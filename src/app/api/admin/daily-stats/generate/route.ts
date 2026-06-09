import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getAdminUserIds } from "@/lib/rateLimit";
import { getAdminEmailList } from "@/lib/verifyAdmin";
import { PAYMENT_ORDERS_COLLECTION, REDEEM_CODES_COLLECTION, type RedeemCodeData } from "@/lib/redeemCodes";
import { jsonServerError } from "@/lib/apiErrors";

export const runtime = "nodejs";

type SnapshotPeriod = "full" | "am" | "pm";

type AnalyticsEvent = {
  eventType?: string;
  sessionId?: string | null;
  anonymousId?: string | null;
  lineUserId?: string | null;
  ipHash?: string | null;
  path?: string;
  referrer?: string;
  url?: string;
  utmSource?: string | null;
  activeSeconds?: number;
  pageActiveSeconds?: number;
  isTest?: boolean;
  isAdmin?: boolean;
};

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
type PeriodUnlock = { free: number; paid: number; total: number; ratio: string };
type TrafficPeriod = { visitors: number; sessions: number; pageViews: number; avgActiveSeconds: number; bounceRate: string };
type LineSavePeriod = { count: number; users: number };
type SourceRow = {
  source: string;
  sessions: number;
  visitors: number;
  avgActiveSeconds: number;
  drawCount: number;
  freeUnlockCount: number;
  paidSuccess: number;
  paidConversionRate: string;
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

function calcRatio(num: number, den: number) {
  if (!den) return "0%";
  return `${Math.round((num / den) * 1000) / 10}%`;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, n) => sum + n, 0) / values.length);
}

function cleanSeconds(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), 7200);
}

function resolveTs(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object" && "toDate" in v) return (v as { toDate(): Date }).toDate();
  if (typeof v === "object" && "seconds" in v) return new Date((v as { seconds: number }).seconds * 1000);
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function taipeiDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days, 16));
  return taipeiDate(d);
}

function taipeiLocalToUtc(dateKey: string, hour: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 8, 0, 0, 0));
}

function defaultPeriod() {
  const now = new Date();
  const taipeiHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", hour: "2-digit", hour12: false }).format(now));
  return taipeiHour < 12 ? "full" : "am";
}

