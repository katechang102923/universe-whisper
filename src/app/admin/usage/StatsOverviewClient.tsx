"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Period = "today" | "month" | "all";

type SimpleRank = { display: string; count: number };

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
  drawCount: number;
  freeUnlockCount: number;
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

interface UsageOverviewProps {
  year: number;
  month: number;
  today: string;
  usageData: {
    total_requests?: number;
    total_blocked?: number;
    feature_usage?: Record<string, number>;
  };
  fortuneCoverage: number;
  zodiacCount: number;
  redeemStats: { total: number; active: number; usedUp: number; test: number };
  orderStats: {
    total: number;
    paid: number;
    failed: number;
    pending: number;
    todayRevenue: number;
    todayPaid: number;
    todayTest: number;
    noCode: number;
    emailUnsent: number;
  };
  shareDownloadStats: {
    todayCount: number;
    todayUsers: number;
    allCount: number;
    allUsers: number;
  };
  shareDownloadRanking: { display: string; count: number; lastAt: string; type: string }[];
  fetchError: boolean;
  ipRanking: SimpleRank[];
  anonRanking: SimpleRank[];
  lineRanking: SimpleRank[];
  lineDailyLimit: number;
  unauthDailyLimit: number;
}

const DEFAULT_OPEN = ["core", "traffic", "funnel", "unlock"];
const ALL_SECTIONS = [
  "core",
  "traffic",
  "funnel",
  "unlock",
  "payment",
  "redeem",
  "download",
  "freeDraw",
  "sources",
  "pageStay",
  "questionTypes",
  "spread",
  "lineSave",
  "debug",
];

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.round(seconds || 0));
  if (safe < 60) return `${safe} 秒`;
  if (safe < 3600) return `${Math.floor(safe / 60)} 分 ${safe % 60} 秒`;
  return `${Math.floor(safe / 3600)} 小時 ${Math.floor((safe % 3600) / 60)} 分`;
}

function formatMoney(value: number) {
  return value > 0 ? `NT$${value.toLocaleString("zh-TW")}` : "NT$0";
}

function getFunnelUsers(data: StatsData | null, label: string) {
  return data?.funnel.find((row) => row.label === label)?.users ?? 0;
}

function periodLabel(period: Period, data: StatsData) {
  if (period === "today") return `今日（${data.today}）`;
  if (period === "month") return `本月（${data.monthKey}）`;
  return "全期";
}

function Section({
  id,
  title,
  summary,
  openSections,
  toggle,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  openSections: Set<string>;
  toggle: (id: string) => void;
  children: React.ReactNode;
}) {
  const isOpen = openSections.has(id);
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/42">
      <button
        type="button"
        onClick={() => toggle(id)}
        className="flex w-full flex-col gap-2 px-4 py-4 text-left transition hover:bg-white/5 sm:flex-row sm:items-center sm:justify-between sm:px-5"
      >
        <span className="flex items-center gap-3">
          <span className={`text-sm text-lavender transition ${isOpen ? "rotate-90" : ""}`}>▶</span>
          <span className="text-sm font-semibold tracking-[0.16em] text-moon">{title}</span>
        </span>
        {summary ? <span className="text-xs leading-6 text-moon/48 sm:text-right">{summary}</span> : null}
      </button>
      {isOpen ? <div className="border-t border-white/8 p-4 sm:p-5">{children}</div> : null}
    </section>
  );
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
      <p className={`text-xs uppercase tracking-[0.22em] ${highlight ? "text-[#d8bd70]/70" : "text-moon/48"}`}>
        {label}
      </p>
      <p className={`mt-2 text-3xl font-semibold ${highlight ? "text-[#d8bd70]" : "text-moon"}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-moon/44">{sub}</p> : null}
    </div>
  );
}

function PeriodTabs({ period, onChange }: { period: Period; onChange: (period: Period) => void }) {
  const tabs: { key: Period; label: string }[] = [
    { key: "today", label: "今日" },
    { key: "month", label: "本月" },
    { key: "all", label: "全期" },
  ];
  return (
    <div className="mb-4 flex w-fit gap-1 rounded-xl border border-white/8 bg-midnight/40 p-1">
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
        <table className="w-full min-w-max text-sm">
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
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={rowIndex < rows.length - 1 ? "border-b border-white/6" : ""}>
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`} className="whitespace-nowrap px-4 py-3 text-moon/75">
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

