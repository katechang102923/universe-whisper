import { cookies } from "next/headers";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  getAdminUserIds,
  getTaipeiDate,
  LINE_DAILY_LIMIT,
  UNAUTH_DAILY_LIMIT,
  type DailyUsageDoc,
} from "@/lib/rateLimit";
import { ZODIAC_SIGNS, getReadyZodiacSet, type FortuneStatsDoc } from "@/lib/dailyFortune";
import {
  SESSION_COOKIE_NAME,
  checkAdminSession,
  getAdminEmailList,
} from "@/lib/verifyAdmin";
import {
  REDEEM_CODES_COLLECTION,
  PAYMENT_ORDERS_COLLECTION,
  type RedeemCodeData,
} from "@/lib/redeemCodes";
import RedeemCodeGenerator from "../redeem-codes/RedeemCodeGenerator";
import { CleanupClient } from "./CleanupClient";
import { FortuneManagementClient } from "./FortuneManagementClient";
import { RedeemCodeList, type SerializableRedeemCode } from "./RedeemCodeList";
import { OrdersTabClient, type SerializableOrder } from "./OrdersTabClient";
import { RevenueTabClient } from "./RevenueTabClient";
import { StatsOverviewClient } from "./StatsOverviewClient";
import { AstroProfileReissueClient } from "./AstroProfileReissueClient";
import { AdminErrorBoundary } from "./AdminErrorBoundary";
import { AdminGate } from "./AdminGate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── 型別 ──────────────────────────────────────────────────────────────────────

type AdminTab = "overview" | "revenue" | "orders" | "codes" | "fortune" | "cleanup";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "overview", label: "使用統計" },
  { id: "revenue",  label: "收入統計" },
  { id: "orders",   label: "付款訂單" },
  { id: "codes",    label: "補發與通行碼" },
  { id: "fortune",  label: "今日星座" },
  { id: "cleanup",  label: "測試清理" },
];

// ── 工具函式 ──────────────────────────────────────────────────────────────────

function sortedEntries(map: Record<string, number>): Array<{ key: string; count: number }> {
  return Object.entries(map)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string") return new Date(v);
  if (typeof v === "object" && "toDate" in v) return (v as { toDate(): Date }).toDate();
  return null;
}

