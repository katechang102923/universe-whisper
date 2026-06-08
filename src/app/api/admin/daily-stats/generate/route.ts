/**
 * GET /api/admin/daily-stats/generate?date=YYYY-MM-DD
 *
 * 每天台灣時間 00:05（UTC 16:05）由 Vercel Cron 呼叫，產生前一天的統計快照，
 * 寫入 Firestore collection `daily_admin_stats`，document id = 台灣日期字串。
 *
 * 也支援手動補跑：帶 ?date=2026-06-08 即可指定日期。
 * 需要 Authorization: Bearer {CRON_SECRET} header。
 */
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getAdminUserIds } from "@/lib/rateLimit";
import { getAdminEmailList } from "@/lib/verifyAdmin";
import { PAYMENT_ORDERS_COLLECTION, REDEEM_CODES_COLLECTION, type RedeemCodeData } from "@/lib/redeemCodes";

export const runtime = "nodejs";

// ── 工具函式（與 stats/route.ts 一致）──────────────────────────────────────────

function calcRatio(num: number, den: number) {
  if (!den) return "0%";
  return `${Math.round((num / den) * 1000) / 10}%`;
}

function resolveTs(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object" && "toDate" in v) return (v as { toDate(): Date }).toDate();
  if (typeof v === "object" && "seconds" in v)
    return new Date((v as { seconds: number }).seconds * 1000);
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toTaipeiDate(d: Date) {
  return d.toLocaleString("en-CA", { timeZone: "Asia/Taipei" }).slice(0, 10);
}

function getYesterdayTaipei(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleString("en-CA", { timeZone: "Asia/Taipei" }).slice(0, 10);
}

type AnalyticsEvent = {
  eventType?: string;
  dateKey?: string;
  monthKey?: string;
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

function visitorKey(event: Pick<AnalyticsEvent, "lineUserId" | "anonymousId" | "ipHash">) {
  if (event.lineUserId) return `line:${event.lineUserId}`;
  if (event.anonymousId) return `anon:${event.anonymousId}`;
  if (event.ipHash) return `ip:${event.ipHash}`;
  return null;
}

function isPublicPath(path: string) {
  return Boolean(path) && !path.startsWith("/admin") && !path.startsWith("/api/");
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
  if (path.startsWith("/share/")) return "分享結果頁";
  return "其他頁面";
}

function sourceFrom(referrer?: string, url?: string, utmSource?: string | null): string {
  if (utmSource) {
    const s = utmSource.toLowerCase();
    if (["facebook", "fb", "meta", "fbad", "fbbad", "fbclid"].includes(s)) return "Facebook";
    if (["instagram", "ig", "igshid", "l.instagram.com", "instagram.com"].includes(s)) return "Instagram";
    if (["threads", "threads.net"].includes(s)) return "Threads";
    if (["line", "line.me", "liff.line.me"].includes(s)) return "LINE";
    if (s === "google") return "Google";
  }
  const ref = (referrer ?? "").toLowerCase();
  const urlStr = (url ?? "").toLowerCase();
  if (urlStr.includes("fbclid")) return "Facebook";
  if (urlStr.includes("igshid")) return "Instagram";
  if (!ref) return "Direct";
  if (ref.includes("l.facebook.com") || ref.includes("facebook.com") || ref.includes("fb.com")) return "Facebook";
  if (ref.includes("l.instagram.com") || ref.includes("instagram.com")) return "Instagram";
  if (ref.includes("threads.net")) return "Threads";
  if (ref.includes("line.me") || ref.includes("liff.line.me")) return "LINE";
  if (ref.includes("t.co") || ref.includes("x.com") || ref.includes("twitter.com")) return "X";
  if (ref.includes("google.com")) return "Google";
  return "Other";
}

type Period = "today" | "month" | "all";

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

type PeriodUnlock = { free: number; paid: number; total: number; ratio: string };

function buildUnlock(free: number, paid: number): PeriodUnlock {
  return { free, paid, total: free + paid, ratio: calcRatio(paid, free + paid) };
}

type QTypeRow = { type: string; count: number; ratio: string; paidCount: number; paidRatio: string };

function buildQTypeRows(
  entries: Array<{ question: string; dateKey: string; monthKey: string; isPaid: boolean }>,
  period: Period,
  today: string,
  monthKey: string,
): QTypeRow[] {
  const filtered = entries.filter((e) => inPeriod(e, period, today, monthKey));
  const total = filtered.length;
  const map = new Map<string, { count: number; paidCount: number }>();
  for (const e of filtered) {
    const type = classifyQuestion(e.question);
    const cur = map.get(type) ?? { count: 0, paidCount: 0 };
    cur.count += 1;
    if (e.isPaid) cur.paidCount += 1;
    map.set(type, cur);
  }
  return Array.from(map.entries())
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([type, row]) => ({
      type, count: row.count, ratio: calcRatio(row.count, total),
      paidCount: row.paidCount, paidRatio: calcRatio(row.paidCount, row.count),
    }));
}

type SpreadRow = { type: string; freeCount: number; paidCount: number; total: number; ratio: string; paidRatio: string; downloadCount: number };

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
  for (const e of paidEntries.filter((e) => inPeriod(e, period, today, monthKey)))
    paid.set(e.spreadKey, (paid.get(e.spreadKey) ?? 0) + 1);
  const downloads = new Map<string, number>();
  for (const e of downloadEntries.filter((e) => inPeriod(e, period, today, monthKey))) {
    const k = normalizeSpread(e.spreadType);
    downloads.set(k, (downloads.get(k) ?? 0) + 1);
  }
  const keys = Array.from(new Set(["單張塔羅", "三張牌", ...paid.keys(), ...downloads.keys()]));
  const total = keys.reduce((sum, k) => sum + (free[k as keyof typeof free] ?? 0) + (paid.get(k) ?? 0), 0);
  return keys
    .map((k) => {
      const freeCount = free[k as keyof typeof free] ?? 0;
      const paidCount = paid.get(k) ?? 0;
      const rowTotal = freeCount + paidCount;
      return { type: k, freeCount, paidCount, total: rowTotal, ratio: calcRatio(rowTotal, total), paidRatio: calcRatio(paidCount, rowTotal), downloadCount: downloads.get(k) ?? 0 };
    })
    .filter((r) => r.total > 0 || r.downloadCount > 0);
}

