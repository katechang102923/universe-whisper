import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyAdminSessionCookie, SESSION_COOKIE_NAME } from "@/lib/verifyAdmin";
import { getAdminUserIds, getTaipeiDate } from "@/lib/rateLimit";
import { jsonServerError } from "@/lib/apiErrors";

export const runtime = "nodejs";

type SnapshotPeriod = "full" | "am";

type BreakdownRow = { label: string; count: number; ratio: string };
type PaymentBreakdownRow = { label: string; count: number; ratio: string; revenue: number };
type ConversionRates = {
  visitorToDraw: string;
  drawToPaid: string;
  visitorToPaid: string;
};
type ZodiacConversionRates = {
  pageToGenerated: string;
  generatedToPaid: string;
  pageToPaid: string;
};
type ZodiacStats = {
  tripleZodiacPageViews: number;
  tripleZodiacStarted: number;
  tripleZodiacGenerated: number;
  tripleZodiacFreeSuccess: number;
  tripleZodiacPaidSuccess: number;
  tripleZodiacCodeSuccess: number;
  tripleZodiacLineSent: number;
  tripleZodiacEmailSent: number;
  tripleZodiacStoryDownloaded: number;
  tripleZodiacRevenue: number;
  conversionRates: ZodiacConversionRates;
};
type DailyMetrics = {
  date: string;
  period: SnapshotPeriod;
  label: string;
  visitors: number;
  pageViews: number;
  tarotDraws: number;
  freeDraws: number;
  paidSuccess: number;
  revenue: number;
  conversionRates: ConversionRates;
  visitorSources: BreakdownRow[];
  featureRanking: BreakdownRow[];
  paymentSources: PaymentBreakdownRow[];
  zodiacStats: ZodiacStats;
};

const EMPTY_ZODIAC_STATS: ZodiacStats = {
  tripleZodiacPageViews: 0,
  tripleZodiacStarted: 0,
  tripleZodiacGenerated: 0,
  tripleZodiacFreeSuccess: 0,
  tripleZodiacPaidSuccess: 0,
  tripleZodiacCodeSuccess: 0,
  tripleZodiacLineSent: 0,
  tripleZodiacEmailSent: 0,
  tripleZodiacStoryDownloaded: 0,
  tripleZodiacRevenue: 0,
  conversionRates: { pageToGenerated: "0%", generatedToPaid: "0%", pageToPaid: "0%" },
};

type SnapshotDoc = {
  date?: string;
  period?: SnapshotPeriod;
  generatedAt?: unknown;
  dailyMetrics?: Partial<DailyMetrics>;
  visitors?: number;
  tarotDraws?: number;
  freeDraws?: number;
  paidUnlocks?: number;
  revenue?: number;
  zodiacStats?: unknown;
  orderStats?: { paid?: number; todayPaid?: number; todayRevenue?: number };
  statsPayload?: {
    traffic?: { today?: { pageViews?: number; visitors?: number } };
    funnel?: Array<{ label?: string; users?: number }>;
  };
};

async function verifyAdmin() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const isGoogleAdmin = await verifyAdminSessionCookie(sessionCookie);
  const lineUserId = cookieStore.get("line_user_id")?.value ?? null;
  return isGoogleAdmin || Boolean(lineUserId && getAdminUserIds().includes(lineUserId));
}

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days, 16));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function taipeiMinutes() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function numberValue(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function calcRatio(num: number, den: number) {
  if (!den) return "0%";
  return `${Math.round((num / den) * 1000) / 10}%`;
}

function safeBreakdownRows(value: unknown): BreakdownRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => ({
    label: String((row as Partial<BreakdownRow>).label ?? ""),
    count: numberValue((row as Partial<BreakdownRow>).count),
    ratio: String((row as Partial<BreakdownRow>).ratio ?? "0%"),
  })).filter((row) => row.label);
}

function safePaymentRows(value: unknown): PaymentBreakdownRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => ({
    label: String((row as Partial<PaymentBreakdownRow>).label ?? ""),
    count: numberValue((row as Partial<PaymentBreakdownRow>).count),
    ratio: String((row as Partial<PaymentBreakdownRow>).ratio ?? "0%"),
    revenue: numberValue((row as Partial<PaymentBreakdownRow>).revenue),
  })).filter((row) => row.label);
}

