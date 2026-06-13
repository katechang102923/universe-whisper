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
  siteUrl?: string;
};

type AstroEmailPlanet = {
  key?: string;
  label?: string;
  degreeText?: string | null;
  houseText?: string | null;
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

// 白底、乾淨、像正式報告的配色（取代舊版深色星空，避免列印灰字偏淡與空白頁）。
const S = {
  bg:          "#ffffff",
  text:        "#2a2438",   // 內文：夠深，列印清楚
  textDim:     "#4d4663",
  textFaint:   "#7b7392",
  gold:        "#9c7d28",   // 白底上仍清楚的金棕色
  purple:      "#5f51a6",
  purpleBg:    "#f5f2fc",
  purpleBorder:"#ddd3f0",
  cardBg:      "#faf9fd",
  cardBorder:  "#e7e2f1",
  divider:     "#e7e2f1",
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
    overallSummary, sunCoreText, moonInnerText, risingOuterText, venusLoveText,
    whisper, advice,
    careerWealthText, loveRelationshipText, yearlyFortuneText, soulLessonText,
    planets,
    mercurySign, marsSign, jupiterSign, saturnSign,
    mercuryText, marsText, jupiterText, saturnText,
    outerPlanetText, fullChartIntegrationText,
  } = payload;

  const signCard = `
    <div class="card" style="background:${S.cardBg};border:1px solid ${S.cardBorder};border-radius:12px;padding:15px 18px;margin-bottom:12px;break-inside:avoid;page-break-inside:avoid;">
      <p style="font-size:11px;letter-spacing:0.18em;color:${S.gold};margin:0 0 8px;text-transform:uppercase;font-weight:600;">✦ 三重星座摘要</p>
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

  const hasPaidPlanets = !!(mercuryText || marsText || jupiterText || saturnText || outerPlanetText || fullChartIntegrationText);
  const hasExtended = careerWealthText || loveRelationshipText || yearlyFortuneText || soulLessonText;

  const sections = [
    // 1. 三重星座摘要 + 2. 完整星盤資料表
    signCard,
    buildChartTable(planets),

    // 3. 三重星座核心解析
    divider("三重星座核心解析", !!(overallSummary || sunCoreText || moonInnerText || risingOuterText)),
    overallSummary ? sectionCard("三重星座整合輪廓", "✦", overallSummary, true) : "",
    sunCoreText ? sectionCard(`太陽核心解析｜${sunSign ?? "太陽"}`, "☀", sunCoreText) : "",
    moonSign && moonInnerText ? sectionCard(`月亮情緒解析｜${moonSign}`, "🌙", moonInnerText) : "",
    risingSign && risingOuterText ? sectionCard(`上升外在印象｜${risingSign}`, "⬆", risingOuterText) : "",

    // 4. 金星感情模式
    venusSign && venusLoveText ? sectionCard(`金星感情模式｜${venusSign}`, "♀", venusLoveText, true) : "",

    // 5. 付費深度星體區塊
    divider("完整星盤深度解析", hasPaidPlanets),
    mercuryText ? sectionCard(`水星 · 溝通與思考模式${mercurySign ? `｜${mercurySign}` : ""}`, "☿", mercuryText) : "",
    marsText ? sectionCard(`火星 · 行動力與衝突模式${marsSign ? `｜${marsSign}` : ""}`, "♂", marsText) : "",
    jupiterText ? sectionCard(`木星 · 成長與幸運方向${jupiterSign ? `｜${jupiterSign}` : ""}`, "♃", jupiterText) : "",
    saturnText ? sectionCard(`土星 · 課題與責任感${saturnSign ? `｜${saturnSign}` : ""}`, "♄", saturnText) : "",
    outerPlanetText ? sectionCard("外行星特質參考（世代特質）", "♅", outerPlanetText) : "",
    fullChartIntegrationText ? sectionCard("完整星盤整合分析", "✦", fullChartIntegrationText, true) : "",

    // 宇宙偷偷話 / 提醒
    whisper ? sectionCard("宇宙偷偷話", "🌌", whisper) : "",
    advice ? sectionCard("給你的提醒", "🌿", advice) : "",

    // 6. 延伸深度解析
    divider("延伸深度解析", !!hasExtended),
    careerWealthText ? sectionCard("事業與財富天賦報告", "💰", careerWealthText) : "",
    loveRelationshipText ? sectionCard("情感正緣與人際模式分析", "❤️", loveRelationshipText) : "",
    yearlyFortuneText ? sectionCard("未來半年的能量提醒", "🌙", yearlyFortuneText) : "",
    soulLessonText ? sectionCard("靈魂課題與人生方向", "✨", soulLessonText) : "",
  ].join("");

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>你的完整星盤深度解析｜Universe Whisper</title>
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
    <h1 style="font-size:23px;font-weight:700;color:${S.text};margin:0 0 6px;">
      你的完整星盤深度解析
    </h1>
    <p style="font-size:13px;line-height:1.7;color:${S.textDim};margin:0 0 4px;">
      包含三重星座、完整星盤資料、感情模式、人際盲點、職涯天賦與行動建議。
    </p>
    <p style="font-size:12px;color:${S.textFaint};margin:0 0 18px;">${dateStr}</p>

    ${sections}

    <div style="text-align:center;margin-top:20px;padding-top:18px;border-top:1px solid ${S.divider};">
      <a href="${esc(siteUrl)}/astro-profile"
         style="display:inline-block;background:${S.purple};color:#fff;text-decoration:none;padding:12px 30px;border-radius:100px;font-size:14px;font-weight:600;letter-spacing:0.04em;">
        重新查看解析
      </a>
    </div>

    <p style="margin-top:20px;font-size:12px;color:${S.textFaint};text-align:center;line-height:1.8;">
      宇宙偷偷話 · Universe Whisper<br/>
      此封信件由系統自動發送，請勿直接回覆。
    </p>
  </div>
</body>
</html>`;
}