type TrafficPeriod = { visitors: number; sessions: number; pageViews: number; avgActiveSeconds: number; bounceRate: string };

function buildTraffic(events: AnalyticsEvent[], period: Period, today: string, monthKey: string): TrafficPeriod {
  const filtered = events.filter((e) => inPeriod(e, period, today, monthKey));
  const sessions = new Map<string, { visitor: string | null; pageViews: number; active: number; hasStart: boolean }>();
  const visitors = new Set<string>();
  for (const e of filtered) {
    const sid = e.sessionId || visitorKey(e) || "unknown";
    const cur = sessions.get(sid) ?? { visitor: visitorKey(e), pageViews: 0, active: 0, hasStart: false };
    if (e.eventType === "page_view") cur.pageViews += 1;
    if (e.eventType === "session_start") cur.hasStart = true;
    if (e.eventType === "session_heartbeat") cur.active = Math.max(cur.active, cleanSeconds(e.activeSeconds));
    cur.visitor = cur.visitor ?? visitorKey(e);
    sessions.set(sid, cur);
    const uid = visitorKey(e);
    if (uid && (e.eventType === "session_start" || e.eventType === "page_view")) visitors.add(uid);
  }
  const rows = Array.from(sessions.values()).filter((r) => r.hasStart || r.pageViews > 0);
  const bounces = rows.filter((r) => r.pageViews <= 1 && r.active < 10).length;
  return {
    visitors: visitors.size,
    sessions: filtered.filter((e) => e.eventType === "session_start").length || rows.length,
    pageViews: filtered.filter((e) => e.eventType === "page_view").length,
    avgActiveSeconds: average(rows.map((r) => r.active)),
    bounceRate: calcRatio(bounces, rows.length),
  };
}

type SourceRow = { source: string; sessions: number; visitors: number; avgActiveSeconds: number; drawCount: number; freeUnlockCount: number; paidSuccess: number; paidConversionRate: string };

