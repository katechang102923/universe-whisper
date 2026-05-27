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

export const dynamic = "force-dynamic"; // 每次請求都取得最新資料

// ── 工具 ──────────────────────────────────────────────────────────────────────

function sortedEntries(map: Record<string, number>): Array<{ key: string; count: number }> {
  return Object.entries(map)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

// ── 子元件 ────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-midnight/50 p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-moon/48">{label}</p>
      <p className="mt-2 text-4xl font-semibold text-moon">{value}</p>
      {sub ? <p className="mt-1 text-xs text-moon/44">{sub}</p> : null}
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
              <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-moon/48 text-right">次數</th>
              <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-moon/48 text-right">狀態</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.display} className={i < rows.length - 1 ? "border-b border-white/6" : ""}>
                <td className="px-5 py-3 text-moon/40">{i + 1}</td>
                <td className="px-5 py-3 font-mono text-xs text-moon/78 break-all">{row.display}</td>
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

// ── 主頁面 ────────────────────────────────────────────────────────────────────

export default async function AdminUsagePage() {
  // ── 驗證管理員身份 ──────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const lineUserId = cookieStore.get("line_user_id")?.value ?? null;
  const adminIds = getAdminUserIds();

  if (!lineUserId || !adminIds.includes(lineUserId)) {
    redirect("/");
  }

  // ── 取得今日使用資料 ─────────────────────────────────────────────────────
  const today = getTaipeiDate();
  let usageData: Partial<DailyUsageDoc> = {};
  let fortuneStats: Partial<FortuneStatsDoc> = {};
  let fetchError = false;

  try {
    const db = getAdminDb();
    const [usageSnap, fortuneSnap] = await Promise.all([
      db.collection("rate_limits").doc(today).get(),
      db.collection("fortune_stats").doc(today).get(),
    ]);
    usageData = (usageSnap.data() as Partial<DailyUsageDoc>) ?? {};
    fortuneStats = (fortuneSnap.data() as Partial<FortuneStatsDoc>) ?? {};
  } catch {
    fetchError = true;
  }

  const totalRequests = usageData.total_requests ?? 0;
  const totalBlocked = usageData.total_blocked ?? 0;
  const featureUsage = usageData.feature_usage ?? {};
  const ipUsage = usageData.ip_usage ?? {};
  const ipDisplay = usageData.ip_display ?? {};
  const anonUsage = usageData.anon_usage ?? {};
  const lineUsage = usageData.line_usage ?? {};

  // 建立排行榜資料
  const ipRanking = sortedEntries(ipUsage)
    .slice(0, 20)
    .map(({ key, count }) => ({ display: ipDisplay[key] ?? key, count }));

  const anonRanking = sortedEntries(anonUsage)
    .slice(0, 20)
    .map(({ key, count }) => ({ display: key, count }));

  const lineRanking = sortedEntries(lineUsage)
    .slice(0, 20)
    .map(({ key, count }) => ({ display: key, count }));

  const blockRate =
    totalRequests + totalBlocked > 0
      ? Math.round((totalBlocked / (totalRequests + totalBlocked)) * 100)
      : 0;

  // ── 今日運勢快取統計 ──────────────────────────────────────────────────────
  const fortuneAiGenerations = fortuneStats.ai_generations ?? 0;
  const fortuneCacheHits = fortuneStats.cache_hits ?? 0;
  const fortuneGeneratedZodiacs = fortuneStats.generated_zodiacs ?? [];
  const fortuneSaved = fortuneCacheHits; // cache hit = 一次節省的 AI 呼叫
  const fortuneCoverage = fortuneGeneratedZodiacs.length;

  return (
    <AppShell>
      <section className="mx-auto w-full max-w-5xl py-8 sm:py-12">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">admin · 後台</p>
            <h1 className="mt-2 text-3xl font-semibold text-moon sm:text-4xl">使用統計</h1>
            <p className="mt-1.5 text-sm text-moon/50">
              統計日期：{today}（Asia/Taipei）
            </p>
          </div>
          <Link
            href="/admin/usage"
            className="mt-1 rounded-full border border-white/12 bg-white/8 px-5 py-2.5 text-sm text-moon transition hover:bg-white/14"
          >
            ↻ 重新整理
          </Link>
        </div>

        {fetchError && (
          <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            ⚠ Firestore 資料讀取失敗，請確認 Firebase 環境變數設定。
          </div>
        )}

        {/* 限制說明 */}
        <div className="mt-6 rounded-2xl border border-lavender/18 bg-lavender/8 p-4 text-sm leading-7 text-moon/72">
          <span className="font-semibold text-lavender">限制規則：</span>
          未登入：每日 {UNAUTH_DAILY_LIMIT} 次（IP＋anonymousId 雙重）&nbsp;·&nbsp;
          LINE 用戶：每日 {LINE_DAILY_LIMIT} 次&nbsp;·&nbsp;
          管理員：無限制
        </div>

        {/* 摘要統計 */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="今日成功次數" value={totalRequests} sub="AI API 已呼叫" />
          <StatCard label="今日阻擋次數" value={totalBlocked} sub="限流攔截，未呼叫 AI" />
          <StatCard label="阻擋率" value={`${blockRate}%`} sub={`${totalRequests + totalBlocked} 次總請求`} />
          <StatCard
            label="最多使用功能"
            value={
              (featureUsage["single_tarot"] ?? 0) >= (featureUsage["three_card"] ?? 0)
                ? "單張塔羅"
                : "三張牌訊息"
            }
            sub={`單張 ${featureUsage["single_tarot"] ?? 0} · 三張 ${featureUsage["three_card"] ?? 0}`}
          />
        </div>

        {/* 功能使用明細 */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-midnight/50 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-moon/48">功能使用分布</p>
            <div className="mt-3 space-y-3">
              {[
                { label: "單張塔羅", key: "single_tarot", color: "bg-aurora" },
                { label: "三張牌訊息", key: "three_card", color: "bg-lavender" },
              ].map(({ label, key, color }) => {
                const count = featureUsage[key] ?? 0;
                const pct = totalRequests > 0 ? Math.round((count / totalRequests) * 100) : 0;
                return (
                  <div key={key}>
                    <div className="flex justify-between text-sm">
                      <span className="text-moon/72">{label}</span>
                      <span className="font-semibold text-moon">
                        {count} 次 <span className="text-moon/44 font-normal">({pct}%)</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/8">
                      <div
                        className={`h-full rounded-full ${color} opacity-70`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-midnight/50 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-moon/48">用戶類型分布</p>
            <div className="mt-3 space-y-3">
              {[
                {
                  label: "LINE 登入用戶",
                  count: Object.values(lineUsage).reduce((a, b) => a + b, 0),
                  color: "bg-[#06C755]",
                },
                {
                  label: "未登入用戶",
                  count: Object.values(ipUsage).reduce((a, b) => a + b, 0),
                  color: "bg-moon",
                },
              ].map(({ label, count, color }) => {
                const pct = totalRequests > 0 ? Math.round((count / totalRequests) * 100) : 0;
                return (
                  <div key={label}>
                    <div className="flex justify-between text-sm">
                      <span className="text-moon/72">{label}</span>
                      <span className="font-semibold text-moon">
                        {count} 次 <span className="text-moon/44 font-normal">({pct}%)</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/8">
                      <div
                        className={`h-full rounded-full ${color} opacity-70`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 排行榜 */}
        <div className="mt-6 space-y-6">
          <UsageTable
            title="IP 使用排行（前 20）"
            keyLabel="IP 位址"
            rows={ipRanking}
            limit={UNAUTH_DAILY_LIMIT}
          />
          <UsageTable
            title="匿名識別碼使用排行（前 20）"
            keyLabel="Anonymous ID"
            rows={anonRanking}
            limit={UNAUTH_DAILY_LIMIT}
          />
          <UsageTable
            title="LINE 用戶使用排行（前 20）"
            keyLabel="LINE User ID"
            rows={lineRanking}
            limit={LINE_DAILY_LIMIT}
          />
        </div>

        {/* 今日運勢快取統計 */}
        <div className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-lavender/80">daily fortune</p>
              <h2 className="mt-1 text-xl font-semibold text-moon">今日運勢快取統計</h2>
            </div>
            <form action="/api/daily-fortune/prefill" method="POST">
              <button
                type="submit"
                className="rounded-full border border-lavender/30 bg-lavender/12 px-5 py-2.5 text-sm text-moon transition hover:bg-lavender/22"
              >
                ✦ 立即預生成 12 星座
              </button>
            </form>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="AI 實際生成次數"
              value={fortuneAiGenerations}
              sub="今日呼叫 AI API"
            />
            <StatCard
              label="Cache Hit 次數"
              value={fortuneCacheHits}
              sub="直接讀取快取，未呼叫 AI"
            />
            <StatCard
              label="節省 AI 呼叫"
              value={fortuneSaved}
              sub="Cache 命中＝節省 1 次 API"
            />
            <StatCard
              label="星座快取覆蓋"
              value={`${fortuneCoverage} / ${ZODIAC_SIGNS.length}`}
              sub="今日已生成星座數"
            />
          </div>

          {/* 已生成星座列表 */}
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
            <div className="border-b border-white/8 px-5 py-4">
              <p className="text-sm font-semibold text-moon">今日星座快取狀態</p>
              <p className="mt-0.5 text-xs text-moon/44">綠色＝已有快取（含 AI 或 seeded），灰色＝尚未生成</p>
            </div>
            <div className="flex flex-wrap gap-2 p-5">
              {ZODIAC_SIGNS.map((sign) => {
                const hasCache = fortuneGeneratedZodiacs.includes(sign);
                return (
                  <span
                    key={sign}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      hasCache
                        ? "bg-aurora/18 text-aurora"
                        : "bg-white/6 text-moon/36"
                    }`}
                  >
                    {sign}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-moon/30">
          資料來源：Firestore › rate_limits › {today} · fortune_stats › {today}
        </p>
      </section>
    </AppShell>
  );
}
