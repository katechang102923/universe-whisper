/**
 * POST /api/astro-profile/send-email
 * Sends the astro-profile result to the user's email via Resend.
 * Uses astro-profile specific email template — does NOT touch tarot email templates.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type AstroEmailPayload = {
  email?: string;
  sunSign?: string;
  moonSign?: string | null;
  risingSign?: string | null;
  venusSign?: string | null;
  overallSummary?: string;
  sunCoreText?: string;
  moonInnerText?: string;
  risingOuterText?: string;
  venusLoveText?: string;
  whisper?: string;
  advice?: string;
  /** 延伸深度解析四章節（已解鎖時傳入） */
  careerWealthText?: string | null;
  loveRelationshipText?: string | null;
  yearlyFortuneText?: string | null;
  soulLessonText?: string | null;
  /** 完整星盤資料表（自動模式才有；舊資料 / 手動模式為 null → 隱藏表格） */
  planets?: AstroEmailPlanet[] | null;
  /** 付費深度星體區塊（與網頁完整版同步） */
  mercurySign?: string | null;
  marsSign?: string | null;
  jupiterSign?: string | null;
  saturnSign?: string | null;
  mercuryText?: string | null;
  marsText?: string | null;
  jupiterText?: string | null;
  saturnText?: string | null;
  outerPlanetText?: string | null;
  fullChartIntegrationText?: string | null;
  /** 付費限定生活化精華卡（與網頁付費版同步） */
  essenceCards?: AstroEmailEssence[] | null;
  /** 人生面向延伸：內在拉扯 */
  innerTensionText?: string | null;
  siteUrl?: string;
};

type AstroEmailPlanet = {
  key?: string;
  label?: string;
  degreeText?: string | null;
  houseText?: string | null;
};

type AstroEmailEssence = {
  icon?: string;
  title?: string;
  body?: string;
};

// 完整星盤資料表的固定顯示順序：太陽、月亮、水星、金星、火星、木星、土星、天王星、海王星、冥王星、上升
const PLANET_ORDER = [
  "sun", "moon", "mercury", "venus", "mars", "jupiter",
  "saturn", "uranus", "neptune", "pluto", "rising",
];

const ZODIAC_SYMBOLS: Record<string, string> = {
  牡羊座: "♈", 金牛座: "♉", 雙子座: "♊", 巨蟹座: "♋",
  獅子座: "♌", 處女座: "♍", 天秤座: "♎", 天蠍座: "♏",
  射手座: "♐", 摩羯座: "♑", 水瓶座: "♒", 雙魚座: "♓",
};

