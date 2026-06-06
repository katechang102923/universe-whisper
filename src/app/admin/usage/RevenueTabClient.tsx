"use client";

import { useCallback, useEffect, useState } from "react";

// ── 型別 ──────────────────────────────────────────────────────────────────────

interface RevenueSummary {
  totalPaid:      number;
  totalPending:   number;
  totalFailed:    number;
  totalRefunded:  number;
  totalTest:      number;
  grossRevenue:   number;
  realRevenue:    number;
  refundedAmount: number;
  testRevenue:    number;
  netRevenue:     number;
  avgOrderValue:  number;
}

interface PlanRow {
  planName: string;
  count:    number;
  revenue:  number;
  avgPrice: number;
  ratio:    number;
}

interface DailyRow {
  date:       string;
  paid:       number;
  revenue:    number;
  test:       number;
  refund:     number;
  pending:    number;
  failed:     number;
  lastPaidAt: string | null;
}

interface RevenueData {
  year:     number;
  month:    number;
  summary:  RevenueSummary;
  planRows: PlanRow[];
  dailyRows: DailyRow[];
}

// ── 格式化工具 ────────────────────────────────────────────────────────────────

function fmtNT(v: number): string {
  if (v === 0) return "NT$0";
  return `NT$${v.toLocaleString("zh-TW")}`;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y}/${m}/${d}`;
}

function fmtDateTime(isoOrNull: string | null | undefined): string {
  if (!isoOrNull) return "—";
  try {
    const d = new Date(isoOrNull);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).replace(/\//g, "/");
  } catch {
    return "—";
  }
}

// ── 子元件 ────────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, highlight,
}: {
  label:      string;
  value:      string | number;
  sub?:       string;
  highlight?: boolean;
}) {
  return (
    <div className={[
      "rounded-2xl border p-5",
      highlight
        ? "border-[#d8bd70]/30 bg-[#d8bd70]/8"
        : "border-white/10 bg-midnight/50",
    ].join(" ")}>
      <p className={`text-xs uppercase tracking-[0.24em] ${highlight ? "text-[#d8bd70]/70" : "text-moon/48"}`}>
        {label}
      </p>
      <p className={`mt-2 text-3xl font-semibold ${highlight ? "text-[#d8bd70]" : "text-moon"}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-moon/44">{sub}</p>}
    </div>
  );
}

// ── 主元件 ────────────────────────────────────────────────────────────────────

