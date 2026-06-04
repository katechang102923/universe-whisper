import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  getAdminUserIds,
  getTaipeiDate,
  LINE_DAILY_LIMIT,
  UNAUTH_DAILY_LIMIT,
  type DailyUsageDoc,
} from "@/lib/rateLimit";
import { ZODIAC_SIGNS, type FortuneStatsDoc } from "@/lib/dailyFortune";
import {
  SESSION_COOKIE_NAME,
  verifyAdminSessionCookie,
} from "@/lib/verifyAdmin";
import {
  REDEEM_CODES_COLLECTION,
  PAYMENT_ORDERS_COLLECTION,
  REDEEM_PLANS,
  type RedeemCodeData,
  type PaymentOrderData,
} from "@/lib/redeemCodes";
import RedeemCodeGenerator from "../redeem-codes/RedeemCodeGenerator";
import { CleanupClient } from "./CleanupClient";
import { FortuneManagementClient } from "./FortuneManagementClient";
import { RedeemCodeList, type SerializableRedeemCode } from "./RedeemCodeList";
import { OrdersTabClient } from "./OrdersTabClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── 型別 ──────────────────────────────────────────────────────────────────────

type AdminTab = "overview" | "orders" | "redeem" | "fortune" | "antiabuse" | "cleanup";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "overview", label: "使用統計" },
  { id: "orders", label: "付款訂單" },
  { id: "redeem", label: "通行碼管理" },
  { id: "fortune", label: "今日星座" },
  { id: "antiabuse", label: "防濫用" },
  { id: "cleanup", label: "測試清理" },
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
  if (typeof v === "object" && "toDate" in v) return (v as { toDate(): Date }).toDate();
  return null;
}

function fmtDate(v: unknown): string {
  const d = toDate(v);
  if (!d) return "—";
  return d.toLocaleDateString("zh-TW") + " " + d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
}

// ── 子元件 ────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-midnight/50 p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-moon/48">{label}</p>
      <p className="mt-2 text-4xl font-semibold text-moon">{value}</p>
      {sub && <p className="mt-1 text-xs text-moon/44">{sub}</p>}
    </div>
  );
}

function UsageTable({
  title,
  rows,
  keyLabel,
  limit,
}: {
  title: string;
  rows: Array<{ display: string; count: number }>;
  keyLabel: string;
  limit: number;
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
                    <span className="rounded-full bg-aurora/12 px-2 py-0.5 text-xs text-aurora">
                      剩 {limit - row.count}
                    </span>
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

function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    pending:   { text: "待付款", cls: "bg-amber-400/14 text-amber-300" },
    paid:      { text: "已付款", cls: "bg-aurora/14 text-aurora" },
    failed:    { text: "付款失敗", cls: "bg-red-500/14 text-red-300" },
    cancelled: { text: "已取消", cls: "bg-white/8 text-moon/40" },
    refunded:  { text: "已退款", cls: "bg-lavender/14 text-lavender" },
    test:      { text: "測試",   cls: "bg-white/10 text-moon/50" },
  };
  const { text, cls } = map[status] ?? { text: status, cls: "bg-white/8 text-moon/40" };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{text}</span>;
}

function SourceBadge({ source }: { source?: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    ecpay_paid:      { text: "綠界付款", cls: "bg-aurora/12 text-aurora" },
    manual_admin:    { text: "手動建立", cls: "bg-lavender/12 text-lavender" },
    test:            { text: "測試", cls: "bg-white/8 text-moon/40" },
    free_grant:      { text: "免費贈送", cls: "bg-amber-400/12 text-amber-300" },
    refund_reissue:  { text: "退款補發", cls: "bg-red-500/12 text-red-300" },
  };
  if (!source) return <span className="text-moon/30 text-xs">—</span>;
  const { text, cls } = map[source] ?? { text: source, cls: "bg-white/8 text-moon/40" };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{text}</span>;
}

// ── 序列化（Timestamp → string，供 Client Component 使用） ───────────────────

