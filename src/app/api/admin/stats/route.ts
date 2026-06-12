import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyAdminSessionCookie, SESSION_COOKIE_NAME } from "@/lib/verifyAdmin";
import { getAdminUserIds, getTaipeiDate } from "@/lib/rateLimit";
import { jsonServerError } from "@/lib/apiErrors";

export const runtime = "nodejs";

// ── 低 Firebase 讀取成本版本 ────────────────────────────────────────────────────
// 只讀 daily_admin_stats 快照（每天 1 筆 `${date}_full`），不掃 collection、不讀 raw events。
// 由管理者手動指定 start/end（皆為 Asia/Taipei 日期）才查詢；單日 = start 省略 end。
// 區間上限 90 天。今日尚無完整快照，回 missingSnapshot 並標記 isToday，前端顯示提示。

const MAX_RANGE_DAYS = 90;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  missingSnapshot: boolean;
  metrics: DayMetrics | null;
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
  // 超過 MAX_RANGE_DAYS 仍未到 end → 超出上限
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

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const today = getTaipeiDate();
  const params = new URL(req.url).searchParams;
  const startParam = params.get("start")?.trim() ?? "";
  const endParam = params.get("end")?.trim() ?? startParam;

  // 初始載入：未指定日期 → 不查詢、不讀 Firestore，回提示讓前端顯示「請選擇日期」
  if (!startParam) {
    return NextResponse.json({ ok: true, needsSelection: true, today, days: [], totals: emptyTotals(), snapshotsRead: 0 });
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

  const db = getAdminDb();

  try {
    // 只讀 daily_admin_stats，每天 1 筆；用 getAll 批次取回（讀取數＝天數）
    const refs = dates.map((date) => db.collection("daily_admin_stats").doc(`${date}_full`));
    const snaps = refs.length ? await db.getAll(...refs) : [];

    const totals = emptyTotals();
    const days: DayResult[] = snaps.map((snap, index) => {
      const date = dates[index];
      const isToday = date === today;
      // 今日：完整快照尚未產生（明日 00:05 才出），不讀 raw events，直接回 missingSnapshot
      if (!snap.exists) {
        return { date, isToday, missingSnapshot: true, metrics: null };
      }
      const metrics = metricsFromDoc(snap, date);
      totals.visitors += metrics.visitors;
      totals.pageViews += metrics.pageViews;
      totals.tarotDrawSuccess += metrics.tarotDrawSuccess;
      totals.tarotSingleSuccess += metrics.tarotSingleSuccess;
      totals.tarotThreeSuccess += metrics.tarotThreeSuccess;
      totals.freeSuccess += metrics.freeSuccess;
      totals.paidSuccess += metrics.paidSuccess;
      totals.revenue += metrics.revenue;
      totals.astroProfilePageViews += metrics.astroProfilePageViews;
      totals.astroProfileSuccess += metrics.astroProfileSuccess;
      totals.astroProfileFreeSuccess += metrics.astroProfileFreeSuccess;
      totals.astroProfilePaidSuccess += metrics.astroProfilePaidSuccess;
      totals.astroProfileRevenue += metrics.astroProfileRevenue;
      return { date, isToday, missingSnapshot: false, metrics };
    });

    return NextResponse.json({
      ok: true,
      today,
      start,
      end,
      days,
      totals: {
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
      },
      snapshotsRead: dates.length,
    });
  } catch (error) {
    console.error("[admin/stats] snapshot read failed:", error);
    return jsonServerError(error, "SNAPSHOT_READ_FAILED");
  }
}