function RankingTable({
  title,
  rows,
  keyLabel,
  limit,
}: {
  title: string;
  rows: SimpleRank[];
  keyLabel: string;
  limit: number;
}) {
  const tableRows = rows.map((row, index) => [
    index + 1,
    row.display,
    row.count,
    row.count >= limit ? "已達上限" : `剩 ${limit - row.count}`,
  ]);
  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-moon">{title}</p>
      <DataTable headers={["排名", keyLabel, "次數", "狀態"]} rows={tableRows} emptyText="今日尚無資料" />
    </div>
  );
}

function TrafficCards({ row, label }: { row: TrafficPeriod; label: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard label={`${label}拜訪人數`} value={row.visitors} />
      <StatCard label={`${label}拜訪次數`} value={row.sessions} />
      <StatCard label={`${label}頁面瀏覽數`} value={row.pageViews} />
      <StatCard label={`${label}平均停留時間`} value={formatDuration(row.avgActiveSeconds)} />
      <StatCard label={`${label}跳出率`} value={row.bounceRate} />
    </div>
  );
}

export function StatsOverviewClient(props: UsageOverviewProps) {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openSections, setOpenSections] = useState(() => new Set(DEFAULT_OPEN));
  const [trafficPeriod, setTrafficPeriod] = useState<Period>("today");
  const [unlockPeriod, setUnlockPeriod] = useState<Period>("today");
  const [questionPeriod, setQuestionPeriod] = useState<Period>("all");
  const [spreadPeriod, setSpreadPeriod] = useState<Period>("today");
  const [linePeriod, setLinePeriod] = useState<Period>("today");

  const load = useCallback(async (year: number, month: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/stats?year=${year}&month=${month}`);
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
    void load(props.year, props.month);
  }, [props.year, props.month, load]);

  const toggle = (id: string) => {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const core = useMemo(() => {
    const todayTraffic = data?.traffic.today ?? { visitors: 0, sessions: 0, pageViews: 0, avgActiveSeconds: 0, bounceRate: "0%" };
    const drawDone = getFunnelUsers(data, "完成抽牌人數");
    const freeUnlock = data?.unlock.today.free ?? 0;
    const paidUnlock = data?.unlock.today.paid ?? 0;
    const paidRatio = data?.unlock.today.ratio ?? "0%";
    return { todayTraffic, drawDone, freeUnlock, paidUnlock, paidRatio };
  }, [data]);

  const featureUsage = props.usageData.feature_usage ?? {};
  const trafficRow = data?.traffic[trafficPeriod] ?? { visitors: 0, sessions: 0, pageViews: 0, avgActiveSeconds: 0, bounceRate: "0%" };
  const unlockRow = data?.unlock[unlockPeriod] ?? { free: 0, paid: 0, total: 0, ratio: "0%" };
  const questionRows = data?.questionTypes[questionPeriod] ?? [];
  const spreadRows = data?.spread[spreadPeriod] ?? [];
  const lineRow = data?.lineSave[linePeriod] ?? { count: 0, users: 0 };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-midnight/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.18em] text-moon">使用統計總覽</p>
          <p className="mt-1 text-xs text-moon/42">預設展開核心營運指標，其餘資料可依需要打開。</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpenSections(new Set(ALL_SECTIONS))}
            className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-xs font-medium text-moon/70 transition hover:bg-white/12 hover:text-moon"
          >
            全部展開
          </button>
          <button
            type="button"
            onClick={() => setOpenSections(new Set())}
            className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-xs font-medium text-moon/70 transition hover:bg-white/12 hover:text-moon"
          >
            全部收合
          </button>
        </div>
      </div>

      {props.fetchError ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          Firestore 資料讀取失敗，請確認 Firebase 環境變數設定。
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-midnight/40 p-5 text-sm text-moon/50">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-lavender/30 border-t-lavender" />
          讀取網站流量統計中...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-400/20 bg-red-400/8 px-4 py-3 text-sm text-red-300">
          {error}
          <button type="button" onClick={() => void load(props.year, props.month)} className="ml-3 text-xs underline opacity-70">
            重試
          </button>
        </div>
      ) : null}

      <Section
        id="core"
        title="今日核心總覽"
        summary={`拜訪 ${core.todayTraffic.visitors}｜完成抽牌 ${core.drawDone}｜收入 ${formatMoney(props.orderStats.todayRevenue)}`}
        openSections={openSections}
        toggle={toggle}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard label="今日拜訪人數" value={core.todayTraffic.visitors} />
          <StatCard label="今日完成抽牌人數" value={core.drawDone} />
          <StatCard label="今日免費解鎖" value={core.freeUnlock} />
          <StatCard label="今日付費解鎖" value={core.paidUnlock} highlight={core.paidUnlock > 0} />
          <StatCard label="今日收入" value={formatMoney(props.orderStats.todayRevenue)} highlight={props.orderStats.todayRevenue > 0} />
          <StatCard label="今日付費比例" value={core.paidRatio} highlight={core.paidUnlock > 0} />
        </div>
      </Section>

      <Section
        id="traffic"
        title="網站流量統計"
        summary={`今日 ${data?.traffic.today.visitors ?? 0} 人｜${data?.traffic.today.sessions ?? 0} 次｜PV ${data?.traffic.today.pageViews ?? 0}`}
        openSections={openSections}
        toggle={toggle}
      >
        {data ? <PeriodTabs period={trafficPeriod} onChange={setTrafficPeriod} /> : null}
        <TrafficCards row={trafficRow} label={data ? `${periodLabel(trafficPeriod, data)} ` : ""} />
      </Section>

      <Section
        id="funnel"
        title="流量轉換漏斗"
        summary={`進站 ${getFunnelUsers(data, "進站人數")}｜完成抽牌 ${getFunnelUsers(data, "完成抽牌人數")}｜付費 ${getFunnelUsers(data, "付費成功人數")}`}
        openSections={openSections}
        toggle={toggle}
      >
        <DataTable
          emptyText="尚無漏斗資料"
          headers={["階段", "人數", "相對上一階段", "相對進站總人數"]}
          rows={(data?.funnel ?? []).map((row) => [row.label, row.users, row.previousRate, row.totalRate])}
        />
      </Section>

      <Section
        id="unlock"
        title="解鎖轉換統計"
        summary={`今日免費 ${data?.unlock.today.free ?? 0}｜付費 ${data?.unlock.today.paid ?? 0}｜比例 ${data?.unlock.today.ratio ?? "0%"}`}
        openSections={openSections}
        toggle={toggle}
      >
        {data ? <PeriodTabs period={unlockPeriod} onChange={setUnlockPeriod} /> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={`${data ? periodLabel(unlockPeriod, data) : ""} 免費抽牌`} value={unlockRow.free} />
          <StatCard label={`${data ? periodLabel(unlockPeriod, data) : ""} 付費解鎖`} value={unlockRow.paid} highlight={unlockRow.paid > 0} />
          <StatCard label={`${data ? periodLabel(unlockPeriod, data) : ""} 總數`} value={unlockRow.total} />
          <StatCard label={`${data ? periodLabel(unlockPeriod, data) : ""} 付費比例`} value={unlockRow.ratio} highlight={unlockRow.paid > 0} />
        </div>
      </Section>

      <Section
        id="payment"
        title="付款訂單統計"
        summary={`成功 ${props.orderStats.paid}｜待付款 ${props.orderStats.pending}｜失敗 ${props.orderStats.failed}`}
        openSections={openSections}
        toggle={toggle}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="付款訂單總筆數" value={props.orderStats.total} />
          <StatCard label="成功付款" value={props.orderStats.paid} sub="status = paid" />
          <StatCard label="待付款" value={props.orderStats.pending} sub="status = pending" />
          <StatCard label="付款失敗" value={props.orderStats.failed} sub="status = failed" />
        </div>
      </Section>

      <Section
        id="redeem"
        title="通行碼統計"
        summary={`總數 ${props.redeemStats.total}｜使用中 ${props.redeemStats.active}｜已用完 ${props.redeemStats.usedUp}`}
        openSections={openSections}
        toggle={toggle}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="通行碼總數" value={props.redeemStats.total} />
          <StatCard label="使用中" value={props.redeemStats.active} />
          <StatCard label="已用完" value={props.redeemStats.usedUp} />
          <StatCard label="測試資料" value={props.redeemStats.test} sub="isTest = true" />
        </div>
      </Section>

      <Section
        id="download"
        title="分享圖下載統計"
        summary={`今日 ${props.shareDownloadStats.todayCount}｜全期 ${props.shareDownloadStats.allCount}`}
        openSections={openSections}
        toggle={toggle}
      >
        <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="今日下載次數" value={props.shareDownloadStats.todayCount} />
          <StatCard label="今日下載人數" value={props.shareDownloadStats.todayUsers} />
          <StatCard label="全期下載次數" value={props.shareDownloadStats.allCount} />
          <StatCard label="全期下載人數" value={props.shareDownloadStats.allUsers} />
        </div>
        <DataTable
          emptyText="尚無下載紀錄"
          headers={["排名", "使用者識別", "次數", "最近下載", "類型"]}
          rows={props.shareDownloadRanking.map((row, index) => [index + 1, row.display, row.count, row.lastAt, row.type])}
        />
      </Section>

      <Section
        id="freeDraw"
        title="今日免費抽牌"
        summary={`成功 ${props.usageData.total_requests ?? 0}｜阻擋 ${props.usageData.total_blocked ?? 0}`}
        openSections={openSections}
        toggle={toggle}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="成功請求" value={props.usageData.total_requests ?? 0} sub="AI API 已呼叫" />
          <StatCard label="阻擋請求" value={props.usageData.total_blocked ?? 0} sub="限流攔截" />
          <StatCard
            label="最多使用功能"
            value={(featureUsage.single_tarot ?? 0) >= (featureUsage.three_card ?? 0) ? "單張塔羅" : "三張牌訊息"}
            sub={`單張 ${featureUsage.single_tarot ?? 0} · 三張 ${featureUsage.three_card ?? 0}`}
          />
          <StatCard
            label="星座快取覆蓋"
            value={`${props.fortuneCoverage} / ${props.zodiacCount}`}
            sub={props.fortuneCoverage === props.zodiacCount ? "全部完成" : "今日已生成"}
          />
        </div>
      </Section>

      <Section
        id="sources"
        title="流量來源排行"
        summary={`來源 ${data?.trafficSources.length ?? 0} 種`}
        openSections={openSections}
        toggle={toggle}
      >
        <DataTable
          emptyText="尚無流量來源資料"
          headers={["排名", "來源", "訪客人數", "訪客次數", "平均停留時間", "完成抽牌數", "免費解鎖數", "付費成功數", "付費轉換率"]}
          rows={(data?.trafficSources ?? []).map((row, index) => [
            index + 1,
            row.source,
            row.visitors,
            row.sessions,
            formatDuration(row.avgActiveSeconds),
            row.drawCount,
            row.freeUnlockCount,
            row.paidSuccess,
            row.paidConversionRate,
          ])}
        />
      </Section>

      <Section
        id="pageStay"
        title="頁面停留排行"
        summary={`頁面 ${data?.pageStay.length ?? 0} 個`}
        openSections={openSections}
        toggle={toggle}
      >
        <DataTable
          emptyText="尚無頁面停留資料"
          headers={["排名", "頁面名稱", "原始路由", "瀏覽數", "平均停留時間", "離開率"]}
          rows={(data?.pageStay ?? []).map((row, index) => [
            index + 1,
            row.label,
            row.path,
            row.views,
            formatDuration(row.avgActiveSeconds),
            row.exitRate,
          ])}
        />
      </Section>

      <Section
        id="questionTypes"
        title="問題類型排行"
        summary={`全期 ${data?.questionTypes.all.length ?? 0} 類`}
        openSections={openSections}
        toggle={toggle}
      >
        {data ? <PeriodTabs period={questionPeriod} onChange={setQuestionPeriod} /> : null}
        <DataTable
          emptyText="尚無問題類型資料"
          headers={["排名", "問題類型", "次數", "占比", "付費次數", "付費比例"]}
          rows={questionRows.map((row, index) => [index + 1, row.type, row.count, row.ratio, row.paidCount, row.paidRatio])}
        />
      </Section>

      <Section
        id="spread"
        title="牌陣使用排行"
        summary={`今日 ${data?.spread.today.length ?? 0} 種｜全期 ${data?.spread.all.length ?? 0} 種`}
        openSections={openSections}
        toggle={toggle}
      >
        {data ? <PeriodTabs period={spreadPeriod} onChange={setSpreadPeriod} /> : null}
        <DataTable
          emptyText="尚無牌陣資料"
          headers={["排名", "牌陣", "免費次數", "付費次數", "總數", "占比", "付費比例", "分享圖下載"]}
          rows={spreadRows.map((row, index) => [
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
      </Section>

      <Section
        id="lineSave"
        title="LINE 保存統計"
        summary={`今日 ${data?.lineSave.today.count ?? 0}｜全期 ${data?.lineSave.all.count ?? 0}`}
        openSections={openSections}
        toggle={toggle}
      >
        {data ? <PeriodTabs period={linePeriod} onChange={setLinePeriod} /> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={`${data ? periodLabel(linePeriod, data) : ""} LINE 保存次數`} value={lineRow.count} />
          <StatCard label={`${data ? periodLabel(linePeriod, data) : ""} LINE 保存人數`} value={lineRow.users} />
          <StatCard label="全期 LINE 保存次數" value={data?.lineSave.all.count ?? 0} />
          <StatCard label="全期 LINE 保存人數" value={data?.lineSave.all.users ?? 0} />
        </div>
      </Section>

      <Section
        id="debug"
        title="進階偵錯資料"
        summary={`IP ${props.ipRanking.length}｜匿名 ${props.anonRanking.length}｜LINE ${props.lineRanking.length}`}
        openSections={openSections}
        toggle={toggle}
      >
        <div className="mb-5 rounded-2xl border border-lavender/18 bg-lavender/8 p-4 text-sm leading-7 text-moon/72">
          <span className="font-semibold text-lavender">限制規則：</span>
          未登入每日 {props.unauthDailyLimit} 次，LINE 用戶每日 {props.lineDailyLimit} 次，管理員無限制。
        </div>
        <div className="space-y-6">
          <RankingTable title="IP 使用排行（前 20）" keyLabel="IP 位址" rows={props.ipRanking} limit={props.unauthDailyLimit} />
          <RankingTable title="匿名識別碼使用排行（前 20）" keyLabel="Anonymous ID" rows={props.anonRanking} limit={props.unauthDailyLimit} />
          <RankingTable title="LINE 用戶使用排行（前 20）" keyLabel="LINE User ID" rows={props.lineRanking} limit={props.lineDailyLimit} />
        </div>
      </Section>
    </div>
  );
}
