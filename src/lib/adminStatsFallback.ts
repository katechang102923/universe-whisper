// ─────────────────────────────────────────────────────────────────────────────
// 後台統計「原始事件補算」— 唯讀（read-only）
//
// 用途：當某天的 daily_admin_stats 快照不存在（例如 cron 尚未/未曾產生）時，
// /api/admin/stats 改用本模組直接從原始 collection 即時彙整該天數據，避免後台顯示 0。
//
// 只做讀取與彙整，不寫入任何 collection、不影響任何前台 / 付款 / LINE / 抽牌流程。
// 彙整口徑刻意對齊 /api/admin/daily-stats/generate 的「full（整日）」快照：
//   - 訪客 / 頁面瀏覽 / 三重星座頁面瀏覽：analytics_events（含匿名 / IP，非只算登入）
//   - 免費成功：rate_limits/{date}.feature_usage（single_tarot + three_card）
//   - 付費成功 / 收入：paymentOrders + astroProfileOrders（以 Asia/Taipei 付款日歸屬）
//   - 三重星座免費成功：triple_zodiac_events + astroProfileReissueCodes
// 日期以 Asia/Taipei 為準（事件用 dateKey 欄位，訂單用付款日字串），含當日完整時間。
// ─────────────────────────────────────────────────────────────────────────────

import { getAdminUserIds } from "@/lib/rateLimit";
import { getAdminEmailList } from "@/lib/verifyAdmin";
import { PAYMENT_ORDERS_COLLECTION } from "@/lib/redeemCodes";

export type RawBreakdownRow = { label: string; count: number; ratio: string };
export type RawPaymentRow = { label: string; count: number; ratio: string; revenue: number };

export type RawDayMetrics = {
  visitors: number;
  pageViews: number;
  tarotSingleSuccess: number;
  tarotThreeSuccess: number;
  freeSuccess: number;
  paidSuccess: number;
  tarotDrawSuccess: number;
  revenue: number;
  astroProfilePageViews: number;
  astroProfileFreeSuccess: number;
  astroProfilePaidSuccess: number;
  astroProfileSuccess: number;
  astroProfileRevenue: number;
  sourceStats: RawBreakdownRow[];
  popularFeatureStats: RawBreakdownRow[];
  paymentSourceStats: RawPaymentRow[];
};

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
  dateKey?: string;
  isTest?: boolean;
  isAdmin?: boolean;
};

// ── 共用小工具（與 generate 口徑一致，read-only 重用）─────────────────────────────

function calcRatio(numerator: number, denominator: number): string {
  if (!denominator) return "0%";
  return `${Math.round((numerator / denominator) * 1000) / 10}%`;
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

function taipeiDayKey(d: Date | null): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** 台北當地某日某時 → 對應 UTC Date（用於訂單建立時間視窗）*/
function taipeiLocalToUtc(dateKey: string, hour: number): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 8, 0, 0, 0));
}

const PAID_STATUSES = new Set(["paid", "success", "completed", "succeeded"]);
function isPaidStatus(status: unknown): boolean {
  return typeof status === "string" && PAID_STATUSES.has(status.toLowerCase());
}
function isTestOrder(order: Record<string, unknown>): boolean {
  return Boolean(order.isTest) || Boolean(order.isTestPayment);
}
function resolveAmount(order: Record<string, unknown>): number {
  const v = order.paidAmount ?? order.amount ?? order.tradeAmt;
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
}
/** 付款成功用付款日歸屬，其餘用建立日；皆以 Asia/Taipei 判定 */
function orderAttributionDayKey(order: Record<string, unknown>, paid: boolean): string | null {
  if (paid) {
    return taipeiDayKey(resolveTs(order.paidAt) ?? resolveTs(order.paymentDate) ?? resolveTs(order.createdAt));
  }
  return taipeiDayKey(resolveTs(order.createdAt));
}

function visitorKey(event: Pick<AnalyticsEvent, "lineUserId" | "anonymousId" | "ipHash">): string | null {
  if (event.lineUserId) return `line:${event.lineUserId}`;
  if (event.anonymousId) return `anon:${event.anonymousId}`;
  if (event.ipHash) return `ip:${event.ipHash}`;
  return null;
}

function normalizePath(path?: string): string {
  if (!path) return "/";
  try {
    return new URL(path, "https://example.com").pathname;
  } catch {
    return path.startsWith("/") ? path : "/";
  }
}

