// ─────────────────────────────────────────────────────────────────────────────
// 後台「使用統計」原始資料即時計算（read-only）。
//
// 設計原則：
//  - 只讀取，不寫回 Firestore（不產生快照、不 merge 任何資料）。
//  - 以 Asia/Taipei 判定日期；有 dateKey 的 collection 直接用 dateKey 範圍查詢，
//    沒有 dateKey 的（訂單、限動下載）用時間欄位 + Asia/Taipei 歸屬日。
//  - 每個 collection 都加 limit，避免 Firestore 讀取暴增；達到上限時在 diagnostics
//    標記 truncated，提醒可能截斷。
//  - 主要營運數據預設排除 isAdmin / isTest / isTestPayment；管理員與測試另計到診斷區。
//  - 事件名稱完全依現有程式（analytics_events / triple_zodiac_events）實際名稱，不臆測。
//  - 付費嘗試 / 建立訂單：只要當天建立訂單（依 createdAt 的 Asia/Taipei 日）就計入，
//    不論 pending / unpaid / paid；付費成功與收入僅 paid/success 才算。
//
// 不影響任何前台寫入、付款、LINE、Email、抽牌、內容生成流程。
// ─────────────────────────────────────────────────────────────────────────────

import type { Firestore } from "firebase-admin/firestore";
import { getAdminUserIds } from "@/lib/rateLimit";
import { getAdminEmailList } from "@/lib/verifyAdmin";
import { PAYMENT_ORDERS_COLLECTION } from "@/lib/redeemCodes";

// 每個 collection 的讀取上限（合理 limit，避免讀取暴增；達上限會標記 truncated）
const LIMIT_ANALYTICS = 20000;
const LIMIT_TRIPLE = 10000;
const LIMIT_ORDERS = 3000;
const LIMIT_ASTRO_ORDERS = 1500;
const LIMIT_SHARE = 5000;

// 頁面瀏覽排行用的中文分類（後台一律顯示「四核心星座」，不再用「三重星座」）
export const PAGE_FEATURES = ["首頁", "塔羅抽牌", "四核心星座", "今日星座", "其他頁面"] as const;

export type RawDayMetrics = {
  date: string;
  visitors: number;
  pageViews: number;
  /** 各頁面分類瀏覽次數（PAGE_FEATURES 為 key） */
  pageViewByFeature: Record<string, number>;
  // 塔羅
  tarotPageViews: number;
  tarotDrawCompleted: number;
  tarotSingleSuccess: number;
  tarotThreeSuccess: number;
  tarotFreeSuccess: number;
  tarotPaidSuccess: number;
  tarotPaymentAttempts: number; // 建立訂單（含 pending）
  tarotRevenue: number;
  tarotLineSent: number;
  tarotEmailSent: number; // 目前無事件來源 → 恆為 0（診斷區標示）
  tarotStoryDownloaded: number; // 由 share_image_downloads 輔助判斷，無資料則 0
  // 四核心星座（內部資料來源仍為 astro-profile / triple_zodiac，不改 key）
  astroProfilePageViews: number;
  astroProfileStarted: number;
  astroProfileFreeSuccess: number;
  astroProfilePaidSuccess: number;
  astroProfilePaymentAttempts: number; // 建立訂單（含 pending）
  astroProfileRevenue: number;
  astroProfileLineSent: number;
  astroProfileEmailSent: number;
  astroProfileStoryDownloaded: number;
};

export type RawDiagnostics = {
  counts: {
    analyticsEvents: number;
    pageViewEvents: number;
    sessionStartEvents: number;
    tripleZodiacEvents: number;
    paymentOrders: number;
    astroProfileOrders: number;
    rateLimits: number;
    shareImageDownloads: number;
  };
  /** 訂單狀態統計（已排除 test / admin，依 createdAt 的 Asia/Taipei 日落在區間內） */
  pendingOrderCount: number;
  paidOrderCount: number;
  /** 因 test / admin 被排除的訂單數（createdAt 日落在區間內） */
  excludedOrderCount: number;
  adminEventCount: number;
  testEventCount: number;
  normalEventCount: number;
  allEventCount: number;
  /** 達到讀取上限、可能被截斷的 collection 名稱 */
  truncated: string[];
  /** share_image_downloads 是否有可用資料（查無集合 / 全空 → false） */
  shareImageAvailable: boolean;
};

