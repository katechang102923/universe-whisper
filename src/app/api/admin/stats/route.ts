import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyAdminSessionCookie, SESSION_COOKIE_NAME } from "@/lib/verifyAdmin";
import { getAdminUserIds, getTaipeiDate } from "@/lib/rateLimit";
import { jsonServerError } from "@/lib/apiErrors";
import { computeRawStats, type RawDayMetrics } from "@/lib/adminStatsFallback";

export const runtime = "nodejs";

// ── 原始資料計算版本 ────────────────────────────────────────────────────────────
// 後台統計頁的主要數據來源 = 原始 collection 即時彙整（不使用 daily_admin_stats 快照）。
// 由管理者手動指定 start/end（皆為 Asia/Taipei 日期）才查詢；單日 = start 省略 end。
// 區間上限 31 天（避免 Firebase 讀取過量）。今日同樣可即時計算（為當日部分資料）。
// 不使用 onSnapshot / 即時監聽 / 自動輪詢；getDocs / getDoc 一次性查詢。

const MAX_RANGE_DAYS = 31;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type ConversionRates = { visitorToDraw: string; drawToPaid: string; visitorToPaid: string };

type DayMetrics = {
  date: string;
  visitors: number;
  pageViews: number;
  tarotDrawSuccess: number;
  tarotSingleSuccess: number;
  tarotThreeSuccess: number;
  freeSuccess: number;
  paidAttempts: number;
  paidSuccess: number;
  revenue: number;
  astroProfilePageViews: number;
  astroProfileAttempts: number;
  astroProfileSuccess: number;
  astroProfileFreeSuccess: number;
  astroProfilePaidSuccess: number;
  astroProfileRevenue: number;
  conversionRates: ConversionRates;
  sourceStats: RawDayMetrics["sourceStats"];
  popularFeatureStats: RawDayMetrics["popularFeatureStats"];
  paymentSourceStats: RawDayMetrics["paymentSourceStats"];
};

type DayResult = {
  date: string;
  isToday: boolean;
  /** false = 該日查無任何原始資料 */
  hasRawData: boolean;
  metrics: DayMetrics | null;
};

async function verifyAdmin() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const isGoogleAdmin = await verifyAdminSessionCookie(sessionCookie);
  const lineUserId = cookieStore.get("line_user_id")?.value ?? null;
  return isGoogleAdmin || Boolean(lineUserId && getAdminUserIds().includes(lineUserId));
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

function metricsFromRaw(raw: RawDayMetrics, date: string): DayMetrics {
  return {
    date,
    visitors: raw.visitors,
    pageViews: raw.pageViews,
    tarotDrawSuccess: raw.tarotDrawSuccess,
    tarotSingleSuccess: raw.tarotSingleSuccess,
    tarotThreeSuccess: raw.tarotThreeSuccess,
    freeSuccess: raw.freeSuccess,
    paidAttempts: raw.paidAttempts,
    paidSuccess: raw.paidSuccess,
    revenue: raw.revenue,
    astroProfilePageViews: raw.astroProfilePageViews,
    astroProfileAttempts: raw.astroProfileAttempts,
    astroProfileSuccess: raw.astroProfileSuccess,
    astroProfileFreeSuccess: raw.astroProfileFreeSuccess,
    astroProfilePaidSuccess: raw.astroProfilePaidSuccess,
    astroProfileRevenue: raw.astroProfileRevenue,
    conversionRates: {
      visitorToDraw: calcRatio(raw.tarotDrawSuccess, raw.visitors),
      drawToPaid: calcRatio(raw.paidSuccess, raw.tarotDrawSuccess),
      visitorToPaid: calcRatio(raw.paidSuccess, raw.visitors),
    },
    sourceStats: raw.sourceStats,
    popularFeatureStats: raw.popularFeatureStats,
    paymentSourceStats: raw.paymentSourceStats,
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
    paidAttempts: 0,
    paidSuccess: 0,
    revenue: 0,
    astroProfilePageViews: 0,
    astroProfileAttempts: 0,
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
    return NextResponse.json({ ok: true, needsSelection: true, today, days: [], totals: emptyTotals(), source: "raw_events" });
  }

  if (!DATE_RE.test(startParam) || !DATE_RE.test(endParam)) {
    return NextResponse.json({ ok: false, error: "INVALID_DATE" }, { status: 400 });
  }

  const start = startParam <= endParam ? startParam : endParam;
  const end = startParam <= endParam ? endParam : startParam;
  const dates = listDates(start, end);
  if (!dates) {
    return NextResponse.json(
      { ok: false, error: `為避免 Firebase 讀取過量，單次最多查詢 ${MAX_RANGE_DAYS} 天。` },
      { status: 400 },
    );
  }

  const db = getAdminDb();

  try {
    // 主要數據來源：原始事件即時彙整（不讀 daily_admin_stats 快照）
    const { byDate, diagnostics } = await computeRawStats(db, dates);

    const totals = emptyTotals();
    const days: DayResult[] = dates.map((date) => {
      const raw = byDate.get(date);
      const isToday = date === today;
      if (!raw) {
        return { date, isToday, hasRawData: false, metrics: null };
      }
      const metrics = metricsFromRaw(raw, date);
      // 累加（即使 hasRawData=false 也都是 0，加總無妨；保持與每日列一致）
      totals.visitors += metrics.visitors;
      totals.pageViews += metrics.pageViews;
      totals.tarotDrawSuccess += metrics.tarotDrawSuccess;
      totals.tarotSingleSuccess += metrics.tarotSingleSuccess;
      totals.tarotThreeSuccess += metrics.tarotThreeSuccess;
      totals.freeSuccess += metrics.freeSuccess;
      totals.paidAttempts += metrics.paidAttempts;
      totals.paidSuccess += metrics.paidSuccess;
      totals.revenue += metrics.revenue;
      totals.astroProfilePageViews += metrics.astroProfilePageViews;
      totals.astroProfileAttempts += metrics.astroProfileAttempts;
      totals.astroProfileSuccess += metrics.astroProfileSuccess;
      totals.astroProfileFreeSuccess += metrics.astroProfileFreeSuccess;
      totals.astroProfilePaidSuccess += metrics.astroProfilePaidSuccess;
      totals.astroProfileRevenue += metrics.astroProfileRevenue;
      return { date, isToday, hasRawData: raw.hasRawData, metrics };
    });

    return NextResponse.json({
      ok: true,
      today,
      start,
      end,
      source: "raw_events",
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
      diagnostics: {
        ...diagnostics,
        start,
        end,
        days: dates.length,
        timezone: "Asia/Taipei",
      },
    });
  } catch (error) {
    console.error("[admin/stats] raw compute failed:", error);
    return jsonServerError(error, "RAW_COMPUTE_FAILED");
  }
}
