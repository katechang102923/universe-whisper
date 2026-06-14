import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyAdminSessionCookie, SESSION_COOKIE_NAME } from "@/lib/verifyAdmin";
import { getAdminUserIds, getTaipeiDate } from "@/lib/rateLimit";
import { jsonServerError } from "@/lib/apiErrors";
import { computeRawMetrics, type RawDayMetrics, type RawDiagnostics } from "@/lib/adminStatsRaw";

export const runtime = "nodejs";

// ── 快照優先、原始重算需手動觸發（read-only）────────────────────────────────────
// 預設（mode 省略或 snapshot）：只讀 daily_admin_stats/{date}_full 快照，不讀任何原始 collection。
//   - 快照存在且有資料 → 顯示快照。
//   - 快照不存在 → 標記「快照缺失」，不自動讀原始 collection。
//   - 快照存在但全為 0 → 標記「快照為空」，不自動讀原始 collection。
// 手動重算（mode=raw）：管理者按「手動用原始事件重算」才會讀原始 collection 即時計算。
//   - 僅支援最多 31 天；以 Asia/Taipei dateKey 範圍查詢、每 collection 有 limit；read-only 不寫回。
// 日期一律 Asia/Taipei；昨日 / 區間皆以台灣時間判定。

const MAX_RANGE_DAYS = 90;
const RAW_MAX_DAYS = 31; // 手動原始事件重算上限
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type DayStatus = "data" | "empty" | "missing" | "raw";
type SnapshotState = "ok" | "partial" | "empty" | "missing";

type BreakdownRow = { label: string; count: number; ratio: string };
type PaymentBreakdownRow = { label: string; count: number; ratio: string; revenue: number };
type ConversionRates = { visitorToDraw: string; drawToPaid: string; visitorToPaid: string };
type ZodiacConversionRates = { pageToGenerated: string; generatedToPaid: string; pageToPaid: string };

type DayMetrics = {
  date: string;
  visitors: number;
  pageViews: number;
  tarotDrawSuccess: number;
  tarotSingleSuccess: number;
  tarotThreeSuccess: number;
  freeSuccess: number;
  paidSuccess: number;
  revenue: number;
  astroProfilePageViews: number;
  astroProfileSuccess: number;
  astroProfileFreeSuccess: number;
  astroProfilePaidSuccess: number;
  astroProfileRevenue: number;
  conversionRates: ConversionRates;
  zodiacConversionRates: ZodiacConversionRates;
  sourceStats: BreakdownRow[];
  popularFeatureStats: BreakdownRow[];
  paymentSourceStats: PaymentBreakdownRow[];
};

type DayResult = {
  date: string;
  isToday: boolean;
  status: DayStatus;
  missingSnapshot: boolean;
  metrics: DayMetrics | null;
};

type Granular = {
  tarotLineSent: number;
  tarotEmailSent: number;
  tarotStoryDownloaded: number;
  astroProfileStarted: number;
  astroProfileLineSent: number;
  astroProfileEmailSent: number;
  astroProfileStoryDownloaded: number;
  lineSentTotal: number;
  emailSentTotal: number;
  storyDownloadedTotal: number;
};

async function verifyAdmin() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const isGoogleAdmin = await verifyAdminSessionCookie(sessionCookie);
  const lineUserId = cookieStore.get("line_user_id")?.value ?? null;
  return isGoogleAdmin || Boolean(lineUserId && getAdminUserIds().includes(lineUserId));
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 轉換率：分母為 0 顯示 0%，永不出現 NaN / Infinity */
function calcRatio(numerator: number, denominator: number): string {
  if (!denominator || denominator <= 0) return "0%";
  return `${Math.round((numerator / denominator) * 1000) / 10}%`;
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  // 以 Asia/Taipei 中午對齊，避免 UTC 切日錯位
  const d = new Date(Date.UTC(year, month - 1, day + days, 4));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** 列出 [start, end] 之間（含端點）所有 Taipei 日期；超出上限回 null */
function listDates(start: string, end: string): string[] | null {
  if (start > end) return null;
  const dates: string[] = [];
  let cursor = start;
  for (let i = 0; i < MAX_RANGE_DAYS; i++) {
    dates.push(cursor);
    if (cursor === end) return dates;
    cursor = addDays(cursor, 1);
  }
  return null;
}

function safeBreakdownRows(value: unknown): BreakdownRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => ({
      label: String((row as Partial<BreakdownRow>).label ?? ""),
      count: num((row as Partial<BreakdownRow>).count),
      ratio: String((row as Partial<BreakdownRow>).ratio ?? "0%"),
    }))
    .filter((row) => row.label);
}

