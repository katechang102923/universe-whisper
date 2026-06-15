/**
 * adminStatsEmail.ts
 *
 * 後台統計報表 Email — 只在 server side 呼叫。
 * RESEND_API_KEY / EMAIL_FROM 只在伺服器讀取，不回傳前端、不印出完整金鑰。
 *
 * 與前台「宇宙通行碼」寄送流程完全分離，不共用、不影響。
 */

// ── 型別 ──────────────────────────────────────────────────────────────────────

export type StatsEmailTotals = {
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
  astroProfileFreeSuccess: number;
  astroProfileAttempts: number;
  astroProfilePaidSuccess: number;
  astroProfileRevenue: number;
};

export type StatsEmailDay = {
  date: string;
  visitors: number;
  pageViews: number;
  tarotSingleSuccess: number;
  tarotThreeSuccess: number;
  astroProfileSuccess: number;
  paidAttempts: number;
  paidSuccess: number;
  revenue: number;
};

export type StatsEmailFeatureRow = { label: string; count: number };

export type StatsEmailDiagnostics = {
  analyticsEventsRead: number;
  rateLimitsRead: number;
  tripleZodiacEventsRead: number;
  paymentOrdersRead: number;
  astroProfileOrdersRead: number;
  excludedAdminTest: number;
};

export type StatsEmailPayload = {
  dateFrom: string;
  dateTo: string;
  source: string; // "raw_events" | "manual_cache"
  totals: StatsEmailTotals;
  days: StatsEmailDay[];
  featureRanking: StatsEmailFeatureRow[];
  diagnostics: StatsEmailDiagnostics;
};

export type SendStatsEmailResult = {
  ok: boolean;
  messageId?: string;
  errorMsg?: string;
};

// ── 工具 ──────────────────────────────────────────────────────────────────────

function n(v: unknown): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}
function fmt(v: unknown): string {
  return n(v).toLocaleString("zh-TW");
}
function money(v: unknown): string {
  return `NT$${Math.max(0, n(v)).toLocaleString("zh-TW")}`;
}
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}
function sourceLabel(source: string): string {
  if (source === "manual_cache") return "manual_cache（已保存統計）";
  return "raw_events（原始資料即時計算）";
}
function nowTaipei(): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date());
}

const FEATURE_ORDER = ["首頁", "塔羅抽牌", "四核心星座", "今日星座", "其他頁面"];

// ── 主旨 ──────────────────────────────────────────────────────────────────────

export function buildStatsEmailSubject(dateFrom: string, dateTo: string): string {
  return `宇宙偷偷話後台統計報表｜${dateFrom} ～ ${dateTo}`;
}

// ── HTML ──────────────────────────────────────────────────────────────────────

function kvTable(rows: [string, string][]): string {
  return `<table style="width:100%;border-collapse:collapse;margin:0 0 8px;">${rows
    .map(
      ([k, v], i) =>
        `<tr style="background:${i % 2 ? "#f6f4fb" : "#ffffff"};"><td style="padding:8px 12px;font-size:14px;color:#555;border:1px solid #e6e2f0;">${esc(k)}</td><td style="padding:8px 12px;font-size:14px;color:#1a1a2e;font-weight:600;text-align:right;border:1px solid #e6e2f0;">${esc(v)}</td></tr>`,
    )
    .join("")}</table>`;
}

function sectionTitle(title: string): string {
  return `<h2 style="font-size:15px;color:#5b4b9b;margin:24px 0 10px;border-left:4px solid #d8bd70;padding-left:10px;">${esc(title)}</h2>`;
}

export function buildStatsEmailHtml(p: StatsEmailPayload): string {
  const t = p.totals;

  const featureMap = new Map(p.featureRanking.map((r) => [r.label, r.count]));
  const featureRows: [string, string][] = FEATURE_ORDER.map((label) => [label, fmt(featureMap.get(label) ?? 0)]);

  const dailyHeader = ["日期", "訪客", "頁面瀏覽", "單張", "三張", "四核心星座", "付費嘗試", "付費成功", "收入"];
  const dailyRowsHtml = p.days
    .map((d, i) => {
      const cells = [
        d.date,
        fmt(d.visitors),
        fmt(d.pageViews),
        fmt(d.tarotSingleSuccess),
        fmt(d.tarotThreeSuccess),
        fmt(d.astroProfileSuccess),
        fmt(d.paidAttempts),
        fmt(d.paidSuccess),
        money(d.revenue),
      ];
      return `<tr style="background:${i % 2 ? "#f6f4fb" : "#ffffff"};">${cells
        .map((c, ci) => `<td style="padding:6px 8px;font-size:12px;color:#1a1a2e;border:1px solid #e6e2f0;text-align:${ci === 0 ? "left" : "right"};white-space:nowrap;">${esc(String(c))}</td>`)
        .join("")}</tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>後台統計報表</title></head>