function buildSourceRows(events: AnalyticsEvent[], today: string, monthKey: string): SourceRow[] {
  const periodEvents = events.filter((e) => inPeriod(e, "month", today, monthKey));
  const sessionSource = new Map<string, string>();
  const sourceMap = new Map<string, { sessions: number; visitors: Set<string>; active: number[]; paid: number; draws: number; freeUnlocks: number }>();
  const sessionActive = new Map<string, number>();

  for (const e of periodEvents) {
    if (!e.sessionId) continue;
    if (e.eventType === "session_heartbeat")
      sessionActive.set(e.sessionId, Math.max(sessionActive.get(e.sessionId) ?? 0, cleanSeconds(e.activeSeconds)));
    if (e.eventType !== "session_start") continue;
    const source = sourceFrom(e.referrer, e.url, e.utmSource);
    sessionSource.set(e.sessionId, source);
    const cur = sourceMap.get(source) ?? { sessions: 0, visitors: new Set<string>(), active: [], paid: 0, draws: 0, freeUnlocks: 0 };
    cur.sessions += 1;
    const uid = visitorKey(e);
    if (uid) cur.visitors.add(uid);
    sourceMap.set(source, cur);
  }
  for (const e of periodEvents) {
    if (!e.sessionId) continue;
    const source = sessionSource.get(e.sessionId) ?? "Direct";
    if (e.eventType === "payment_success" && !e.isTest) {
      const cur = sourceMap.get(source) ?? { sessions: 0, visitors: new Set<string>(), active: [], paid: 0, draws: 0, freeUnlocks: 0 };
      cur.paid += 1;
      sourceMap.set(source, cur);
    }
    if (e.eventType === "tarot_draw_complete") { const c = sourceMap.get(source); if (c) c.draws += 1; }
    if (e.eventType === "free_unlock") { const c = sourceMap.get(source); if (c) c.freeUnlocks += 1; }
  }
  for (const [sid, source] of sessionSource.entries())
    sourceMap.get(source)?.active.push(sessionActive.get(sid) ?? 0);

  return Array.from(sourceMap.entries())
    .map(([source, row]): SourceRow => ({
      source, sessions: row.sessions, visitors: row.visitors.size,
      avgActiveSeconds: average(row.active), drawCount: row.draws,
      freeUnlockCount: row.freeUnlocks, paidSuccess: row.paid,
      paidConversionRate: calcRatio(row.paid, row.sessions),
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 10);
}

type PageStayRow = { path: string; label: string; views: number; avgActiveSeconds: number; exitRate: string };

function buildPageStayRows(events: AnalyticsEvent[], today: string, monthKey: string): PageStayRow[] {
  const periodEvents = events.filter((e) => inPeriod(e, "month", today, monthKey));
  const views = new Map<string, number>();
  const exits = new Map<string, number>();
  const active = new Map<string, number[]>();
  const sessionPageActive = new Map<string, number>();
  const lastPageBySession = new Map<string, string>();

  for (const e of periodEvents) {
    const path = normalizePath(e.path);
    if (!isPublicPath(path)) continue;
    if (e.eventType === "page_view") {
      views.set(path, (views.get(path) ?? 0) + 1);
      if (e.sessionId) lastPageBySession.set(e.sessionId, path);
    }
    if (e.eventType === "session_heartbeat" && e.sessionId) {
      const key = `${e.sessionId}:${path}`;
      sessionPageActive.set(key, Math.max(sessionPageActive.get(key) ?? 0, cleanSeconds(e.pageActiveSeconds ?? e.activeSeconds)));
    }
  }
  for (const path of lastPageBySession.values()) exits.set(path, (exits.get(path) ?? 0) + 1);
  for (const [key, seconds] of sessionPageActive.entries()) {
    const path = key.slice(key.indexOf(":") + 1);
    const rows = active.get(path) ?? [];
    rows.push(seconds);
    active.set(path, rows);
  }
  return Array.from(views.entries())
    .map(([path, count]): PageStayRow => ({
      path, label: pageLabel(path), views: count,
      avgActiveSeconds: average(active.get(path) ?? []),
      exitRate: calcRatio(exits.get(path) ?? 0, count),
    }))
    .sort((a, b) => b.avgActiveSeconds - a.avgActiveSeconds || b.views - a.views)
    .slice(0, 10);
}

type FunnelRow = { label: string; users: number; previousRate: string; totalRate: string };

function buildFunnel(events: AnalyticsEvent[], period: Period, today: string, monthKey: string): FunnelRow[] {
  const periodEvents = events.filter((e) => inPeriod(e, period, today, monthKey));
  const steps = [
    { label: "進站人數", match: (e: AnalyticsEvent) => e.eventType === "session_start" },
    { label: "進入抽牌頁人數", match: (e: AnalyticsEvent) => e.eventType === "page_view" && normalizePath(e.path) === "/tarot" },
    { label: "完成抽牌人數", match: (e: AnalyticsEvent) => e.eventType === "tarot_draw_complete" },
    { label: "點擊完整版人數", match: (e: AnalyticsEvent) => e.eventType === "full_reading_click" },
    { label: "免費解鎖人數", match: (e: AnalyticsEvent) => e.eventType === "free_unlock" },
    { label: "付費成功人數", match: (e: AnalyticsEvent) => e.eventType === "payment_success" && !e.isTest },
    { label: "LINE 保存人數", match: (e: AnalyticsEvent) => e.eventType === "line_save" },
    { label: "下載分享圖人數", match: (e: AnalyticsEvent) => e.eventType === "share_image_download_click" },
  ];
  const counts = steps.map((step) => {
    const users = new Set<string>();
    for (const e of periodEvents) {
      if (!step.match(e)) continue;
      const uid = visitorKey(e);
      if (uid) users.add(uid);
    }
    return users.size;
  });
  const total = counts[0] ?? 0;
  return steps.map((step, i): FunnelRow => ({
    label: step.label, users: counts[i] ?? 0,
    previousRate: i === 0 ? "100%" : calcRatio(counts[i] ?? 0, counts[i - 1] ?? 0),
    totalRate: i === 0 ? "100%" : calcRatio(counts[i] ?? 0, total),
  }));
}

// ── 主 Handler ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── 授權 ──────────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET ?? "";
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  // ── 日期參數 ───────────────────────────────────────────────────────────────────
  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const date = dateParam ?? getYesterdayTaipei();
  // 簡單驗證格式
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: "INVALID_DATE" }, { status: 400 });
  }
  const monthKey = date.slice(0, 7);

  const db = getAdminDb();
  const adminLineIds = new Set(getAdminUserIds());
  const adminEmails = new Set(getAdminEmailList());

  try {
    // ── 平行查詢（全部使用限制，避免 quota exhausted）────────────────────────────
    const [rateLimitSnap, fortuneSnap, analyticsSnap, downloadSnap, redeemSnap, orderSnap, astroSnap] =
      await Promise.all([
        db.collection("rate_limits").doc(date).get(),
        db.collection("fortune_stats").doc(date).get(),
        // analytics_events 以 monthKey 過濾，只讀當月資料
        db.collection("analytics_events").where("monthKey", "==", monthKey).limit(5000).get().catch(() => null),
        // share_image_downloads 以 limit 控制讀取量
        db.collection("share_image_downloads").limit(2000).get().catch(() => null),
        // redeem_codes 以 limit 控制讀取量
        db.collection(REDEEM_CODES_COLLECTION).limit(1000).get().catch(() => null),
        // payment_orders 以 limit 控制讀取量
        db.collection(PAYMENT_ORDERS_COLLECTION).limit(1000).get().catch(() => null),
        // astroProfileOrders（三重星座付費訂單）
        db.collection("astroProfileOrders").where("status", "==", "paid").limit(200).get().catch(() => null),
      ]);

    // ── rate_limits（usageData、IP/匿名/LINE 排行）────────────────────────────────
    const usageData = (rateLimitSnap.data() ?? {}) as {
      total_requests?: number;
      total_blocked?: number;
      feature_usage?: Record<string, number>;
      ip_usage?: Record<string, number>;
      ip_display?: Record<string, string>;
      anon_usage?: Record<string, number>;
      line_usage?: Record<string, number>;
    };

    function sortedEntries(map: Record<string, number>) {
      return Object.entries(map).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
    }
    const ipDisplay = usageData.ip_display ?? {};
    const ipRanking = sortedEntries(usageData.ip_usage ?? {}).slice(0, 20).map(({ key, count }) => ({ display: ipDisplay[key] ?? key, count }));
    const anonRanking = sortedEntries(usageData.anon_usage ?? {}).slice(0, 20).map(({ key, count }) => ({ display: key, count }));
    const lineRanking = sortedEntries(usageData.line_usage ?? {}).filter(({ key }) => !adminLineIds.has(key)).slice(0, 20).map(({ key, count }) => ({ display: key, count }));

    // ── fortune_stats ──────────────────────────────────────────────────────────
    const fortuneData = (fortuneSnap.data() ?? {}) as { generated_zodiacs?: string[]; ai_generations?: number; cache_hits?: number };
    const fortuneCoverage = (fortuneData.generated_zodiacs ?? []).length;

    // ── rate_limits freeByDate（取當日）───────────────────────────────────────
    const featureUsage = usageData.feature_usage ?? {};
    const freeByDate = new Map<string, { single: number; three: number }>();
    freeByDate.set(date, { single: featureUsage.single_tarot ?? 0, three: featureUsage.three_card ?? 0 });

    // ── analytics_events ──────────────────────────────────────────────────────
    const analyticsEvents: AnalyticsEvent[] = analyticsSnap
      ? analyticsSnap.docs
          .map((d) => d.data() as AnalyticsEvent)
          .filter((e) => {
            if (e.isAdmin === true) return false;
            if (e.lineUserId && adminLineIds.has(e.lineUserId)) return false;
            return isPublicPath(normalizePath(e.path));
          })
      : [];

    // 快速彙總：今日 visitor、tarot draws、line saves
    const todayVisitors = new Set<string>();
    let tarotDraws = 0;
    let lineSaves = 0;
    for (const e of analyticsEvents) {
      if (e.dateKey !== date) continue;
      const uid = visitorKey(e);
      if (uid && (e.eventType === "session_start" || e.eventType === "page_view")) todayVisitors.add(uid);
      if (e.eventType === "tarot_draw_complete") tarotDraws++;
      if (e.eventType === "line_save") lineSaves++;
    }

    // ── redeem_codes（通行碼統計 + 付費解鎖）────────────────────────────────────
    const redeemStats = { total: 0, active: 0, usedUp: 0, test: 0 };
    const paidUnlockEntries: Array<{ question: string; dateKey: string; monthKey: string; isPaid: boolean; spreadKey: string }> = [];
    const paidSpreadEntries: Array<{ spreadKey: string; dateKey: string; monthKey: string }> = [];

    if (redeemSnap) {
      for (const doc of redeemSnap.docs) {
        const code = doc.data() as RedeemCodeData;
        if (code.isTest) { redeemStats.test++; continue; }
        if (code.buyerEmail && adminEmails.has(code.buyerEmail.toLowerCase())) continue;
        redeemStats.total++;
        if (code.status === "active") redeemStats.active++;
        if (code.status === "used_up") redeemStats.usedUp++;
        for (const log of code.usedLogs ?? []) {
          const ts = resolveTs(log.usedAt);
          if (!ts) continue;
          const dk = toTaipeiDate(ts);
          const mk = dk.slice(0, 7);
          const spreadKey = normalizeSpread(log.mode ?? log.spreadType);
          paidUnlockEntries.push({ question: log.question ?? "", dateKey: dk, monthKey: mk, isPaid: true, spreadKey });
          paidSpreadEntries.push({ spreadKey, dateKey: dk, monthKey: mk });
        }
      }
    }

    // ── share_image_downloads ────────────────────────────────────────────────
    const downloadEntries: Array<{ spreadType: string; dateKey: string; monthKey: string }> = [];
    const shareDownloadStats = { todayCount: 0, todayUsers: 0, allCount: 0, allUsers: 0 };
    const shareDownloadRanking: { display: string; count: number; lastAt: string; type: string }[] = [];

    if (downloadSnap) {
      const userCounterAll = new Set<string>();
      const userCounterToday = new Set<string>();
      const rankMap = new Map<string, { count: number; lastAt: string; type: string }>();

      for (const doc of downloadSnap.docs) {
        const ev = doc.data() as { dateKey?: string; lineUserId?: string; anonymousId?: string; ip?: string; createdAt?: unknown; spreadType?: string; isAdmin?: boolean; isTest?: boolean };
        if (ev.isAdmin === true || ev.isTest === true) continue;
        if (ev.lineUserId && adminLineIds.has(ev.lineUserId)) continue;

        shareDownloadStats.allCount++;
        const isToday = ev.dateKey === date;
        if (isToday) shareDownloadStats.todayCount++;

        const uid = ev.lineUserId ? `LINE:${ev.lineUserId}` : ev.anonymousId ? `anon:${ev.anonymousId}` : ev.ip && ev.ip !== "unknown" ? `ip:${ev.ip}` : null;
        if (uid) { userCounterAll.add(uid); if (isToday) userCounterToday.add(uid); }

        const dk = ev.dateKey ?? (resolveTs(ev.createdAt) ? toTaipeiDate(resolveTs(ev.createdAt)!) : "");
        if (dk) downloadEntries.push({ spreadType: ev.spreadType ?? "", dateKey: dk, monthKey: dk.slice(0, 7) });

        const rankKey = ev.lineUserId ? `LINE:${ev.lineUserId}` : ev.anonymousId ? `anon:${ev.anonymousId.slice(0, 20)}` : ev.ip && ev.ip !== "unknown" ? `ip:${ev.ip}` : "unknown";
        const ts = resolveTs(ev.createdAt);
        const tsStr = ts ? ts.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
        const existing = rankMap.get(rankKey);
        if (!existing) rankMap.set(rankKey, { count: 1, lastAt: tsStr, type: ev.spreadType ?? "—" });
        else { existing.count++; if (tsStr > existing.lastAt) existing.lastAt = tsStr; }
      }
      shareDownloadStats.allUsers = userCounterAll.size;
      shareDownloadStats.todayUsers = userCounterToday.size;
      shareDownloadRanking.push(
        ...Array.from(rankMap.entries()).sort(([, a], [, b]) => b.count - a.count).slice(0, 20)
          .map(([key, v]) => ({ display: key, count: v.count, lastAt: v.lastAt, type: v.type }))
      );
    }

    // ── payment_orders ────────────────────────────────────────────────────────
    const orderStats = { total: 0, paid: 0, failed: 0, pending: 0, todayRevenue: 0, todayPaid: 0, todayTest: 0, noCode: 0, emailUnsent: 0 };
    let paymentOrderCount = 0;

    if (orderSnap) {
      for (const doc of orderSnap.docs) {
        const o = doc.data() as { status?: string; amount?: number; paidAt?: unknown; isTest?: boolean; redeemCode?: string; emailSent?: boolean; buyerEmail?: string };
        const paidDate = resolveTs(o.paidAt);
        const isToday = paidDate ? toTaipeiDate(paidDate) === date : false;
        const isTest = Boolean(o.isTest);
        if (isTest) { if (isToday && o.status === "paid") orderStats.todayTest++; continue; }
        if (o.buyerEmail && adminEmails.has(o.buyerEmail.toLowerCase())) continue;
        orderStats.total++;
        if (o.status === "paid") {
          orderStats.paid++;
          paymentOrderCount++;
          if (isToday) { orderStats.todayPaid++; orderStats.todayRevenue += o.amount ?? 0; }
          if (!o.redeemCode) orderStats.noCode++;
          if (!o.emailSent) orderStats.emailUnsent++;
        }
        if (o.status === "failed") orderStats.failed++;
        if (o.status === "pending") orderStats.pending++;
      }
    }

    // ── astroProfileOrders（三重星座）─────────────────────────────────────────
    let astroProfileCount = 0;
    if (astroSnap) {
      for (const doc of astroSnap.docs) {
        const o = doc.data() as { paidAt?: unknown; isTest?: boolean };
        if (o.isTest) continue;
        const paidDate = resolveTs(o.paidAt);
        if (paidDate && toTaipeiDate(paidDate) === date) astroProfileCount++;
      }
    }

    // ── 彙整統計 ──────────────────────────────────────────────────────────────
    const todayFree = freeByDate.get(date) ?? { single: 0, three: 0 };
    const freeDraws = todayFree.single + todayFree.three;
    const paidUnlocksToday = paidUnlockEntries.filter((e) => e.dateKey === date).length;

    const sourceBreakdown: Record<string, number> = {};
    for (const e of analyticsEvents) {
      if (e.eventType !== "session_start" || e.dateKey !== date) continue;
      const src = sourceFrom(e.referrer, e.url, e.utmSource);
      sourceBreakdown[src] = (sourceBreakdown[src] ?? 0) + 1;
    }

    // ── stats payload（供 StatsOverviewClient 使用）────────────────────────────
    const statsPayload = {
      today: date,
      monthKey,
      unlock: {
        today: buildUnlock(todayFree.single + todayFree.three, paidUnlocksToday),
        month: buildUnlock(
          [...freeByDate.entries()].filter(([k]) => k.startsWith(monthKey)).reduce((s, [, r]) => s + r.single + r.three, 0),
          paidUnlockEntries.filter((e) => e.monthKey === monthKey).length,
        ),
        all: buildUnlock(
          [...freeByDate.values()].reduce((s, r) => s + r.single + r.three, 0),
          paidUnlockEntries.length,
        ),
      },
      questionTypes: {
        today: buildQTypeRows(paidUnlockEntries, "today", date, monthKey),
        month: buildQTypeRows(paidUnlockEntries, "month", date, monthKey),
        all: buildQTypeRows(paidUnlockEntries, "all", date, monthKey),
      },
      spread: {
        today: buildSpreadRows(freeByDate, paidSpreadEntries, downloadEntries, "today", date, monthKey),
        month: buildSpreadRows(freeByDate, paidSpreadEntries, downloadEntries, "month", date, monthKey),
        all: buildSpreadRows(freeByDate, paidSpreadEntries, downloadEntries, "all", date, monthKey),
      },
      lineSave: {
        today: { count: analyticsEvents.filter((e) => e.eventType === "line_save" && e.dateKey === date).length, users: new Set(analyticsEvents.filter((e) => e.eventType === "line_save" && e.dateKey === date).map(visitorKey).filter(Boolean)).size },
        month: { count: analyticsEvents.filter((e) => e.eventType === "line_save" && e.monthKey === monthKey).length, users: new Set(analyticsEvents.filter((e) => e.eventType === "line_save" && e.monthKey === monthKey).map(visitorKey).filter(Boolean)).size },
        all: { count: analyticsEvents.filter((e) => e.eventType === "line_save").length, users: new Set(analyticsEvents.filter((e) => e.eventType === "line_save").map(visitorKey).filter(Boolean)).size },
      },
      traffic: {
        today: buildTraffic(analyticsEvents, "today", date, monthKey),
        month: buildTraffic(analyticsEvents, "month", date, monthKey),
        all: buildTraffic(analyticsEvents, "all", date, monthKey),
      },
      trafficSources: buildSourceRows(analyticsEvents, date, monthKey),
      pageStay: buildPageStayRows(analyticsEvents, date, monthKey),
      funnel: buildFunnel(analyticsEvents, "month", date, monthKey),
      funnelFilter: { type: "month" as const, monthKey },
      paymentOrderCount,
    };

    // ── 寫入 daily_admin_stats ────────────────────────────────────────────────
    const docData = {
      date,
      monthKey,
      timezone: "Asia/Taipei",
      generatedAt: FieldValue.serverTimestamp(),
      // 摘要欄位
      visitors: todayVisitors.size,
      freeDraws,
      paidUnlocks: paidUnlocksToday,
      revenue: orderStats.todayRevenue,
      paymentRate: calcRatio(paidUnlocksToday, freeDraws + paidUnlocksToday),
      shareImageDownloads: shareDownloadStats.todayCount,
      lineSaves,
      tarotDraws,
      astroProfileCount,
      sourceBreakdown,
      // page.tsx overview 用
      usageData,
      fortuneCoverage,
      redeemStats,
      orderStats,
      shareDownloadStats,
      shareDownloadRanking,
      ipRanking,
      anonRanking,
      lineRanking,
      // StatsOverviewClient 用
      statsPayload,
    };

    await db.collection("daily_admin_stats").doc(date).set(docData);

    return NextResponse.json({
      ok: true,
      date,
      monthKey,
      visitors: docData.visitors,
      freeDraws,
      paidUnlocks: paidUnlocksToday,
      revenue: orderStats.todayRevenue,
      shareImageDownloads: shareDownloadStats.todayCount,
      lineSaves,
      tarotDraws,
      astroProfileCount,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("[daily-stats/generate] failed:", { name: error.name, message: error.message, date });
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
