import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyAdminSessionCookie, SESSION_COOKIE_NAME } from "@/lib/verifyAdmin";
import { getAdminUserIds, getTaipeiDate } from "@/lib/rateLimit";
import { jsonServerError } from "@/lib/apiErrors";

export const runtime = "nodejs";

type SnapshotPeriod = "full" | "am";

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

  return {
    date,
    period,
    label: dailyMetrics.label ?? (period === "am" ? "今日 00:00-12:00" : "昨日 00:00-23:59"),
    visitors: numberValue(dailyMetrics.visitors) || numberValue(data.visitors) || numberValue(data.statsPayload?.traffic?.today?.visitors),
    pageViews: numberValue(dailyMetrics.pageViews) || numberValue(data.statsPayload?.traffic?.today?.pageViews),
    tarotDraws: completedDraws,
    freeDraws: numberValue(dailyMetrics.freeDraws) || numberValue(data.freeDraws),
    paidSuccess:
      numberValue(dailyMetrics.paidSuccess) ||
      numberValue(data.orderStats?.todayPaid) ||
      numberValue(data.orderStats?.paid) ||
      numberValue(data.paidUnlocks),
    revenue: numberValue(dailyMetrics.revenue) || numberValue(data.revenue) || numberValue(data.orderStats?.todayRevenue),
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
    const [yesterdaySnap, todayAmSnap, ...trendSnaps] = await Promise.all([
      db.collection("daily_admin_stats").doc(`${yesterday}_full`).get(),
      db.collection("daily_admin_stats").doc(`${today}_am`).get(),
      ...trendDates.map((date) => db.collection("daily_admin_stats").doc(`${date}_full`).get()),
    ]);

    const yesterdayMetrics = metricsFromDoc(yesterdaySnap, yesterday, "full");
    const todayAmMetrics = todayAmAvailable ? metricsFromDoc(todayAmSnap, today, "am") : null;
    const trends = trendSnaps
      .map((doc, index) => metricsFromDoc(doc, trendDates[index], "full"))
      .filter((row): row is DailyMetrics => Boolean(row));

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