function safePaymentRows(value: unknown): PaymentBreakdownRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => ({
      label: String((row as Partial<PaymentBreakdownRow>).label ?? ""),
      count: num((row as Partial<PaymentBreakdownRow>).count),
      ratio: String((row as Partial<PaymentBreakdownRow>).ratio ?? "0%"),
      revenue: num((row as Partial<PaymentBreakdownRow>).revenue),
    }))
    .filter((row) => row.label);
}

type SnapshotDoc = Record<string, unknown> & {
  dailyMetrics?: Record<string, unknown>;
  zodiacStats?: Record<string, unknown>;
};

/** 將快照 doc 映射成規格化 metrics；優先讀新欄位，缺少時回退舊欄位（向下相容，不假造） */
function metricsFromDoc(doc: DocumentSnapshot, date: string): DayMetrics {
  const data = (doc.data() ?? {}) as SnapshotDoc;
  const dm = (data.dailyMetrics ?? {}) as Record<string, unknown>;
  const zodiac = (data.zodiacStats ?? (dm.zodiacStats as Record<string, unknown>) ?? {}) as Record<string, unknown>;

  const visitors = num(data.visitors) || num(dm.visitors);
  const pageViews = num(data.pageViews) || num(dm.pageViews);

  const tarotSingleSuccess = num(data.tarotSingleSuccess);
  const tarotThreeSuccess = num(data.tarotThreeSuccess);
  const freeSuccess = num(data.freeSuccess) || num(dm.freeDraws) || num(data.freeDraws);
  const paidSuccess = num(data.paidSuccess) || num(dm.paidSuccess) || num(data.paidUnlocks);
  const tarotDrawSuccess =
    num(data.tarotDrawSuccess) || num(dm.tarotDraws) || freeSuccess + paidSuccess;
  const revenue = num(data.revenue) || num(dm.revenue);

  const astroProfilePageViews = num(data.astroProfilePageViews) || num(zodiac.tripleZodiacPageViews);
  const astroProfilePaidSuccess = num(data.astroProfilePaidSuccess) || num(zodiac.tripleZodiacPaidSuccess);
  const astroProfileFreeSuccess =
    num(data.astroProfileFreeSuccess) ||
    num(zodiac.tripleZodiacFreeSuccess) + num(zodiac.tripleZodiacCodeSuccess);
  const astroProfileSuccess =
    num(data.astroProfileSuccess) ||
    num(zodiac.tripleZodiacGenerated) ||
    astroProfilePaidSuccess + astroProfileFreeSuccess;
  const astroProfileRevenue = num(data.astroProfileRevenue) || num(zodiac.tripleZodiacRevenue);

  return {
    date,
    visitors,
    pageViews,
    tarotDrawSuccess,
    tarotSingleSuccess,
    tarotThreeSuccess,
    freeSuccess,
    paidSuccess,
    revenue,
    astroProfilePageViews,
    astroProfileSuccess,
    astroProfileFreeSuccess,
    astroProfilePaidSuccess,
    astroProfileRevenue,
    conversionRates: {
      visitorToDraw: calcRatio(tarotDrawSuccess, visitors),
      drawToPaid: calcRatio(paidSuccess, tarotDrawSuccess),
      visitorToPaid: calcRatio(paidSuccess, visitors),
    },
    zodiacConversionRates: {
      pageToGenerated: calcRatio(astroProfileSuccess, astroProfilePageViews),
      generatedToPaid: calcRatio(astroProfilePaidSuccess, astroProfileSuccess),
      pageToPaid: calcRatio(astroProfilePaidSuccess, astroProfilePageViews),
    },
    sourceStats: safeBreakdownRows(data.sourceStats ?? dm.visitorSources),
    popularFeatureStats: safeBreakdownRows(data.popularFeatureStats ?? dm.featureRanking),
    paymentSourceStats: safePaymentRows(data.paymentSourceStats ?? dm.paymentSources),
  };
}