<body style="background:#f0eef7;color:#1a1a2e;font-family:'Helvetica Neue',Arial,'PingFang TC','Microsoft JhengHei',sans-serif;margin:0;padding:0;">
  <div style="max-width:680px;margin:0 auto;padding:28px 18px;">
    <p style="font-size:11px;letter-spacing:0.28em;color:#9b8fd4;text-transform:uppercase;margin:0 0 6px;">宇宙偷偷話 · Admin</p>
    <h1 style="font-size:22px;font-weight:700;color:#2a2150;margin:0 0 4px;">後台統計報表</h1>
    <p style="font-size:13px;color:#7a6fa0;margin:0 0 18px;">${esc(p.dateFrom)} ～ ${esc(p.dateTo)}</p>

    ${kvTable([
      ["查詢日期區間", `${p.dateFrom} ～ ${p.dateTo}`],
      ["統計產生時間", `${nowTaipei()}（Asia/Taipei）`],
      ["資料來源", sourceLabel(p.source)],
    ])}

    ${sectionTitle("查詢區間摘要")}
    ${kvTable([
      ["訪客", fmt(t.visitors)],
      ["頁面瀏覽", fmt(t.pageViews)],
      ["完成抽牌", fmt(t.tarotDrawSuccess)],
      ["免費成功", fmt(t.freeSuccess)],
      ["付費嘗試", fmt(t.paidAttempts)],
      ["付費成功", fmt(t.paidSuccess)],
      ["收入", money(t.revenue)],
    ])}

    ${sectionTitle("免費功能使用")}
    ${kvTable([
      ["免費單張抽牌", fmt(t.tarotSingleSuccess)],
      ["免費三張抽牌", fmt(t.tarotThreeSuccess)],
      ["免費四核心星座解析", fmt(t.astroProfileFreeSuccess)],
    ])}

    ${sectionTitle("頁面瀏覽排行")}
    ${kvTable(featureRows)}

    ${sectionTitle("四核心星座統計")}
    ${kvTable([
      ["頁面瀏覽", fmt(t.astroProfilePageViews)],
      ["免費成功", fmt(t.astroProfileFreeSuccess)],
      ["付費嘗試", fmt(t.astroProfileAttempts)],
      ["付費成功", fmt(t.astroProfilePaidSuccess)],
      ["收入", money(t.astroProfileRevenue)],
    ])}

    ${sectionTitle("每日明細")}
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:#2a2150;">${dailyHeader
          .map((h, i) => `<th style="padding:7px 8px;font-size:12px;color:#fff;border:1px solid #3a2f66;text-align:${i === 0 ? "left" : "right"};white-space:nowrap;">${esc(h)}</th>`)
          .join("")}</tr></thead>
        <tbody>${dailyRowsHtml || `<tr><td colspan="9" style="padding:10px;font-size:12px;color:#888;border:1px solid #e6e2f0;text-align:center;">查無原始資料</td></tr>`}</tbody>
      </table>
    </div>

    ${sectionTitle("統計診斷摘要")}
    ${kvTable([
      ["analytics_events 讀取筆數", fmt(p.diagnostics.analyticsEventsRead)],
      ["rate_limits 讀取筆數", fmt(p.diagnostics.rateLimitsRead)],
      ["triple_zodiac_events 讀取筆數", fmt(p.diagnostics.tripleZodiacEventsRead)],
      ["paymentOrders 讀取筆數", fmt(p.diagnostics.paymentOrdersRead)],
      ["astroProfileOrders 讀取筆數", fmt(p.diagnostics.astroProfileOrdersRead)],
      ["admin/test 排除筆數", fmt(p.diagnostics.excludedAdminTest)],
    ])}

    <p style="margin-top:28px;font-size:12px;color:#9088ab;text-align:center;border-top:1px solid #e0dcec;padding-top:16px;">
      宇宙偷偷話 · 管理後台統計報表<br/>此信件由後台手動觸發寄出，僅供管理用途。
    </p>
  </div>
