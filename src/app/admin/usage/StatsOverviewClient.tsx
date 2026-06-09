"use client";

import { useCallback, useEffect, useState } from "react";
import { readJsonResponse } from "@/lib/readJsonResponse";

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
type DailyMetrics = {
  date: string;
  period: "full" | "am";
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
  zodiacStats?: ZodiacStats;
};

const EMPTY_ZODIAC_STATS: ZodiacStats = {
  tripleZodiacPageViews: 0,
  tripleZodiacStarted: 0,
  tripleZodiacGenerated: 0,
  tripleZodiacFreeSuccess: 0,
  tripleZodiacPaidSuccess: 0,
  tripleZodiacCodeSuccess: 0,
  tripleZodiacLineSent: 0,
  tripleZodiacEmailSent: 0,
  tripleZodiacStoryDownloaded: 0,
  tripleZodiacRevenue: 0,
  conversionRates: { pageToGenerated: "0%", generatedToPaid: "0%", pageToPaid: "0%" },
};

type AdminStatsResponse = {
  ok: true;
  today: string;
  yesterday: DailyMetrics | null;
  todayAm: DailyMetrics | null;
  todayAmAvailable: boolean;
  todayAmMessage?: string;
  trends: DailyMetrics[];
};
type AdminStatsApiResponse = AdminStatsResponse | { ok: false; error?: string };

interface UsageOverviewProps {
  today: string;
  fetchError: boolean;
}

function formatMoney(value: number) {
  return `NT$${Math.max(0, value || 0).toLocaleString("zh-TW")}`;
}