/** 將原始逐日資料映射成 DayMetrics；排行明細只在快照才有，帶入對應快照（若有） */
function metricsFromRaw(r: RawDayMetrics, snap?: DocumentSnapshot): DayMetrics {
  const tarotDrawSuccess = Math.max(r.tarotDrawCompleted, r.tarotFreeSuccess + r.tarotPaidSuccess);
  const paidSuccess = r.tarotPaidSuccess + r.astroProfilePaidSuccess;
  const revenue = r.tarotRevenue + r.astroProfileRevenue;
  const astroProfileSuccess = r.astroProfileFreeSuccess + r.astroProfilePaidSuccess;
  const snapData = (snap?.data() ?? {}) as SnapshotDoc;
  const dm = (snapData.dailyMetrics ?? {}) as Record<string, unknown>;
  return {
    date: r.date,
    visitors: r.visitors,
    pageViews: r.pageViews,
    tarotDrawSuccess,
    tarotSingleSuccess: r.tarotSingleSuccess,
    tarotThreeSuccess: r.tarotThreeSuccess,
    freeSuccess: r.tarotFreeSuccess,
    paidSuccess,
    revenue,
    astroProfilePageViews: r.astroProfilePageViews,
    astroProfileSuccess,
    astroProfileFreeSuccess: r.astroProfileFreeSuccess,
    astroProfilePaidSuccess: r.astroProfilePaidSuccess,
    astroProfileRevenue: r.astroProfileRevenue,
    conversionRates: {
      visitorToDraw: calcRatio(tarotDrawSuccess, r.visitors),
      drawToPaid: calcRatio(paidSuccess, tarotDrawSuccess),
      visitorToPaid: calcRatio(paidSuccess, r.visitors),
    },
    zodiacConversionRates: {
      pageToGenerated: calcRatio(astroProfileSuccess, r.astroProfilePageViews),
      generatedToPaid: calcRatio(r.astroProfilePaidSuccess, astroProfileSuccess),
      pageToPaid: calcRatio(r.astroProfilePaidSuccess, r.astroProfilePageViews),
    },
    sourceStats: safeBreakdownRows((snapData.sourceStats as unknown) ?? dm.visitorSources),
    popularFeatureStats: safeBreakdownRows((snapData.popularFeatureStats as unknown) ?? dm.featureRanking),
    paymentSourceStats: safePaymentRows((snapData.paymentSourceStats as unknown) ?? dm.paymentSources),
  };
}

function emptyTotals() {
  return {
    visitors: 0,
    pageViews: 0,
    tarotDrawSuccess: 0,
    tarotSingleSuccess: 0,
    tarotThreeSuccess: 0,
    freeSuccess: 0,
    paidSuccess: 0,
    revenue: 0,
    astroProfilePageViews: 0,
    astroProfileSuccess: 0,
    astroProfileFreeSuccess: 0,
    astroProfilePaidSuccess: 0,
    astroProfileRevenue: 0,
  };
}

type Totals = ReturnType<typeof emptyTotals>;

