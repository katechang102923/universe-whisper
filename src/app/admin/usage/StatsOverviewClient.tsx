"use client";

import { useCallback, useEffect, useState } from "react";

type Period = "today" | "month" | "all";

interface PeriodUnlock {
  free: number;
  paid: number;
  total: number;
  ratio: string;
}
interface QTypeRow {
  type: string;
  count: number;
  ratio: string;
  paidCount: number;
  paidRatio: string;
}
interface SpreadRow {
  type: string;
  freeCount: number;
  paidCount: number;
  total: number;
  ratio: string;
  paidRatio: string;
  downloadCount: number;
}
interface LineSavePeriod {
  count: number;
  users: number;
}
interface TrafficPeriod {
  visitors: number;
  sessions: number;
  pageViews: number;
  avgActiveSeconds: number;
  bounceRate: string;
}
interface SourceRow {
  source: string;
  sessions: number;
  visitors: number;
  avgActiveSeconds: number;
  paidSuccess: number;
  paidConversionRate: string;
}
interface PageStayRow {
  path: string;
  label: string;
  views: number;
  avgActiveSeconds: number;
  exitRate: string;
}
interface FunnelRow {
  label: string;
  users: number;
  previousRate: string;
  totalRate: string;
}

interface StatsData {
  ok: true;
  today: string;
  monthKey: string;
  unlock: { today: PeriodUnlock; month: PeriodUnlock; all: PeriodUnlock };
  questionTypes: { today: QTypeRow[]; month: QTypeRow[]; all: QTypeRow[] };
  spread: { today: SpreadRow[]; month: SpreadRow[]; all: SpreadRow[] };
  lineSave: { today: LineSavePeriod; month: LineSavePeriod; all: LineSavePeriod };
  traffic: { today: TrafficPeriod; month: TrafficPeriod; all: TrafficPeriod };
  trafficSources: SourceRow[];
  pageStay: PageStayRow[];
  funnel: FunnelRow[];
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.round(seconds || 0));
  if (safe < 60) return `${safe} 秒`;
  if (safe < 3600) return `${Math.floor(safe / 60)} 分 ${safe % 60} 秒`;
  return `${Math.floor(safe / 3600)} 小時 ${Math.floor((safe % 3600) / 60)} 分`;
}