function isPublicPath(path: string): boolean {
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

function featureFromPath(path?: string): string {
  const normalized = normalizePath(path);
  if (normalized === "/") return "首頁";
  if (
    normalized.startsWith("/tarot") ||
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

function paymentSourceFromOrder(order: Record<string, unknown>, fallback: string): string {
  const values = [
    order.productType, order.product, order.type, order.resultType,
    order.mode, order.planId, order.planName, order.path, order.source,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
  if (values.includes("astro") || values.includes("triple") || values.includes("zodiac-profile")) return "三重星座";
  if (values.includes("daily") || values.includes("horoscope")) return "每日星座";
  if (values.includes("tarot") || values.includes("redeem") || values.includes("card")) return "塔羅抽牌";
  return fallback;
}

function rowsFromCounts(counts: Map<string, number>, total: number, labels: string[]): RawBreakdownRow[] {
  return labels
    .map((label) => ({ label, count: counts.get(label) ?? 0, ratio: calcRatio(counts.get(label) ?? 0, total) }))
    .sort((a, b) => b.count - a.count);
}

function buildVisitorSources(events: AnalyticsEvent[]): RawBreakdownRow[] {
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

function buildFeatureRanking(events: AnalyticsEvent[]): RawBreakdownRow[] {
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

function paymentRowsFromMap(rows: Map<string, { count: number; revenue: number }>): RawPaymentRow[] {
  const labels = ["塔羅抽牌", "三重星座", "每日星座", "其他"];
  const total = labels.reduce((sum, label) => sum + (rows.get(label)?.count ?? 0), 0);
  return labels
    .map((label) => {
      const row = rows.get(label) ?? { count: 0, revenue: 0 };
      return { label, count: row.count, ratio: calcRatio(row.count, total), revenue: row.revenue };
    })
    .sort((a, b) => b.count - a.count);
}

function emptyDay(): RawDayMetrics {
  return {
    visitors: 0, pageViews: 0,
    tarotSingleSuccess: 0, tarotThreeSuccess: 0, freeSuccess: 0,
    paidSuccess: 0, tarotDrawSuccess: 0, revenue: 0,
    astroProfilePageViews: 0, astroProfileFreeSuccess: 0,
    astroProfilePaidSuccess: 0, astroProfileSuccess: 0, astroProfileRevenue: 0,
    sourceStats: [], popularFeatureStats: [], paymentSourceStats: [],
  };
}

/**
 * 從原始事件即時彙整指定 Asia/Taipei 日期（陣列）的後台統計。
 * 回傳 Map<dateKey, RawDayMetrics>；缺資料的日期回空白指標（全 0），仍會被回傳。
 */
export async function computeRawDayMetrics(
  db: FirebaseFirestore.Firestore,
  dates: string[],
): Promise<Map<string, RawDayMetrics>> {
  const result = new Map<string, RawDayMetrics>();
  const wanted = new Set(dates);
  if (!dates.length) return result;

  const sorted = [...dates].sort();
  const minDate = sorted[0];
  const maxDate = sorted[sorted.length - 1];
  // 訂單以建立時間寬鬆視窗查詢（涵蓋整段日期 ±36h），實際歸屬再用 Asia/Taipei 付款日精準過濾
  const orderWindowStart = new Date(taipeiLocalToUtc(minDate, 0).getTime() - 36 * 3600 * 1000);
  const orderWindowEnd = new Date(taipeiLocalToUtc(maxDate, 24).getTime() + 36 * 3600 * 1000);

  const adminLineIds = new Set(getAdminUserIds());
  const adminEmails = new Set(getAdminEmailList());

  const [analyticsSnap, zodiacEventSnap, orderSnap, astroOrderSnap, zodiacCodeSnap, rateLimitSnaps] =
    await Promise.all([
      db.collection("analytics_events").where("dateKey", ">=", minDate).where("dateKey", "<=", maxDate).limit(50000).get().catch(() => null),
      db.collection("triple_zodiac_events").where("dateKey", ">=", minDate).where("dateKey", "<=", maxDate).limit(20000).get().catch(() => null),
      db.collection(PAYMENT_ORDERS_COLLECTION).where("createdAt", ">=", orderWindowStart).where("createdAt", "<", orderWindowEnd).limit(2000).get().catch(() => null),
      db.collection("astroProfileOrders").where("createdAt", ">=", orderWindowStart).where("createdAt", "<", orderWindowEnd).limit(1000).get().catch(() => null),
      db.collection("astroProfileReissueCodes").where("usedAt", ">=", orderWindowStart).where("usedAt", "<", orderWindowEnd).limit(1000).get().catch(() => null),
      db.getAll(...dates.map((date) => db.collection("rate_limits").doc(date))).catch(() => null),
    ]);

  // ── analytics_events 依日期分組（排除管理員 / 測試 / 非公開頁面）─────────────────
  const eventsByDate = new Map<string, AnalyticsEvent[]>();
  if (analyticsSnap) {
    for (const doc of analyticsSnap.docs) {
      const event = doc.data() as AnalyticsEvent;
      if (event.isAdmin === true || event.isTest === true) continue;
      if (event.lineUserId && adminLineIds.has(event.lineUserId)) continue;
      if (!isPublicPath(normalizePath(event.path))) continue;
      const dateKey = typeof event.dateKey === "string" ? event.dateKey : "";
      if (!wanted.has(dateKey)) continue;
      const arr = eventsByDate.get(dateKey) ?? [];
      arr.push(event);
      eventsByDate.set(dateKey, arr);
    }
  }

  // ── 三重星座免費成功事件依日期計數 ──────────────────────────────────────────────
  const zodiacFreeByDate = new Map<string, number>();
  if (zodiacEventSnap) {
    for (const doc of zodiacEventSnap.docs) {
      const ev = doc.data() as { eventType?: string; dateKey?: string; isAdmin?: boolean; isTest?: boolean };
      if (ev.isAdmin === true || ev.isTest === true) continue;
      if (ev.eventType !== "triple_zodiac_free_success") continue;
      const dateKey = typeof ev.dateKey === "string" ? ev.dateKey : "";
      if (!wanted.has(dateKey)) continue;
      zodiacFreeByDate.set(dateKey, (zodiacFreeByDate.get(dateKey) ?? 0) + 1);
    }
  }

  // ── 三重星座兌換碼成功依使用日（付款日同等）計數 ─────────────────────────────────
  const zodiacCodeByDate = new Map<string, number>();
  if (zodiacCodeSnap) {
    for (const doc of zodiacCodeSnap.docs) {
      const code = doc.data() as { type?: string; usedAt?: unknown };
      if (code.type && code.type !== "astro-profile-reissue") continue;
      const dateKey = taipeiDayKey(resolveTs(code.usedAt));
      if (!dateKey || !wanted.has(dateKey)) continue;
      zodiacCodeByDate.set(dateKey, (zodiacCodeByDate.get(dateKey) ?? 0) + 1);
    }
  }

  // ── 訂單依 Asia/Taipei 付款日歸屬：塔羅付費 / 收入 / 付費來源 ──────────────────────
  type DayOrderAgg = { tarotPaid: number; tarotRevenue: number; paymentRows: Map<string, { count: number; revenue: number }> };
  const orderByDate = new Map<string, DayOrderAgg>();
  const ensureOrderDay = (dateKey: string): DayOrderAgg => {
    const cur = orderByDate.get(dateKey) ?? { tarotPaid: 0, tarotRevenue: 0, paymentRows: new Map() };
    orderByDate.set(dateKey, cur);
    return cur;
  };
  const addPaymentRow = (agg: DayOrderAgg, label: string, amount: number) => {
    const row = agg.paymentRows.get(label) ?? { count: 0, revenue: 0 };
    row.count += 1;
    row.revenue += amount;
    agg.paymentRows.set(label, row);
  };

  if (orderSnap) {
    for (const doc of orderSnap.docs) {
      const order = doc.data() as { status?: string; buyerEmail?: string } & Record<string, unknown>;
      const paid = isPaidStatus(order.status);
      if (!paid) continue;
      if (isTestOrder(order)) continue;
      if (order.buyerEmail && adminEmails.has(String(order.buyerEmail).toLowerCase())) continue;
      const dateKey = orderAttributionDayKey(order, true);
      if (!dateKey || !wanted.has(dateKey)) continue;
      const amount = resolveAmount(order);
      const agg = ensureOrderDay(dateKey);
      agg.tarotPaid += 1;
      agg.tarotRevenue += amount;
      addPaymentRow(agg, paymentSourceFromOrder(order, "塔羅抽牌"), amount);
    }
  }

  // ── 三重星座訂單：付費成功 / 收入 ───────────────────────────────────────────────
  const astroByDate = new Map<string, { paid: number; revenue: number; paymentRows: Map<string, { count: number; revenue: number }> }>();
  if (astroOrderSnap) {
    for (const doc of astroOrderSnap.docs) {
      const order = doc.data() as { status?: string; buyerEmail?: string } & Record<string, unknown>;
      const paid = isPaidStatus(order.status);
      if (!paid) continue;
      if (isTestOrder(order)) continue;
      if (order.buyerEmail && adminEmails.has(String(order.buyerEmail).toLowerCase())) continue;
      const dateKey = orderAttributionDayKey(order, true);
      if (!dateKey || !wanted.has(dateKey)) continue;
      const amount = resolveAmount(order);
      const cur = astroByDate.get(dateKey) ?? { paid: 0, revenue: 0, paymentRows: new Map() };
      cur.paid += 1;
      cur.revenue += amount;
      const row = cur.paymentRows.get("三重星座") ?? { count: 0, revenue: 0 };
      row.count += 1;
      row.revenue += amount;
      cur.paymentRows.set("三重星座", row);
      astroByDate.set(dateKey, cur);
    }
  }

  // ── rate_limits 免費抽牌（single / three）依日期 ─────────────────────────────────
  const freeByDate = new Map<string, { single: number; three: number }>();
  if (rateLimitSnaps) {
    rateLimitSnaps.forEach((snap, index) => {
      const date = dates[index];
      const data = (snap?.data() ?? {}) as { feature_usage?: Record<string, number> };
      const usage = data.feature_usage ?? {};
      freeByDate.set(date, {
        single: Number(usage.single_tarot) || 0,
        three: Number(usage.three_card) || 0,
      });
    });
  }

  // ── 組裝每日指標 ────────────────────────────────────────────────────────────────
  for (const date of dates) {
    const metrics = emptyDay();
    const events = eventsByDate.get(date) ?? [];

    const visitors = new Set<string>();
    let pageViews = 0;
    let astroPageViews = 0;
    for (const event of events) {
      const uid = visitorKey(event);
      if (uid && (event.eventType === "session_start" || event.eventType === "page_view")) visitors.add(uid);
      if (event.eventType === "page_view") {
        pageViews += 1;
        if (featureFromPath(event.path ?? event.url) === "三重星座") astroPageViews += 1;
      }
    }
    metrics.visitors = visitors.size;
    metrics.pageViews = pageViews;
    metrics.astroProfilePageViews = astroPageViews;
    metrics.sourceStats = buildVisitorSources(events);
    metrics.popularFeatureStats = buildFeatureRanking(events);

    const free = freeByDate.get(date) ?? { single: 0, three: 0 };
    metrics.tarotSingleSuccess = free.single;
    metrics.tarotThreeSuccess = free.three;
    metrics.freeSuccess = free.single + free.three;

    const order = orderByDate.get(date);
    const astro = astroByDate.get(date);
    const tarotPaid = order?.tarotPaid ?? 0;
    const astroPaid = astro?.paid ?? 0;
    metrics.paidSuccess = tarotPaid + astroPaid;
    metrics.tarotDrawSuccess = metrics.freeSuccess + tarotPaid;
    metrics.revenue = (order?.tarotRevenue ?? 0) + (astro?.revenue ?? 0);

    metrics.astroProfilePaidSuccess = astroPaid;
    metrics.astroProfileRevenue = astro?.revenue ?? 0;
    metrics.astroProfileFreeSuccess = (zodiacFreeByDate.get(date) ?? 0) + (zodiacCodeByDate.get(date) ?? 0);
    metrics.astroProfileSuccess = metrics.astroProfilePaidSuccess + metrics.astroProfileFreeSuccess;

    // 付費來源排行：合併塔羅訂單與三重星座訂單
    const mergedPaymentRows = new Map<string, { count: number; revenue: number }>();
    for (const [label, row] of order?.paymentRows ?? []) mergedPaymentRows.set(label, { ...row });
    for (const [label, row] of astro?.paymentRows ?? []) {
      const cur = mergedPaymentRows.get(label) ?? { count: 0, revenue: 0 };
      cur.count += row.count;
      cur.revenue += row.revenue;
      mergedPaymentRows.set(label, cur);
    }
    metrics.paymentSourceStats = paymentRowsFromMap(mergedPaymentRows);

    result.set(date, metrics);
  }

  return result;
}
