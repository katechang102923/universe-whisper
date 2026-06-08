"use client";

import { useCallback, useEffect, useState } from "react";
import { readJsonResponse } from "@/lib/readJsonResponse";

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
};

type AdminStatsResponse = {
  ok: true;
  today: string;
  generatedAt?: string | null;
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

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-2xl border p-4",
        highlight ? "border-[#d8bd70]/35 bg-[#d8bd70]/10" : "border-white/10 bg-midnight/62",
      ].join(" ")}
    >
      <p className={`text-xs uppercase tracking-[0.22em] ${highlight ? "text-[#d8bd70]/70" : "text-moon/48"}`}>
        {label}
      </p>
      <p className={`mt-1.5 text-3xl font-semibold ${highlight ? "text-[#d8bd70]" : "text-moon"}`}>{value}</p>
    </div>
  );
}

function MetricsGrid({ metrics }: { metrics: DailyMetrics }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <StatCard label="訪客" value={metrics.visitors} />
      <StatCard label="PV" value={metrics.pageViews} />
      <StatCard label="完成抽牌" value={metrics.tarotDraws} />
      <StatCard label="免費抽牌成功" value={metrics.freeDraws} />
      <StatCard label="付費成功" value={metrics.paidSuccess} highlight={metrics.paidSuccess > 0} />
      <StatCard label="收入" value={formatMoney(metrics.revenue)} highlight={metrics.revenue > 0} />
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

function TrendTable({ rows }: { rows: DailyMetrics[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-midnight/50 p-6 text-center text-sm text-moon/42">
        尚未產生最近 7 天統計快照。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-white/8 text-left">
              {["日期", "訪客", "PV", "抽牌", "付費", "收入"].map((header) => (
                <th key={header} className="whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wider text-moon/42">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.date} className={index < rows.length - 1 ? "border-b border-white/6" : ""}>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-moon">{row.date}</td>
                <td className="whitespace-nowrap px-4 py-3 text-moon/75">{row.visitors}</td>
                <td className="whitespace-nowrap px-4 py-3 text-moon/75">{row.pageViews}</td>
                <td className="whitespace-nowrap px-4 py-3 text-moon/75">{row.tarotDraws}</td>
                <td className="whitespace-nowrap px-4 py-3 text-moon/75">{row.paidSuccess}</td>
                <td className="whitespace-nowrap px-4 py-3 text-moon/75">{formatMoney(row.revenue)}</td>
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

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-white/10 bg-midnight/72 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-lavender/70">Admin Statistics Snapshot</p>
            <h2 className="mt-1 text-xl font-semibold text-moon">後台統計快照</h2>
            <p className="mt-1 text-xs leading-6 text-moon/48">
              後台只讀取 daily_admin_stats 快照集合；每日 00:05 產生昨日完整數據，每日 12:05 產生今日前半天數據。
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
          <Panel title="A. 昨日完整數據" subtitle={data.yesterday ? `${data.yesterday.date} 00:00-23:59` : "尚未產生昨日完整快照"}>
            {data.yesterday ? (
              <MetricsGrid metrics={data.yesterday} />
            ) : (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-400/8 px-5 py-4 text-sm text-amber-200">
                昨日完整統計將於每日 00:05 更新。
              </div>
            )}
          </Panel>

          <Panel title="B. 今日前半天數據" subtitle={`${data.today} 00:00-12:00`}>
            {data.todayAmAvailable && data.todayAm ? (
              <MetricsGrid metrics={data.todayAm} />
            ) : (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-400/8 px-5 py-4 text-sm text-amber-200">
                {data.todayAmMessage ?? "今日前半天統計將於 12:05 更新"}
              </div>
            )}
          </Panel>

          <Panel title="C. 最近 7 天趨勢" subtitle="日期｜訪客｜PV｜抽牌｜付費｜收入">
            <TrendTable rows={data.trends} />
          </Panel>
        </>
      ) : null}
    </div>
  );
}
