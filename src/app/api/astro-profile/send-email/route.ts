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
  siteUrl?: string;
};

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

const S = {
  bg:          "#0d0d1a",
  text:        "#e8e0f0",
  textDim:     "#b4a8d0",
  textFaint:   "#7a6fa0",
  gold:        "#d8bd70",
  purple:      "#9b8fd4",
  purpleBg:    "rgba(155,143,212,0.09)",
  purpleBorder:"rgba(155,143,212,0.22)",
  cardBg:      "rgba(155,143,212,0.07)",
  cardBorder:  "rgba(155,143,212,0.16)",
  divider:     "rgba(255,255,255,0.08)",
  font:        "'Helvetica Neue',Arial,sans-serif",
};

function sectionCard(label: string, icon: string, content: string, accent = false): string {
  const bg     = accent ? S.purpleBg  : S.cardBg;
  const border = accent ? S.purpleBorder : S.cardBorder;
  return `
    <div style="background:${bg};border:1px solid ${border};border-radius:14px;padding:20px 22px;margin-bottom:18px;">
      <p style="font-size:11px;letter-spacing:0.22em;color:${S.gold};margin:0 0 10px;text-transform:uppercase;">${icon} ${esc(label)}</p>
      <p style="font-size:15px;line-height:1.85;color:${S.text};margin:0;">${nl2br(content)}</p>
    </div>`;
}

function signBadge(label: string, sign: string | null | undefined, color: string): string {
  const value = sign ? `${sym(sign)}${sign}` : "尚未提供";
  const valueColor = sign ? color : S.textFaint;
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid ${S.divider};">
      <span style="font-size:14px;color:${S.textDim};">${esc(label)}</span>
      <span style="font-size:15px;font-weight:600;color:${valueColor};">${esc(value)}</span>
    </div>`;
}

function buildAstroEmailHtml(payload: AstroEmailPayload, dateStr: string, siteUrl: string): string {
  const {
    sunSign, moonSign, risingSign, venusSign,
    overallSummary, sunCoreText, moonInnerText, risingOuterText, venusLoveText,
    whisper, advice,
  } = payload;

  const signCard = `
    <div style="background:${S.cardBg};border:1px solid ${S.cardBorder};border-radius:14px;padding:20px 22px;margin-bottom:18px;">
      <p style="font-size:11px;letter-spacing:0.22em;color:${S.gold};margin:0 0 12px;text-transform:uppercase;">✦ 三重星座</p>
      ${signBadge("☀ 太陽星座", sunSign ?? null, "#f7d987")}
      ${signBadge("🌙 月亮星座", moonSign, "#b8a0f0")}
      ${signBadge("⬆ 上升星座", risingSign, "#88d8b0")}
      ${venusSign ? signBadge("♀ 金星星座", venusSign, "#c9a0dc") : ""}
    </div>`;

  const sections = [
    signCard,
    overallSummary ? sectionCard("三重星座整體解析", "✦", overallSummary, true) : "",
    sunCoreText ? sectionCard(`核心本質｜${sunSign ?? "太陽"}`, "☀", sunCoreText) : "",
    moonSign && moonInnerText ? sectionCard(`內在情感｜${moonSign}`, "🌙", moonInnerText) : "",
    risingSign && risingOuterText ? sectionCard(`外在展現｜${risingSign}`, "⬆", risingOuterText) : "",
    venusSign && venusLoveText ? sectionCard(`感情吸引力｜${venusSign}`, "♀", venusLoveText) : "",
    whisper ? sectionCard("宇宙偷偷話", "🌌", whisper) : "",
    advice ? sectionCard("給你的提醒", "🌿", advice) : "",
  ].join("");

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>你的三重星座完整解析｜Universe Whisper</title>
</head>
<body style="background:${S.bg};color:${S.text};font-family:${S.font};margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <p style="font-size:11px;letter-spacing:0.3em;color:${S.gold};text-transform:uppercase;margin:0 0 20px;">
      宇宙偷偷話 · Universe Whisper
    </p>
    <h1 style="font-size:24px;font-weight:600;color:#f0eaff;margin:0 0 6px;">
      你的三重星座完整解析
    </h1>
    <p style="font-size:13px;color:${S.textFaint};margin:0 0 32px;">${dateStr}</p>

    ${sections}

    <div style="text-align:center;margin-top:32px;padding-top:24px;border-top:1px solid ${S.divider};">
      <a href="${esc(siteUrl)}/astro-profile"
         style="display:inline-block;background:${S.purple};color:#fff;text-decoration:none;padding:13px 32px;border-radius:100px;font-size:14px;font-weight:500;letter-spacing:0.04em;">
        重新查看解析
      </a>
    </div>

    <p style="margin-top:32px;font-size:12px;color:#3a3255;text-align:center;line-height:1.8;">
      宇宙偷偷話 · Universe Whisper<br/>
      此封信件由系統自動發送，請勿直接回覆。
    </p>
  </div>
</body>
</html>`;
}

function buildAstroEmailText(payload: AstroEmailPayload, dateStr: string, siteUrl: string): string {
  const { sunSign, moonSign, risingSign, venusSign,
    overallSummary, sunCoreText, moonInnerText, risingOuterText, venusLoveText, whisper, advice } = payload;
  const D = "━━━━━━━━━━━━━━━━";
  const lines = [
    "宇宙偷偷話 · Universe Whisper",
    `你的三重星座完整解析 | ${dateStr}`,
    "", D, "",
    `☀ 太陽：${sym(sunSign)}${sunSign ?? "未知"}`,
    `🌙 月亮：${moonSign ? `${sym(moonSign)}${moonSign}` : "尚未提供"}`,
    `⬆ 上升：${risingSign ? `${sym(risingSign)}${risingSign}` : "尚未提供"}`,
    ...(venusSign ? [`♀ 金星：${sym(venusSign)}${venusSign}`] : []),
    "", D, "",
  ];

  if (overallSummary) lines.push("✦ 整體解析", overallSummary, "");
  if (sunCoreText) lines.push(`☀ 核心本質｜${sunSign ?? "太陽"}`, sunCoreText, "");
  if (moonSign && moonInnerText) lines.push(`🌙 內在情感｜${moonSign}`, moonInnerText, "");
  if (risingSign && risingOuterText) lines.push(`⬆ 外在展現｜${risingSign}`, risingOuterText, "");
  if (venusSign && venusLoveText) lines.push(`♀ 感情吸引力｜${venusSign}`, venusLoveText, "");
  if (whisper) lines.push("🌌 宇宙偷偷話", whisper, "");
  if (advice) lines.push("🌿 給你的提醒", advice, "");

  lines.push(D, "", `重新查看解析：${siteUrl}/astro-profile`, "", "宇宙偷偷話 Universe Whisper");
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
        subject: "宇宙偷偷話｜你的三重星座完整解析",
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