function buildAstroEmailText(payload: AstroEmailPayload, dateStr: string, siteUrl: string): string {
  const { sunSign, moonSign, risingSign, venusSign,
    overallSummary, sunCoreText, moonInnerText, risingOuterText, venusLoveText, whisper, advice,
    careerWealthText, loveRelationshipText, yearlyFortuneText, soulLessonText,
    planets,
    mercurySign, marsSign, jupiterSign, saturnSign,
    mercuryText, marsText, jupiterText, saturnText,
    outerPlanetText, fullChartIntegrationText,
  } = payload;
  const D = "━━━━━━━━━━━━━━━━";
  const txtCell = (v: string | null | undefined): string => {
    const s = (v ?? "").trim();
    return (!s || /undefined|null|NaN/i.test(s)) ? "—" : s;
  };
  const lines = [
    "宇宙偷偷話 · Universe Whisper",
    `你的完整星盤深度解析 | ${dateStr}`,
    "包含三重星座、完整星盤資料、感情模式、人際盲點、職涯天賦與行動建議。",
    "", D, "",
    `☀ 太陽：${sym(sunSign)}${sunSign ?? "未知"}`,
    `🌙 月亮：${moonSign ? `${sym(moonSign)}${moonSign}` : "尚未提供"}`,
    `⬆ 上升：${risingSign ? `${sym(risingSign)}${risingSign}` : "尚未提供"}`,
    ...(venusSign ? [`♀ 金星：${sym(venusSign)}${venusSign}`] : []),
  ];

  // 完整星盤資料表（自動模式才有）
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

  lines.push("", D, "");
  if (overallSummary) lines.push("✦ 三重星座整合輪廓", overallSummary, "");
  if (sunCoreText) lines.push(`☀ 太陽核心解析｜${sunSign ?? "太陽"}`, sunCoreText, "");
  if (moonSign && moonInnerText) lines.push(`🌙 月亮情緒解析｜${moonSign}`, moonInnerText, "");
  if (risingSign && risingOuterText) lines.push(`⬆ 上升外在印象｜${risingSign}`, risingOuterText, "");
  if (venusSign && venusLoveText) lines.push(`♀ 金星感情模式｜${venusSign}`, venusLoveText, "");

  // 付費深度星體區塊
  const hasPaidPlanets = mercuryText || marsText || jupiterText || saturnText || outerPlanetText || fullChartIntegrationText;
  if (hasPaidPlanets) {
    lines.push("", D, "", "【完整星盤深度解析】", "");
    if (mercuryText) lines.push(`☿ 水星 · 溝通與思考模式${mercurySign ? `｜${mercurySign}` : ""}`, mercuryText, "");
    if (marsText)    lines.push(`♂ 火星 · 行動力與衝突模式${marsSign ? `｜${marsSign}` : ""}`, marsText, "");
    if (jupiterText) lines.push(`♃ 木星 · 成長與幸運方向${jupiterSign ? `｜${jupiterSign}` : ""}`, jupiterText, "");
    if (saturnText)  lines.push(`♄ 土星 · 課題與責任感${saturnSign ? `｜${saturnSign}` : ""}`, saturnText, "");
    if (outerPlanetText) lines.push("♅ 外行星特質參考（世代特質）", outerPlanetText, "");
    if (fullChartIntegrationText) lines.push("✦ 完整星盤整合分析", fullChartIntegrationText, "");
  }

  if (whisper) lines.push("🌌 宇宙偷偷話", whisper, "");
  if (advice) lines.push("🌿 給你的提醒", advice, "");

  // 延伸深度解析四章節
  const hasExtended = careerWealthText || loveRelationshipText || yearlyFortuneText || soulLessonText;
  if (hasExtended) {
    lines.push("", D, "", "【延伸深度解析】", "");
    if (careerWealthText)    lines.push("💰 事業與財富天賦報告", careerWealthText, "");
    if (loveRelationshipText) lines.push("❤️ 情感正緣與人際模式分析", loveRelationshipText, "");
    if (yearlyFortuneText)   lines.push("🌙 未來半年的能量提醒", yearlyFortuneText, "");
    if (soulLessonText)      lines.push("✨ 靈魂課題與人生方向", soulLessonText, "");
  }

  lines.push(D, "", `重新查看解析：${siteUrl}/astro-profile`, "", "宇宙偷偷話 Universe Whisper", "此封信件由系統自動發送，請勿直接回覆。");
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
        subject: "宇宙偷偷話｜你的完整星盤深度解析",
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