function SummaryCards({ metrics }: { metrics: DailyMetrics }) {
  const cards = [
    { label: "訪客", value: metrics.visitors },
    { label: "完成抽牌", value: metrics.tarotDraws },
    { label: "免費抽牌成功", value: metrics.freeDraws },
    { label: "付費成功", value: metrics.paidSuccess, highlight: metrics.paidSuccess > 0 },
    { label: "收入", value: formatMoney(metrics.revenue), highlight: metrics.revenue > 0 },
  ];
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

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
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

function Accordion({
  id,
  title,
  children,
  openSections,
  toggle,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  openSections: Set<string>;
  toggle: (id: string) => void;
}) {
  const open = openSections.has(id);
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/62">
      <button
        type="button"
        onClick={() => toggle(id)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5 sm:px-5"
      >
        <span className="text-sm font-semibold tracking-[0.12em] text-moon">{title}</span>
        <span className="whitespace-nowrap text-xs text-lavender">{open ? "收合" : "展開"} {open ? "▲" : "▼"}</span>
      </button>
      {open ? <div className="border-t border-white/8 p-3 sm:p-4">{children}</div> : null}
    </section>
  );
}

function EmptyBox({ text = "尚無資料" }: { text?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-midnight/50 p-5 text-center text-sm text-moon/42">
      {text}
    </div>
  );
}

function SimpleTrend({ rows }: { rows: DailyMetrics[] }) {
  if (!rows.length) return <EmptyBox text="尚無統計資料" />;
  return (
    <div className="grid gap-2">
      {rows.slice(0, 7).map((row) => (
        <div key={row.date} className="grid grid-cols-5 gap-2 rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-3 text-xs sm:text-sm">
          <span className="font-medium text-moon">{row.date}</span>
          <span className="text-moon/70">訪客 {row.visitors}</span>
          <span className="text-moon/70">抽牌 {row.tarotDraws}</span>
          <span className="text-moon/70">付費 {row.paidSuccess}</span>
          <span className="text-right text-moon/70">{formatMoney(row.revenue)}</span>
        </div>
      ))}
    </div>
  );
}

function BreakdownTable({ rows, countLabel }: { rows: BreakdownRow[]; countLabel: string }) {
  const visibleRows = rows.filter((row) => row.count > 0);
  if (!visibleRows.length) return <EmptyBox />;
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-white/8 text-left">
              {["項目", countLabel, "百分比"].map((header) => (
                <th key={header} className="whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wider text-moon/42">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
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
  const visibleRows = rows.filter((row) => row.count > 0 || row.revenue > 0);
  if (!visibleRows.length) return <EmptyBox />;
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-white/8 text-left">
              {["來源", "付費筆數", "佔比", "收入"].map((header) => (
                <th key={header} className="whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wider text-moon/42">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
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

function ConversionTable({ metrics }: { metrics: DailyMetrics }) {
  const rows = [
    ["訪客 → 抽牌轉換率", metrics.conversionRates.visitorToDraw, "完成抽牌 / 訪客"],
    ["抽牌 → 付費轉換率", metrics.conversionRates.drawToPaid, "付費成功 / 完成抽牌"],
    ["訪客 → 付費轉換率", metrics.conversionRates.visitorToPaid, "付費成功 / 訪客"],
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <tbody>
            {rows.map(([label, value, formula]) => (
              <tr key={label} className="border-b border-white/6 last:border-b-0">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-moon">{label}</td>
                <td className="whitespace-nowrap px-4 py-3 text-lavender">{value}</td>
                <td className="whitespace-nowrap px-4 py-3 text-moon/45">{formula}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ZodiacSummaryCards({ stats }: { stats: ZodiacStats }) {
  const cards = [
    { label: "頁面瀏覽", value: stats.tripleZodiacPageViews },
    { label: "成功產出", value: stats.tripleZodiacGenerated },
    { label: "免費成功", value: stats.tripleZodiacFreeSuccess },
    { label: "付費成功", value: stats.tripleZodiacPaidSuccess, highlight: stats.tripleZodiacPaidSuccess > 0 },
    { label: "收入", value: formatMoney(stats.tripleZodiacRevenue), highlight: stats.tripleZodiacRevenue > 0 },
  ];
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

function ZodiacDetailTable({ stats }: { stats: ZodiacStats }) {
  const rows: Array<[string, string | number]> = [
    ["頁面瀏覽", stats.tripleZodiacPageViews],
    ["開始填寫", stats.tripleZodiacStarted],
    ["成功產出", stats.tripleZodiacGenerated],
    ["免費成功", stats.tripleZodiacFreeSuccess],
    ["付費成功", stats.tripleZodiacPaidSuccess],
    ["兌換碼成功", stats.tripleZodiacCodeSuccess],
    ["LINE 傳送", stats.tripleZodiacLineSent],
    ["Email 寄送", stats.tripleZodiacEmailSent],
    ["限動圖下載", stats.tripleZodiacStoryDownloaded],
    ["收入", formatMoney(stats.tripleZodiacRevenue)],
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-b border-white/6 last:border-b-0">
              <td className="whitespace-nowrap px-4 py-2.5 font-medium text-moon/80">{label}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right text-moon/75">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ZodiacConversionTable({ stats }: { stats: ZodiacStats }) {
  const rows = [
    ["三重星座頁面 → 產出轉換率", stats.conversionRates.pageToGenerated, "成功產出 / 頁面瀏覽"],
    ["三重星座產出 → 付費轉換率", stats.conversionRates.generatedToPaid, "付費成功 / 成功產出"],
    ["三重星座頁面 → 付費轉換率", stats.conversionRates.pageToPaid, "付費成功 / 頁面瀏覽"],
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <tbody>
            {rows.map(([label, value, formula]) => (
              <tr key={label} className="border-b border-white/6 last:border-b-0">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-moon">{label}</td>
                <td className="whitespace-nowrap px-4 py-3 text-lavender">{value}</td>
                <td className="whitespace-nowrap px-4 py-3 text-moon/45">{formula}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FullTrendTable({ rows }: { rows: DailyMetrics[] }) {
  if (!rows.length) return <EmptyBox text="尚無統計資料" />;
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-white/8 text-left">
              {["日期", "訪客", "抽牌", "付費", "收入", "訪客→抽牌", "抽牌→付費", "訪客→付費"].map((header) => (
                <th key={header} className="whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wider text-moon/42">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.date} className="border-b border-white/6 last:border-b-0">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-moon">{row.date}</td>
                <td className="whitespace-nowrap px-4 py-3 text-moon/75">{row.visitors}</td>
                <td className="whitespace-nowrap px-4 py-3 text-moon/75">{row.tarotDraws}</td>
                <td className="whitespace-nowrap px-4 py-3 text-moon/75">{row.paidSuccess}</td>
                <td className="whitespace-nowrap px-4 py-3 text-moon/75">{formatMoney(row.revenue)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-moon/75">{row.conversionRates.visitorToDraw}</td>
                <td className="whitespace-nowrap px-4 py-3 text-moon/75">{row.conversionRates.drawToPaid}</td>
                <td className="whitespace-nowrap px-4 py-3 text-moon/75">{row.conversionRates.visitorToPaid}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StatsOverviewClient(props: UsageOverviewProps) {
  const [data, setData] = useState<AdminStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/stats");
      const json = await readJsonResponse<AdminStatsApiResponse>(res, { ok: false });
      if (!json.ok) {
        setError(json.error ?? "讀取統計快照失敗");
        return;
      }
      setData(json as AdminStatsResponse);
    } catch {
      setError("讀取統計快照失敗，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) => {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-white/10 bg-midnight/72 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-lavender/70">Admin Statistics Snapshot</p>
            <h2 className="mt-1 text-xl font-semibold text-moon">後台統計快照</h2>
            <p className="mt-1 text-xs leading-6 text-moon/48">
              只讀取 daily_admin_stats 快照集合；每日 00:05 與 12:05 更新。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="w-fit rounded-full border border-white/12 bg-white/8 px-5 py-2.5 text-sm text-moon transition hover:bg-white/14"
          >
            重新讀取快照
          </button>
        </div>
      </section>

      {props.fetchError ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          Firestore 快照讀取失敗，請確認 Firebase 環境變數設定。
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-midnight/40 p-5 text-sm text-moon/50">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-lavender/30 border-t-lavender" />
          讀取統計快照中...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-400/20 bg-red-400/8 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {!loading && data ? (
        <>
          <Panel title="1. 昨日完整數據摘要" subtitle={data.yesterday ? `${data.yesterday.date} 00:00-23:59` : "尚無統計資料"}>
            {data.yesterday ? <SummaryCards metrics={data.yesterday} /> : <EmptyBox text="尚無統計資料" />}
          </Panel>

          <Panel title="2. 今日前半天數據摘要" subtitle={`${data.today} 00:00-12:00`}>
            {data.todayAmAvailable && data.todayAm ? (
              <SummaryCards metrics={data.todayAm} />
            ) : (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-400/8 px-5 py-4 text-sm text-amber-200">
                {data.todayAmMessage ?? "今日前半天統計將於 12:05 更新"}
              </div>
            )}
          </Panel>

          <Panel title="3. 三重星座數據" subtitle="頁面瀏覽｜成功產出｜免費成功｜付費成功｜收入">
            <div className="space-y-4">
              <div>
                <p className="mb-3 text-sm font-semibold text-moon">昨日三重星座</p>
                {data.yesterday
                  ? <ZodiacSummaryCards stats={data.yesterday.zodiacStats ?? EMPTY_ZODIAC_STATS} />
                  : <EmptyBox text="尚無紀錄" />}
              </div>
              <div>
                <p className="mb-3 text-sm font-semibold text-moon">今日前半天三重星座</p>
                {data.todayAmAvailable && data.todayAm
                  ? <ZodiacSummaryCards stats={data.todayAm.zodiacStats ?? EMPTY_ZODIAC_STATS} />
                  : (
                    <div className="rounded-2xl border border-amber-400/30 bg-amber-400/8 px-5 py-4 text-sm text-amber-200">
                      {data.todayAmMessage ?? "今日前半天統計將於 12:05 更新"}
                    </div>
                  )}
              </div>
            </div>
          </Panel>

          <Accordion id="zodiacDetail" title="三重星座數據分析" openSections={openSections} toggle={toggle}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-3 text-sm font-semibold text-moon">昨日三重星座明細</p>
                {data.yesterday
                  ? <ZodiacDetailTable stats={data.yesterday.zodiacStats ?? EMPTY_ZODIAC_STATS} />
                  : <EmptyBox text="尚無紀錄" />}
                {data.yesterday ? (
                  <div className="mt-3">
                    <ZodiacConversionTable stats={data.yesterday.zodiacStats ?? EMPTY_ZODIAC_STATS} />
                  </div>
                ) : null}
              </div>
              <div>
                <p className="mb-3 text-sm font-semibold text-moon">今日前半天三重星座明細</p>
                {data.todayAmAvailable && data.todayAm ? (
                  <>
                    <ZodiacDetailTable stats={data.todayAm.zodiacStats ?? EMPTY_ZODIAC_STATS} />
                    <div className="mt-3">
                      <ZodiacConversionTable stats={data.todayAm.zodiacStats ?? EMPTY_ZODIAC_STATS} />
                    </div>
                  </>
                ) : (
                  <EmptyBox text="今日前半天統計將於 12:05 更新" />
                )}
              </div>
            </div>
          </Accordion>

          <Panel title="4. 最近 7 天趨勢摘要" subtitle="日期｜訪客｜抽牌｜付費｜收入">
            <SimpleTrend rows={data.trends} />
          </Panel>

          <Accordion id="conversion" title="轉換率詳細說明" openSections={openSections} toggle={toggle}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-3 text-sm font-semibold text-moon">昨日完整數據</p>
                {data.yesterday ? <ConversionTable metrics={data.yesterday} /> : <EmptyBox />}
              </div>
              <div>
                <p className="mb-3 text-sm font-semibold text-moon">今日前半天數據</p>
                {data.todayAmAvailable && data.todayAm ? <ConversionTable metrics={data.todayAm} /> : <EmptyBox text="今日前半天統計將於 12:05 更新" />}
              </div>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-3 text-sm font-semibold text-moon">昨日三重星座</p>
                {data.yesterday ? <ZodiacConversionTable stats={data.yesterday.zodiacStats ?? EMPTY_ZODIAC_STATS} /> : <EmptyBox />}
              </div>
              <div>
                <p className="mb-3 text-sm font-semibold text-moon">今日前半天三重星座</p>
                {data.todayAmAvailable && data.todayAm ? <ZodiacConversionTable stats={data.todayAm.zodiacStats ?? EMPTY_ZODIAC_STATS} /> : <EmptyBox text="今日前半天統計將於 12:05 更新" />}
              </div>
            </div>
          </Accordion>

          <Accordion id="sources" title="訪客來源分析" openSections={openSections} toggle={toggle}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-3 text-sm font-semibold text-moon">昨日訪客來源</p>
                {data.yesterday ? <BreakdownTable rows={data.yesterday.visitorSources} countLabel="訪客" /> : <EmptyBox />}
              </div>
              <div>
                <p className="mb-3 text-sm font-semibold text-moon">今日前半天訪客來源</p>
                {data.todayAmAvailable && data.todayAm ? <BreakdownTable rows={data.todayAm.visitorSources} countLabel="訪客" /> : <EmptyBox text="今日前半天統計將於 12:05 更新" />}
              </div>
            </div>
          </Accordion>

          <Accordion id="features" title="熱門功能排行" openSections={openSections} toggle={toggle}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-3 text-sm font-semibold text-moon">昨日熱門功能排行</p>
                {data.yesterday ? <BreakdownTable rows={data.yesterday.featureRanking} countLabel="瀏覽次數" /> : <EmptyBox />}
              </div>
              <div>
                <p className="mb-3 text-sm font-semibold text-moon">今日前半天熱門功能排行</p>
                {data.todayAmAvailable && data.todayAm ? <BreakdownTable rows={data.todayAm.featureRanking} countLabel="瀏覽次數" /> : <EmptyBox text="今日前半天統計將於 12:05 更新" />}
              </div>
            </div>
          </Accordion>

          <Accordion id="payments" title="付費來源排行" openSections={openSections} toggle={toggle}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-3 text-sm font-semibold text-moon">昨日付費來源排行</p>
                {data.yesterday ? <PaymentTable rows={data.yesterday.paymentSources} /> : <EmptyBox />}
              </div>
              <div>
                <p className="mb-3 text-sm font-semibold text-moon">今日前半天付費來源排行</p>
                {data.todayAmAvailable && data.todayAm ? <PaymentTable rows={data.todayAm.paymentSources} /> : <EmptyBox text="今日前半天統計將於 12:05 更新" />}
              </div>
            </div>
          </Accordion>

          <Accordion id="fullTrend" title="最近 7 天完整表格" openSections={openSections} toggle={toggle}>
            <FullTrendTable rows={data.trends} />
          </Accordion>
        </>
      ) : null}
    </div>
  );
}