function addMetricsToTotals(totals: Totals, m: DayMetrics) {
  totals.visitors += m.visitors;
  totals.pageViews += m.pageViews;
  totals.tarotDrawSuccess += m.tarotDrawSuccess;
  totals.tarotSingleSuccess += m.tarotSingleSuccess;
  totals.tarotThreeSuccess += m.tarotThreeSuccess;
  totals.freeSuccess += m.freeSuccess;
  totals.paidSuccess += m.paidSuccess;
  totals.revenue += m.revenue;
  totals.astroProfilePageViews += m.astroProfilePageViews;
  totals.astroProfileSuccess += m.astroProfileSuccess;
  totals.astroProfileFreeSuccess += m.astroProfileFreeSuccess;
  totals.astroProfilePaidSuccess += m.astroProfilePaidSuccess;
  totals.astroProfileRevenue += m.astroProfileRevenue;
}

/** 是否有任何營運資料（用來判斷快照是否為空） */
function hasData(m: DayMetrics): boolean {
  return (
    m.visitors > 0 || m.pageViews > 0 || m.tarotDrawSuccess > 0 || m.freeSuccess > 0 ||
    m.paidSuccess > 0 || m.revenue > 0 || m.astroProfilePageViews > 0 || m.astroProfileSuccess > 0
  );
}

function granularFromRaw(perDay: Record<string, RawDayMetrics>): Granular {
  const g: Granular = {
    tarotLineSent: 0, tarotEmailSent: 0, tarotStoryDownloaded: 0,
    astroProfileStarted: 0, astroProfileLineSent: 0, astroProfileEmailSent: 0, astroProfileStoryDownloaded: 0,
    lineSentTotal: 0, emailSentTotal: 0, storyDownloadedTotal: 0,
  };
  for (const r of Object.values(perDay)) {
    g.tarotLineSent += r.tarotLineSent;
    g.tarotEmailSent += r.tarotEmailSent;
    g.tarotStoryDownloaded += r.tarotStoryDownloaded;
    g.astroProfileStarted += r.astroProfileStarted;
    g.astroProfileLineSent += r.astroProfileLineSent;
    g.astroProfileEmailSent += r.astroProfileEmailSent;
    g.astroProfileStoryDownloaded += r.astroProfileStoryDownloaded;
  }
  g.lineSentTotal = g.tarotLineSent + g.astroProfileLineSent;
  g.emailSentTotal = g.tarotEmailSent + g.astroProfileEmailSent;
  g.storyDownloadedTotal = g.tarotStoryDownloaded + g.astroProfileStoryDownloaded;
  return g;
}

function granularFromSnapshots(snaps: DocumentSnapshot[]): Granular {
  const g: Granular = {
    tarotLineSent: 0, tarotEmailSent: 0, tarotStoryDownloaded: 0,
    astroProfileStarted: 0, astroProfileLineSent: 0, astroProfileEmailSent: 0, astroProfileStoryDownloaded: 0,
    lineSentTotal: 0, emailSentTotal: 0, storyDownloadedTotal: 0,
  };
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = (snap.data() ?? {}) as SnapshotDoc & { lineSends?: unknown; shareImageDownloads?: unknown };
    const z = (data.zodiacStats ?? {}) as Record<string, unknown>;
    g.tarotLineSent += num(data.lineSends);
    g.tarotStoryDownloaded += num(data.shareImageDownloads);
    g.astroProfileStarted += num(z.tripleZodiacStarted);
    g.astroProfileLineSent += num(z.tripleZodiacLineSent);
    g.astroProfileEmailSent += num(z.tripleZodiacEmailSent);
    g.astroProfileStoryDownloaded += num(z.tripleZodiacStoryDownloaded);
  }
  g.lineSentTotal = g.tarotLineSent + g.astroProfileLineSent;
  g.emailSentTotal = g.tarotEmailSent + g.astroProfileEmailSent;
  g.storyDownloadedTotal = g.tarotStoryDownloaded + g.astroProfileStoryDownloaded;
  return g;
}

