"use client";

import { useCallback, useEffect, useState } from "react";
import { readJsonResponse } from "@/lib/readJsonResponse";

// ── 低 Firebase 讀取成本版本 ────────────────────────────────────────────────────
// 預設只讀 daily_admin_stats 快照（初始自動顯示昨日）；原始事件重算需管理者手動按鈕觸發。

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

type DayStatus = "data" | "empty" | "missing" | "raw";
type SnapshotState = "ok" | "partial" | "empty" | "missing" | null;
type DataSource = "snapshot" | "raw";
type DayResult = { date: string; isToday: boolean; status?: DayStatus; missingSnapshot: boolean; metrics: DayMetrics | null };

type Totals = {
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
};

type Granular = {
  tarotLineSent: number;
  tarotEmailSent: number;
  tarotStoryDownloaded: number;
  astroProfileStarted: number;
  astroProfileLineSent: number;
  astroProfileEmailSent: number;
  astroProfileStoryDownloaded: number;
  lineSentTotal: number;
  emailSentTotal: number;
  storyDownloadedTotal: number;
};

type Diagnostics = {
  start: string;
  end: string;
  days: number;
  mode: DataSource;
  dataSource: DataSource;
  snapshotState: SnapshotState;
  rawRecomputable: boolean;
  counts: {
    analyticsEvents: number | null;
    tripleZodiacEvents: number | null;
    paymentOrders: number | null;
    astroProfileOrders: number | null;
    rateLimits: number | null;
    dailyAdminStats: number | null;
    shareImageDownloads: number | null;
  };
  adminEventCount: number | null;
  testEventCount: number | null;
  normalEventCount: number | null;
  allEventCount: number | null;
  truncated: string[];
  shareImageAvailable: boolean | null;
  notes: string[];
};

type StatsResponse = {
  ok: true;
  today: string;
  needsSelection?: boolean;
  start?: string;
  end?: string;
  days?: DayResult[];
  totals: Totals;
  granular?: Granular;
  dataSource?: DataSource;
  snapshotState?: SnapshotState;
  displayNotice?: string;
  rawRecomputable?: boolean;
  diagnostics?: Diagnostics;
  snapshotsRead?: number;
};
type StatsApiResponse = StatsResponse | { ok: false; error?: string };

/** 依資料來源與狀態組出白話的顯示標籤 */
function sourceLabel(dataSource?: DataSource, snapshotState?: SnapshotState): string {
  if (dataSource === "raw") return "已手動重新計算原始資料";
  if (snapshotState === "missing") return "此日期尚未產生統計";
  if (snapshotState === "empty") return "此日期統計為 0";
  return "已讀取昨日統計快照";
}

function dayStatusLabel(status: DayStatus | undefined, isToday: boolean): { text: string; cls: string } {
  if (status === "raw") return { text: "原始重算", cls: "text-lavender/80" };
  if (status === "data") return { text: "已產生統計", cls: "text-aurora/80" };
  if (status === "empty") return { text: "統計為 0", cls: "text-amber-300/80" };
  if (isToday) return { text: "今日未產出", cls: "text-amber-300" };
  return { text: "尚未產生統計", cls: "text-moon/40" };
}

function fmtCount(value: number | null | undefined): string {
  return typeof value === "number" ? value.toLocaleString("zh-TW") : "—";
}

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
                    {(() => {
                      const s = dayStatusLabel(day.status, day.isToday);
                      return <span className={s.cls}>{s.text}</span>;
                    })()}
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

function DiagRow({ label, hint, value }: { label: string; hint?: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/6 py-1.5 last:border-b-0">
      <span className="text-moon/50">
        {label}
        {hint ? <span className="ml-1 text-[10px] text-moon/30">（{hint}）</span> : null}
      </span>
      <span className="font-medium text-moon/80">{value}</span>
    </div>
  );
}

