import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyAdminSessionCookie, SESSION_COOKIE_NAME, getAdminEmailList } from "@/lib/verifyAdmin";
import { getAdminUserIds, getTaipeiDate, type DailyUsageDoc } from "@/lib/rateLimit";
import { PAYMENT_ORDERS_COLLECTION, REDEEM_CODES_COLLECTION, type RedeemCodeData } from "@/lib/redeemCodes";

export const runtime = "nodejs";

type Period = "today" | "month" | "all";

type AnalyticsEvent = {
  eventType?: string;
  createdAt?: unknown;
  dateKey?: string;
  monthKey?: string;
  sessionId?: string | null;
  anonymousId?: string | null;
  lineUserId?: string | null;
  ipHash?: string | null;
  path?: string;
  landingPath?: string;
  referrer?: string;
  url?: string;
  utmSource?: string | null;
  activeSeconds?: number;
  pageActiveSeconds?: number;
  totalSeconds?: number;
  deviceType?: string;
  isTest?: boolean;
  /** 管理員操作：由 /api/analytics/events 在寫入時標記，統計查詢時排除 */
  isAdmin?: boolean;
};

type PeriodUnlock = { free: number; paid: number; total: number; ratio: string };
type QTypeRow = { type: string; count: number; ratio: string; paidCount: number; paidRatio: string };
type SpreadRow = {
  type: string;
  freeCount: number;
  paidCount: number;
  total: number;
  ratio: string;
  paidRatio: string;
  downloadCount: number;
};
type LineSavePeriod = { count: number; users: number };
type TrafficPeriod = {
  visitors: number;
  sessions: number;
  pageViews: number;
  avgActiveSeconds: number;
  bounceRate: string;
};
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
type PageStayRow = {
  path: string;
  label: string;
  views: number;
  avgActiveSeconds: number;
  exitRate: string;
};
type FunnelRow = {
  label: string;
  users: number;
  previousRate: string;
  totalRate: string;
};

function calcRatio(num: number, den: number) {
  if (!den) return "0%";
  return `${Math.round((num / den) * 1000) / 10}%`;
}