export function RevenueTabClient() {
  const now = new Date();
  const [year,    setYear]    = useState(now.getFullYear());
  const [month,   setMonth]   = useState(now.getMonth() + 1);
  const [data,    setData]    = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/revenue?year=${y}&month=${m}`);
      const json = (await res.json()) as { ok: boolean; error?: string } & Partial<RevenueData>;
      if (!json.ok) { setError(json.error ?? "載入失敗"); return; }
      setData(json as RevenueData);
    } catch {
      setError("網路錯誤，請重試。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(year, month); }, [year, month, load]);

  // 年份選項（近 3 年）
  const yearOptions = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  const s = data?.summary;

  return (
    <div className="space-y-8">
      {/* 月份篩選 */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-moon/60">查詢月份：</span>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-xl border border-white/12 bg-midnight/60 px-3 py-2 text-sm text-moon outline-none focus:border-lavender/40"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y} className="bg-[#0d0d1a]">{y} 年</option>
          ))}
        </select>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="rounded-xl border border-white/12 bg-midnight/60 px-3 py-2 text-sm text-moon outline-none focus:border-lavender/40"
        >
          {monthOptions.map((m) => (
            <option key={m} value={m} className="bg-[#0d0d1a]">{m} 月</option>
          ))}
        </select>
        <button
          onClick={() => void load(year, month)}
          disabled={loading}
          className="rounded-xl border border-white/12 bg-white/6 px-4 py-2 text-sm text-moon/70 transition hover:bg-white/12 disabled:opacity-50"
        >
          {loading ? "載入中…" : "↻ 重新整理"}
        </button>
        <span className="text-xs text-moon/40">
          {year} 年 {month} 月
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-red-400/20 bg-red-400/8 px-4 py-3 text-sm text-red-300">
          ⚠ {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center gap-3 py-8 text-sm text-moon/50">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-lavender/30 border-t-lavender" />
          載入收入資料…
        </div>
      )}

      {s && (
        <>
          {/* 主要統計卡片 */}
          <div>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-moon/50">
              {year} 年 {month} 月 · 收入總覽
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="實際收入" value={fmtNT(s.realRevenue)} sub="排除測試付款" highlight />
              <StatCard label="本月成功付款" value={`${s.totalPaid} 筆`} sub={`含測試 ${s.totalTest} 筆`} />
              <StatCard label="平均客單價" value={fmtNT(s.avgOrderValue)} sub="排除測試付款" />
              <StatCard label="淨收入" value={fmtNT(s.netRevenue)} sub={`退款 ${fmtNT(s.refundedAmount)}`} />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="待付款" value={`${s.totalPending} 筆`} />
              <StatCard label="付款失敗" value={`${s.totalFailed} 筆`} />
              <StatCard label="退款" value={`${s.totalRefunded} 筆`} sub={fmtNT(s.refundedAmount)} />
              <StatCard label="測試付款" value={`${s.totalTest} 筆`} sub={fmtNT(s.testRevenue)} />
            </div>
          </div>

          {/* 方案收入分布 */}
          {data!.planRows.length > 0 && (
            <div>
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-moon/50">方案收入分布</h2>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/8 text-left">
                        {["方案", "筆數", "收入", "佔比", "平均客單"].map((h) => (
                          <th key={h} className="whitespace-nowrap px-5 py-3 text-xs font-medium uppercase tracking-wider text-moon/40">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data!.planRows.map((row, i) => (
                        <tr key={row.planName} className={i < data!.planRows.length - 1 ? "border-b border-white/6" : ""}>
                          <td className="px-5 py-3 font-medium text-moon">{row.planName}</td>
                          <td className="px-5 py-3 text-moon/70">{row.count} 筆</td>
                          <td className="px-5 py-3 font-semibold text-[#d8bd70]">{fmtNT(row.revenue)}</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 rounded-full bg-white/10">
                                <div
                                  className="h-1.5 rounded-full bg-lavender"
                                  style={{ width: `${row.ratio}%` }}
                                />
                              </div>
                              <span className="text-xs text-moon/60">{row.ratio}%</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-moon/70">{fmtNT(row.avgPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 每日收入明細 */}
          <div>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-moon/50">
              每日收入明細
            </h2>
            {data!.dailyRows.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-midnight/50 p-8 text-center text-sm text-moon/40">
                本月尚無訂單資料
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/8 text-left">
                        {["日期", "成功付款", "收入", "最近成功付款時間", "測試付款", "退款", "待付款", "失敗"].map((h) => (
                          <th key={h} className="whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wider text-moon/40">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data!.dailyRows.map((row, i) => (
                        <tr
                          key={row.date}
                          className={i < data!.dailyRows.length - 1 ? "border-b border-white/6" : ""}
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-moon/70">
                            {fmtDate(row.date)}
                          </td>
                          <td className="px-4 py-3 text-moon/80">
                            {row.paid > 0 ? `${row.paid} 筆` : <span className="text-moon/30">—</span>}
                          </td>
                          <td className="px-4 py-3 font-semibold text-[#d8bd70]">
                            {row.revenue > 0 ? fmtNT(row.revenue) : <span className="font-normal text-moon/30">—</span>}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-moon/55">
                            {fmtDateTime(row.lastPaidAt)}
                          </td>
                          <td className="px-4 py-3">
                            {row.test > 0
                              ? <span className="rounded-full bg-lavender/12 px-2 py-0.5 text-xs text-lavender">{row.test} 筆</span>
                              : <span className="text-moon/30">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {row.refund > 0
                              ? <span className="rounded-full bg-red-400/12 px-2 py-0.5 text-xs text-red-300">{row.refund} 筆</span>
                              : <span className="text-moon/30">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {row.pending > 0
                              ? <span className="text-amber-300/80">{row.pending} 筆</span>
                              : <span className="text-moon/30">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {row.failed > 0
                              ? <span className="text-red-300/60">{row.failed} 筆</span>
                              : <span className="text-moon/30">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