function sym(sign: string | null | undefined): string {
  if (!sign) return "";
  return (ZODIAC_SYMBOLS[sign] ?? "") + " ";
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2br(text: string): string {
  return esc(text).replace(/\n/g, "<br/>");
}

// ── Shared style constants ────────────────────────────────────────────────────

// 正式報告版配色：白卡 + 極淺底，文字夠深、對比清楚，適合 Gmail 預覽與列印。
// 重點：內文一律深色實心字，不放灰紫低對比字、不靠 opacity。
const S = {
  bg:          "#f6f5fb",   // 頁面底：極淺灰紫，襯出白色卡片
  text:        "#1f2433",   // 主要內文：深色高對比
  textDim:     "#5f6275",   // 次要文字（仍清楚可讀）
  textFaint:   "#6e6982",   // 日期 / 註腳（避免太淡，不用 #aaa）
  gold:        "#8a6a20",   // section 小標（金棕，白底上清楚）
  purple:      "#5b47b0",   // 按鈕底 / 紫色小標
  title:       "#2d2557",   // 標題（深紫）
  purpleBg:    "#f1eefb",   // accent 卡片底（淡紫，但文字仍用深色）
  purpleBorder:"#d8cef0",
  cardBg:      "#ffffff",   // 一般卡片：純白
  cardBorder:  "#e3e0ef",
  divider:     "#e3e0ef",
  font:        "'Helvetica Neue',Arial,sans-serif",
};

function sectionCard(label: string, icon: string, content: string, accent = false): string {
  const bg     = accent ? S.purpleBg  : S.cardBg;
  const border = accent ? S.purpleBorder : S.cardBorder;
  return `
    <div class="card" style="background:${bg};border:1px solid ${border};border-radius:12px;padding:15px 18px;margin-bottom:12px;break-inside:avoid;page-break-inside:avoid;">
      <p style="font-size:11px;letter-spacing:0.18em;color:${S.gold};margin:0 0 8px;text-transform:uppercase;font-weight:600;">${icon} ${esc(label)}</p>
      <p style="font-size:14.5px;line-height:1.8;color:${S.text};margin:0;">${nl2br(content)}</p>
    </div>`;
}

function signBadge(label: string, sign: string | null | undefined, color: string): string {
  const value = sign ? `${sym(sign)}${sign}` : "尚未提供";
  const valueColor = sign ? color : S.textFaint;
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid ${S.divider};">
      <span style="font-size:14px;color:${S.textDim};">${esc(label)}</span>
      <span style="font-size:15px;font-weight:600;color:${valueColor};">${esc(value)}</span>
    </div>`;
}

// 表格儲存格防呆：空值 / undefined / null / NaN 一律顯示「—」，不外洩假資料。
function cell(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v || /undefined|null|NaN/i.test(v)) return "—";
  return esc(v);
}

/** 完整星盤資料表（僅 result.planets 存在時顯示；依固定行星順序排列） */
function buildChartTable(planets: AstroEmailPlanet[] | null | undefined): string {
  if (!planets || planets.length === 0) return "";
  const byKey = new Map(planets.filter((p) => p.key).map((p) => [p.key as string, p]));
  const rows = PLANET_ORDER
    .map((key) => byKey.get(key))
    .filter((p): p is AstroEmailPlanet => !!p)
    .map((p) => `
      <tr>
        <td style="padding:9px 10px;border-bottom:1px solid ${S.divider};font-weight:600;color:${S.text};white-space:nowrap;">${cell(p.label)}</td>
        <td style="padding:9px 10px;border-bottom:1px solid ${S.divider};color:${S.textDim};white-space:nowrap;">${cell(p.degreeText)}</td>
        <td style="padding:9px 10px;border-bottom:1px solid ${S.divider};color:${S.textDim};white-space:nowrap;">${cell(p.houseText)}</td>
      </tr>`)
    .join("");
  if (!rows) return "";
  return `
    <div class="card" style="background:${S.cardBg};border:1px solid ${S.cardBorder};border-radius:12px;padding:15px 18px;margin-bottom:12px;break-inside:avoid;page-break-inside:avoid;">
      <p style="font-size:11px;letter-spacing:0.18em;color:${S.gold};margin:0 0 4px;text-transform:uppercase;font-weight:600;">✦ 完整星盤資料表</p>
      <p style="font-size:12px;color:${S.textFaint};margin:0 0 12px;">十大行星與上升的星座、度數與宮位（Whole Sign 宮位制）</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:6px 10px;border-bottom:2px solid ${S.cardBorder};font-size:12px;color:${S.textFaint};font-weight:600;">星體</th>
            <th style="text-align:left;padding:6px 10px;border-bottom:2px solid ${S.cardBorder};font-size:12px;color:${S.textFaint};font-weight:600;">星座度數</th>
            <th style="text-align:left;padding:6px 10px;border-bottom:2px solid ${S.cardBorder};font-size:12px;color:${S.textFaint};font-weight:600;">落入宮位</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function buildAstroEmailHtml(payload: AstroEmailPayload, dateStr: string, siteUrl: string): string {
  const {
    sunSign, moonSign, risingSign, venusSign,
    sunCoreText, moonInnerText, risingOuterText, venusLoveText,
    whisper, advice,
    careerWealthText, loveRelationshipText, yearlyFortuneText, soulLessonText,
    planets,
    mercurySign, marsSign, jupiterSign, saturnSign,
    mercuryText, marsText, jupiterText, saturnText,
    outerPlanetText, fullChartIntegrationText,
    essenceCards, innerTensionText,
  } = payload;

  const signCard = `
    <div class="card" style="background:${S.cardBg};border:1px solid ${S.cardBorder};border-radius:12px;padding:15px 18px;margin-bottom:12px;break-inside:avoid;page-break-inside:avoid;">
      <p style="font-size:11px;letter-spacing:0.18em;color:${S.gold};margin:0 0 8px;text-transform:uppercase;font-weight:600;">✦ 星盤摘要</p>
      ${signBadge("☀ 太陽星座", sunSign ?? null, "#b8860b")}
      ${signBadge("🌙 月亮星座", moonSign, "#6f5fc0")}
      ${signBadge("⬆ 上升星座", risingSign, "#1f9e6e")}
      ${venusSign ? signBadge("♀ 金星星座", venusSign, "#a85ab0") : ""}
    </div>`;

  // 小標題分隔（只在底下至少有一個區塊時顯示）
  const divider = (label: string, show: boolean) => show ? `
    <div style="border-top:1px solid ${S.divider};margin:18px 0 12px;">
      <p style="font-size:11px;letter-spacing:0.24em;color:${S.gold};margin:14px 0 0;text-transform:uppercase;font-weight:600;">${esc(label)}</p>
    </div>` : "";

  // 主打卡：把整張星盤合成一個你（紫底，視覺權重最高）
  const heroCard = fullChartIntegrationText ? `
    <div class="card" style="background:${S.purpleBg};border:1px solid ${S.purpleBorder};border-radius:12px;padding:16px 18px;margin-bottom:12px;break-inside:avoid;page-break-inside:avoid;">
      <p style="font-size:11px;letter-spacing:0.18em;color:${S.purple};margin:0 0 8px;text-transform:uppercase;font-weight:700;">✦ 把整張星盤合成一個你</p>
      <p style="font-size:14.5px;line-height:1.85;color:${S.text};margin:0;">${nl2br(fullChartIntegrationText)}</p>
    </div>` : "";

  // 付費限定精華卡
  const essence = (essenceCards ?? []).filter((c) => c && c.title && c.body);
  const essenceBlock = essence.length
    ? essence.map((c) => sectionCard(c.title as string, c.icon ?? "✦", c.body as string)).join("")
    : "";

  const hasCore = !!(sunCoreText || moonInnerText || risingOuterText || venusLoveText);
  const hasPaidPlanets = !!(mercuryText || marsText || jupiterText || saturnText || outerPlanetText);
  const hasLife = !!(loveRelationshipText || innerTensionText || careerWealthText || yearlyFortuneText || soulLessonText || whisper || advice);

  const cosmicReminder = (whisper || advice) ? `
    <div class="card" style="background:${S.purpleBg};border:1px solid ${S.purpleBorder};border-radius:12px;padding:15px 18px;margin-bottom:12px;break-inside:avoid;page-break-inside:avoid;">
      <p style="font-size:11px;letter-spacing:0.18em;color:${S.purple};margin:0 0 8px;text-transform:uppercase;font-weight:600;">🌌 給你的宇宙提醒</p>
      ${whisper ? `<p style="font-size:14.5px;line-height:1.8;color:${S.text};margin:0;">${nl2br(whisper)}</p>` : ""}
      ${advice ? `<p style="font-size:14px;line-height:1.8;color:${S.textDim};margin:10px 0 0;padding-top:10px;border-top:1px solid ${S.divider};">${nl2br(advice)}</p>` : ""}
    </div>` : "";

  const sections = [
    // 2. 星盤摘要
    signCard,

    // 3. 主打：把整張星盤合成一個你（前段）
    heroCard,

    // 4. 付費限定精華卡
    divider("為你而寫的重點", essence.length > 0),
    essenceBlock,

    // 5. 核心四星體深度解析
    divider("核心四星體深度解析", hasCore),
    sunCoreText ? sectionCard(`太陽｜核心本質${sunSign ? `・${sunSign}` : ""}`, "☀", sunCoreText) : "",
    moonSign && moonInnerText ? sectionCard(`月亮｜內在情感・${moonSign}`, "🌙", moonInnerText) : "",
    risingSign && risingOuterText ? sectionCard(`上升｜外在印象・${risingSign}`, "⬆", risingOuterText) : "",
    venusSign && venusLoveText ? sectionCard(`金星｜感情模式・${venusSign}`, "♀", venusLoveText) : "",

    // 6. 付費限定行星深度解析
    divider("付費限定行星深度解析", hasPaidPlanets),
    mercuryText ? sectionCard(`水星｜你的溝通與思考模式${mercurySign ? `・${mercurySign}` : ""}`, "☿", mercuryText) : "",
    marsText ? sectionCard(`火星｜你的行動力與衝突模式${marsSign ? `・${marsSign}` : ""}`, "♂", marsText) : "",
    jupiterText ? sectionCard(`木星｜你的成長與幸運方向${jupiterSign ? `・${jupiterSign}` : ""}`, "♃", jupiterText) : "",
    saturnText ? sectionCard(`土星｜你的課題與責任感${saturnSign ? `・${saturnSign}` : ""}`, "♄", saturnText) : "",
    outerPlanetText ? sectionCard("外行星特質參考（世代特質）", "♅", outerPlanetText) : "",

    // 7. 人生面向延伸
    divider("人生面向延伸", hasLife),
    loveRelationshipText ? sectionCard("感情與人際模式", "❤️", loveRelationshipText) : "",
    innerTensionText ? sectionCard("你的內在拉扯", "🌗", innerTensionText) : "",
    careerWealthText ? sectionCard("職涯天賦與財富傾向", "💰", careerWealthText) : "",
    yearlyFortuneText ? sectionCard("近期能量提醒", "🌙", yearlyFortuneText) : "",
    soulLessonText ? sectionCard("靈魂課題與人生方向", "✨", soulLessonText) : "",
    cosmicReminder,

    // 8. 完整星盤資料表（移到後段）
    divider("完整星盤資料表", !!(planets && planets.length > 0)),
    buildChartTable(planets),
  ].join("");

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>你的完整星盤人格解析｜Universe Whisper</title>
  <style>
    @media print {
      body { margin: 0; background: #ffffff; }
      .card { break-inside: avoid; page-break-inside: avoid; }
    }
  </style>
</head>
<body style="background:${S.bg};color:${S.text};font-family:${S.font};margin:0;padding:0;">
  <div style="max-width:640px;margin:0 auto;padding:24px 20px;">
    <p style="font-size:11px;letter-spacing:0.28em;color:${S.gold};text-transform:uppercase;margin:0 0 12px;font-weight:600;">
      宇宙偷偷話 · Universe Whisper
    </p>
    <h1 style="font-size:23px;font-weight:700;color:${S.title};margin:0 0 6px;">
      你的完整星盤人格解析
    </h1>
    <p style="font-size:13px;line-height:1.7;color:${S.textDim};margin:0 0 4px;">
      包含太陽、月亮、上升、金星四核心、完整星盤資料、感情模式、人際盲點、職涯天賦與行動建議。
    </p>
    <p style="font-size:12px;color:${S.textFaint};margin:0 0 18px;">${dateStr}</p>

    ${sections}

    <div class="card" style="margin-top:18px;padding:15px 18px;background:${S.cardBg};border:1px solid ${S.cardBorder};border-radius:12px;break-inside:avoid;page-break-inside:avoid;">
      <p style="font-size:13.5px;line-height:1.85;color:${S.text};margin:0;">
        這封信就是你的完整星盤人格解析保存版，建議妥善保存。
      </p>
      <p style="font-size:13px;line-height:1.85;color:${S.textDim};margin:8px 0 0;">
        若想再次使用 Universe Whisper，可回到官網重新測算。
      </p>
    </div>

    <div style="text-align:center;margin-top:16px;">
      <a href="${esc(siteUrl)}/astro-profile"
         style="display:inline-block;background:${S.purple};color:#fff;text-decoration:none;padding:12px 30px;border-radius:100px;font-size:14px;font-weight:600;letter-spacing:0.04em;">
        前往 Universe Whisper 官網
      </a>
    </div>

    <p style="margin-top:18px;font-size:12px;color:${S.textFaint};text-align:center;line-height:1.8;">
      宇宙偷偷話 · Universe Whisper<br/>
      此封信件由系統自動發送，請勿直接回覆。
    </p>
  </div>
</body>
</html>`;
}

function buildAstroEmailText(payload: AstroEmailPayload, dateStr: string, siteUrl: string): string {
  const { sunSign, moonSign, risingSign, venusSign,
    sunCoreText, moonInnerText, risingOuterText, venusLoveText, whisper, advice,
    careerWealthText, loveRelationshipText, yearlyFortuneText, soulLessonText,
    planets,
    mercurySign, marsSign, jupiterSign, saturnSign,
    mercuryText, marsText, jupiterText, saturnText,
    outerPlanetText, fullChartIntegrationText,
    essenceCards, innerTensionText,
  } = payload;
  const D = "━━━━━━━━━━━━━━━━";
  const txtCell = (v: string | null | undefined): string => {
    const s = (v ?? "").trim();
    return (!s || /undefined|null|NaN/i.test(s)) ? "—" : s;
  };
  const lines = [
    "宇宙偷偷話 · Universe Whisper",
    `你的完整星盤人格解析 | ${dateStr}`,
    "包含太陽、月亮、上升、金星四核心、完整星盤資料、感情模式、人際盲點、職涯天賦與行動建議。",
    "", D, "", "【星盤摘要】",
    `☀ 太陽：${sym(sunSign)}${sunSign ?? "未知"}`,
    `🌙 月亮：${moonSign ? `${sym(moonSign)}${moonSign}` : "尚未提供"}`,
    `⬆ 上升：${risingSign ? `${sym(risingSign)}${risingSign}` : "尚未提供"}`,
    ...(venusSign ? [`♀ 金星：${sym(venusSign)}${venusSign}`] : []),
  ];

  // 主打：把整張星盤合成一個你（前段）
  if (fullChartIntegrationText) {
    lines.push("", D, "", "✦ 把整張星盤合成一個你", fullChartIntegrationText, "");
  }

  // 付費限定精華卡
  const essence = (essenceCards ?? []).filter((c) => c && c.title && c.body);
  if (essence.length) {
    lines.push("", D, "", "【為你而寫的重點】", "");
    for (const c of essence) lines.push(`${c.icon ?? "✦"} ${c.title}`, c.body as string, "");
  }

  // 核心四星體深度解析
  if (sunCoreText || moonInnerText || risingOuterText || venusLoveText) {
    lines.push("", D, "", "【核心四星體深度解析】", "");
    if (sunCoreText) lines.push(`☀ 太陽｜核心本質${sunSign ? `・${sunSign}` : ""}`, sunCoreText, "");
    if (moonSign && moonInnerText) lines.push(`🌙 月亮｜內在情感・${moonSign}`, moonInnerText, "");
    if (risingSign && risingOuterText) lines.push(`⬆ 上升｜外在印象・${risingSign}`, risingOuterText, "");
    if (venusSign && venusLoveText) lines.push(`♀ 金星｜感情模式・${venusSign}`, venusLoveText, "");
  }

  // 付費限定行星深度解析
  if (mercuryText || marsText || jupiterText || saturnText || outerPlanetText) {
    lines.push("", D, "", "【付費限定行星深度解析】", "");
    if (mercuryText) lines.push(`☿ 水星｜你的溝通與思考模式${mercurySign ? `・${mercurySign}` : ""}`, mercuryText, "");
    if (marsText)    lines.push(`♂ 火星｜你的行動力與衝突模式${marsSign ? `・${marsSign}` : ""}`, marsText, "");
    if (jupiterText) lines.push(`♃ 木星｜你的成長與幸運方向${jupiterSign ? `・${jupiterSign}` : ""}`, jupiterText, "");
    if (saturnText)  lines.push(`♄ 土星｜你的課題與責任感${saturnSign ? `・${saturnSign}` : ""}`, saturnText, "");
    if (outerPlanetText) lines.push("♅ 外行星特質參考（世代特質）", outerPlanetText, "");
  }

  // 人生面向延伸
  if (loveRelationshipText || innerTensionText || careerWealthText || yearlyFortuneText || soulLessonText || whisper || advice) {
    lines.push("", D, "", "【人生面向延伸】", "");
    if (loveRelationshipText) lines.push("❤️ 感情與人際模式", loveRelationshipText, "");
    if (innerTensionText)    lines.push("🌗 你的內在拉扯", innerTensionText, "");
    if (careerWealthText)    lines.push("💰 職涯天賦與財富傾向", careerWealthText, "");
    if (yearlyFortuneText)   lines.push("🌙 近期能量提醒", yearlyFortuneText, "");
    if (soulLessonText)      lines.push("✨ 靈魂課題與人生方向", soulLessonText, "");
    if (whisper) lines.push("🌌 給你的宇宙提醒", whisper, "");
    if (advice)  lines.push(advice, "");
  }

  // 完整星盤資料表（移到後段）
  if (planets && planets.length > 0) {
    const byKey = new Map(planets.filter((p) => p.key).map((p) => [p.key as string, p]));
    const rows = PLANET_ORDER
      .map((key) => byKey.get(key))
      .filter((p): p is AstroEmailPlanet => !!p)
      .map((p) => `${txtCell(p.label)}｜${txtCell(p.degreeText)}｜${txtCell(p.houseText)}`);
    if (rows.length) {
      lines.push("", D, "", "✦ 完整星盤資料表（星體｜星座度數｜落入宮位）", ...rows);
    }
  }

  lines.push(
    "", D, "",
    "這封信就是你的完整星盤人格解析保存版，建議妥善保存。",
    "若想再次使用 Universe Whisper，可回到官網重新測算：",
    `${siteUrl}/astro-profile`,
    "",
    "宇宙偷偷話 Universe Whisper",
    "此封信件由系統自動發送，請勿直接回覆。",
  );
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const apiKey    = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM || "宇宙偷偷話 <noreply@universewhisper.com>";

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "EMAIL_NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const body = await req.json().catch(() => ({})) as AstroEmailPayload;
    const { email } = body;

    if (!email || !validateEmail(email)) {
      return NextResponse.json({ ok: false, error: "INVALID_EMAIL" }, { status: 400 });
    }
    if (!body.sunSign) {
      return NextResponse.json({ ok: false, error: "MISSING_DATA" }, { status: 400 });
    }

    const siteUrl = (
      body.siteUrl ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://universe-whisper.vercel.app"
    ).replace(/\/$/, "");

    const dateStr = new Date().toLocaleDateString("zh-TW", {
      year: "numeric", month: "long", day: "numeric",
    });

    const html = buildAstroEmailHtml(body, dateStr, siteUrl);
    const text = buildAstroEmailText(body, dateStr, siteUrl);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    emailFrom,
        to:      [email],
        subject: "宇宙偷偷話｜你的完整星盤人格解析",
        html,
        text,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text().catch(() => "");
      console.error("[astro-profile/send-email] Resend error:", resendRes.status, errText);
      return NextResponse.json({ ok: false, error: "SEND_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[astro-profile/send-email] error:", err);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