</body>
</html>`;
}

// ── 純文字版 ──────────────────────────────────────────────────────────────────

export function buildStatsEmailText(p: StatsEmailPayload): string {
  const t = p.totals;
  const featureMap = new Map(p.featureRanking.map((r) => [r.label, r.count]));
  const lines: string[] = [
    "宇宙偷偷話後台統計報表",
    `查詢日期區間：${p.dateFrom} ～ ${p.dateTo}`,
    `統計產生時間：${nowTaipei()}（Asia/Taipei）`,
    `資料來源：${sourceLabel(p.source)}`,
    "",
    "【查詢區間摘要】",
    `訪客：${fmt(t.visitors)}`,
    `頁面瀏覽：${fmt(t.pageViews)}`,
    `完成抽牌：${fmt(t.tarotDrawSuccess)}`,
    `免費成功：${fmt(t.freeSuccess)}`,
    `付費嘗試：${fmt(t.paidAttempts)}`,
    `付費成功：${fmt(t.paidSuccess)}`,
    `收入：${money(t.revenue)}`,
    "",
    "【免費功能使用】",
    `免費單張抽牌：${fmt(t.tarotSingleSuccess)}`,
    `免費三張抽牌：${fmt(t.tarotThreeSuccess)}`,
    `免費四核心星座解析：${fmt(t.astroProfileFreeSuccess)}`,
    "",
    "【頁面瀏覽排行】",
    ...FEATURE_ORDER.map((label) => `${label}：${fmt(featureMap.get(label) ?? 0)}`),
    "",
    "【四核心星座統計】",
    `頁面瀏覽：${fmt(t.astroProfilePageViews)}`,
    `免費成功：${fmt(t.astroProfileFreeSuccess)}`,
    `付費嘗試：${fmt(t.astroProfileAttempts)}`,
    `付費成功：${fmt(t.astroProfilePaidSuccess)}`,
    `收入：${money(t.astroProfileRevenue)}`,
    "",
    "【每日明細】日期 / 訪客 / 頁面瀏覽 / 單張 / 三張 / 四核心星座 / 付費嘗試 / 付費成功 / 收入",
    ...p.days.map(
      (d) =>
        `${d.date} | ${fmt(d.visitors)} | ${fmt(d.pageViews)} | ${fmt(d.tarotSingleSuccess)} | ${fmt(d.tarotThreeSuccess)} | ${fmt(d.astroProfileSuccess)} | ${fmt(d.paidAttempts)} | ${fmt(d.paidSuccess)} | ${money(d.revenue)}`,
    ),
    "",
    "【統計診斷摘要】",
    `analytics_events 讀取筆數：${fmt(p.diagnostics.analyticsEventsRead)}`,
    `rate_limits 讀取筆數：${fmt(p.diagnostics.rateLimitsRead)}`,
    `triple_zodiac_events 讀取筆數：${fmt(p.diagnostics.tripleZodiacEventsRead)}`,
    `paymentOrders 讀取筆數：${fmt(p.diagnostics.paymentOrdersRead)}`,
    `astroProfileOrders 讀取筆數：${fmt(p.diagnostics.astroProfileOrdersRead)}`,
    `admin/test 排除筆數：${fmt(p.diagnostics.excludedAdminTest)}`,
  ];
  return lines.join("\n");
}

// ── 寄送（Resend，server-only）────────────────────────────────────────────────

export async function sendStatsReportEmail(opts: {
  to: string;
  payload: StatsEmailPayload;
}): Promise<SendStatsEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.EMAIL_FROM || "宇宙偷偷話 <noreply@universewhisper.com>";

  if (!apiKey) {
    console.error("[AdminStatsEmail] Missing env RESEND_API_KEY", { hasApiKey: false });
    return { ok: false, errorMsg: "Email 服務尚未設定（缺少 RESEND_API_KEY）" };
  }

  const subject = buildStatsEmailSubject(opts.payload.dateFrom, opts.payload.dateTo);
  const html = buildStatsEmailHtml(opts.payload);
  const text = buildStatsEmailText(opts.payload);

  console.log("[AdminStatsEmail] send start", {
    to: opts.to,
    range: `${opts.payload.dateFrom}~${opts.payload.dateTo}`,
    source: opts.payload.source,
    keyPrefix: apiKey.slice(0, 4) + "…", // 只印前 4 碼
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromAddr, to: [opts.to], subject, html, text }),
    });

    if (res.ok) {
      const json = (await res.json().catch(() => ({}))) as { id?: string };
      console.log("[AdminStatsEmail] success", { to: opts.to, id: json.id });
      return { ok: true, messageId: json.id };
    }

    const errText = await res.text().catch(() => "");
    let parsed: { message?: string } = {};
    try { parsed = JSON.parse(errText); } catch { /* ignore */ }
    console.error("[AdminStatsEmail] resend failed", { statusCode: res.status, message: parsed.message ?? errText.slice(0, 200) });
    return { ok: false, errorMsg: `Resend HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[AdminStatsEmail] exception", { error: msg });
    return { ok: false, errorMsg: msg.slice(0, 200) };
  }
}