/** 工程診斷資料（預設收合，排查時才看）：原始資料表筆數與事件來源細項 */
function DiagnosticsPanel({ diag }: { diag: Diagnostics }) {
  return (
    <details className="group rounded-3xl border border-white/10 bg-midnight/70 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.2)] sm:p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-moon/45">工程診斷資料（排查時才看）</p>
          <p className="mt-1 text-xs text-moon/40">一般檢視不需要展開；數字看起來怪怪的時候再打開核對。</p>
        </div>
        <span className="shrink-0 rounded-full border border-white/12 px-3 py-1 text-xs text-moon/50 transition group-open:bg-white/8">
          展開 / 收合
        </span>
      </summary>

      <div className="mt-4 grid gap-x-6 gap-y-0 text-xs sm:grid-cols-2">
        <DiagRow label="查詢區間" value={`${diag.start} ～ ${diag.end}（${diag.days} 天）`} />
        <DiagRow label="資料來源" value={sourceLabel(diag.dataSource, diag.snapshotState)} />
        <DiagRow label="本次是否即時掃描原始資料" value={diag.mode === "raw" ? "是（手動重新計算）" : "否（僅讀每日統計）"} />
        <DiagRow label="是否可手動重新計算" value={diag.rawRecomputable ? "可（最多 31 天）" : "否（區間過長）"} />
        <DiagRow label="網站瀏覽事件筆數" hint="analytics_events" value={fmtCount(diag.counts.analyticsEvents)} />
        <DiagRow label="三重星座事件筆數" hint="triple_zodiac_events" value={fmtCount(diag.counts.tripleZodiacEvents)} />
        <DiagRow label="塔羅付費訂單筆數" hint="paymentOrders" value={fmtCount(diag.counts.paymentOrders)} />
        <DiagRow label="三重星座付費訂單筆數" hint="astroProfileOrders" value={fmtCount(diag.counts.astroProfileOrders)} />
        <DiagRow label="免費使用紀錄筆數" hint="rate_limits" value={fmtCount(diag.counts.rateLimits)} />
        <DiagRow label="每日統計快照筆數" hint="daily_admin_stats" value={fmtCount(diag.counts.dailyAdminStats)} />
        <DiagRow label="限動圖下載紀錄筆數" hint="share_image_downloads" value={fmtCount(diag.counts.shareImageDownloads)} />
        <DiagRow label="一般使用者事件數" value={fmtCount(diag.normalEventCount)} />
        <DiagRow label="管理員事件數" value={fmtCount(diag.adminEventCount)} />
        <DiagRow label="測試事件數" value={fmtCount(diag.testEventCount)} />
        <DiagRow label="全部事件數" value={fmtCount(diag.allEventCount)} />
      </div>

      {diag.truncated.length ? (
        <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/8 px-4 py-2 text-xs text-amber-200">
          以下資料表達讀取上限、數字可能被截斷：{diag.truncated.join("、")}
        </p>
      ) : null}

      {diag.notes.length ? (
        <ul className="mt-3 space-y-1 text-xs text-moon/40">
          {diag.notes.map((n) => (
            <li key={n}>・{n}</li>
          ))}
        </ul>
      ) : null}
    </details>
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
  // 記住本次查詢的區間（state，供 render 與「手動原始事件重算」沿用同一區間）
  const [queried, setQueried] = useState<{ start: string; end: string } | null>(null);

  // 兩日期（含端點）相差天數
  const countDays = useCallback((start: string, end: string) => {
    const [ys, ms, ds] = start.split("-").map(Number);
    const [ye, me, de] = end.split("-").map(Number);
    const a = Date.UTC(ys, ms - 1, ds);
    const b = Date.UTC(ye, me - 1, de);
    return Math.round((b - a) / 86400000) + 1;
  }, []);

  const runQuery = useCallback(async (start: string, end: string, queryMode: DataSource = "snapshot") => {
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
    setQueried({ start, end });
    try {
      const modeParam = queryMode === "raw" ? "&mode=raw" : "";
      const res = await fetch(`/api/admin/stats?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${modeParam}`);
      const json = await readJsonResponse<StatsApiResponse>(res, { ok: false });
      if (!json.ok) {
        setError(json.error ?? "讀取統計失敗");
        setData(null);
        return;
      }
      setData(json as StatsResponse);
    } catch {
      setError("讀取統計失敗，請稍後再試。");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [today]);

  // 預設：初次載入只讀「昨日」快照（不讀原始 collection）。
  // 延後到 setTimeout 觸發，避免在 effect body 內同步 setState。
  useEffect(() => {
    const t = setTimeout(() => { void runQuery(yesterday, yesterday, "snapshot"); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // 手動原始事件重算：沿用本次查詢區間，改以原始 collection 即時計算
  const recomputeRaw = () => {
    if (!queried || loading) return;
    void runQuery(queried.start, queried.end, "raw");
  };
  const recomputeDays = queried ? countDays(queried.start, queried.end) : 0;
  const recomputeAllowed = Boolean(queried) && recomputeDays <= 31 && !loading;

  const monthStart = `${today.slice(0, 7)}-01`;

  const days = data?.days ?? [];
  const withMetrics = days.filter((d) => d.metrics);
  const singleDayMetrics = withMetrics.length === 1 ? withMetrics[0].metrics : null;

  return (
    <div className="space-y-4">
      {/* 說明 + 查詢區 */}
      <section className="rounded-3xl border border-white/10 bg-midnight/72 p-4 sm:p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-lavender/70">USAGE OVERVIEW</p>
          <h2 className="mt-1 text-xl font-semibold text-moon">後台使用統計</h2>
          <p className="mt-1 text-xs leading-6 text-moon/48">
            後台預設顯示昨日完整統計，避免每次開啟都大量讀取 Firebase。若你覺得數字不對，可按「手動重新計算」檢查原始資料。
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

        {/* 手動原始事件重算：只有按這顆才會讀 analytics_events / triple_zodiac_events / 訂單等原始 collection */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/8 pt-4">
          <button
            type="button"
            onClick={recomputeRaw}
            disabled={!recomputeAllowed}
            className="rounded-full border border-lavender/35 bg-lavender/10 px-5 py-2 text-xs font-semibold text-lavender transition hover:bg-lavender/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "重新計算中..." : "手動重新計算"}
          </button>
          <span className="text-xs text-moon/40">
            {queried
              ? recomputeDays > 31
                ? "目前區間超過 31 天，無法手動重新計算（請縮短區間）"
                : "改用原始資料重新計算本區間（只顯示、不會覆蓋每日統計）"
              : "先查詢一個區間後即可重新計算"}
          </span>
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
          {data.dataSource ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-midnight/50 px-4 py-3 text-xs text-moon/60">
              <span className="rounded-full border border-lavender/30 bg-lavender/10 px-2.5 py-1 font-medium text-lavender">
                資料來源：{sourceLabel(data.dataSource, data.snapshotState)}
              </span>
              {data.displayNotice ? <span className="text-amber-200/90">{data.displayNotice}</span> : null}
            </div>
          ) : null}

          <Panel
            title="1. 總覽"
            subtitle={`${data.start} ～ ${data.end}（共 ${data.days.length} 天）`}
          >
            <SummaryCards
              cards={[
                { label: "訪客數", value: data.totals.visitors },
                { label: "頁面瀏覽數", value: data.totals.pageViews },
                { label: "免費使用成功", value: data.totals.freeSuccess + data.totals.astroProfileFreeSuccess },
                { label: "付費成功", value: data.totals.paidSuccess, highlight: data.totals.paidSuccess > 0 },
                { label: "收入", value: formatMoney(data.totals.revenue), highlight: data.totals.revenue > 0 },
              ]}
            />
            <div className="mt-3 grid gap-2 text-xs text-moon/55 sm:grid-cols-3">
              <span>訪客→抽牌：{data.totals.conversionRates?.visitorToDraw ?? "0%"}</span>
              <span>抽牌→付費：{data.totals.conversionRates?.drawToPaid ?? "0%"}</span>
              <span>訪客→付費：{data.totals.conversionRates?.visitorToPaid ?? "0%"}</span>
            </div>
            {data.totals.visitors === 0 && (data.totals.paidSuccess > 0 || data.totals.revenue > 0) ? (
              <p className="mt-3 rounded-2xl border border-white/10 bg-midnight/50 px-4 py-3 text-xs leading-6 text-moon/55">
                此日期較舊、可能未記錄訪客資料，因此訪客數無法回補；付款與收入仍以訂單為準。
              </p>
            ) : null}
          </Panel>

          <Panel title="2. 塔羅牌" subtitle="單張 / 三張完成、免費解鎖、付費成功、LINE 傳送、限動圖下載">
            <SummaryCards
              cards={[
                { label: "單張牌完成", value: data.totals.tarotSingleSuccess },
                { label: "三張牌完成", value: data.totals.tarotThreeSuccess },
                { label: "塔羅免費解鎖", value: data.totals.freeSuccess },
                { label: "塔羅付費成功", value: Math.max(0, data.totals.paidSuccess - data.totals.astroProfilePaidSuccess), highlight: data.totals.paidSuccess - data.totals.astroProfilePaidSuccess > 0 },
                { label: "塔羅 LINE 傳送", value: data.granular?.tarotLineSent ?? 0 },
                { label: "塔羅限動圖下載", value: data.granular?.tarotStoryDownloaded ?? 0 },
              ]}
            />
          </Panel>

          <Panel title="3. 三重星座" subtitle="頁面瀏覽、開始填寫、成功產出、免費 / 付費成功、LINE / Email 傳送、限動圖下載">
            <SummaryCards
              cards={[
                { label: "頁面瀏覽", value: data.totals.astroProfilePageViews },
                { label: "開始填寫", value: data.granular?.astroProfileStarted ?? 0 },
                { label: "成功產出", value: data.totals.astroProfileSuccess },
                { label: "免費成功", value: data.totals.astroProfileFreeSuccess },
                { label: "付費成功", value: data.totals.astroProfilePaidSuccess, highlight: data.totals.astroProfilePaidSuccess > 0 },
                { label: "LINE 傳送", value: data.granular?.astroProfileLineSent ?? 0 },
                { label: "Email 傳送", value: data.granular?.astroProfileEmailSent ?? 0 },
                { label: "限動圖下載", value: data.granular?.astroProfileStoryDownloaded ?? 0 },
              ]}
            />
          </Panel>

          <Panel title="4. 每日明細" subtitle="每天一列；尚未產生統計或今日會在狀態欄標示">
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
              <Panel title="5. 訪客來源" subtitle={singleDayMetrics.date}>
                <BreakdownTable rows={singleDayMetrics.sourceStats} countLabel="訪客" />
              </Panel>
              <Panel title="6. 熱門功能排行" subtitle={singleDayMetrics.date}>
                <BreakdownTable rows={singleDayMetrics.popularFeatureStats} countLabel="瀏覽次數" />
              </Panel>
              <Panel title="7. 付費來源排行" subtitle={singleDayMetrics.date}>
                <PaymentTable rows={singleDayMetrics.paymentSourceStats} />
              </Panel>
            </>
          ) : null}

          {data.diagnostics ? <DiagnosticsPanel diag={data.diagnostics} /> : null}
        </>
      ) : null}
    </div>
  );
}
