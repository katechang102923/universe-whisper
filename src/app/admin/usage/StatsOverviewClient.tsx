"use client";

import { useCallback, useState } from "react";
import { readJsonResponse } from "@/lib/readJsonResponse";

// ── 原始資料計算版本 ────────────────────────────────────────────────────────────
// 進頁不自動查詢、不讀快照、不自動重新整理。管理員手動選日期區間並按「查詢」後，
// 才呼叫 /api/admin/stats（從原始 collection 即時彙整，不使用 daily_admin_stats 快照）。
// 單次最多 31 天；不使用 onSnapshot / 即時監聽 / 自動輪詢。

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
  paidAttempts: number;
  paidSuccess: number;
  revenue: number;
  astroProfilePageViews: number;
  astroProfileAttempts: number;
  astroProfileSuccess: number;
  astroProfileFreeSuccess: number;
  astroProfilePaidSuccess: number;
  astroProfileRevenue: number;
  conversionRates: ConversionRates;
  sourceStats: BreakdownRow[];
  popularFeatureStats: BreakdownRow[];
  paymentSourceStats: PaymentBreakdownRow[];
};

type DayResult = { date: string; isToday: boolean; hasRawData: boolean; metrics: DayMetrics | null };

type Totals = {
  visitors: number;
  pageViews: number;
  tarotDrawSuccess: number;
  tarotSingleSuccess: number;
  tarotThreeSuccess: number;
  freeSuccess: number;
  paidAttempts: number;
  paidSuccess: number;
  revenue: number;
  astroProfilePageViews: number;
  astroProfileAttempts: number;
  astroProfileSuccess: number;
  astroProfileFreeSuccess: number;
  astroProfilePaidSuccess: number;
  astroProfileRevenue: number;
  conversionRates: ConversionRates;
};

type Diagnostics = {
  start: string;
  end: string;
  days: number;
  timezone: string;
  analyticsEventsRead: number;
  pageViewCount: number;
  sessionStartCount: number;
  rateLimitsRead: number;
  tripleZodiacEventsRead: number;
  paymentOrdersRead: number;
  astroProfileOrdersRead: number;
  pendingOrders: number;
  paidOrders: number;
  excludedAdminTest: number;
  source: string;
};

type StatsResponse = {
  ok: true;
  today: string;
  needsSelection?: boolean;
  source?: string;
  start?: string;
  end?: string;
  days?: DayResult[];
  totals: Totals;
  diagnostics?: Diagnostics;
};
type StatsApiResponse = StatsResponse | { ok: false; error?: string };

interface UsageOverviewProps {
  today: string;
  fetchError: boolean;
  /** 預設收件 Email（管理員），可為空字串 */
  defaultEmail?: string;
}

const MAX_RANGE_DAYS = 31;

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

/** [start, end] 含端點的天數；start > end 回 0 */
function dayCount(start: string, end: string): number {
  if (start > end) return 0;
  let cursor = start;
  let n = 1;
  while (cursor !== end) {
    cursor = addDays(cursor, 1);
    n += 1;
    if (n > 400) return n; // 安全上限，避免無窮迴圈
  }
  return n;
}

/** 將多天的 breakdown 合併（加總 count），重算百分比 */
function mergeBreakdown(daysMetrics: DayMetrics[], pick: (m: DayMetrics) => BreakdownRow[]): BreakdownRow[] {
  const counts = new Map<string, number>();
  for (const m of daysMetrics) {
    for (const row of pick(m)) counts.set(row.label, (counts.get(row.label) ?? 0) + row.count);
  }
  const total = Array.from(counts.values()).reduce((s, n) => s + n, 0);
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count, ratio: total ? `${Math.round((count / total) * 1000) / 10}%` : "0%" }))
    .sort((a, b) => b.count - a.count);
}