function periodLabel(period: Period, data: StatsData) {
  if (period === "today") return `今日（${data.today}）`;
  if (period === "month") return `本月（${data.monthKey}）`;
  return "全期";
}

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-2xl border p-5",
        highlight ? "border-[#d8bd70]/30 bg-[#d8bd70]/8" : "border-white/10 bg-midnight/50",
      ].join(" ")}
    >
      <p className={`text-xs uppercase tracking-[0.24em] ${highlight ? "text-[#d8bd70]/70" : "text-moon/48"}`}>
        {label}
      </p>
      <p className={`mt-2 text-3xl font-semibold ${highlight ? "text-[#d8bd70]" : "text-moon"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-moon/44">{sub}</p>}
    </div>
  );
}

function PeriodTabs({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const tabs: { key: Period; label: string }[] = [
    { key: "today", label: "今日" },
    { key: "month", label: "本月" },
    { key: "all", label: "全期" },
  ];
  return (
    <div className="flex gap-1 rounded-xl border border-white/8 bg-midnight/40 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={[
            "rounded-lg px-3 py-1.5 text-xs font-medium transition",
            period === tab.key ? "bg-lavender/22 text-lavender" : "text-moon/55 hover:bg-white/8 hover:text-moon",
          ].join(" ")}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function SectionHeader({
  title,
  period,
  onPeriodChange,
}: {
  title: string;
  period?: Period;
  onPeriodChange?: (p: Period) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-moon/50">{title}</h2>
      {period && onPeriodChange ? <PeriodTabs period={period} onChange={onPeriodChange} /> : null}
    </div>
  );
}

function TrafficSection({ data }: { data: StatsData }) {
  const [period, setPeriod] = useState<Period>("today");
  const row = data.traffic[period] ?? { visitors: 0, sessions: 0, pageViews: 0, avgActiveSeconds: 0, bounceRate: "0%" };
  const label = periodLabel(period, data);
  return (
    <div>
      <SectionHeader title="網站流量統計" period={period} onPeriodChange={setPeriod} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label={`${label} 拜訪人數`} value={row.visitors} />
        <StatCard label={`${label} 拜訪次數`} value={row.sessions} />
        <StatCard label={`${label} 頁面瀏覽數`} value={row.pageViews} />
        <StatCard label={`${label} 平均停留時間`} value={formatDuration(row.avgActiveSeconds)} />
        <StatCard label={`${label} 跳出率`} value={row.bounceRate} />
      </div>
    </div>
  );
}

function TrafficSourceSection({ rows }: { rows: SourceRow[] }) {
  return (
    <div>
      <SectionHeader title="流量來源排行" />
      <DataTable
        emptyText="尚無流量來源資料"
        headers={["排名", "來源", "拜訪次數", "拜訪人數", "平均停留時間", "付費成功次數", "付費轉換率"]}
        rows={rows.map((row, index) => [
          index + 1,
          row.source,
          row.sessions,
          row.visitors,
          formatDuration(row.avgActiveSeconds),
          row.paidSuccess,
          row.paidConversionRate,
        ])}
      />
    </div>
  );
}

function PageStaySection({ rows }: { rows: PageStayRow[] }) {
  return (
    <div>
      <SectionHeader title="頁面停留排行" />
      <DataTable
        emptyText="尚無頁面停留資料"
        headers={["排名", "頁面路徑", "瀏覽數", "平均停留時間", "離開率"]}
        rows={rows.map((row, index) => [
          index + 1,
          row.label,
          row.views,
          formatDuration(row.avgActiveSeconds),
          row.exitRate,
        ])}
      />
    </div>
  );
}

function FunnelSection({ rows }: { rows: FunnelRow[] }) {
  return (
    <div>
      <SectionHeader title="流量轉換漏斗" />
      <DataTable
        emptyText="尚無漏斗資料"
        headers={["階段", "人數", "相對上一階段", "相對進站總人數"]}
        rows={rows.map((row) => [row.label, row.users, row.previousRate, row.totalRate])}
      />
    </div>
  );
}

function UnlockSection({ data }: { data: StatsData }) {
  const [period, setPeriod] = useState<Period>("today");
  const row = data.unlock[period];
  const label = periodLabel(period, data);
  return (
    <div>
      <SectionHeader title="解鎖轉換統計" period={period} onPeriodChange={setPeriod} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={`${label} 免費抽牌`} value={row.free} sub="rate_limits 記錄" />
        <StatCard label={`${label} 付費解鎖`} value={row.paid} sub="通行碼使用記錄" highlight={row.paid > 0} />
        <StatCard label={`${label} 總數`} value={row.total} />
        <StatCard label={`${label} 付費比例`} value={row.ratio} highlight={row.paid > 0} />
      </div>
    </div>
  );
}

function QuestionTypeSection({ data }: { data: StatsData }) {
  const [period, setPeriod] = useState<Period>("all");
  const rows = data.questionTypes[period];
  return (
    <div>
      <SectionHeader title="問題類型排行" period={period} onPeriodChange={setPeriod} />
      <DataTable
        emptyText="尚無問題類型資料"
        headers={["排名", "問題類型", "次數", "占比", "付費次數", "付費比例"]}
        rows={rows.map((row, index) => [index + 1, row.type, row.count, row.ratio, row.paidCount, row.paidRatio])}
      />
    </div>
  );
}

function SpreadSection({ data }: { data: StatsData }) {
  const [period, setPeriod] = useState<Period>("today");
  const rows = data.spread[period];
  return (
    <div>
      <SectionHeader title="牌陣使用排行" period={period} onPeriodChange={setPeriod} />
      <DataTable
        emptyText="尚無牌陣資料"
        headers={["排名", "牌陣", "免費次數", "付費次數", "總數", "占比", "付費比例", "分享圖下載"]}
        rows={rows.map((row, index) => [
          index + 1,
          row.type,
          row.freeCount,
          row.paidCount,
          row.total,
          row.ratio,
          row.paidRatio,
          row.downloadCount,
        ])}
      />
    </div>
  );
}

function LineSaveSection({ data }: { data: StatsData }) {
  const [period, setPeriod] = useState<Period>("today");
  const row = data.lineSave[period];
  const label = periodLabel(period, data);
  return (
    <div>
      <SectionHeader title="LINE 保存統計" period={period} onPeriodChange={setPeriod} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={`${label} LINE 保存次數`} value={row.count} />
        <StatCard label={`${label} LINE 保存人數`} value={row.users} />
        <StatCard label="全期 LINE 保存次數" value={data.lineSave.all.count} />
        <StatCard label="全期 LINE 保存人數" value={data.lineSave.all.users} />
      </div>
    </div>
  );
}

function DataTable({
  headers,
  rows,
  emptyText,
}: {
  headers: string[];
  rows: Array<Array<string | number>>;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-midnight/50 p-6 text-center text-sm text-moon/40">
        {emptyText}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/8 text-left">
              {headers.map((header) => (
                <th key={header} className="whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wider text-moon/40">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className={index < rows.length - 1 ? "border-b border-white/6" : ""}>
                {row.map((cell, cellIndex) => (
                  <td key={`${index}-${cellIndex}`} className="whitespace-nowrap px-4 py-3 text-moon/75">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StatsOverviewClient({ year, month }: { year: number; month: number }) {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/stats?year=${y}&month=${m}`);
      const json = (await res.json()) as { ok: boolean; error?: string } & Partial<StatsData>;
      if (!json.ok) {
        setError(json.error ?? "讀取失敗");
        return;
      }
      setData(json as StatsData);
    } catch {
      setError("讀取統計資料失敗，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(year, month);
  }, [year, month, load]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-4 text-sm text-moon/50">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-lavender/30 border-t-lavender" />
        讀取進階統計中...
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-400/20 bg-red-400/8 px-4 py-3 text-sm text-red-300">
        {error}
        <button type="button" onClick={() => void load(year, month)} className="ml-3 text-xs underline opacity-70">
          重試
        </button>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-8">
      <TrafficSection data={data} />
      <TrafficSourceSection rows={data.trafficSources ?? []} />
      <PageStaySection rows={data.pageStay ?? []} />
      <FunnelSection rows={data.funnel ?? []} />
      <UnlockSection data={data} />
      <QuestionTypeSection data={data} />
      <SpreadSection data={data} />
      <LineSaveSection data={data} />
    </div>
  );
}