function buildUnlock(free: number, paid: number): PeriodUnlock {
  return { free, paid, total: free + paid, ratio: calcRatio(paid, free + paid) };
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

function toTaipeiDate(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

function visitorKey(event: Pick<AnalyticsEvent, "lineUserId" | "anonymousId" | "ipHash">) {
  if (event.lineUserId) return `line:${event.lineUserId}`;
  if (event.anonymousId) return `anon:${event.anonymousId}`;
  if (event.ipHash) return `ip:${event.ipHash}`;
  return null;
}

function isPublicPath(path: string) {
  return Boolean(path) && !path.startsWith("/admin") && !path.startsWith("/api/admin") && !path.startsWith("/api/");
}

function normalizePath(path?: string) {
  if (!path) return "/";
  try {
    return new URL(path, "https://example.com").pathname;
  } catch {
    return path.startsWith("/") ? path : "/";
  }
}

function pageLabel(path: string) {
  if (path === "/") return "首頁";
  if (path === "/tarot") return "塔羅抽牌";
  if (path === "/tarot-cards") return "塔羅牌介紹";
  if (path === "/daily-horoscope" || path === "/daily") return "今日星座";
  if (path === "/astro-profile") return "三重星座";
  if (path === "/disclaimer") return "使用聲明";
  if (path === "/payment-info") return "付款說明";
  if (path === "/payment/result") return "付款結果";
  if (path === "/redeem/check") return "序號兌換";
  if (path === "/admin") return "管理後台";
  if (path.startsWith("/share/")) return "分享結果頁";
  return "其他頁面";
}

function sourceFrom(referrer?: string, url?: string, utmSource?: string | null): string {
  // 1. utm_source 優先
  if (utmSource) {
    const s = utmSource.toLowerCase();
    if (["facebook", "fb", "meta", "fbad", "fbclid"].includes(s)) return "Facebook";
    if (["instagram", "ig", "igshid", "l.instagram.com", "instagram.com"].includes(s)) return "Instagram";
    if (["threads", "threads.net"].includes(s)) return "Threads";
    if (["line", "line.me", "liff.line.me"].includes(s)) return "LINE";
    if (s === "google") return "Google";
  }

  const ref = (referrer ?? "").toLowerCase();
  const urlStr = (url ?? "").toLowerCase();

  // 2. URL 參數辨識：fbclid → Facebook，igshid → Instagram
  if (urlStr.includes("fbclid")) return "Facebook";
  if (urlStr.includes("igshid")) return "Instagram";

  // 3. 無 referrer → Direct
  if (!ref) return "Direct";

  // 4. referrer domain 辨識
  if (ref.includes("facebook.com") || ref.includes("fb.com")) return "Facebook";
  if (ref.includes("l.instagram.com") || ref.includes("instagram.com")) return "Instagram";
  if (ref.includes("threads.net")) return "Threads";
  if (ref.includes("line.me") || ref.includes("liff.line.me")) return "LINE";
  if (ref.includes("t.co") || ref.includes("x.com") || ref.includes("twitter.com")) return "X";
  if (ref.includes("google.com")) return "Google";

  return "Other";
}

function inPeriod(event: AnalyticsEvent, period: Period, today: string, monthKey: string) {
  if (period === "today") return event.dateKey === today;
  if (period === "month") return event.monthKey === monthKey;
  return true;
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

function classifyQuestion(question: string) {
  if (/愛|戀|感情|關係|復合|曖昧/.test(question)) return "感情";
  if (/工作|事業|職涯|面試|同事|主管/.test(question)) return "工作";
  if (/錢|財|收入|付款|投資/.test(question)) return "金錢";
  if (/人生|方向|選擇|未來|迷惘/.test(question)) return "人生方向";
  if (/家庭|家人|朋友|人際/.test(question)) return "人際家庭";
  return "其他";
}

function normalizeSpread(mode?: string) {
  if (mode === "three" || mode === "three_card") return "三張牌";
  if (mode === "single" || mode === "single_tarot" || mode === "tarot") return "單張塔羅";
  return "未知牌陣";
}

function buildQTypeRows(
  entries: Array<{ question: string; dateKey: string; monthKey: string; isPaid: boolean }>,
  period: Period,
  today: string,
  monthKey: string,
): QTypeRow[] {
  const filtered = entries.filter((entry) => inPeriod(entry, period, today, monthKey));
  const total = filtered.length;
  const map = new Map<string, { count: number; paidCount: number }>();
  for (const entry of filtered) {
    const type = classifyQuestion(entry.question);
    const current = map.get(type) ?? { count: 0, paidCount: 0 };
    current.count += 1;
    if (entry.isPaid) current.paidCount += 1;
    map.set(type, current);
  }
  return Array.from(map.entries())
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([type, row]) => ({
      type,
      count: row.count,
      ratio: calcRatio(row.count, total),
      paidCount: row.paidCount,
      paidRatio: calcRatio(row.paidCount, row.count),
    }));
}

function buildSpreadRows(
  freeByDate: Map<string, { single: number; three: number }>,
  paidEntries: Array<{ spreadKey: string; dateKey: string; monthKey: string }>,
  downloadEntries: Array<{ spreadType: string; dateKey: string; monthKey: string }>,
  period: Period,
  today: string,
  monthKey: string,
): SpreadRow[] {
  const free = { "單張塔羅": 0, "三張牌": 0 };
  for (const [date, row] of freeByDate.entries()) {
    if (period === "today" && date !== today) continue;
    if (period === "month" && !date.startsWith(monthKey)) continue;
    free["單張塔羅"] += row.single;
    free["三張牌"] += row.three;
  }

  const paid = new Map<string, number>();
  for (const entry of paidEntries.filter((entry) => inPeriod(entry, period, today, monthKey))) {
    paid.set(entry.spreadKey, (paid.get(entry.spreadKey) ?? 0) + 1);
  }

  const downloads = new Map<string, number>();
  for (const entry of downloadEntries.filter((entry) => inPeriod(entry, period, today, monthKey))) {
    const key = normalizeSpread(entry.spreadType);
    downloads.set(key, (downloads.get(key) ?? 0) + 1);
  }

  const keys = Array.from(new Set(["單張塔羅", "三張牌", ...paid.keys(), ...downloads.keys()]));
  const total = keys.reduce((sum, key) => sum + (free[key as keyof typeof free] ?? 0) + (paid.get(key) ?? 0), 0);
  return keys
    .map((key) => {
      const freeCount = free[key as keyof typeof free] ?? 0;
      const paidCount = paid.get(key) ?? 0;
      const rowTotal = freeCount + paidCount;
      return {
        type: key,
        freeCount,
        paidCount,
        total: rowTotal,
        ratio: calcRatio(rowTotal, total),
        paidRatio: calcRatio(paidCount, rowTotal),
        downloadCount: downloads.get(key) ?? 0,
      };
    })
    .filter((row) => row.total > 0 || row.downloadCount > 0);
}

function buildTraffic(events: AnalyticsEvent[], period: Period, today: string, monthKey: string): TrafficPeriod {
  const filtered = events.filter((event) => inPeriod(event, period, today, monthKey));
  const sessions = new Map<string, { visitor: string | null; pageViews: number; active: number; hasStart: boolean }>();
  const visitors = new Set<string>();

  for (const event of filtered) {
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

  const sessionRows = Array.from(sessions.values()).filter((row) => row.hasStart || row.pageViews > 0);
  const bounces = sessionRows.filter((row) => row.pageViews <= 1 && row.active < 10).length;
  return {
    visitors: visitors.size,
    sessions: filtered.filter((event) => event.eventType === "session_start").length || sessionRows.length,
    pageViews: filtered.filter((event) => event.eventType === "page_view").length,
    avgActiveSeconds: average(sessionRows.map((row) => row.active)),
    bounceRate: calcRatio(bounces, sessionRows.length),
  };
}

function buildSourceRows(events: AnalyticsEvent[], today: string, monthKey: string) {
  const periodEvents = events.filter((event) => inPeriod(event, "month", today, monthKey));
  const sessionSource = new Map<string, string>();
  const sourceMap = new Map<string, {
    sessions: number;
    visitors: Set<string>;
    active: number[];
    paid: number;
    draws: number;
    freeUnlocks: number;
  }>();
  const sessionActive = new Map<string, number>();

  for (const event of periodEvents) {
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

  for (const event of periodEvents) {
    if (!event.sessionId) continue;
    const source = sessionSource.get(event.sessionId) ?? "Direct";
    if (event.eventType === "payment_success" && !event.isTest) {
      const current = sourceMap.get(source) ?? { sessions: 0, visitors: new Set<string>(), active: [], paid: 0, draws: 0, freeUnlocks: 0 };
      current.paid += 1;
      sourceMap.set(source, current);
    }
    if (event.eventType === "tarot_draw_complete") {
      const current = sourceMap.get(source);
      if (current) current.draws += 1;
    }
    if (event.eventType === "free_unlock") {
      const current = sourceMap.get(source);
      if (current) current.freeUnlocks += 1;
    }
  }

  for (const [sessionId, source] of sessionSource.entries()) {
    sourceMap.get(source)?.active.push(sessionActive.get(sessionId) ?? 0);
  }

  return Array.from(sourceMap.entries())
    .map(([source, row]): SourceRow => ({
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

function buildPageStayRows(events: AnalyticsEvent[], today: string, monthKey: string) {
  const periodEvents = events.filter((event) => inPeriod(event, "month", today, monthKey));
  const views = new Map<string, number>();
  const exits = new Map<string, number>();
  const active = new Map<string, number[]>();
  const sessionPageActive = new Map<string, number>();
  const lastPageBySession = new Map<string, string>();

  for (const event of periodEvents) {
    const path = normalizePath(event.path);
    if (!isPublicPath(path)) continue;
    if (event.eventType === "page_view") {
      views.set(path, (views.get(path) ?? 0) + 1);
      if (event.sessionId) lastPageBySession.set(event.sessionId, path);
    }
    if (event.eventType === "session_heartbeat" && event.sessionId) {
      const key = `${event.sessionId}:${path}`;
      sessionPageActive.set(key, Math.max(sessionPageActive.get(key) ?? 0, cleanSeconds(event.pageActiveSeconds ?? event.activeSeconds)));
    }
  }

  for (const path of lastPageBySession.values()) {
    exits.set(path, (exits.get(path) ?? 0) + 1);
  }
  for (const [key, seconds] of sessionPageActive.entries()) {
    const path = key.slice(key.indexOf(":") + 1);
    const rows = active.get(path) ?? [];
    rows.push(seconds);
    active.set(path, rows);
  }

  return Array.from(views.entries())
    .map(([path, count]): PageStayRow => ({
      path,
      label: pageLabel(path),
      views: count,
      avgActiveSeconds: average(active.get(path) ?? []),
      exitRate: calcRatio(exits.get(path) ?? 0, count),
    }))
    .sort((a, b) => b.avgActiveSeconds - a.avgActiveSeconds || b.views - a.views)
    .slice(0, 10);
}

function buildFunnel(events: AnalyticsEvent[], today: string, monthKey: string) {
  const periodEvents = events.filter((event) => inPeriod(event, "month", today, monthKey));
  const steps = [
    { label: "進站人數", match: (event: AnalyticsEvent) => event.eventType === "session_start" },
    { label: "進入抽牌頁人數", match: (event: AnalyticsEvent) => event.eventType === "page_view" && normalizePath(event.path) === "/tarot" },
    { label: "完成抽牌人數", match: (event: AnalyticsEvent) => event.eventType === "tarot_draw_complete" },
    { label: "點擊完整版人數", match: (event: AnalyticsEvent) => event.eventType === "full_reading_click" },
    { label: "免費解鎖人數", match: (event: AnalyticsEvent) => event.eventType === "free_unlock" },
    { label: "付費成功人數", match: (event: AnalyticsEvent) => event.eventType === "payment_success" && !event.isTest },
    { label: "LINE 保存人數", match: (event: AnalyticsEvent) => event.eventType === "line_save" },
    { label: "下載分享圖人數", match: (event: AnalyticsEvent) => event.eventType === "share_image_download_click" },
  ];

  const counts = steps.map((step) => {
    const users = new Set<string>();
    for (const event of periodEvents) {
      if (!step.match(event)) continue;
      const uid = visitorKey(event);
      if (uid) users.add(uid);
    }
    return users.size;
  });
  const total = counts[0] ?? 0;
  return steps.map((step, index): FunnelRow => ({
    label: step.label,
    users: counts[index] ?? 0,
    previousRate: index === 0 ? "100%" : calcRatio(counts[index] ?? 0, counts[index - 1] ?? 0),
    totalRate: index === 0 ? "100%" : calcRatio(counts[index] ?? 0, total),
  }));
}

async function verifyAdmin() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const isGoogleAdmin = await verifyAdminSessionCookie(sessionCookie);
  const lineUserId = cookieStore.get("line_user_id")?.value ?? null;
  return isGoogleAdmin || Boolean(lineUserId && getAdminUserIds().includes(lineUserId));
}

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year") ?? now.getFullYear());
  const month = Number(url.searchParams.get("month") ?? now.getMonth() + 1);
  const today = getTaipeiDate();
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const db = getAdminDb();

  const { FieldPath } = await import("firebase-admin/firestore");
  const d180Key = toTaipeiDate(new Date(Date.now() - 180 * 86400000));
  const rateLimitSnap = await db
    .collection("rate_limits")
    .where(FieldPath.documentId(), ">=", d180Key)
    .where(FieldPath.documentId(), "<=", today)
    .get()
    .catch(() => null);

  const freeByDate = new Map<string, { single: number; three: number }>();
  let allFreeSingle = 0;
  let allFreeThree = 0;
  if (rateLimitSnap) {
    for (const doc of rateLimitSnap.docs) {
      const data = doc.data() as Partial<DailyUsageDoc>;
      const featureUsage = data.feature_usage ?? {};
      const single = featureUsage.single_tarot ?? 0;
      const three = featureUsage.three_card ?? 0;
      freeByDate.set(doc.id, { single, three });
      allFreeSingle += single;
      allFreeThree += three;
    }
  }

  // 管理員識別集合（供所有 collection 過濾使用）
  const adminLineIds = new Set(getAdminUserIds());
  const adminEmails = new Set(getAdminEmailList());

  const redeemSnap = await db.collection(REDEEM_CODES_COLLECTION).limit(500).get().catch(() => null);
  const paidUnlockEntries: Array<{ question: string; dateKey: string; monthKey: string; isPaid: boolean; spreadKey: string }> = [];
  const paidSpreadEntries: Array<{ spreadKey: string; dateKey: string; monthKey: string }> = [];
  if (redeemSnap) {
    for (const doc of redeemSnap.docs) {
      const code = doc.data() as RedeemCodeData;
      if (code.isTest) continue;
      // 排除管理員 email 購買的通行碼（管理員測試用）
      if (code.buyerEmail && adminEmails.has(code.buyerEmail.toLowerCase())) continue;
      for (const log of code.usedLogs ?? []) {
        const ts = resolveTs(log.usedAt);
        if (!ts) continue;
        const dateKey = toTaipeiDate(ts);
        const spreadKey = normalizeSpread(log.mode ?? log.spreadType);
        paidUnlockEntries.push({
          question: log.question ?? "",
          dateKey,
          monthKey: dateKey.slice(0, 7),
          isPaid: true,
          spreadKey,
        });
        paidSpreadEntries.push({ spreadKey, dateKey, monthKey: dateKey.slice(0, 7) });
      }
    }
  }

  const downloadSnap = await db.collection("share_image_downloads").limit(1000).get().catch(() => null);
  const downloadEntries: Array<{ spreadType: string; dateKey: string; monthKey: string }> = [];
  if (downloadSnap) {
    for (const doc of downloadSnap.docs) {
      const event = doc.data() as { spreadType?: string; dateKey?: string; createdAt?: unknown; isTest?: boolean; isAdmin?: boolean; lineUserId?: string | null };
      if (event.isTest) continue;
      if (event.isAdmin === true) continue;
      if (event.lineUserId && adminLineIds.has(event.lineUserId)) continue;
      const dateKey = event.dateKey ?? (resolveTs(event.createdAt) ? toTaipeiDate(resolveTs(event.createdAt)!) : "");
      if (dateKey) downloadEntries.push({ spreadType: event.spreadType ?? "", dateKey, monthKey: dateKey.slice(0, 7) });
    }
  }

  const analyticsSnap = await db.collection("analytics_events").limit(5000).get().catch(() => null);
  // 排除管理員事件：
  //   1. 新格式：寫入時已標記 isAdmin: true
  //   2. 舊格式（回溯）：LINE 管理員 lineUserId 在 admin 清單中
  const analyticsEvents: AnalyticsEvent[] = analyticsSnap
    ? analyticsSnap.docs
        .map((doc) => doc.data() as AnalyticsEvent)
        .filter((event) => {
          if (event.isAdmin === true) return false;
          if (event.lineUserId && adminLineIds.has(event.lineUserId)) return false;
          return isPublicPath(normalizePath(event.path));
        })
    : [];

  const todayFree = freeByDate.get(today) ?? { single: 0, three: 0 };
  let monthFreeSingle = 0;
  let monthFreeThree = 0;
  for (const [date, row] of freeByDate.entries()) {
    if (date.startsWith(monthKey)) {
      monthFreeSingle += row.single;
      monthFreeThree += row.three;
    }
  }

  const countPaid = (period: Period) => paidUnlockEntries.filter((entry) => inPeriod(entry, period, today, monthKey)).length;
  const lineSave = (period: Period): LineSavePeriod => {
    const rows = analyticsEvents.filter((event) => event.eventType === "line_save" && inPeriod(event, period, today, monthKey));
    return { count: rows.length, users: new Set(rows.map(visitorKey).filter(Boolean)).size };
  };

  return NextResponse.json({
    ok: true,
    today,
    monthKey,
    unlock: {
      today: buildUnlock(todayFree.single + todayFree.three, countPaid("today")),
      month: buildUnlock(monthFreeSingle + monthFreeThree, countPaid("month")),
      all: buildUnlock(allFreeSingle + allFreeThree, countPaid("all")),
    },
    questionTypes: {
      today: buildQTypeRows(paidUnlockEntries, "today", today, monthKey),
      month: buildQTypeRows(paidUnlockEntries, "month", today, monthKey),
      all: buildQTypeRows(paidUnlockEntries, "all", today, monthKey),
    },
    spread: {
      today: buildSpreadRows(freeByDate, paidSpreadEntries, downloadEntries, "today", today, monthKey),
      month: buildSpreadRows(freeByDate, paidSpreadEntries, downloadEntries, "month", today, monthKey),
      all: buildSpreadRows(freeByDate, paidSpreadEntries, downloadEntries, "all", today, monthKey),
    },
    lineSave: {
      today: lineSave("today"),
      month: lineSave("month"),
      all: lineSave("all"),
    },
    traffic: {
      today: buildTraffic(analyticsEvents, "today", today, monthKey),
      month: buildTraffic(analyticsEvents, "month", today, monthKey),
      all: buildTraffic(analyticsEvents, "all", today, monthKey),
    },
    trafficSources: buildSourceRows(analyticsEvents, today, monthKey),
    pageStay: buildPageStayRows(analyticsEvents, today, monthKey),
    funnel: buildFunnel(analyticsEvents, today, monthKey),
    paymentOrderCount: await db
      .collection(PAYMENT_ORDERS_COLLECTION)
      .where("status", "==", "paid")
      .limit(1)
      .get()
      .then((snap) => snap.size)
      .catch(() => 0),
  });
}