function totalsWithRates(totals: Totals) {
  return {
    ...totals,
    conversionRates: {
      visitorToDraw: calcRatio(totals.tarotDrawSuccess, totals.visitors),
      drawToPaid: calcRatio(totals.paidSuccess, totals.tarotDrawSuccess),
      visitorToPaid: calcRatio(totals.paidSuccess, totals.visitors),
    },
    astroConversionRates: {
      pageToGenerated: calcRatio(totals.astroProfileSuccess, totals.astroProfilePageViews),
      generatedToPaid: calcRatio(totals.astroProfilePaidSuccess, totals.astroProfileSuccess),
      pageToPaid: calcRatio(totals.astroProfilePaidSuccess, totals.astroProfilePageViews),
    },
  };
}

const DATA_NOTES = [
  "tarotEmailSent：目前無事件來源，固定顯示 0（未假造）。",
  "tarotStoryDownloaded：由 share_image_downloads 輔助判斷，無資料則顯示 0（未假造）。",
];

const NO_SNAPSHOT_NOTICE = "此日期尚無完整快照，請稍後或手動重算。";
const EMPTY_SNAPSHOT_NOTICE = "此日期快照為空，請稍後或手動重算。";
const PARTIAL_SNAPSHOT_NOTICE = "部分日期尚無完整快照，已略過；可手動重算補齊。";

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const today = getTaipeiDate();
  const params = new URL(req.url).searchParams;
  const startParam = params.get("start")?.trim() ?? "";
  const endParam = params.get("end")?.trim() ?? startParam;
  const mode: "snapshot" | "raw" = params.get("mode") === "raw" ? "raw" : "snapshot";

  // 初始載入若未指定日期 → 不查詢、不讀 Firestore（前端預設會帶昨日進來）
  if (!startParam) {
    return NextResponse.json({ ok: true, needsSelection: true, today, days: [], totals: totalsWithRates(emptyTotals()), snapshotsRead: 0 });
  }

  if (!DATE_RE.test(startParam) || !DATE_RE.test(endParam)) {
    return NextResponse.json({ ok: false, error: "INVALID_DATE" }, { status: 400 });
  }

  const start = startParam <= endParam ? startParam : endParam;
  const end = startParam <= endParam ? endParam : startParam;
  const dates = listDates(start, end);
  if (!dates) {
    return NextResponse.json({ ok: false, error: `查詢區間最多 ${MAX_RANGE_DAYS} 天` }, { status: 400 });
  }

  if (mode === "raw" && dates.length > RAW_MAX_DAYS) {
    return NextResponse.json({ ok: false, error: `手動原始事件重算最多支援 ${RAW_MAX_DAYS} 天` }, { status: 400 });
  }

  const db = getAdminDb();

  try {
    // 兩種模式都會讀 daily_admin_stats（成本低：每天 1 筆；重算模式也用它帶入排行明細與快照筆數）
    const refs = dates.map((date) => db.collection("daily_admin_stats").doc(`${date}_full`));
    const snaps = refs.length ? await db.getAll(...refs) : [];
    const snapByDate = new Map<string, DocumentSnapshot>();
    snaps.forEach((snap, i) => snapByDate.set(dates[i], snap));
    const dailyAdminStatsCount = snaps.filter((s) => s.exists).length;

    // ── 手動原始事件重算（mode=raw）──────────────────────────────────────────
    if (mode === "raw") {
      const rawResult = await computeRawMetrics(db, dates);
      const rd: RawDiagnostics = rawResult.diagnostics;
      const totals = emptyTotals();
      const days: DayResult[] = dates.map((date) => {
        const m = metricsFromRaw(rawResult.perDay[date], snapByDate.get(date));
        addMetricsToTotals(totals, m);
        return { date, isToday: date === today, status: "raw" as DayStatus, missingSnapshot: false, metrics: m };
      });

      const diagnostics = {
        start, end, days: dates.length,
        mode,
        dataSource: "raw" as const,
        snapshotState: null,
        rawRecomputable: true,
        counts: {
          analyticsEvents: rd.counts.analyticsEvents,
          tripleZodiacEvents: rd.counts.tripleZodiacEvents,
          paymentOrders: rd.counts.paymentOrders,
          astroProfileOrders: rd.counts.astroProfileOrders,
          rateLimits: rd.counts.rateLimits,
          dailyAdminStats: dailyAdminStatsCount,
          shareImageDownloads: rd.counts.shareImageDownloads,
        },
        adminEventCount: rd.adminEventCount,
        testEventCount: rd.testEventCount,
        normalEventCount: rd.normalEventCount,
        allEventCount: rd.allEventCount,
        truncated: rd.truncated,
        shareImageAvailable: rd.shareImageAvailable,
        notes: DATA_NOTES,
      };

      return NextResponse.json({
        ok: true, today, start, end,
        days,
        totals: totalsWithRates(totals),
        granular: granularFromRaw(rawResult.perDay),
        dataSource: "raw",
        snapshotState: null,
        displayNotice: "",
        rawRecomputable: true,
        diagnostics,
        snapshotsRead: dates.length,
      });
    }

    // ── 預設：快照優先（不讀任何原始 collection）──────────────────────────────
    const totals = emptyTotals();
    let missingCount = 0;
    let dataCount = 0;
    let emptyCount = 0;
    const days: DayResult[] = dates.map((date) => {
      const isToday = date === today;
      const snap = snapByDate.get(date)!;
      if (!snap.exists) {
        missingCount += 1;
        return { date, isToday, status: "missing" as DayStatus, missingSnapshot: true, metrics: null };
      }
      const m = metricsFromDoc(snap, date);
      addMetricsToTotals(totals, m);
      if (hasData(m)) {
        dataCount += 1;
        return { date, isToday, status: "data" as DayStatus, missingSnapshot: false, metrics: m };
      }
      emptyCount += 1;
      return { date, isToday, status: "empty" as DayStatus, missingSnapshot: false, metrics: m };
    });

    let snapshotState: SnapshotState;
    if (dataCount === 0 && emptyCount === 0) snapshotState = "missing";
    else if (dataCount === 0 && missingCount === 0) snapshotState = "empty";
    else if (missingCount > 0) snapshotState = "partial";
    else snapshotState = "ok";

    let displayNotice = "";
    if (snapshotState === "missing") displayNotice = NO_SNAPSHOT_NOTICE;
    else if (snapshotState === "empty") displayNotice = EMPTY_SNAPSHOT_NOTICE;
    else if (snapshotState === "partial") displayNotice = PARTIAL_SNAPSHOT_NOTICE;

    const rawRecomputable = dates.length <= RAW_MAX_DAYS;
    const diagnostics = {
      start, end, days: dates.length,
      mode,
      dataSource: "snapshot" as const,
      snapshotState,
      rawRecomputable,
      counts: {
        // 快照模式不讀原始 collection，故為 null（未讀取）
        analyticsEvents: null,
        tripleZodiacEvents: null,
        paymentOrders: null,
        astroProfileOrders: null,
        rateLimits: null,
        dailyAdminStats: dailyAdminStatsCount,
        shareImageDownloads: null,
      },
      adminEventCount: null,
      testEventCount: null,
      normalEventCount: null,
      allEventCount: null,
      truncated: [] as string[],
      shareImageAvailable: null,
      notes: DATA_NOTES,
    };

    return NextResponse.json({
      ok: true, today, start, end,
      days,
      totals: totalsWithRates(totals),
      granular: granularFromSnapshots(snaps),
      dataSource: "snapshot",
      snapshotState,
      displayNotice,
      rawRecomputable,
      diagnostics,
      snapshotsRead: dates.length,
    });
  } catch (error) {
    console.error("[admin/stats] read failed:", error);
    return jsonServerError(error, "STATS_READ_FAILED");
  }
}
