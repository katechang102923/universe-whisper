"use client";

import { useCallback, useState } from "react";
import { readJsonResponse } from "@/lib/readJsonResponse";

// ── 低 Firebase 讀取成本版本 ────────────────────────────────────────────────────
// 初始不自動查詢；由管理者手動選日期或區間後才打 /api/admin/stats（只讀 daily_admin_stats）。

type BreakdownRow = { label: string; count: number; ratio: string };
type PaymentBreakdownRow = { label: string; count: number; ratio: string; revenue: number };
type ConversionRates = { visitorToDraw: string; drawToPaid: string; visitorToPaid: string };

type DayMetrics = {
  date: string;
  visitors: number;
  pageViews: number;
  tarotDrawSuccess: number;
  tarotSingleSuccess: number;
  tarotThreeSuccess: number;
  freeSuccess: number;
  paidSuccess: number;
  revenue: number;
  astroProfilePageViews: number;
  astroProfileSuccess: number;
  astroProfileFreeSuccess: number;
  astroProfilePaidSuccess: number;
  astroProfileRevenue: number;
  conversionRates: ConversionRates;
  sourceStats: BreakdownRow[];
  popularFeatureStats: BreakdownRow[];
  paymentSourceStats: PaymentBreakdownRow[];
};

type DayResult = { date: string; isToday: boolean; missingSnapshot: boolean; metrics: DayMetrics | null };

type Totals = {
  visitors: number;
  tarotDrawSuccess: number;
  tarotSingleSuccess: number;
  tarotThreeSuccess: number;
  freeSuccess: number;
  paidSuccess: number;
  revenue: number;
  astroProfilePageViews: number;
  astroProfileSuccess: number;
  astroProfileFreeSuccess: number;
  astroProfilePaidSuccess: number;
  astroProfileRevenue: number;
  conversionRates: ConversionRates;
};

type StatsResponse = {
  ok: true;
  today: string;
  needsSelection?: boolean;
  start?: string;
  end?: string;
  days?: DayResult[];
  totals: Totals;
  snapshotsRead?: number;
};
type StatsApiResponse = StatsResponse | { ok: false; error?: string };

interface UsageOverviewProps {
  today: string;
  fetchError: boolean;
}

const TODAY_NOTICE = "今日完整統計將於明日 00:05 產出，目前不提供即時統計。";
const NO_SNAPSHOT_NOTICE = "該日期尚無統計快照，可稍後再查詢或重新產生統計。";

function formatMoney(value: number) {
  return `NT$${Math.max(0, value || 0).toLocaleString("zh-TW")}`;
}