function safeZodiacStats(value: unknown): ZodiacStats {
  if (!value || typeof value !== "object") return EMPTY_ZODIAC_STATS;
  const v = value as Partial<ZodiacStats> & { conversionRates?: Partial<ZodiacConversionRates> };
  const pageViews = numberValue(v.tripleZodiacPageViews);
  const generated = numberValue(v.tripleZodiacGenerated);
  const paid = numberValue(v.tripleZodiacPaidSuccess);
  const rates: Partial<ZodiacConversionRates> = v.conversionRates ?? {};
  return {
    tripleZodiacPageViews: pageViews,
    tripleZodiacStarted: numberValue(v.tripleZodiacStarted),
    tripleZodiacGenerated: generated,
    tripleZodiacFreeSuccess: numberValue(v.tripleZodiacFreeSuccess),
    tripleZodiacPaidSuccess: paid,
    tripleZodiacCodeSuccess: numberValue(v.tripleZodiacCodeSuccess),
    tripleZodiacLineSent: numberValue(v.tripleZodiacLineSent),
    tripleZodiacEmailSent: numberValue(v.tripleZodiacEmailSent),
    tripleZodiacStoryDownloaded: numberValue(v.tripleZodiacStoryDownloaded),
    tripleZodiacRevenue: numberValue(v.tripleZodiacRevenue),
    conversionRates: {
      pageToGenerated: String(rates.pageToGenerated ?? calcRatio(generated, pageViews)),
      generatedToPaid: String(rates.generatedToPaid ?? calcRatio(paid, generated)),
      pageToPaid: String(rates.pageToPaid ?? calcRatio(paid, pageViews)),
    },
  };
}

function funnelUsers(snapshot: SnapshotDoc, label: string) {
  return snapshot.statsPayload?.funnel?.find((row) => row.label === label)?.users ?? 0;
}

function metricsFromDoc(doc: DocumentSnapshot, fallbackDate: string, fallbackPeriod: SnapshotPeriod): DailyMetrics | null {
  if (!doc.exists) return null;
  const data = doc.data() as SnapshotDoc;
  const date = data.date ?? fallbackDate;
  const period = data.period ?? fallbackPeriod;
  const dailyMetrics = data.dailyMetrics ?? {};
  const completedDraws =
    numberValue(dailyMetrics.tarotDraws) ||
    numberValue(data.tarotDraws) ||
    numberValue(funnelUsers(data, "完成抽牌人數"));

  const visitors = numberValue(dailyMetrics.visitors) || numberValue(data.visitors) || numberValue(data.statsPayload?.traffic?.today?.visitors);
  const pageViews = numberValue(dailyMetrics.pageViews) || numberValue(data.statsPayload?.traffic?.today?.pageViews);
  const freeDraws = numberValue(dailyMetrics.freeDraws) || numberValue(data.freeDraws);
  const paidSuccess =
    numberValue(dailyMetrics.paidSuccess) ||
    numberValue(data.orderStats?.todayPaid) ||
    numberValue(data.orderStats?.paid) ||
    numberValue(data.paidUnlocks);
  const revenue = numberValue(dailyMetrics.revenue) || numberValue(data.revenue) || numberValue(data.orderStats?.todayRevenue);
  const conversionRates = dailyMetrics.conversionRates ?? {
    visitorToDraw: calcRatio(completedDraws, visitors),
    drawToPaid: calcRatio(paidSuccess, completedDraws),
    visitorToPaid: calcRatio(paidSuccess, visitors),
  };

  return {
    date,
    period,
    label: dailyMetrics.label ?? (period === "am" ? "今日 00:00-12:00" : "昨日 00:00-23:59"),
    visitors,
    pageViews,
    tarotDraws: completedDraws,
    freeDraws,
    paidSuccess,
    revenue,
    conversionRates: {
      visitorToDraw: conversionRates.visitorToDraw ?? "0%",
      drawToPaid: conversionRates.drawToPaid ?? "0%",
      visitorToPaid: conversionRates.visitorToPaid ?? "0%",
    },
    visitorSources: safeBreakdownRows(dailyMetrics.visitorSources),
    featureRanking: safeBreakdownRows(dailyMetrics.featureRanking),
    paymentSources: safePaymentRows(dailyMetrics.paymentSources),
    zodiacStats: safeZodiacStats(dailyMetrics.zodiacStats ?? data.zodiacStats),
  };
}

export async function GET() {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const today = getTaipeiDate();
  const yesterday = addDays(today, -1);
  const db = getAdminDb();
  const todayAmAvailable = taipeiMinutes() >= 12 * 60 + 5;
  const trendDates = Array.from({ length: 7 }, (_, index) => addDays(yesterday, -index));

  try {
    const [todayAmSnap, ...trendSnaps] = await Promise.all([
      db.collection("daily_admin_stats").doc(`${today}_am`).get(),
      ...trendDates.map((date) => db.collection("daily_admin_stats").doc(`${date}_full`).get()),
    ]);

    const trends = trendSnaps
      .map((doc, index) => metricsFromDoc(doc, trendDates[index], "full"))
      .filter((row): row is DailyMetrics => Boolean(row));
    const yesterdayMetrics = trends.find((row) => row.date === yesterday) ?? null;
    const todayAmMetrics = todayAmAvailable ? metricsFromDoc(todayAmSnap, today, "am") : null;

    return NextResponse.json({
      ok: true,
      today,
      yesterday: yesterdayMetrics,
      todayAm: todayAmMetrics,
      todayAmAvailable: Boolean(todayAmAvailable && todayAmMetrics),
      todayAmMessage: todayAmAvailable ? "今日前半天快照尚未產生" : "今日前半天統計將於 12:05 更新",
      trends,
    });
  } catch (error) {
    console.error("[admin/stats] snapshot read failed:", error);
    return jsonServerError(error, "SNAPSHOT_READ_FAILED");
  }
}