function fmtDate(v: unknown): string {
  const d = toDate(v);
  if (!d) return "—";
  return d.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

// ── 子元件 ────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, highlight }: { label: string; value: number | string; sub?: string; highlight?: boolean }) {
  return (
    <div className={[
      "rounded-2xl border p-5",
      highlight ? "border-[#d8bd70]/30 bg-[#d8bd70]/8" : "border-white/10 bg-midnight/50",
    ].join(" ")}>
      <p className={`text-xs uppercase tracking-[0.24em] ${highlight ? "text-[#d8bd70]/70" : "text-moon/48"}`}>{label}</p>
      <p className={`mt-2 text-4xl font-semibold ${highlight ? "text-[#d8bd70]" : "text-moon"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-moon/44">{sub}</p>}
    </div>
  );
}

function UsageTable({
  title, rows, keyLabel, limit,
}: {
  title: string; rows: Array<{ display: string; count: number }>; keyLabel: string; limit: number;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-midnight/50 p-5">
        <p className="text-sm font-semibold text-moon">{title}</p>
        <p className="mt-3 text-sm text-moon/44">今日尚無資料</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
      <div className="border-b border-white/8 px-5 py-4">
        <p className="text-sm font-semibold text-moon">{title}</p>
        <p className="mt-0.5 text-xs text-moon/44">每日上限：{limit} 次</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/8 text-left">
              <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-moon/48">#</th>
              <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-moon/48">{keyLabel}</th>
              <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-moon/48">次數</th>
              <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-moon/48">狀態</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.display} className={i < rows.length - 1 ? "border-b border-white/6" : ""}>
                <td className="px-5 py-3 text-moon/40">{i + 1}</td>
                <td className="break-all px-5 py-3 font-mono text-xs text-moon/78">{row.display}</td>
                <td className="px-5 py-3 text-right font-semibold text-moon">{row.count}</td>
                <td className="px-5 py-3 text-right">
                  {row.count >= limit ? (
                    <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-300">已達上限</span>
                  ) : (
                    <span className="rounded-full bg-aurora/12 px-2 py-0.5 text-xs text-aurora">剩 {limit - row.count}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ShareDownloadRankingTable({
  rows,
}: {
  rows: { display: string; count: number; lastAt: string; type: string }[];
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-midnight/50 p-5">
        <p className="text-sm font-semibold text-moon">分享圖下載排行（前 20）</p>
        <p className="mt-3 text-sm text-moon/44">尚無下載紀錄</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
      <div className="border-b border-white/8 px-5 py-4">
        <p className="text-sm font-semibold text-moon">分享圖下載排行（前 20，全期）</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/8 text-left">
              <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-moon/48">#</th>
              <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-moon/48">使用者識別</th>
              <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-moon/48">次數</th>
              <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-moon/48">最近下載</th>
              <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-moon/48">類型</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.display + i} className={i < rows.length - 1 ? "border-b border-white/6" : ""}>
                <td className="px-5 py-3 text-moon/40">{i + 1}</td>
                <td className="break-all px-5 py-3 font-mono text-xs text-moon/78">{row.display}</td>
                <td className="px-5 py-3 text-right font-semibold text-moon">{row.count}</td>
                <td className="whitespace-nowrap px-5 py-3 text-xs text-moon/55">{row.lastAt}</td>
                <td className="px-5 py-3 text-xs text-moon/55">{row.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RedeemStatusBadge({ status }: { status: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    active:   { text: "使用中", cls: "bg-aurora/14 text-aurora" },
    used_up:  { text: "已用完", cls: "bg-red-500/14 text-red-300" },
    expired:  { text: "已過期", cls: "bg-white/8 text-moon/40" },
    disabled: { text: "已停用", cls: "bg-white/8 text-moon/40" },
    revoked:  { text: "已作廢", cls: "bg-red-500/14 text-red-300" },
    refunded: { text: "已退款", cls: "bg-amber-400/14 text-amber-300" },
    test:     { text: "測試",   cls: "bg-lavender/14 text-lavender" },
  };
  const { text, cls } = map[status] ?? { text: status, cls: "bg-white/8 text-moon/40" };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{text}</span>;
}

function SourceBadge({ source }: { source?: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    ecpay_paid:     { text: "綠界付款", cls: "bg-aurora/12 text-aurora" },
    manual_admin:   { text: "手動建立", cls: "bg-lavender/12 text-lavender" },
    test:           { text: "測試",     cls: "bg-white/8 text-moon/40" },
    free_grant:     { text: "免費贈送", cls: "bg-amber-400/12 text-amber-300" },
    refund_reissue: { text: "退款補發", cls: "bg-red-500/12 text-red-300" },
  };
  if (!source) return <span className="text-moon/30 text-xs">—</span>;
  const { text, cls } = map[source] ?? { text: source, cls: "bg-white/8 text-moon/40" };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{text}</span>;
}

// ── 序列化 ────────────────────────────────────────────────────────────────────

function serializeConsentRecord(data: FirebaseFirestore.DocumentData): SerializableOrder["consents"] {
  const consents = data.consents;
  if (!consents || typeof consents !== "object") return null;

  return {
    ageAndGuardianConsent:       Boolean(consents.ageAndGuardianConsent),
    paymentAuthorizationConsent: Boolean(consents.paymentAuthorizationConsent),
    digitalContentConsent:       Boolean(consents.digitalContentConsent),
    consentVersion:              consents.consentVersion ?? null,
    consentAcceptedAt:           toDate(consents.consentAcceptedAt)?.toISOString() ?? null,
    userAgent:                   consents.userAgent ?? null,
    pagePath:                    consents.pagePath ?? null,
    tarotMode:                   consents.tarotMode ?? null,
    amount:                      consents.amount ?? null,
    currency:                    consents.currency ?? null,
  };
}

function serializeOrders(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  orderSource: SerializableOrder["orderSource"] = "tarot",
): SerializableOrder[] {
  return docs.map((d) => {
    const data = d.data();
    return {
      id:              d.id,
      orderSource,
      orderNo:         data.orderNo         ?? null,
      merchantTradeNo: data.merchantTradeNo ?? null,
      ecpayTradeNo:    data.ecpayTradeNo    ?? data.tradeNo ?? null,
      tradeNo:         data.tradeNo         ?? data.ecpayTradeNo ?? null,
      status:          data.status          ?? "pending",
      planId:          data.planId          ?? null,
      planName:        data.planName        ?? (orderSource === "astro_profile" ? "三重星座付費解鎖" : null),
      amount:          data.amount          ?? null,
      currency:        data.currency        ?? "TWD",
      uses:            data.uses            ?? null,
      buyerEmail:      data.buyerEmail      ?? null,
      userId:          data.userId          ?? null,
      paymentMethod:   data.paymentMethod   ?? null,
      paymentType:     data.paymentType     ?? null,
      paymentDate:     data.paymentDate     ?? null,
      tradeAmt:        data.tradeAmt        ?? null,
      rtnCode:         data.rtnCode         ?? null,
      rtnMsg:          data.rtnMsg          ?? null,
      cardLast4:       data.cardLast4       ?? null,
      cardType:        data.cardType        ?? null,
      authCode:        data.authCode        ?? null,
      redeemCode:      data.redeemCode      ?? null,
      redeemCodeId:    data.redeemCodeId    ?? null,
      emailSent:       data.emailSent       ?? false,
      emailError:      data.emailError      ?? null,
      emailSentAt:     toDate(data.emailSentAt)?.toISOString()  ?? null,
      createdAt:       toDate(data.createdAt)?.toISOString()    ?? null,
      paidAt:          toDate(data.paidAt)?.toISOString()       ?? null,
      failedAt:        toDate(data.failedAt)?.toISOString()     ?? null,
      refundedAt:      toDate(data.refundedAt)?.toISOString()   ?? null,
      isTest:          data.isTest          ?? false,
      note:            data.note            ?? null,
      consents:        serializeConsentRecord(data),
    };
  });
}

function serializeCodes(codes: RedeemCodeData[]): SerializableRedeemCode[] {
  return codes.map((c) => ({
    code:           c.code,
    planName:       c.planName,
    displayName:    c.displayName,
    price:          c.price,
    totalUses:      c.totalUses,
    remainingUses:  c.remainingUses,
    status:         c.status,
    createdAt:      toDate(c.createdAt)?.toISOString() ?? null,
    expiresAt:      toDate(c.expiresAt)?.toISOString() ?? null,
    usedLogs:       (c.usedLogs ?? []).map((log) => ({
      usedAt:             toDate(log.usedAt)?.toISOString() ?? null,
      resultId:           log.resultId,
      question:           log.question,
      spreadType:         log.spreadType,
      mode:               log.mode,
      source:             log.source,
      remainingUsesAfter: log.remainingUsesAfter,
    })),
    source:          c.source,
    createdByAdmin:  c.createdByAdmin,
    paymentStatus:   c.paymentStatus,
    isTest:          c.isTest,
    merchantTradeNo: c.merchantTradeNo,
    ecpayTradeNo:    c.ecpayTradeNo,
    buyerEmail:      c.buyerEmail,
    emailSent:       c.emailSent,
  }));
}

// ── OverviewTab ────────────────────────────────────────────────────────────────

function OverviewTab({
  today,
  fetchError,
  defaultEmail,
}: {
  today:        string;
  fetchError:   boolean;
  defaultEmail: string;
}) {
  return (
    <StatsOverviewClient
      today={today}
      fetchError={fetchError}
      defaultEmail={defaultEmail}
    />
  );
}

// ── FortuneTab ────────────────────────────────────────────────────────────────

function FortuneTab({
  today, generatedSigns, fortuneStats,
}: {
  today: string; generatedSigns: string[]; fortuneStats: Partial<FortuneStatsDoc>;
}) {
  const allSigns     = [...ZODIAC_SIGNS];
  const missingSigns = allSigns.filter((s) => !generatedSigns.includes(s));
  const coverage     = generatedSigns.length;
  const allDone      = coverage === allSigns.length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="AI 生成次數" value={fortuneStats.ai_generations ?? 0} sub="今日 AI API 呼叫" />
        <StatCard label="快取命中"    value={fortuneStats.cache_hits ?? 0}    sub="直接讀快取" />
        <StatCard label="星座覆蓋"    value={`${coverage} / ${allSigns.length}`} sub={allDone ? "✓ 全部完成" : `缺 ${missingSigns.length} 個`} />
        <StatCard label="生成狀態"    value={allDone ? "完成" : "部分"}        sub={today} />
      </div>
      <FortuneManagementClient missingSigns={missingSigns} generatedSigns={generatedSigns} totalSigns={allSigns.length} />
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
        <div className="border-b border-white/8 px-5 py-4">
          <p className="text-sm font-semibold text-moon">今日 12 星座快取狀態</p>
          <p className="mt-0.5 text-xs text-moon/44">綠色＝已生成 · 橘色＝缺少</p>
        </div>
        <div className="flex flex-wrap gap-2 p-5">
          {allSigns.map((sign) => {
            const ok = generatedSigns.includes(sign);
            return (
              <span key={sign} className={`rounded-full px-3 py-1.5 text-xs font-medium ${ok ? "bg-aurora/18 text-aurora" : "bg-amber-400/14 text-amber-300 ring-1 ring-amber-400/30"}`}>
                {ok ? "✓ " : "✗ "}{sign}
              </span>
            );
          })}
        </div>
        {missingSigns.length > 0 && (
          <div className="border-t border-white/8 px-5 py-3">
            <p className="text-xs text-moon/50">缺少：<span className="text-amber-300">{missingSigns.join("、")}</span></p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 主頁面 ────────────────────────────────────────────────────────────────────

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // ── 驗證管理員 ──────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const sessionCheck = await checkAdminSession(sessionCookie);
  const lineUserId = cookieStore.get("line_user_id")?.value ?? null;
  const isLineAdmin = Boolean(lineUserId && getAdminUserIds().includes(lineUserId));
  const isAdminUser = sessionCheck.ok || isLineAdmin;

  // ── 診斷 log（僅伺服器 console，不顯示在前台）──────────────────────────────────
  console.log("[admin/usage] auth", {
    hasSession: sessionCheck.hasSession,
    sessionEmail: sessionCheck.email,
    isGoogleAdmin: sessionCheck.ok,
    hasLineCookie: Boolean(lineUserId),
    isLineAdmin,
    isAdminUser,
    adminEmails: getAdminEmailList(),
    decision: isAdminUser ? "render-admin" : "show-gate",
  });

  // 未通過：顯示清楚的登入閘門（不再靜默 redirect 回首頁，也不會卡在 loading）
  if (!isAdminUser) {
    return (
      <AppShell adminMode>
        <section className="mx-auto w-full max-w-6xl py-10">
          <AdminGate hasSession={sessionCheck.hasSession} email={sessionCheck.email} />
        </section>
      </AppShell>
    );
  }

  // ── Tab 解析 ────────────────────────────────────────────────────────────────
  const params     = await searchParams;
  const requestedTab = params.tab;
  const normalizedTab = requestedTab === "redeem" || requestedTab === "astro" ? "codes" : requestedTab;
  const tab        = (normalizedTab ?? "overview") as AdminTab;
  const validTabs  = TABS.map((t) => t.id);
  const currentTab: AdminTab = validTabs.includes(tab) ? tab : "overview";

  const today = getTaipeiDate();

  // ── 資料抓取 ─────────────────────────────────────────────────────────────────
  let usageData:   Partial<DailyUsageDoc>   = {};
  let fortuneStats: Partial<FortuneStatsDoc> = {};
  let fortuneReadySigns: string[] | null = null;
  let codes:       RedeemCodeData[]          = [];
  let orders:      SerializableOrder[]        = [];
  let redeemStats  = { total: 0, active: 0, usedUp: 0, test: 0 };
  let orderStats   = {
    total: 0, paid: 0, failed: 0, pending: 0,
    todayRevenue: 0, todayPaid: 0, todayTest: 0, noCode: 0, emailUnsent: 0,
  };
  let shareDownloadStats = { todayCount: 0, todayUsers: 0, allCount: 0, allUsers: 0 };
  let shareDownloadRanking: { display: string; count: number; lastAt: string; type: string }[] = [];
  let fetchError = false;
  let snapshotNote = "";
  let noSnapshot = false;

  try {
    const db = getAdminDb();

    if (currentTab === "orders") {
      try {
        const snap = await db
          .collection(PAYMENT_ORDERS_COLLECTION)
          .orderBy("createdAt", "desc")
          .limit(200)
          .get();
        const astroSnap = await db
          .collection("astroProfileOrders")
          .orderBy("createdAt", "desc")
          .limit(80)
          .get()
          .catch(() => null);

        orders = [
          ...serializeOrders(snap.docs, "tarot"),
          ...(astroSnap ? serializeOrders(astroSnap.docs, "astro_profile") : []),
        ]
          .sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0))
          .slice(0, 200);
      } catch (e) {
        console.error("[Admin Orders] load failed:", e);
      }
    }

    if (currentTab === "codes") {
      const snap = await db
        .collection(REDEEM_CODES_COLLECTION)
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();
      codes = snap.docs.map((d) => d.data() as RedeemCodeData);
    }

    if (currentTab === "fortune") {
      const snap = await db.collection("fortune_stats").doc(today).get();
      fortuneStats = (snap.data() as Partial<FortuneStatsDoc>) ?? {};
      // 以實際 dailyFortunes 快取為準計算 X/12（讀當天 12 筆），避免 fortune_stats 漂移
      try {
        fortuneReadySigns = [...(await getReadyZodiacSet(today))];
      } catch (e) {
        console.error("[Admin Fortune] getReadyZodiacSet failed:", e);
      }
    }

  } catch (err) {
    fetchError = true;
    const error = err instanceof Error ? err : new Error(String(err));
    const pk = process.env.FIREBASE_PRIVATE_KEY ?? process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "";
    console.error("[Admin Firebase Error]", {
      name: error.name,
      message: error.message,
      hasProjectId: Boolean(process.env.FIREBASE_PROJECT_ID ?? process.env.FIREBASE_ADMIN_PROJECT_ID),
      hasClientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL ?? process.env.FIREBASE_ADMIN_CLIENT_EMAIL),
      hasPrivateKey: Boolean(pk),
      privateKeyStartsCorrectly: pk.replace(/^["']|["']$/g, "").trimStart().startsWith("-----BEGIN PRIVATE KEY-----"),
      privateKeyHasLiteralBackslashN: pk.includes("\\n"),
      runtime: typeof process !== "undefined" ? process.version : "unknown",
    });
  }

  // 防濫用排行（overview 用）
  const ipUsage    = usageData.ip_usage    ?? {};
  const ipDisplay  = usageData.ip_display  ?? {};
  const anonUsage  = usageData.anon_usage  ?? {};
  const lineUsage  = usageData.line_usage  ?? {};

  const adminLineIdsSet = new Set(getAdminUserIds());
  const ipRanking   = sortedEntries(ipUsage).slice(0, 20).map(({ key, count }) => ({ display: ipDisplay[key] ?? key, count }));
  const anonRanking = sortedEntries(anonUsage).slice(0, 20).map(({ key, count }) => ({ display: key, count }));
  const lineRanking = sortedEntries(lineUsage)
    .filter(({ key }) => !adminLineIdsSet.has(key))
    .slice(0, 20)
    .map(({ key, count }) => ({ display: key, count }));

  const generatedSigns = fortuneReadySigns ?? fortuneStats.generated_zodiacs ?? [];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <AppShell adminMode>
      <section className="mx-auto w-full max-w-6xl py-6 sm:py-10">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">admin · 營運後台</p>
            <h1 className="mt-2 text-3xl font-semibold text-moon sm:text-4xl">管理後台</h1>
            <p className="mt-1.5 text-sm text-moon/50">統計日期：{today}（Asia/Taipei）</p>
          </div>
          <Link
            href={`/admin/usage?tab=${currentTab}`}
            className="mt-1 rounded-full border border-white/12 bg-white/8 px-5 py-2.5 text-sm text-moon transition hover:bg-white/14"
          >
            ↻ 重新整理
          </Link>
        </div>

        {/* Tab 導覽 */}
        <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-midnight/70 p-1.5">
          <div className="flex min-w-max gap-1">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={`/admin/usage?tab=${t.id}`}
              className={[
                "rounded-xl px-4 py-2 text-sm font-medium transition",
                currentTab === t.id
                  ? "bg-lavender/20 text-lavender"
                  : "text-moon/60 hover:bg-white/6 hover:text-moon",
              ].join(" ")}
            >
              {t.label}
            </Link>
          ))}
          {/* 獨立頁面連結（付費測試） */}
          <Link
            href="/admin/payment-test"
            className="rounded-xl px-4 py-2 text-sm font-medium transition text-moon/60 hover:bg-white/6 hover:text-moon"
          >
            付費測試
          </Link>
          </div>
        </div>

        {/* Tab 內容（以錯誤邊界隔離：單一區塊壞掉不影響整個後台導覽） */}
        <div className="mt-8">
          <AdminErrorBoundary label={`${currentTab} 區塊`}>
          {currentTab === "overview" && (
            <OverviewTab
              today={today}
              fetchError={fetchError}
              defaultEmail={sessionCheck.email ?? getAdminEmailList()[0] ?? ""}
            />
          )}

          {currentTab === "revenue" && <RevenueTabClient />}

          {currentTab === "orders" && <OrdersTabClient orders={orders} />}

          {currentTab === "codes" && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-white/10 bg-midnight/60 p-5 sm:p-6">
                <p className="text-xs uppercase tracking-[0.24em] text-[#d8bd70]/70">A. 通行碼管理</p>
                <h2 className="mt-2 text-lg font-semibold text-moon">產生新宇宙通行碼</h2>
                <RedeemCodeGenerator />
              </div>
              <div className="rounded-2xl border border-white/10 bg-midnight/60 p-5 sm:p-6">
                <h2 className="mb-4 text-lg font-semibold text-moon">最近通行碼（前 50 筆）</h2>
                <RedeemCodeList codes={serializeCodes(codes)} />
              </div>
              <div className="rounded-2xl border border-white/10 bg-midnight/60 p-5 sm:p-6">
                <p className="text-xs uppercase tracking-[0.24em] text-lavender/70">B. 三重星座手動補發</p>
                <h2 className="mt-2 text-lg font-semibold text-moon">三重星座補發序號</h2>
                <p className="mb-6 text-sm text-moon/50">
                  產生單次使用的補發序號（AP-XXXXXXXX），寄給需要補發的用戶。用戶在 /astro-profile 解鎖頁輸入序號即可免費解鎖，序號 30 天內有效。
                </p>
                <AstroProfileReissueClient />
              </div>
            </div>
          )}

          {currentTab === "fortune" && (
            <FortuneTab today={today} generatedSigns={generatedSigns} fortuneStats={fortuneStats} />
          )}

          {currentTab === "cleanup" && <CleanupClient />}
          </AdminErrorBoundary>
        </div>

        <p className="mt-10 text-center text-xs text-moon/28">
          宇宙偷偷話 · 管理後台 · {today}
        </p>
      </section>
    </AppShell>
  );
}