function serializeCodes(codes: RedeemCodeData[]): SerializableRedeemCode[] {
  return codes.map((c) => ({
    code: c.code,
    planName: c.planName,
    displayName: c.displayName,
    price: c.price,
    totalUses: c.totalUses,
    remainingUses: c.remainingUses,
    status: c.status,
    createdAt: toDate(c.createdAt)?.toISOString() ?? null,
    expiresAt: toDate(c.expiresAt)?.toISOString() ?? null,
    usedLogs: (c.usedLogs ?? []).map((log) => ({
      usedAt: toDate(log.usedAt)?.toISOString() ?? null,
      resultId: log.resultId,
      question: log.question,
      spreadType: log.spreadType,
      mode: log.mode,
      source: log.source,
      remainingUsesAfter: log.remainingUsesAfter,
    })),
    source: c.source,
    createdByAdmin: c.createdByAdmin,
    paymentStatus: c.paymentStatus,
    isTest: c.isTest,
    merchantTradeNo: c.merchantTradeNo,
    ecpayTradeNo: c.ecpayTradeNo,
    buyerEmail: c.buyerEmail,
    emailSent: c.emailSent,
  }));
}

// ── 各 Tab 內容元件 ────────────────────────────────────────────────────────────

function OverviewTab({
  today,
  usageData,
  fortuneStats,
  redeemStats,
  orderStats,
  fetchError,
}: {
  today: string;
  usageData: Partial<DailyUsageDoc>;
  fortuneStats: Partial<FortuneStatsDoc>;
  redeemStats: { total: number; active: number; usedUp: number; test: number };
  orderStats: { total: number; paid: number; failed: number; todayRevenue: number };
  fetchError: boolean;
}) {
  const totalRequests = usageData.total_requests ?? 0;
  const totalBlocked  = usageData.total_blocked  ?? 0;
  const fortuneCoverage = (fortuneStats.generated_zodiacs ?? []).length;
  const featureUsage = usageData.feature_usage ?? {};

  return (
    <div className="space-y-8">
      {fetchError && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          ⚠ Firestore 資料讀取失敗，請確認 Firebase 環境變數設定。
        </div>
      )}

      {/* 付款概覽 */}
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-moon/50">付款概覽（全期）</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="付款訂單總筆數" value={orderStats.total} />
          <StatCard label="成功付款" value={orderStats.paid} sub="status = paid" />
          <StatCard label="付款失敗" value={orderStats.failed} sub="status = failed" />
          <StatCard label="今日累積營收" value={orderStats.todayRevenue > 0 ? `NT$${orderStats.todayRevenue}` : "—"} sub="付款成功訂單加總" />
        </div>
      </div>

      {/* 通行碼概覽 */}
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-moon/50">通行碼概覽（全期）</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="通行碼總數" value={redeemStats.total} />
          <StatCard label="使用中" value={redeemStats.active} sub="status = active" />
          <StatCard label="已用完" value={redeemStats.usedUp} sub="status = used_up" />
          <StatCard label="測試資料" value={redeemStats.test} sub="isTest = true" />
        </div>
      </div>

      {/* 今日使用 */}
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-moon/50">今日免費抽牌（{today}）</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="成功請求" value={totalRequests} sub="AI API 已呼叫" />
          <StatCard label="阻擋請求" value={totalBlocked} sub="限流攔截" />
          <StatCard
            label="最多使用功能"
            value={
              (featureUsage["single_tarot"] ?? 0) >= (featureUsage["three_card"] ?? 0)
                ? "單張塔羅"
                : "三張牌訊息"
            }
            sub={`單張 ${featureUsage["single_tarot"] ?? 0} · 三張 ${featureUsage["three_card"] ?? 0}`}
          />
          <StatCard
            label="星座快取覆蓋"
            value={`${fortuneCoverage} / ${ZODIAC_SIGNS.length}`}
            sub={fortuneCoverage === ZODIAC_SIGNS.length ? "✓ 全部完成" : "今日已生成"}
          />
        </div>
      </div>
    </div>
  );
}

function OrdersTab({ orders }: { orders: PaymentOrderData[] }) {
  return <OrdersTabClient orders={orders} />;
}