export type RawResult = {
  perDay: Record<string, RawDayMetrics>;
  diagnostics: RawDiagnostics;
};

// ── 內部工具 ──────────────────────────────────────────────────────────────────

function emptyFeatureMap(): Record<string, number> {
  const m: Record<string, number> = {};
  for (const f of PAGE_FEATURES) m[f] = 0;
  return m;
}

function emptyDay(date: string): RawDayMetrics {
  return {
    date,
    visitors: 0,
    pageViews: 0,
    pageViewByFeature: emptyFeatureMap(),
    tarotPageViews: 0,
    tarotDrawCompleted: 0,
    tarotSingleSuccess: 0,
    tarotThreeSuccess: 0,
    tarotFreeSuccess: 0,
    tarotPaidSuccess: 0,
    tarotPaymentAttempts: 0,
    tarotRevenue: 0,
    tarotLineSent: 0,
    tarotEmailSent: 0,
    tarotStoryDownloaded: 0,
    astroProfilePageViews: 0,
    astroProfileStarted: 0,
    astroProfileFreeSuccess: 0,
    astroProfilePaidSuccess: 0,
    astroProfilePaymentAttempts: 0,
    astroProfileRevenue: 0,
    astroProfileLineSent: 0,
    astroProfileEmailSent: 0,
    astroProfileStoryDownloaded: 0,
  };
}

function resolveTs(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object" && v !== null && "toDate" in v) {
    try { return (v as { toDate(): Date }).toDate(); } catch { return null; }
  }
  if (typeof v === "object" && v !== null && "seconds" in v) {
    return new Date((v as { seconds: number }).seconds * 1000);
  }
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

/** Asia/Taipei 某日 00:00 對應的 UTC 時間（Taipei = UTC+8） */
function taipeiDayStartUtc(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0 - 8, 0, 0, 0));
}

/** dateKey + days → 新 dateKey（以 Asia/Taipei 計，中午對齊避免切日錯位） */
function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 4));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dt);
}

function normalizePath(path: unknown): string {
  if (typeof path !== "string" || !path) return "/";
  try {
    return new URL(path, "https://example.com").pathname;
  } catch {
    return path.startsWith("/") ? path : "/";
  }
}

function isPublicPath(path: string): boolean {
  return Boolean(path) && !path.startsWith("/admin") && !path.startsWith("/api/");
}

/** 塔羅 / 四核心星座 / 其他（給 tarotPageViews / astroProfilePageViews 累計用） */
function featureFromPath(path?: string): "tarot" | "astro" | "other" {
  const p = normalizePath(path);
  if (p.startsWith("/tarot") || p.startsWith("/single") || p.startsWith("/three-card")) return "tarot";
  if (p.startsWith("/astro-profile") || p.startsWith("/triple-zodiac") || p.startsWith("/zodiac-report")) return "astro";
  return "other";
}

/** 頁面瀏覽排行用的中文分類 */
function pageFeature(path?: string): (typeof PAGE_FEATURES)[number] {
  const p = normalizePath(path);
  if (p === "/") return "首頁";
  if (p.startsWith("/tarot") || p.startsWith("/single") || p.startsWith("/three-card")) return "塔羅抽牌";
  if (p.startsWith("/astro-profile") || p.startsWith("/triple-zodiac") || p.startsWith("/zodiac-report")) return "四核心星座";
  if (p.startsWith("/daily") || p.startsWith("/horoscope")) return "今日星座";
  return "其他頁面";
}

type AnalyticsEvent = {
  eventType?: string;
  sessionId?: string | null;
  anonymousId?: string | null;
  lineUserId?: string | null;
  ipHash?: string | null;
  path?: string;
  url?: string;
  isTest?: boolean;
  isAdmin?: boolean;
};

