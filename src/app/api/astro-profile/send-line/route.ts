/**
 * POST /api/astro-profile/send-line
 * Sends astro-profile result to the user's LINE account.
 * Uses the same LINE push mechanism as tarot but with astro-profile specific formatting.
 * Does NOT modify tarot LINE formatter.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

type AstroLinePayload = {
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

function truncate(text: string | undefined, max: number): string {
  const t = (text ?? "").replace(/\*\*/g, "").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

function buildAstroLineMessage(payload: AstroLinePayload, siteUrl: string): string {
  const { sunSign, moonSign, risingSign, venusSign,
    overallSummary, sunCoreText, moonInnerText, risingOuterText, venusLoveText, whisper } = payload;

  const parts: string[] = [
    "🌙 宇宙偷偷話｜三重星座解析",
    "",
    "你的三重星座",
    `☀ 太陽：${sym(sunSign)}${sunSign ?? "未知"}`,
    `🌙 月亮：${moonSign ? `${sym(moonSign)}${moonSign}` : "尚未提供"}`,
    `⬆ 上升：${risingSign ? `${sym(risingSign)}${risingSign}` : "尚未提供"}`,
  ];

  if (venusSign) {
    parts.push(`♀ 金星：${sym(venusSign)}${venusSign}`);
  }

  parts.push("");

  if (overallSummary) {
    parts.push("✦ 整體摘要", truncate(overallSummary, 120), "");
  }

  if (sunCoreText) {
    parts.push(`☀ 核心本質｜${sunSign ?? "太陽"}`, truncate(sunCoreText, 100), "");
  }

  if (moonSign && moonInnerText) {
    parts.push(`🌙 內在情感｜${moonSign}`, truncate(moonInnerText, 100), "");
  }

  if (risingSign && risingOuterText) {
    parts.push(`⬆ 外在展現｜${risingSign}`, truncate(risingOuterText, 100), "");
  }

  if (venusSign && venusLoveText) {
    parts.push(`♀ 感情吸引力｜${venusSign}`, truncate(venusLoveText, 100), "");
  }

  if (whisper) {
    parts.push("🌌 宇宙偷偷話", truncate(whisper, 120), "");
  }

  parts.push(`📍 回到三重星座頁面：\n${siteUrl}/astro-profile`);
  parts.push("");
  parts.push("此 LINE 訊息為精簡摘要，完整內容請以當次網頁結果或 Email 完整版保存。");

  return parts.join("\n");
}

async function pushLineMessage(userId: string, message: string): Promise<{ ok: boolean }> {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) return { ok: true }; // dev mode: simulate

  const resp = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: "text", text: message }],
    }),
  });

  return { ok: resp.ok };
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("line_user_id")?.value;

  if (!userId) {
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
    return NextResponse.json(
      {
        loginRequired: true,
        loginUrl: `/api/line/login/start?returnTo=${encodeURIComponent("/astro-profile?lineAction=send")}`,
      },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as AstroLinePayload;
  const siteUrl = (
    body.siteUrl ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://universe-whisper.vercel.app"
  ).replace(/\/$/, "");

  const message = buildAstroLineMessage(body, siteUrl);
  const result = await pushLineMessage(userId, message);

  return NextResponse.json({ ok: result.ok });
}