function RedeemTab({ codes }: { codes: RedeemCodeData[] }) {
  const serialized = serializeCodes(codes);
  return (
    <div className="space-y-8">
      {/* 產生器 */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-moon">產生新宇宙通行碼</h2>
        <RedeemCodeGenerator />
      </div>

      {/* 通行碼列表 */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-moon">最近通行碼（前 50 筆）</h2>
        <RedeemCodeList codes={serialized} />
      </div>
    </div>
  );
}

function FortuneTab({
  today,
  generatedSigns,
  fortuneStats,
}: {
  today: string;
  generatedSigns: string[];
  fortuneStats: Partial<FortuneStatsDoc>;
}) {
  const allSigns = [...ZODIAC_SIGNS];
  const missingSigns = allSigns.filter((s) => !generatedSigns.includes(s));
  const fortuneCoverage = generatedSigns.length;
  const allGenerated = fortuneCoverage === allSigns.length;

  return (
    <div className="space-y-6">
      {/* 統計卡片 */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="AI 生成次數" value={fortuneStats.ai_generations ?? 0} sub="今日 AI API 呼叫" />
        <StatCard label="快取命中" value={fortuneStats.cache_hits ?? 0} sub="直接讀快取" />
        <StatCard
          label="星座覆蓋"
          value={`${fortuneCoverage} / ${allSigns.length}`}
          sub={allGenerated ? "✓ 全部完成" : `缺 ${missingSigns.length} 個`}
        />
        <StatCard label="生成狀態" value={allGenerated ? "完成" : "部分"} sub={today} />
      </div>

      {/* 互動操作 */}
      <FortuneManagementClient
        missingSigns={missingSigns}
        generatedSigns={generatedSigns}
        totalSigns={allSigns.length}
      />

      {/* 12 星座狀態格 */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
        <div className="border-b border-white/8 px-5 py-4">
          <p className="text-sm font-semibold text-moon">今日 12 星座快取狀態</p>
          <p className="mt-0.5 text-xs text-moon/44">
            綠色＝已生成 · 橘色＝缺少 · 資料來源：fortune_stats › {today}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 p-5">
          {allSigns.map((sign) => {
            const hasCache = generatedSigns.includes(sign);
            return (
              <span
                key={sign}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  hasCache
                    ? "bg-aurora/18 text-aurora"
                    : "bg-amber-400/14 text-amber-300 ring-1 ring-amber-400/30"
                }`}
              >
                {hasCache ? "✓ " : "✗ "}{sign}
              </span>
            );
          })}
        </div>
        {missingSigns.length > 0 && (
          <div className="border-t border-white/8 px-5 py-3">
            <p className="text-xs text-moon/50">
              缺少：<span className="text-amber-300">{missingSigns.join("、")}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function AntiAbuseTab({
  ipRanking,
  anonRanking,
  lineRanking,
  usageData,
}: {
  ipRanking: { display: string; count: number }[];
  anonRanking: { display: string; count: number }[];
  lineRanking: { display: string; count: number }[];
  usageData: Partial<DailyUsageDoc>;
}) {
  const blockRate =
    (usageData.total_requests ?? 0) + (usageData.total_blocked ?? 0) > 0
      ? Math.round(
          ((usageData.total_blocked ?? 0) /
            ((usageData.total_requests ?? 0) + (usageData.total_blocked ?? 0))) *
            100
        )
      : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-lavender/18 bg-lavender/8 p-4 text-sm leading-7 text-moon/72">
        <span className="font-semibold text-lavender">限制規則：</span>
        未登入：每日 {UNAUTH_DAILY_LIMIT} 次（IP＋anonymousId 雙重）&nbsp;·&nbsp;
        LINE 用戶：每日 {LINE_DAILY_LIMIT} 次&nbsp;·&nbsp;
        管理員：無限制
        <span className="ml-4 rounded-full bg-white/8 px-2 py-0.5 text-xs">
          今日阻擋率 {blockRate}%
        </span>
      </div>

      <UsageTable title="IP 使用排行（前 20）" keyLabel="IP 位址" rows={ipRanking} limit={UNAUTH_DAILY_LIMIT} />
      <UsageTable title="匿名識別碼使用排行（前 20）" keyLabel="Anonymous ID" rows={anonRanking} limit={UNAUTH_DAILY_LIMIT} />
      <UsageTable title="LINE 用戶使用排行（前 20）" keyLabel="LINE User ID" rows={lineRanking} limit={LINE_DAILY_LIMIT} />
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
  const isGoogleAdmin = await verifyAdminSessionCookie(sessionCookie);
  const lineUserId = cookieStore.get("line_user_id")?.value ?? null;
  const isLineAdmin = Boolean(lineUserId && getAdminUserIds().includes(lineUserId));

  if (!isGoogleAdmin && !isLineAdmin) {
    redirect("/");
  }

  // ── Tab 解析 ────────────────────────────────────────────────────────────────
  const params = await searchParams;
  const tab = (params.tab ?? "overview") as AdminTab;
  const validTabs = TABS.map((t) => t.id);
  const currentTab: AdminTab = validTabs.includes(tab) ? tab : "overview";

  const today = getTaipeiDate();

  // ── 資料抓取（依 tab 條件載入） ──────────────────────────────────────────────
  let usageData: Partial<DailyUsageDoc> = {};
  let fortuneStats: Partial<FortuneStatsDoc> = {};
  let codes: RedeemCodeData[] = [];
  let orders: PaymentOrderData[] = [];
  let redeemStats = { total: 0, active: 0, usedUp: 0, test: 0 };
  let orderStats = { total: 0, paid: 0, failed: 0, todayRevenue: 0 };
  let fetchError = false;

  try {
    const db = getAdminDb();

    if (currentTab === "overview" || currentTab === "antiabuse") {
      const [usageSnap, fortuneSnap] = await Promise.all([
        db.collection("rate_limits").doc(today).get(),
        db.collection("fortune_stats").doc(today).get(),
      ]);
      usageData = (usageSnap.data() as Partial<DailyUsageDoc>) ?? {};
      fortuneStats = (fortuneSnap.data() as Partial<FortuneStatsDoc>) ?? {};
    }

    if (currentTab === "overview") {
      // 通行碼彙總
      const codeSnap = await db.collection(REDEEM_CODES_COLLECTION).get();
      codeSnap.docs.forEach((d) => {
        const c = d.data() as RedeemCodeData;
        redeemStats.total++;
        if (c.status === "active") redeemStats.active++;
        if (c.status === "used_up") redeemStats.usedUp++;
        if (c.isTest) redeemStats.test++;
      });

      // 付款訂單彙總
      try {
        const orderSnap = await db.collection(PAYMENT_ORDERS_COLLECTION).get();
        orderSnap.docs.forEach((d) => {
          const o = d.data() as PaymentOrderData;
          orderStats.total++;
          if (o.status === "paid") {
            orderStats.paid++;
            const paidAt = toDate(o.paidAt);
            if (paidAt && paidAt.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }) === today) {
              orderStats.todayRevenue += o.amount ?? 0;
            }
          }
          if (o.status === "failed") orderStats.failed++;
        });
      } catch { /* paymentOrders 不存在時忽略 */ }
    }

    if (currentTab === "orders") {
      try {
        const orderSnap = await db
          .collection(PAYMENT_ORDERS_COLLECTION)
          .orderBy("createdAt", "desc")
          .limit(100)
          .get();
        orders = orderSnap.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentOrderData));
      } catch { /* empty */ }
    }

    if (currentTab === "redeem") {
      const snap = await db
        .collection(REDEEM_CODES_COLLECTION)
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();
      codes = snap.docs.map((d) => d.data() as RedeemCodeData);
    }

    if (currentTab === "fortune") {
      const fortuneSnap = await db.collection("fortune_stats").doc(today).get();
      fortuneStats = (fortuneSnap.data() as Partial<FortuneStatsDoc>) ?? {};
    }

  } catch {
    fetchError = true;
  }

  const ipUsage = usageData.ip_usage ?? {};
  const ipDisplay = usageData.ip_display ?? {};
  const anonUsage = usageData.anon_usage ?? {};
  const lineUsage = usageData.line_usage ?? {};

  const ipRanking = sortedEntries(ipUsage).slice(0, 20).map(({ key, count }) => ({
    display: ipDisplay[key] ?? key,
    count,
  }));
  const anonRanking = sortedEntries(anonUsage).slice(0, 20).map(({ key, count }) => ({
    display: key,
    count,
  }));
  const lineRanking = sortedEntries(lineUsage).slice(0, 20).map(({ key, count }) => ({
    display: key,
    count,
  }));

  const generatedSigns = fortuneStats.generated_zodiacs ?? [];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <section className="mx-auto w-full max-w-6xl py-8 sm:py-12">

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
        <div className="mt-6 flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-midnight/50 p-1.5">
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
        </div>

        {/* Tab 內容 */}
        <div className="mt-8">
          {currentTab === "overview" && (
            <OverviewTab
              today={today}
              usageData={usageData}
              fortuneStats={fortuneStats}
              redeemStats={redeemStats}
              orderStats={orderStats}
              fetchError={fetchError}
            />
          )}

          {currentTab === "orders" && <OrdersTab orders={orders} />}

          {currentTab === "redeem" && <RedeemTab codes={codes} />}

          {currentTab === "fortune" && (
            <FortuneTab
              today={today}
              generatedSigns={generatedSigns}
              fortuneStats={fortuneStats}
            />
          )}

          {currentTab === "antiabuse" && (
            <AntiAbuseTab
              ipRanking={ipRanking}
              anonRanking={anonRanking}
              lineRanking={lineRanking}
              usageData={usageData}
            />
          )}

          {currentTab === "cleanup" && <CleanupClient />}
        </div>

        <p className="mt-10 text-center text-xs text-moon/28">
          宇宙偷偷話 · 管理後台 · {today}
        </p>
      </section>
    </AppShell>
  );
}