function SummaryCards({ cards }: { cards: { label: string; value: string | number; highlight?: boolean }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
              {["日期", "訪客", "完成抽牌", "單張", "三張", "免費成功", "付費嘗試", "付費成功", "收入", "狀態"].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wider text-moon/42">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const m = day.metrics;
              const hasData = Boolean(m && day.hasRawData);
              return (
                <tr key={day.date} className="border-b border-white/6 last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-moon">{day.date}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-moon/75">{m ? m.visitors : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-moon/75">{m ? m.tarotDrawSuccess : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-moon/75">{m ? m.tarotSingleSuccess : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-moon/75">{m ? m.tarotThreeSuccess : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-moon/75">{m ? m.freeSuccess : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-moon/75">{m ? m.paidAttempts : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-moon/75">{m ? m.paidSuccess : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-moon/75">{m ? formatMoney(m.revenue) : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {hasData ? (
                      <span className="text-aurora/80">原始資料計算</span>
                    ) : (
                      <span className="text-moon/40">查無原始資料</span>
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

function DiagnosticsPanel({ diag }: { diag: Diagnostics }) {
  const [open, setOpen] = useState(false);
  const rows: [string, string | number][] = [
    ["查詢日期區間", `${diag.start} ～ ${diag.end}（${diag.days} 天）`],
    ["使用時區", diag.timezone],
    ["analytics_events 讀取", diag.analyticsEventsRead],
    ["page_view", diag.pageViewCount],
    ["session_start", diag.sessionStartCount],
    ["rate_limits 讀取", diag.rateLimitsRead],
    ["triple_zodiac_events 讀取", diag.tripleZodiacEventsRead],
    ["paymentOrders（建立）", diag.paymentOrdersRead],
    ["astroProfileOrders（建立）", diag.astroProfileOrdersRead],
    ["pending / unpaid 訂單", diag.pendingOrders],
    ["paid / success 訂單", diag.paidOrders],
    ["被 admin / test 排除", diag.excludedAdminTest],
    ["最終採用來源", diag.source],
  ];
  return (
    <section className="rounded-3xl border border-white/10 bg-midnight/70 p-4 sm:p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-xs uppercase tracking-[0.24em] text-lavender/70">統計診斷（raw_events）</span>
        <span className="text-sm text-moon/50">{open ? "收合 ▲" : "展開 ▼"}</span>
      </button>
      {open ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between rounded-xl border border-white/8 bg-midnight/50 px-4 py-2.5 text-sm">
              <span className="text-moon/55">{label}</span>
              <span className="font-mono text-moon/85">{value}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
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

  // 保存 / Email 備份（僅後台管理員）
  const [email, setEmail] = useState(props.defaultEmail ?? "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [emailMsg, setEmailMsg] = useState("");

  const runQuery = useCallback(async (start: string, end: string) => {
    setError("");
    // 每次新查詢都重置保存 / 寄送狀態
    setSaveStatus("idle"); setSaveMsg("");
    setEmailStatus("idle"); setEmailMsg("");
    const lo = start <= end ? start : end;
    const hi = start <= end ? end : start;

    // 單次最多 31 天（前端先擋，後端也會再驗證）
    if (dayCount(lo, hi) > MAX_RANGE_DAYS) {
      setData(null);
      setHasQueried(true);
      setError(`為避免 Firebase 讀取過量，單次最多查詢 ${MAX_RANGE_DAYS} 天。`);
      return;
    }

    setLoading(true);
    setHasQueried(true);
    try {
      const res = await fetch(`/api/admin/stats?start=${encodeURIComponent(lo)}&end=${encodeURIComponent(hi)}`);
      const json = await readJsonResponse<StatsApiResponse>(res, { ok: false });
      if (!json.ok) {
        setError(json.error ?? "讀取統計資料失敗");
        setData(null);
        return;
      }
      setData(json as StatsResponse);
    } catch {
      setError("讀取統計資料失敗，請稍後再試。");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

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
  const withMetrics = days.filter((d) => d.metrics).map((d) => d.metrics as DayMetrics);

  // 查詢區間的合併排行（跨多天加總）
  const mergedSources = mergeBreakdown(withMetrics, (m) => m.sourceStats);
  const mergedFeatures = mergeBreakdown(withMetrics, (m) => m.popularFeatureStats);
  const mergedPayments = (() => {
    const counts = new Map<string, { count: number; revenue: number }>();
    for (const m of withMetrics) {
      for (const row of m.paymentSourceStats) {
        const cur = counts.get(row.label) ?? { count: 0, revenue: 0 };
        cur.count += row.count;
        cur.revenue += row.revenue;
        counts.set(row.label, cur);
      }
    }
    const total = Array.from(counts.values()).reduce((s, r) => s + r.count, 0);
    return Array.from(counts.entries())
      .map(([label, r]) => ({ label, count: r.count, ratio: total ? `${Math.round((r.count / total) * 1000) / 10}%` : "0%", revenue: r.revenue }))
      .sort((a, b) => b.count - a.count);
  })();

  // 組裝保存 / Email 用的統計結果（與畫面一致）
  const buildStatsResult = () => ({
    totals: data?.totals,
    days: withMetrics.map((m) => ({
      date: m.date,
      visitors: m.visitors,
      pageViews: m.pageViews,
      tarotSingleSuccess: m.tarotSingleSuccess,
      tarotThreeSuccess: m.tarotThreeSuccess,
      astroProfileSuccess: m.astroProfileSuccess,
      paidAttempts: m.paidAttempts,
      paidSuccess: m.paidSuccess,
      revenue: m.revenue,
    })),
    featureRanking: mergedFeatures.map((r) => ({ label: r.label, count: r.count })),
  });

  async function handleSave() {
    if (!data || !data.days) return;
    setSaveStatus("saving");
    setSaveMsg("");
    try {
      const res = await fetch("/api/admin/stats/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: data.start,
          end: data.end,
          source: data.source ?? "raw_events",
          statsResult: buildStatsResult(),
          diagnostics: data.diagnostics ?? null,
        }),
      });
      const json = await readJsonResponse<{ ok: boolean }>(res, { ok: false });
      if (json.ok) {
        setSaveStatus("saved");
        setSaveMsg("已保存本次統計結果。");
      } else {
        setSaveStatus("error");
        setSaveMsg("保存失敗，請稍後再試。");
      }
    } catch {
      setSaveStatus("error");
      setSaveMsg("保存失敗，請稍後再試。");
    }
  }

  async function handleSendEmail() {
    if (!data || !data.days) return;
    const to = email.trim();
    if (!to) {
      setEmailStatus("error");
      setEmailMsg("請輸入收件 Email。");
      return;
    }
    setEmailStatus("sending");
    setEmailMsg("");
    try {
      const res = await fetch("/api/admin/stats/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: to,
          dateFrom: data.start,
          dateTo: data.end,
          source: saveStatus === "saved" ? "manual_cache" : "raw_events",
          statsResult: buildStatsResult(),
          diagnostics: data.diagnostics ?? {},
        }),
      });
      const json = await readJsonResponse<{ ok: boolean; message?: string }>(res, { ok: false });
      if (json.ok) {
        setEmailStatus("sent");
        setEmailMsg(`Email 已寄出至 ${to}`);
      } else {
        setEmailStatus("error");
        setEmailMsg(json.message ?? "Email 寄送失敗，請稍後再試。");
      }
    } catch {
      setEmailStatus("error");
      setEmailMsg("Email 寄送失敗，請稍後再試。");
    }
  }

  return (
    <div className="space-y-4">
      {/* 說明 + 查詢區 */}
      <section className="rounded-3xl border border-white/10 bg-midnight/72 p-4 sm:p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-lavender/70">Admin Statistics（raw events）</p>
          <h2 className="mt-1 text-xl font-semibold text-moon">後台使用統計</h2>
          <p className="mt-1 text-xs leading-6 text-moon/48">
            請選擇日期區間後查詢。系統會從原始資料重新計算，不使用快照作為主要統計來源。單次最多查詢 {MAX_RANGE_DAYS} 天。
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
          <button type="button" onClick={() => { setMode("single"); setSingleDate(today); void runQuery(today, today); }}
            className="rounded-full border border-white/12 bg-white/6 px-4 py-1.5 text-xs text-moon/75 transition hover:bg-white/12">今日</button>
          <button type="button" onClick={() => quick(addDays(today, -7), yesterday)}
            className="rounded-full border border-white/12 bg-white/6 px-4 py-1.5 text-xs text-moon/75 transition hover:bg-white/12">最近 7 天</button>
          <button type="button" onClick={() => quick(monthStart, monthStart > yesterday ? monthStart : yesterday)}
            className="rounded-full border border-white/12 bg-white/6 px-4 py-1.5 text-xs text-moon/75 transition hover:bg-white/12">本月</button>
        </div>
      </section>

      {props.fetchError ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          Firestore 讀取失敗，請確認 Firebase 環境變數設定。
        </div>
      ) : null}

      {!hasQueried ? (
        <div className="rounded-2xl border border-white/10 bg-midnight/50 p-6 text-center text-sm text-moon/55">
          請選擇日期區間後查詢統計資料。
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-midnight/40 p-5 text-sm text-moon/50">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-lavender/30 border-t-lavender" />
          從原始資料計算中...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-400/20 bg-red-400/8 px-4 py-3 text-sm text-red-300">{error}</div>
      ) : null}

      {!loading && data && data.days ? (
        <>
          {/* 保存 + Email 備份（僅後台管理員，手動觸發，不自動寄送） */}
          <section className="rounded-3xl border border-[#d8bd70]/25 bg-[#d8bd70]/6 p-4 sm:p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-[#d8bd70]/70">保存與 Email 備份</p>
            <p className="mt-1 text-sm text-moon/55">
              {saveStatus === "saved"
                ? "已保存本次統計，可寄送已保存統計到 Email。"
                : "可保存本次統計結果，或寄送到 Email 備份。寄送需手動點擊，不會自動寄出。"}
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="text-sm text-moon/60">
                <span className="mb-1 block text-xs text-moon/45">收件 Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (emailMsg) setEmailMsg(""); }}
                  placeholder="輸入收件 Email"
                  className="w-72 max-w-full rounded-xl border border-white/12 bg-midnight/60 px-3 py-2 text-moon"
                />
              </label>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saveStatus === "saving"}
                className="rounded-full border border-white/15 bg-white/8 px-5 py-2.5 text-sm font-medium text-moon transition hover:bg-white/14 disabled:opacity-60"
              >
                {saveStatus === "saving" ? "保存中..." : saveStatus === "saved" ? "✓ 已保存統計" : "保存本次統計結果"}
              </button>
              <button
                type="button"
                onClick={() => void handleSendEmail()}
                disabled={emailStatus === "sending"}
                className="rounded-full border border-[#d8bd70]/35 bg-[#d8bd70] px-5 py-2.5 text-sm font-semibold text-midnight transition hover:bg-moon disabled:cursor-wait disabled:opacity-70"
              >
                {emailStatus === "sending"
                  ? "寄送中..."
                  : saveStatus === "saved"
                    ? "寄送已保存統計到 Email"
                    : "寄送統計到 Email"}
              </button>
            </div>
            {saveMsg ? (
              <p className={`mt-2 text-xs ${saveStatus === "error" ? "text-red-300" : "text-aurora"}`}>{saveMsg}</p>
            ) : null}
            {emailMsg ? (
              <p className={`mt-1 text-xs ${emailStatus === "error" ? "text-red-300" : "text-aurora"}`}>{emailMsg}</p>
            ) : null}
          </section>

          <Panel
            title="1. 查詢區間摘要"
            subtitle={`${data.start} ～ ${data.end}（共 ${data.days.length} 天 · 原始資料計算）`}
          >
            <SummaryCards
              cards={[
                { label: "訪客", value: data.totals.visitors },
                { label: "頁面瀏覽", value: data.totals.pageViews },
                { label: "完成抽牌", value: data.totals.tarotDrawSuccess },
                { label: "免費成功", value: data.totals.freeSuccess },
                { label: "付費嘗試", value: data.totals.paidAttempts },
                { label: "付費成功", value: data.totals.paidSuccess, highlight: data.totals.paidSuccess > 0 },
                { label: "收入", value: formatMoney(data.totals.revenue), highlight: data.totals.revenue > 0 },
              ]}
            />
            <div className="mt-3 grid gap-2 text-xs text-moon/55 sm:grid-cols-3">
              <span>訪客→抽牌：{data.totals.conversionRates?.visitorToDraw ?? "0%"}</span>
              <span>抽牌→付費：{data.totals.conversionRates?.drawToPaid ?? "0%"}</span>
              <span>訪客→付費：{data.totals.conversionRates?.visitorToPaid ?? "0%"}</span>
            </div>
          </Panel>

          <Panel title="2. 免費功能使用" subtitle="免費單張抽牌｜免費三張抽牌｜免費四核心星座解析">
            <SummaryCards
              cards={[
                { label: "免費單張抽牌", value: data.totals.tarotSingleSuccess },
                { label: "免費三張抽牌", value: data.totals.tarotThreeSuccess },
                { label: "免費四核心星座解析", value: data.totals.astroProfileFreeSuccess },
              ]}
            />
          </Panel>

          <Panel title="3. 頁面瀏覽排行" subtitle="首頁｜塔羅抽牌｜四核心星座｜今日星座｜其他頁面">
            <BreakdownTable rows={mergedFeatures} countLabel="瀏覽次數" />
          </Panel>

          <Panel title="4. 四核心星座" subtitle="頁面瀏覽｜成功產出｜免費成功｜付費嘗試｜付費成功｜收入">
            <SummaryCards
              cards={[
                { label: "頁面瀏覽", value: data.totals.astroProfilePageViews },
                { label: "成功產出", value: data.totals.astroProfileSuccess },
                { label: "免費成功", value: data.totals.astroProfileFreeSuccess },
                { label: "付費嘗試", value: data.totals.astroProfileAttempts },
                { label: "付費成功", value: data.totals.astroProfilePaidSuccess, highlight: data.totals.astroProfilePaidSuccess > 0 },
                { label: "收入", value: formatMoney(data.totals.astroProfileRevenue), highlight: data.totals.astroProfileRevenue > 0 },
              ]}
            />
          </Panel>

          <Panel title="5. 每日明細" subtitle="狀態欄：原始資料計算 / 查無原始資料">
            {days.length ? <DayTable days={days} /> : <EmptyBox text="此區間沒有任何日期" />}
          </Panel>

          {mergedSources.some((r) => r.count > 0) ? (
            <Panel title="6. 訪客來源" subtitle={`${data.start} ～ ${data.end}`}>
              <BreakdownTable rows={mergedSources} countLabel="訪客" />
            </Panel>
          ) : null}

          {mergedPayments.some((r) => r.count > 0 || r.revenue > 0) ? (
            <Panel title="7. 付費來源排行" subtitle={`${data.start} ～ ${data.end}`}>
              <PaymentTable rows={mergedPayments} />
            </Panel>
          ) : null}

          {data.diagnostics ? <DiagnosticsPanel diag={data.diagnostics} /> : null}
        </>
      ) : null}
    </div>
  );
}