/** 訪客去重鍵：lineUserId → anonymousId → sessionId → ipHash；皆無回 null */
function visitorKey(e: AnalyticsEvent): string | null {
  if (e.lineUserId) return `line:${e.lineUserId}`;
  if (e.anonymousId) return `anon:${e.anonymousId}`;
  if (e.sessionId) return `sid:${e.sessionId}`;
  if (e.ipHash) return `ip:${e.ipHash}`;
  return null;
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
/** 付款成功的歸屬日（付款日）；用於收入與付費成功 */
function paidDayKey(order: Record<string, unknown>): string | null {
  return taipeiDayKey(resolveTs(order.paidAt) ?? resolveTs(order.paymentDate) ?? resolveTs(order.createdAt));
}
/** 建立訂單的歸屬日（建立日）；用於付費嘗試 */
function createdDayKey(order: Record<string, unknown>): string | null {
  return taipeiDayKey(resolveTs(order.createdAt));
}

/**
 * 處理單一訂單集合：付費嘗試（建立日）+ 付費成功 / 收入（付款日）。
 * kind 決定計入塔羅或四核心星座欄位。
 */
function tallyOrders(
  snap: FirebaseFirestore.QuerySnapshot | null,
  kind: "tarot" | "astro",
  perDay: Record<string, RawDayMetrics>,
  dateSet: Set<string>,
  adminEmails: Set<string>,
  diagnostics: RawDiagnostics,
) {
  if (!snap) return;
  for (const doc of snap.docs) {
    const order = doc.data() as { status?: string; buyerEmail?: string } & Record<string, unknown>;
    const test = isTestOrder(order);
    const adminEmail = !!(order.buyerEmail && adminEmails.has(String(order.buyerEmail).toLowerCase()));
    const createdDay = createdDayKey(order);
    const inRangeByCreated = !!(createdDay && dateSet.has(createdDay));

    if (test || adminEmail) {
      if (inRangeByCreated) diagnostics.excludedOrderCount += 1;
      continue;
    }

    const paid = isPaidStatus(order.status);

    // 付費嘗試 / 建立訂單：依建立日，含 pending
    if (inRangeByCreated) {
      if (kind === "tarot") perDay[createdDay!].tarotPaymentAttempts += 1;
      else perDay[createdDay!].astroProfilePaymentAttempts += 1;
      if (paid) diagnostics.paidOrderCount += 1;
      else diagnostics.pendingOrderCount += 1;
    }

    // 付費成功 / 收入：依付款日，只算 paid
    if (paid) {
      const pDay = paidDayKey(order);
      if (pDay && dateSet.has(pDay)) {
        if (kind === "tarot") {
          perDay[pDay].tarotPaidSuccess += 1;
          perDay[pDay].tarotRevenue += resolveAmount(order);
        } else {
          perDay[pDay].astroProfilePaidSuccess += 1;
          perDay[pDay].astroProfileRevenue += resolveAmount(order);
        }
      }
    }
  }
}

// ── 主函式 ────────────────────────────────────────────────────────────────────

/**
 * 即時讀取原始 collection，計算指定日期（Asia/Taipei）區間的逐日營運指標。
 * dates 必須為已排序、連續或不連續皆可的 Taipei 日期字串陣列。
 * 純讀取，不寫回 Firestore。
 */
export async function computeRawMetrics(db: Firestore, dates: string[]): Promise<RawResult> {
  const startKey = dates[0];
  const endKey = dates[dates.length - 1];
  const dateSet = new Set(dates);

  const perDay: Record<string, RawDayMetrics> = {};
  for (const d of dates) perDay[d] = emptyDay(d);

  const freeUnlockByDay: Record<string, number> = {};
  const visitorSets: Record<string, Set<string>> = {};
  for (const d of dates) { visitorSets[d] = new Set<string>(); freeUnlockByDay[d] = 0; }
  const triplePageViewByDay: Record<string, number> = {};
  for (const d of dates) triplePageViewByDay[d] = 0;

  const adminLineIds = new Set(getAdminUserIds());
  const adminEmails = new Set(getAdminEmailList());

  const diagnostics: RawDiagnostics = {
    counts: {
      analyticsEvents: 0,
      pageViewEvents: 0,
      sessionStartEvents: 0,
      tripleZodiacEvents: 0,
      paymentOrders: 0,
      astroProfileOrders: 0,
      rateLimits: 0,
      shareImageDownloads: 0,
    },
    pendingOrderCount: 0,
    paidOrderCount: 0,
    excludedOrderCount: 0,
    adminEventCount: 0,
    testEventCount: 0,
    normalEventCount: 0,
    allEventCount: 0,
    truncated: [],
    shareImageAvailable: false,
  };

  // 訂單以 createdAt 寬鬆視窗查詢（±36h），避免跨午夜建立日≠付款日漏算；歸屬再用 Asia/Taipei 精算
  const orderWindowStart = new Date(taipeiDayStartUtc(startKey).getTime() - 36 * 3600 * 1000);
  const orderWindowEnd = new Date(taipeiDayStartUtc(addDays(endKey, 1)).getTime() + 36 * 3600 * 1000);
  const shareWindowStart = taipeiDayStartUtc(startKey);
  const shareWindowEnd = taipeiDayStartUtc(addDays(endKey, 1));

  const rateLimitRefs = dates.map((d) => db.collection("rate_limits").doc(d));

  const [analyticsSnap, tripleSnap, orderSnap, astroSnap, rateLimitSnaps, shareSnap] = await Promise.all([
    db.collection("analytics_events").where("dateKey", ">=", startKey).where("dateKey", "<=", endKey).limit(LIMIT_ANALYTICS).get().catch(() => null),
    db.collection("triple_zodiac_events").where("dateKey", ">=", startKey).where("dateKey", "<=", endKey).limit(LIMIT_TRIPLE).get().catch(() => null),
    db.collection(PAYMENT_ORDERS_COLLECTION).where("createdAt", ">=", orderWindowStart).where("createdAt", "<", orderWindowEnd).limit(LIMIT_ORDERS).get().catch(() => null),
    db.collection("astroProfileOrders").where("createdAt", ">=", orderWindowStart).where("createdAt", "<", orderWindowEnd).limit(LIMIT_ASTRO_ORDERS).get().catch(() => null),
    rateLimitRefs.length ? db.getAll(...rateLimitRefs).catch(() => null) : Promise.resolve(null),
    db.collection("share_image_downloads").where("createdAt", ">=", shareWindowStart).where("createdAt", "<", shareWindowEnd).limit(LIMIT_SHARE).get().catch(() => null),
  ]);

  // ── analytics_events ──────────────────────────────────────────────────────
  if (analyticsSnap) {
    diagnostics.counts.analyticsEvents = analyticsSnap.size;
    if (analyticsSnap.size >= LIMIT_ANALYTICS) diagnostics.truncated.push("analytics_events");
    for (const doc of analyticsSnap.docs) {
      const e = doc.data() as AnalyticsEvent & { dateKey?: string };
      const day = typeof e.dateKey === "string" ? e.dateKey : null;
      if (!day || !dateSet.has(day)) continue;

      diagnostics.allEventCount += 1;
      if (e.eventType === "page_view") diagnostics.counts.pageViewEvents += 1;
      if (e.eventType === "session_start") diagnostics.counts.sessionStartEvents += 1;

      const isAdmin = e.isAdmin === true || Boolean(e.lineUserId && adminLineIds.has(e.lineUserId));
      const isTest = e.isTest === true;
      if (isAdmin) diagnostics.adminEventCount += 1;
      else if (isTest) diagnostics.testEventCount += 1;
      else diagnostics.normalEventCount += 1;

      // 主營運數據：排除管理員 / 測試 / 非公開路徑
      if (isAdmin || isTest) continue;
      if (!isPublicPath(normalizePath(e.path))) continue;

      const m = perDay[day];
      const uid = visitorKey(e);
      if (uid && (e.eventType === "session_start" || e.eventType === "page_view")) visitorSets[day].add(uid);

      switch (e.eventType) {
        case "page_view": {
          m.pageViews += 1;
          m.pageViewByFeature[pageFeature(e.path ?? e.url)] += 1;
          const feat = featureFromPath(e.path ?? e.url);
          if (feat === "tarot") m.tarotPageViews += 1;
          else if (feat === "astro") m.astroProfilePageViews += 1;
          break;
        }
        case "tarot_draw_complete":
          m.tarotDrawCompleted += 1;
          break;
        case "free_unlock":
          freeUnlockByDay[day] += 1;
          break;
        case "line_save":
          m.tarotLineSent += 1;
          break;
        default:
          break;
      }
    }
  }

  // ── triple_zodiac_events ──────────────────────────────────────────────────
  if (tripleSnap) {
    diagnostics.counts.tripleZodiacEvents = tripleSnap.size;
    if (tripleSnap.size >= LIMIT_TRIPLE) diagnostics.truncated.push("triple_zodiac_events");
    for (const doc of tripleSnap.docs) {
      const e = doc.data() as { eventType?: string; dateKey?: string; isAdmin?: boolean; isTest?: boolean };
      const day = typeof e.dateKey === "string" ? e.dateKey : null;
      if (!day || !dateSet.has(day)) continue;

      diagnostics.allEventCount += 1;
      const isAdmin = e.isAdmin === true;
      const isTest = e.isTest === true;
      if (isAdmin) diagnostics.adminEventCount += 1;
      else if (isTest) diagnostics.testEventCount += 1;
      else diagnostics.normalEventCount += 1;

      if (isAdmin || isTest) continue;

      const m = perDay[day];
      switch (e.eventType) {
        case "triple_zodiac_page_view":
          triplePageViewByDay[day] += 1;
          break;
        case "triple_zodiac_started":
          m.astroProfileStarted += 1;
          break;
        case "triple_zodiac_free_success":
          m.astroProfileFreeSuccess += 1;
          break;
        case "triple_zodiac_line_sent":
          m.astroProfileLineSent += 1;
          break;
        case "triple_zodiac_email_sent":
          m.astroProfileEmailSent += 1;
          break;
        case "triple_zodiac_story_downloaded":
          m.astroProfileStoryDownloaded += 1;
          break;
        default:
          break;
      }
    }
  }

  // ── rate_limits（僅輔助塔羅免費成功；不覆蓋事件，最後取較大值）────────────────
  if (rateLimitSnaps) {
    for (const snap of rateLimitSnaps) {
      if (!snap.exists) continue;
      const day = snap.id;
      if (!dateSet.has(day)) continue;
      diagnostics.counts.rateLimits += 1;
      const data = (snap.data() ?? {}) as { feature_usage?: Record<string, number> };
      const fu = data.feature_usage ?? {};
      perDay[day].tarotSingleSuccess = Number(fu.single_tarot) || 0;
      perDay[day].tarotThreeSuccess = Number(fu.three_card) || 0;
    }
  }

  // ── 訂單（塔羅 / 四核心星座）：付費嘗試 + 付費成功 + 收入 ──────────────────────
  if (orderSnap) {
    diagnostics.counts.paymentOrders = orderSnap.size;
    if (orderSnap.size >= LIMIT_ORDERS) diagnostics.truncated.push(PAYMENT_ORDERS_COLLECTION);
  }
  if (astroSnap) {
    diagnostics.counts.astroProfileOrders = astroSnap.size;
    if (astroSnap.size >= LIMIT_ASTRO_ORDERS) diagnostics.truncated.push("astroProfileOrders");
  }
  tallyOrders(orderSnap, "tarot", perDay, dateSet, adminEmails, diagnostics);
  tallyOrders(astroSnap, "astro", perDay, dateSet, adminEmails, diagnostics);

  // ── share_image_downloads（塔羅限動下載輔助；無資料則維持 0，不假造）──────────
  if (shareSnap) {
    diagnostics.shareImageAvailable = true;
    diagnostics.counts.shareImageDownloads = shareSnap.size;
    if (shareSnap.size >= LIMIT_SHARE) diagnostics.truncated.push("share_image_downloads");
    for (const doc of shareSnap.docs) {
      const ev = doc.data() as { isAdmin?: boolean; isTest?: boolean; lineUserId?: string | null; createdAt?: unknown };
      const day = taipeiDayKey(resolveTs(ev.createdAt));
      if (!day || !dateSet.has(day)) continue;
      if (ev.isAdmin === true || ev.isTest === true) continue;
      if (ev.lineUserId && adminLineIds.has(ev.lineUserId)) continue;
      perDay[day].tarotStoryDownloaded += 1;
    }
  }

  // ── 收尾：訪客數、免費成功取較大值、astro 頁面瀏覽取較大值 ──────────────────
  for (const d of dates) {
    const m = perDay[d];
    m.visitors = visitorSets[d].size;
    const rateFree = m.tarotSingleSuccess + m.tarotThreeSuccess;
    m.tarotFreeSuccess = Math.max(freeUnlockByDay[d], rateFree);
    m.astroProfilePageViews = Math.max(m.astroProfilePageViews, triplePageViewByDay[d]);
  }

  return { perDay, diagnostics };
}