/** 以 Asia/Taipei 計算日期位移（中午對齊，避免 UTC 切日錯位）*/
function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days, 4));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function SummaryCards({ cards }: { cards: { label: string; value: string | number; highlight?: boolean }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className={[
            "rounded-2xl border p-4",
            card.highlight ? "border-[#d8bd70]/35 bg-[#d8bd70]/10" : "border-white/10 bg-midnight/62",
          ].join(" ")}
        >
          <p className={`text-xs uppercase tracking-[0.22em] ${card.highlight ? "text-[#d8bd70]/70" : "text-moon/48"}`}>{card.label}</p>
          <p className={`mt-1.5 text-3xl font-semibold ${card.highlight ? "text-[#d8bd70]" : "text-moon"}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-midnight/70 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.2)] sm:p-5">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.24em] text-[#d8bd70]/70">{title}</p>
        <p className="mt-1 text-sm text-moon/48">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function EmptyBox({ text = "尚無資料" }: { text?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-midnight/50 p-5 text-center text-sm text-moon/42">{text}</div>;
}

function BreakdownTable({ rows, countLabel }: { rows: BreakdownRow[]; countLabel: string }) {
  const visible = rows.filter((row) => row.count > 0);
  if (!visible.length) return <EmptyBox />;
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-white/8 text-left">
              {["項目", countLabel, "百分比"].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wider text-moon/42">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.label} className="border-b border-white/6 last:border-b-0">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-moon">{row.label}</td>
                <td className="whitespace-nowrap px-4 py-3 text-moon/75">{row.count}</td>
                <td className="whitespace-nowrap px-4 py-3 text-moon/75">{row.ratio}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentTable({ rows }: { rows: PaymentBreakdownRow[] }) {
  const visible = rows.filter((row) => row.count > 0 || row.revenue > 0);
  if (!visible.length) return <EmptyBox />;
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-white/8 text-left">
              {["來源", "付費筆數", "佔比", "收入"].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wider text-moon/42">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.label} className="border-b border-white/6 last:border-b-0">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-moon">{row.label}</td>
                <td className="whitespace-nowrap px-4 py-3 text-moon/75">{row.count}</td>
                <td className="whitespace-nowrap px-4 py-3 text-moon/75">{row.ratio}</td>
                <td className="whitespace-nowrap px-4 py-3 text-moon/75">{formatMoney(row.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DayTable({ days }: { days: DayResult[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-white/8 text-left">
              {["日期", "訪客", "完成抽牌", "單張", "三張", "免費成功", "付費成功", "收入", "狀態"].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wider text-moon/42">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const m = day.metrics;
              return (
                <tr key={day.date} className="border-b border-white/6 last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-moon">{day.date}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-moon/75">{m ? m.visitors : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-moon/75">{m ? m.tarotDrawSuccess : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-moon/75">{m ? m.tarotSingleSuccess : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-moon/75">{m ? m.tarotThreeSuccess : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-moon/75">{m ? m.freeSuccess : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-moon/75">{m ? m.paidSuccess : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-moon/75">{m ? formatMoney(m.revenue) : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {m ? (
                      <span className="text-aurora/80">有快照</span>
                    ) : day.isToday ? (
                      <span className="text-amber-300">今日未產出</span>
                    ) : (
                      <span className="text-moon/40">尚無快照</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StatsOverviewClient(props: UsageOverviewProps) {
  const today = props.today;
  const yesterday = addDays(today, -1);

  const [mode, setMode] = useState<"single" | "range">("single");
  const [singleDate, setSingleDate] = useState(yesterday);
  const [startDate, setStartDate] = useState(addDays(today, -7));
  const [endDate, setEndDate] = useState(yesterday);

  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasQueried, setHasQueried] = useState(false);
  const [todayBlocked, setTodayBlocked] = useState(false);

  const runQuery = useCallback(async (start: string, end: string) => {
    setError("");
    setTodayBlocked(false);
    // 今日守則：單日選到今天 → 不打 API、不讀任何資料，只顯示提示
    if (start === end && start === today) {
      setData(null);
      setHasQueried(true);
      setTodayBlocked(true);
      return;
    }
    setLoading(true);
    setHasQueried(true);
    try {
      const res = await fetch(`/api/admin/stats?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
      const json = await readJsonResponse<StatsApiResponse>(res, { ok: false });
      if (!json.ok) {
        setError(json.error ?? "讀取統計快照失敗");
        setData(null);
        return;
      }
      setData(json as StatsResponse);
    } catch {
      setError("讀取統計快照失敗，請稍後再試。");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [today]);

  const onQuery = () => {
    if (mode === "single") void runQuery(singleDate, singleDate);
    else void runQuery(startDate, endDate);
  };

  const quick = (start: string, end: string) => {
    setMode("range");
    setStartDate(start);
    setEndDate(end);
    void runQuery(start, end);
  };

  const monthStart = `${today.slice(0, 7)}-01`;

  const days = data?.days ?? [];
  const withMetrics = days.filter((d) => d.metrics);
  const singleDayMetrics = withMetrics.length === 1 ? withMetrics[0].metrics : null;

  return (
    <div className="space-y-4">
      {/* 說明 + 查詢區 */}
      <section className="rounded-3xl border border-white/10 bg-midnight/72 p-4 sm:p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-lavender/70">Admin Statistics Snapshot</p>
          <h2 className="mt-1 text-xl font-semibold text-moon">後台統計快照</h2>
          <p className="mt-1 text-xs leading-6 text-moon/48">
            每日 00:05 產出前一日完整統計；請手動選擇日期或日期區間查詢。
          </p>
        </div>

        {/* 模式切換 */}
        <div className="mt-4 inline-flex rounded-full border border-white/12 bg-midnight/50 p-1 text-sm">
          {(["single", "range"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-4 py-1.5 transition ${mode === m ? "bg-lavender/20 text-lavender" : "text-moon/55 hover:text-moon"}`}
            >
              {m === "single" ? "單日查詢" : "日期區間"}
            </button>
          ))}
        </div>

        {/* 日期輸入 */}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {mode === "single" ? (
            <label className="text-sm text-moon/60">
              <span className="mb-1 block text-xs text-moon/45">日期</span>
              <input
                type="date"
                value={singleDate}
                max={today}
                onChange={(e) => setSingleDate(e.target.value)}
                className="rounded-xl border border-white/12 bg-midnight/60 px-3 py-2 text-moon"
              />
            </label>
          ) : (
            <>
              <label className="text-sm text-moon/60">
                <span className="mb-1 block text-xs text-moon/45">開始日期</span>
                <input
                  type="date"
                  value={startDate}
                  max={today}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-xl border border-white/12 bg-midnight/60 px-3 py-2 text-moon"
                />
              </label>
              <label className="text-sm text-moon/60">
                <span className="mb-1 block text-xs text-moon/45">結束日期</span>
                <input
                  type="date"
                  value={endDate}
                  max={today}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-xl border border-white/12 bg-midnight/60 px-3 py-2 text-moon"
                />
              </label>
            </>
          )}
          <button
            type="button"
            onClick={onQuery}
            disabled={loading}
            className="rounded-full border border-[#d8bd70]/35 bg-[#d8bd70] px-6 py-2.5 text-sm font-semibold text-midnight transition hover:bg-moon disabled:cursor-wait disabled:opacity-70"
          >
            {loading ? "查詢中..." : "查詢"}
          </button>
        </div>

        {/* 快捷 */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => { setMode("single"); setSingleDate(yesterday); void runQuery(yesterday, yesterday); }}
            className="rounded-full border border-white/12 bg-white/6 px-4 py-1.5 text-xs text-moon/75 transition hover:bg-white/12">昨日</button>
          <button type="button" onClick={() => quick(addDays(today, -7), yesterday)}
            className="rounded-full border border-white/12 bg-white/6 px-4 py-1.5 text-xs text-moon/75 transition hover:bg-white/12">最近 7 天</button>
          <button type="button" onClick={() => quick(monthStart, monthStart > yesterday ? monthStart : yesterday)}
            className="rounded-full border border-white/12 bg-white/6 px-4 py-1.5 text-xs text-moon/75 transition hover:bg-white/12">本月</button>
        </div>
      </section>

      {props.fetchError ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          Firestore 快照讀取失敗，請確認 Firebase 環境變數設定。
        </div>
      ) : null}

      {!hasQueried ? (
        <div className="rounded-2xl border border-white/10 bg-midnight/50 p-6 text-center text-sm text-moon/55">
          請選擇日期或日期區間查詢統計資料
        </div>
      ) : null}

      {todayBlocked ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/8 px-5 py-4 text-sm text-amber-200">
          {TODAY_NOTICE}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-midnight/40 p-5 text-sm text-moon/50">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-lavender/30 border-t-lavender" />
          讀取統計快照中...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-400/20 bg-red-400/8 px-4 py-3 text-sm text-red-300">{error}</div>
      ) : null}

      {!loading && !todayBlocked && data && data.days ? (
        <>
          <Panel
            title="1. 查詢區間摘要"
            subtitle={`${data.start} ～ ${data.end}（共 ${data.days.length} 天，讀取 ${data.snapshotsRead ?? data.days.length} 筆快照）`}
          >
            <SummaryCards
              cards={[
                { label: "訪客", value: data.totals.visitors },
                { label: "完成抽牌", value: data.totals.tarotDrawSuccess },
                { label: "免費成功", value: data.totals.freeSuccess },
                { label: "付費成功", value: data.totals.paidSuccess, highlight: data.totals.paidSuccess > 0 },
                { label: "收入", value: formatMoney(data.totals.revenue), highlight: data.totals.revenue > 0 },
              ]}
            />
            <div className="mt-3 grid gap-2 text-xs text-moon/55 sm:grid-cols-3">
              <span>訪客→抽牌：{data.totals.conversionRates.visitorToDraw}</span>
              <span>抽牌→付費：{data.totals.conversionRates.drawToPaid}</span>
              <span>訪客→付費：{data.totals.conversionRates.visitorToPaid}</span>
            </div>
          </Panel>

          <Panel title="2. 三重星座（查詢區間）" subtitle="頁面瀏覽｜成功產出｜免費成功｜付費成功｜收入">
            <SummaryCards
              cards={[
                { label: "頁面瀏覽", value: data.totals.astroProfilePageViews },
                { label: "成功產出", value: data.totals.astroProfileSuccess },
                { label: "免費成功", value: data.totals.astroProfileFreeSuccess },
                { label: "付費成功", value: data.totals.astroProfilePaidSuccess, highlight: data.totals.astroProfilePaidSuccess > 0 },
                { label: "收入", value: formatMoney(data.totals.astroProfileRevenue), highlight: data.totals.astroProfileRevenue > 0 },
              ]}
            />
          </Panel>

          <Panel title="3. 每日明細" subtitle="每天一筆 daily_admin_stats；無快照或今日會標示狀態">
            {days.length ? <DayTable days={days} /> : <EmptyBox text="此區間沒有任何日期" />}
            {days.some((d) => d.isToday && d.missingSnapshot) ? (
              <p className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-400/8 px-4 py-3 text-xs text-amber-200">{TODAY_NOTICE}</p>
            ) : null}
            {days.some((d) => !d.isToday && d.missingSnapshot) ? (
              <p className="mt-2 rounded-2xl border border-white/10 bg-midnight/50 px-4 py-3 text-xs text-moon/50">{NO_SNAPSHOT_NOTICE}</p>
            ) : null}
          </Panel>

          {singleDayMetrics ? (
            <>
              <Panel title="4. 訪客來源" subtitle={singleDayMetrics.date}>
                <BreakdownTable rows={singleDayMetrics.sourceStats} countLabel="訪客" />
              </Panel>
              <Panel title="5. 熱門功能排行" subtitle={singleDayMetrics.date}>
                <BreakdownTable rows={singleDayMetrics.popularFeatureStats} countLabel="瀏覽次數" />
              </Panel>
              <Panel title="6. 付費來源排行" subtitle={singleDayMetrics.date}>
                <PaymentTable rows={singleDayMetrics.paymentSourceStats} />
              </Panel>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