function resolveTarget(searchParams: URLSearchParams) {
  const rawPeriod = searchParams.get("period");
  const period: SnapshotPeriod = rawPeriod === "am" || rawPeriod === "pm" || rawPeriod === "full" ? rawPeriod : defaultPeriod();
  const today = taipeiDate();
  const date = searchParams.get("date") ?? (period === "full" ? addDays(today, -1) : today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const nextDate = addDays(date, 1);
  if (period === "am") {
    return { date, period, rangeStart: taipeiLocalToUtc(date, 0), rangeEnd: taipeiLocalToUtc(date, 12) };
  }
  if (period === "pm") {
    return { date, period, rangeStart: taipeiLocalToUtc(date, 12), rangeEnd: taipeiLocalToUtc(nextDate, 0) };
  }
  return { date, period, rangeStart: taipeiLocalToUtc(date, 0), rangeEnd: taipeiLocalToUtc(nextDate, 0) };
}

function inRange(value: unknown, start: Date, end: Date) {
  const d = resolveTs(value);
  return Boolean(d && d >= start && d < end);
}

function visitorKey(event: Pick<AnalyticsEvent, "lineUserId" | "anonymousId" | "ipHash">) {
  if (event.lineUserId) return `line:${event.lineUserId}`;
  if (event.anonymousId) return `anon:${event.anonymousId}`;
  if (event.ipHash) return `ip:${event.ipHash}`;
  return null;
}

function normalizePath(path?: string) {
  if (!path) return "/";
  try {
    return new URL(path, "https://example.com").pathname;
  } catch {
    return path.startsWith("/") ? path : "/";
  }
}

function isPublicPath(path: string) {
  return Boolean(path) && !path.startsWith("/admin") && !path.startsWith("/api/");
}

function sourceFrom(referrer?: string, url?: string, utmSource?: string | null): string {
  const source = (utmSource ?? "").toLowerCase();
  if (["facebook", "fb", "meta", "fbad", "fbclid"].includes(source)) return "Facebook";
  if (["instagram", "ig", "igshid"].includes(source)) return "Instagram";
  if (source === "line") return "LINE";
  if (source === "google") return "Google";

  const ref = (referrer ?? "").toLowerCase();
  const urlStr = (url ?? "").toLowerCase();
  if (urlStr.includes("fbclid")) return "Facebook";
  if (urlStr.includes("igshid")) return "Instagram";
  if (!ref) return "直接進入";
  if (ref.includes("facebook.com") || ref.includes("fb.com")) return "Facebook";
  if (ref.includes("instagram.com")) return "Instagram";
  if (ref.includes("threads.net")) return "Threads";
  if (ref.includes("line.me") || ref.includes("liff.line.me")) return "LINE";
  if (ref.includes("google.com")) return "Google";
  return "其他";
}

function featureFromPath(path?: string) {
  const normalized = normalizePath(path);
  if (normalized === "/") return "首頁";
  if (
    normalized.startsWith("/tarot") ||
    normalized.startsWith("/tarot/result") ||
    normalized.startsWith("/single") ||
    normalized.startsWith("/three-card")
  ) {
    return "塔羅抽牌";
  }
  if (
    normalized.startsWith("/triple-zodiac") ||
    normalized.startsWith("/astro-profile") ||
    normalized.startsWith("/zodiac-report")
  ) {
    return "三重星座";
  }
  if (
    normalized.startsWith("/daily-zodiac") ||
    normalized.startsWith("/horoscope") ||
    normalized.startsWith("/daily-horoscope") ||
    normalized.startsWith("/daily")
  ) {
    return "每日星座";
  }
  return "其他頁面";
}

function paymentSourceFromOrder(order: Record<string, unknown>, fallback: string) {
  const values = [
    order.productType,
    order.product,
    order.type,
    order.resultType,
    order.mode,
    order.planId,
    order.planName,
    order.path,
    order.source,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
  if (values.includes("astro") || values.includes("triple") || values.includes("zodiac-profile")) return "三重星座";
  if (values.includes("daily") || values.includes("horoscope")) return "每日星座";
  if (values.includes("tarot") || values.includes("redeem") || values.includes("card")) return "塔羅抽牌";
  return fallback;
}

function rowsFromCounts(counts: Map<string, number>, total: number, labels?: string[]): BreakdownRow[] {
  const source = labels ?? Array.from(counts.keys());
  return source
    .map((label) => ({ label, count: counts.get(label) ?? 0, ratio: calcRatio(counts.get(label) ?? 0, total) }))
    .sort((a, b) => b.count - a.count);
}

function paymentRowsFromMap(rows: Map<string, { count: number; revenue: number }>): PaymentBreakdownRow[] {
  const labels = ["塔羅抽牌", "三重星座", "每日星座", "其他"];
  const total = labels.reduce((sum, label) => sum + (rows.get(label)?.count ?? 0), 0);
  return labels
    .map((label) => {
      const row = rows.get(label) ?? { count: 0, revenue: 0 };
      return { label, count: row.count, ratio: calcRatio(row.count, total), revenue: row.revenue };
    })
    .sort((a, b) => b.count - a.count);
}

function buildVisitorSources(events: AnalyticsEvent[]) {
  const labels = ["Facebook", "Instagram", "Threads", "LINE", "Google", "直接進入", "其他"];
  const sourceVisitors = new Map<string, Set<string>>();

  for (const event of events) {
    if (event.eventType !== "session_start" && event.eventType !== "page_view") continue;
    const uid = visitorKey(event);
    if (!uid) continue;
    const source = sourceFrom(event.referrer, event.url, event.utmSource);
    const current = sourceVisitors.get(source) ?? new Set<string>();
    current.add(uid);
    sourceVisitors.set(source, current);
  }

  const counts = new Map(labels.map((label) => [label, sourceVisitors.get(label)?.size ?? 0]));
  const total = Array.from(new Set(events.map(visitorKey).filter(Boolean))).length;
  return rowsFromCounts(counts, total, labels);
}

function buildFeatureRanking(events: AnalyticsEvent[]) {
  const counts = new Map<string, number>();
  let total = 0;
  for (const event of events) {
    if (event.eventType !== "page_view") continue;
    const feature = featureFromPath(event.path ?? event.url);
    counts.set(feature, (counts.get(feature) ?? 0) + 1);
    total += 1;
  }
  return rowsFromCounts(counts, total, ["首頁", "塔羅抽牌", "三重星座", "每日星座", "其他頁面"]);
}

function buildUnlock(free: number, paid: number): PeriodUnlock {
  return { free, paid, total: free + paid, ratio: calcRatio(paid, free + paid) };
}

function buildTraffic(events: AnalyticsEvent[]): TrafficPeriod {
  const sessions = new Map<string, { visitor: string | null; pageViews: number; active: number; hasStart: boolean }>();
  const visitors = new Set<string>();

  for (const event of events) {
    const sessionId = event.sessionId || visitorKey(event) || "unknown";
    const current = sessions.get(sessionId) ?? { visitor: visitorKey(event), pageViews: 0, active: 0, hasStart: false };
    if (event.eventType === "page_view") current.pageViews += 1;
    if (event.eventType === "session_start") current.hasStart = true;
    if (event.eventType === "session_heartbeat") current.active = Math.max(current.active, cleanSeconds(event.activeSeconds));
    current.visitor = current.visitor ?? visitorKey(event);
    sessions.set(sessionId, current);
    const uid = visitorKey(event);
    if (uid && (event.eventType === "session_start" || event.eventType === "page_view")) visitors.add(uid);
  }

  const rows = Array.from(sessions.values()).filter((row) => row.hasStart || row.pageViews > 0);
  const bounces = rows.filter((row) => row.pageViews <= 1 && row.active < 10).length;
  return {
    visitors: visitors.size,
    sessions: events.filter((event) => event.eventType === "session_start").length || rows.length,
    pageViews: events.filter((event) => event.eventType === "page_view").length,
    avgActiveSeconds: average(rows.map((row) => row.active)),
    bounceRate: calcRatio(bounces, rows.length),
  };
}

function buildSourceRows(events: AnalyticsEvent[]): SourceRow[] {
  const sessionSource = new Map<string, string>();
  const sourceMap = new Map<string, { sessions: number; visitors: Set<string>; active: number[]; paid: number; draws: number; freeUnlocks: number }>();
  const sessionActive = new Map<string, number>();

  for (const event of events) {
    if (!event.sessionId) continue;
    if (event.eventType === "session_heartbeat") {
      sessionActive.set(event.sessionId, Math.max(sessionActive.get(event.sessionId) ?? 0, cleanSeconds(event.activeSeconds)));
    }
    if (event.eventType !== "session_start") continue;
    const source = sourceFrom(event.referrer, event.url, event.utmSource);
    sessionSource.set(event.sessionId, source);
    const current = sourceMap.get(source) ?? { sessions: 0, visitors: new Set<string>(), active: [], paid: 0, draws: 0, freeUnlocks: 0 };
    current.sessions += 1;
    const uid = visitorKey(event);
    if (uid) current.visitors.add(uid);
    sourceMap.set(source, current);
  }

  for (const event of events) {
    if (!event.sessionId) continue;
    const source = sessionSource.get(event.sessionId) ?? "Direct";
    const current = sourceMap.get(source);
    if (!current) continue;
    if (event.eventType === "payment_success" && !event.isTest) current.paid += 1;
    if (event.eventType === "tarot_draw_complete") current.draws += 1;
    if (event.eventType === "free_unlock") current.freeUnlocks += 1;
  }

  for (const [sessionId, source] of sessionSource.entries()) {
    sourceMap.get(source)?.active.push(sessionActive.get(sessionId) ?? 0);
  }

  return Array.from(sourceMap.entries())
    .map(([source, row]) => ({
      source,
      sessions: row.sessions,
      visitors: row.visitors.size,
      avgActiveSeconds: average(row.active),
      drawCount: row.draws,
      freeUnlockCount: row.freeUnlocks,
      paidSuccess: row.paid,
      paidConversionRate: calcRatio(row.paid, row.sessions),
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 10);
}

function emptyStatsPayload(date: string, monthKey: string, freeDraws: number, paidUnlocks: number, events: AnalyticsEvent[], lineSends: number) {
  const unlock = buildUnlock(freeDraws, paidUnlocks);
  const lineSave: LineSavePeriod = { count: lineSends, users: new Set(events.filter((event) => event.eventType === "line_save").map(visitorKey).filter(Boolean)).size };
  const traffic = buildTraffic(events);
  return {
    today: date,
    monthKey,
    unlock: { today: unlock, month: unlock, all: unlock },
    questionTypes: { today: [], month: [], all: [] },
    spread: { today: [], month: [], all: [] },
    lineSave: { today: lineSave, month: lineSave, all: lineSave },
    traffic: { today: traffic, month: traffic, all: traffic },
    trafficSources: buildSourceRows(events),
    pageStay: [],
    funnel: [],
    funnelFilter: { type: "today" as const, date },
    paymentOrderCount: paidUnlocks,
  };
}

async function cleanupOldSnapshots(db: FirebaseFirestore.Firestore, cutoffDate: string) {
  const oldSnaps = await db
    .collection("daily_admin_stats")
    .where("date", "<", cutoffDate)
    .limit(30)
    .get()
    .catch(() => null);
  if (!oldSnaps || oldSnaps.empty) return;

  const batch = db.batch();
  for (const doc of oldSnaps.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const target = resolveTarget(new URL(req.url).searchParams);
  if (!target) return NextResponse.json({ ok: false, error: "INVALID_DATE" }, { status: 400 });

  const { date, period, rangeStart, rangeEnd } = target;
  const db = getAdminDb();
  const adminLineIds = new Set(getAdminUserIds());
  const adminEmails = new Set(getAdminEmailList());

  try {
    const [analyticsSnap, downloadSnap, orderSnap, astroSnap, rateLimitSnap, fortuneSnap, redeemSnap, zodiacEventSnap, zodiacCodeSnap] = await Promise.all([
      db.collection("analytics_events").where("createdAt", ">=", rangeStart).where("createdAt", "<", rangeEnd).limit(5000).get().catch(() => null),
      db.collection("share_image_downloads").where("createdAt", ">=", rangeStart).where("createdAt", "<", rangeEnd).limit(2000).get().catch(() => null),
      db.collection(PAYMENT_ORDERS_COLLECTION).where("paidAt", ">=", rangeStart).where("paidAt", "<", rangeEnd).limit(1000).get().catch(() => null),
      db.collection("astroProfileOrders").where("paidAt", ">=", rangeStart).where("paidAt", "<", rangeEnd).limit(500).get().catch(() => null),
      db.collection("rate_limits").doc(date).get().catch(() => null),
      db.collection("fortune_stats").doc(date).get().catch(() => null),
      db.collection(REDEEM_CODES_COLLECTION).where("createdAt", ">=", rangeStart).where("createdAt", "<", rangeEnd).limit(1000).get().catch(() => null),
      // 三重星座行為事件（started / free_success / line_sent / email_sent / story_downloaded）
      db.collection("triple_zodiac_events").where("createdAt", ">=", rangeStart).where("createdAt", "<", rangeEnd).limit(5000).get().catch(() => null),
      // 三重星座兌換碼使用紀錄（兌換碼成功）
      db.collection("astroProfileReissueCodes").where("usedAt", ">=", rangeStart).where("usedAt", "<", rangeEnd).limit(500).get().catch(() => null),
    ]);

    const analyticsEvents: AnalyticsEvent[] = analyticsSnap
      ? analyticsSnap.docs
          .map((doc) => doc.data() as AnalyticsEvent)
          .filter((event) => {
            if (event.isAdmin === true || event.isTest === true) return false;
            if (event.lineUserId && adminLineIds.has(event.lineUserId)) return false;
            return isPublicPath(normalizePath(event.path));
          })
      : [];

    const visitors = new Set<string>();
    let tarotDraws = 0;
    let lineSends = 0;
    let tripleZodiacPageViews = 0;
    const sourceBreakdown: Record<string, number> = {};
    for (const event of analyticsEvents) {
      const uid = visitorKey(event);
      if (uid && (event.eventType === "session_start" || event.eventType === "page_view")) visitors.add(uid);
      if (event.eventType === "tarot_draw_complete") tarotDraws += 1;
      if (event.eventType === "line_save") lineSends += 1;
      if (event.eventType === "page_view" && featureFromPath(event.path ?? event.url) === "三重星座") tripleZodiacPageViews += 1;
      if (event.eventType === "session_start") {
        const source = sourceFrom(event.referrer, event.url, event.utmSource);
        sourceBreakdown[source] = (sourceBreakdown[source] ?? 0) + 1;
      }
    }

    const usageData = (rateLimitSnap?.data() ?? {}) as {
      total_requests?: number;
      total_blocked?: number;
      feature_usage?: Record<string, number>;
      ip_usage?: Record<string, number>;
      ip_display?: Record<string, string>;
      anon_usage?: Record<string, number>;
      line_usage?: Record<string, number>;
    };
    const featureUsage = usageData.feature_usage ?? {};
    const dailySingle = featureUsage.single_tarot ?? 0;
    const dailyThree = featureUsage.three_card ?? 0;
    const freeDraws = period === "full" ? dailySingle + dailyThree : tarotDraws;

    let paidUnlocks = 0;
    const redeemStats = { total: 0, active: 0, usedUp: 0, test: 0 };
    if (redeemSnap) {
      for (const doc of redeemSnap.docs) {
        const code = doc.data() as RedeemCodeData;
        if (code.isTest) {
          redeemStats.test += 1;
          continue;
        }
        if (code.buyerEmail && adminEmails.has(code.buyerEmail.toLowerCase())) continue;
        redeemStats.total += 1;
        if (code.status === "active") redeemStats.active += 1;
        if (code.status === "used_up") redeemStats.usedUp += 1;
        paidUnlocks += (code.usedLogs ?? []).filter((log) => inRange(log.usedAt, rangeStart, rangeEnd)).length;
      }
    }

    let revenue = 0;
    const paymentSourceMap = new Map<string, { count: number; revenue: number }>();
    const addPaymentSource = (label: string, amount: number) => {
      const current = paymentSourceMap.get(label) ?? { count: 0, revenue: 0 };
      current.count += 1;
      current.revenue += amount;
      paymentSourceMap.set(label, current);
    };
    const orderStats = { total: 0, paid: 0, failed: 0, pending: 0, todayRevenue: 0, todayPaid: 0, todayTest: 0, noCode: 0, emailUnsent: 0 };
    if (orderSnap) {
      for (const doc of orderSnap.docs) {
        const order = doc.data() as { status?: string; amount?: number; isTest?: boolean; redeemCode?: string; emailSent?: boolean; buyerEmail?: string } & Record<string, unknown>;
        if (order.isTest) {
          if (order.status === "paid") orderStats.todayTest += 1;
          continue;
        }
        if (order.buyerEmail && adminEmails.has(order.buyerEmail.toLowerCase())) continue;
        orderStats.total += 1;
        if (order.status === "paid") {
          orderStats.paid += 1;
          orderStats.todayPaid += 1;
          orderStats.todayRevenue += order.amount ?? 0;
          revenue += order.amount ?? 0;
          addPaymentSource(paymentSourceFromOrder(order, "塔羅抽牌"), order.amount ?? 0);
          if (!order.redeemCode) orderStats.noCode += 1;
          if (!order.emailSent) orderStats.emailUnsent += 1;
        }
        if (order.status === "failed") orderStats.failed += 1;
        if (order.status === "pending") orderStats.pending += 1;
      }
    }
    paidUnlocks = Math.max(
      paidUnlocks,
      orderStats.paid,
      analyticsEvents.filter((event) => event.eventType === "payment_success" && !event.isTest).length,
    );

    let shareImageDownloads = 0;
    const shareUsers = new Set<string>();
    if (downloadSnap) {
      for (const doc of downloadSnap.docs) {
        const event = doc.data() as { isAdmin?: boolean; isTest?: boolean; lineUserId?: string | null; anonymousId?: string | null; ip?: string };
        if (event.isAdmin === true || event.isTest === true) continue;
        if (event.lineUserId && adminLineIds.has(event.lineUserId)) continue;
        shareImageDownloads += 1;
        const uid = event.lineUserId ? `LINE:${event.lineUserId}` : event.anonymousId ? `anon:${event.anonymousId}` : event.ip ? `ip:${event.ip}` : null;
        if (uid) shareUsers.add(uid);
      }
    }

    let astroProfileCount = 0;
    let astroProfileRevenue = 0;
    if (astroSnap) {
      for (const doc of astroSnap.docs) {
        const order = doc.data() as { isTest?: boolean; buyerEmail?: string; status?: string; amount?: number } & Record<string, unknown>;
        if (order.isTest || order.status === "failed") continue;
        if (order.buyerEmail && adminEmails.has(order.buyerEmail.toLowerCase())) continue;
        astroProfileCount += 1;
        astroProfileRevenue += order.amount ?? 0;
        addPaymentSource(paymentSourceFromOrder(order, "三重星座"), order.amount ?? 0);
      }
    }
    revenue += astroProfileRevenue;
    const paidSuccess = orderStats.todayPaid + astroProfileCount;

    // ── 三重星座（astro-profile）獨立統計 ──────────────────────────────────────
    // 行為事件來自 triple_zodiac_events（純儀表化，不含敏感個資）；
    // 付費與收入沿用 astroProfileOrders（金額權威來源）；
    // 兌換碼成功沿用 astroProfileReissueCodes。
    const zodiacEventCounts: Record<string, number> = {};
    if (zodiacEventSnap) {
      for (const doc of zodiacEventSnap.docs) {
        const event = doc.data() as { eventType?: string; isAdmin?: boolean; isTest?: boolean };
        if (event.isAdmin === true || event.isTest === true) continue;
        const type = typeof event.eventType === "string" ? event.eventType : "";
        if (!type) continue;
        zodiacEventCounts[type] = (zodiacEventCounts[type] ?? 0) + 1;
      }
    }
    let tripleZodiacCodeSuccess = 0;
    if (zodiacCodeSnap) {
      for (const doc of zodiacCodeSnap.docs) {
        const code = doc.data() as { status?: string; type?: string };
        if (code.type && code.type !== "astro-profile-reissue") continue;
        tripleZodiacCodeSuccess += 1;
      }
    }
    const tripleZodiacPaidSuccess = astroProfileCount;
    const tripleZodiacRevenue = astroProfileRevenue;
    const tripleZodiacGenerated = tripleZodiacPaidSuccess + tripleZodiacCodeSuccess;
    const zodiacStats: ZodiacStats = {
      tripleZodiacPageViews,
      tripleZodiacStarted: zodiacEventCounts["triple_zodiac_started"] ?? 0,
      tripleZodiacGenerated,
      tripleZodiacFreeSuccess: zodiacEventCounts["triple_zodiac_free_success"] ?? 0,
      tripleZodiacPaidSuccess,
      tripleZodiacCodeSuccess,
      tripleZodiacLineSent: zodiacEventCounts["triple_zodiac_line_sent"] ?? 0,
      tripleZodiacEmailSent: zodiacEventCounts["triple_zodiac_email_sent"] ?? 0,
      tripleZodiacStoryDownloaded: zodiacEventCounts["triple_zodiac_story_downloaded"] ?? 0,
      tripleZodiacRevenue,
      conversionRates: {
        pageToGenerated: calcRatio(tripleZodiacGenerated, tripleZodiacPageViews),
        generatedToPaid: calcRatio(tripleZodiacPaidSuccess, tripleZodiacGenerated),
        pageToPaid: calcRatio(tripleZodiacPaidSuccess, tripleZodiacPageViews),
      },
    };

    const sortedEntries = (map: Record<string, number>) =>
      Object.entries(map).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
    const ipDisplay = usageData.ip_display ?? {};
    const ipRanking = sortedEntries(usageData.ip_usage ?? {}).slice(0, 20).map(({ key, count }) => ({ display: ipDisplay[key] ?? key, count }));
    const anonRanking = sortedEntries(usageData.anon_usage ?? {}).slice(0, 20).map(({ key, count }) => ({ display: key, count }));
    const lineRanking = sortedEntries(usageData.line_usage ?? {}).filter(({ key }) => !adminLineIds.has(key)).slice(0, 20).map(({ key, count }) => ({ display: key, count }));

    const statsPayload = emptyStatsPayload(date, date.slice(0, 7), freeDraws, paidUnlocks, analyticsEvents, lineSends);
    const dailyMetrics: DailyMetrics = {
      date,
      period,
      label: period === "am" ? "今日 00:00-12:00" : period === "pm" ? "今日 12:00-23:59" : "昨日 00:00-23:59",
      visitors: visitors.size,
      pageViews: statsPayload.traffic.today.pageViews,
      tarotDraws,
      freeDraws,
      paidSuccess: paidSuccess || paidUnlocks,
      revenue,
      conversionRates: {
        visitorToDraw: calcRatio(tarotDraws, visitors.size),
        drawToPaid: calcRatio(paidSuccess || paidUnlocks, tarotDraws),
        visitorToPaid: calcRatio(paidSuccess || paidUnlocks, visitors.size),
      },
      visitorSources: buildVisitorSources(analyticsEvents),
      featureRanking: buildFeatureRanking(analyticsEvents),
      paymentSources: paymentRowsFromMap(paymentSourceMap),
      zodiacStats,
    };
    const docData = {
      date,
      period,
      timezone: "Asia/Taipei",
      rangeStart,
      rangeEnd,
      generatedAt: FieldValue.serverTimestamp(),
      dailyMetrics,
      visitors: visitors.size,
      freeDraws,
      paidUnlocks,
      revenue,
      paymentRate: calcRatio(paidUnlocks, freeDraws + paidUnlocks),
      shareImageDownloads,
      lineSends,
      lineRedeems: lineSends,
      tarotDraws,
      astroProfileCount,
      zodiacStats,
      sourceBreakdown,
      usageData,
      fortuneCoverage: ((fortuneSnap?.data() ?? {}) as { generated_zodiacs?: string[] }).generated_zodiacs?.length ?? 0,
      redeemStats,
      orderStats,
      shareDownloadStats: {
        todayCount: shareImageDownloads,
        todayUsers: shareUsers.size,
        allCount: shareImageDownloads,
        allUsers: shareUsers.size,
      },
      shareDownloadRanking: [],
      ipRanking,
      anonRanking,
      lineRanking,
      statsPayload,
    };

    const docId = `${date}_${period}`;
    await db.collection("daily_admin_stats").doc(docId).set(docData, { merge: true });
    await cleanupOldSnapshots(db, addDays(date, -6));

    return NextResponse.json({
      ok: true,
      id: docId,
      date,
      period,
      timezone: "Asia/Taipei",
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
      visitors: visitors.size,
      freeDraws,
      paidUnlocks,
      revenue,
      dailyMetrics,
      paymentRate: docData.paymentRate,
      shareImageDownloads,
      lineSends,
      tarotDraws,
      astroProfileCount,
      zodiacStats,
      sourceBreakdown,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("[daily-stats/generate] failed:", { name: error.name, message: error.message, date, period });
    return jsonServerError(err, "INTERNAL_ERROR");
  }
}
