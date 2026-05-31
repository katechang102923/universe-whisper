import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

type LineTarotCard = {
  name?: string;
  orientationLabel?: string;
  position?: string;
};

type SendTarotPayload = {
  cards?: LineTarotCard[];
  topic?: string;
  question?: string;
  freeReading?: string;
  premiumReading?: string;
  resultUrl?: string;
};

function getBaseUrl(request: Request) {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
}

function getCardText(cards: LineTarotCard[]) {
  return cards
    .map((card, index) => {
      const position = card.position ? `${card.position}｜` : "";
      const orientation = card.orientationLabel ? `（${card.orientationLabel}）` : "";
      return `${index + 1}. ${position}${card.name ?? "塔羅牌"}${orientation}`;
    })
    .join("\n");
}

function getOverallAnswer(readingText: string): string {
  const m = readingText.match(/整體答案[：:]\s*\n?([\s\S]*?)(?:\n\n為什麼|$)/);
  if (m?.[1]) return m[1].trim().slice(0, 180);
  // 若找不到，取前 180 字
  return readingText.replace(/\s+/g, " ").slice(0, 180);
}

function getCardOneLiner(readingText: string, cardIndex: number): string {
  const mSummary = readingText.match(
    new RegExp(`🃏 第${cardIndex + 1}張牌[\\s\\S]*?摘要：([^\n]+)`)
  );
  if (mSummary?.[1]) return mSummary[1].trim().slice(0, 50);
  const mRepresent = readingText.match(
    new RegExp(`🃏 第${cardIndex + 1}張牌[\\s\\S]*?這張牌代表：([^\n]+)`)
  );
  return mRepresent?.[1]?.trim().slice(0, 50) ?? "";
}

function getActionSummary(readingText: string): string {
  const m = readingText.match(/🕯️ 3～7 天行動建議\s*\n+([\s\S]*?)(?:\n\n🌌|$)/);
  if (!m?.[1]) return "";
  return m[1].trim().split(/\n\n/).filter(Boolean)
    .slice(0, 3)
    .map(s => s.split("\n")[0]?.trim() ?? "")
    .filter(Boolean)
    .join("　")
    .slice(0, 120);
}

function getBlessing(readingText: string): string {
  const m = readingText.match(/💫 一句專屬祝福\s*\n+([\s\S]*?)(?:\n\n|$)/);
  return m?.[1]?.trim().slice(0, 50) ?? "";
}

function buildLineMessage(payload: SendTarotPayload, resultUrl: string) {
  const cards = Array.isArray(payload.cards) ? payload.cards : [];
  const cardText = cards.length ? getCardText(cards) : "今晚抽到的牌已為你保存。";
  const question = payload.question?.trim() || "你把問題放在心裡，宇宙也有聽見。";
  const reading = (payload.premiumReading || payload.freeReading || "").replace(/\*\*/g, "").trim();

  // 三張牌：使用緊湊格式
  if (cards.length === 3 && reading) {
    const overallAnswer = getOverallAnswer(reading);
    const cardLines = cards.map((card, i) => {
      const position = card.position ? `${card.position}｜` : "";
      const ori = card.orientationLabel ? `（${card.orientationLabel}）` : "";
      const oneLiner = getCardOneLiner(reading, i) || "這張牌的提醒在完整解讀裡。";
      return `${position}${card.name ?? `牌${i + 1}`}${ori}：\n${oneLiner}`;
    }).join("\n\n");
    const actionText = getActionSummary(reading);
    const blessing = getBlessing(reading);

    const parts = [
      `🌙 宇宙偷偷話｜塔羅訊息`,
      ``,
      `你的問題：\n${question}`,
      ``,
      `你抽到的牌：\n${cardText}`,
    ];
    if (overallAnswer) parts.push(``, `✨ 整體答案\n${overallAnswer}`);
    if (cardLines) parts.push(``, `🃏 三張牌提醒你\n${cardLines}`);
    if (actionText) parts.push(``, `🕯️ 接下來 3～7 天\n${actionText}`);
    if (blessing) parts.push(``, `💫 給你的祝福\n${blessing}`);
    parts.push(``, `🔮 完整解讀請回到網站查看：\n${resultUrl}`);
    return parts.join("\n");
  }

  // 單張牌或無法解析：使用簡短格式
  const core = reading
    ? reading.replace(/\s+/g, " ").slice(0, 150)
    : "今晚的訊息已經為你收好，回到網站可以慢慢看。";

  return `🌙 宇宙偷偷話｜塔羅訊息

你的問題：
${question}

你抽到的牌：
${cardText}

✨ 宇宙說
${core}

🔮 完整解讀請回到網站查看：
${resultUrl}`;
}

async function saveTarotResult(userId: string, payload: SendTarotPayload, resultId: string, deliveryStatus: string) {
  try {
    await getAdminDb().collection("tarot_logs").doc(resultId).set({
      lineUserId: userId,
      topic: payload.topic ?? "",
      question: payload.question ?? "",
      cards: Array.isArray(payload.cards) ? payload.cards : [],
      freeReading: payload.freeReading ?? "",
      premiumReading: payload.premiumReading ?? "",
      deliveryStatus,
      createdAt: FieldValue.serverTimestamp()
    });

    return true;
  } catch (error) {
    console.warn("Tarot result was not saved:", error);
    return false;
  }
}

async function pushLineMessage(userId: string, message: string) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!accessToken) {
    return { status: "simulated", ok: true };
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: "text", text: message }]
    })
  });

  return { status: response.ok ? "sent" : "prepared", ok: response.ok };
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("line_user_id")?.value;
  const baseUrl = getBaseUrl(request);

  if (!userId) {
    return NextResponse.json(
      {
        loginRequired: true,
        loginUrl: `/api/line/login/start?returnTo=${encodeURIComponent("/tarot?lineAction=send")}`
      },
      { status: 401 }
    );
  }

  const payload = (await request.json().catch(() => ({}))) as SendTarotPayload;
  const resultId = crypto.randomUUID();
  const resultUrl = payload.resultUrl || `${baseUrl}/tarot?result=${resultId}`;
  const message = buildLineMessage(payload, resultUrl);
  const pushResult = await pushLineMessage(userId, message);
  const saved = await saveTarotResult(userId, payload, resultId, pushResult.status);

  return NextResponse.json({
    ok: true,
    resultId,
    resultUrl,
    saved,
    deliveryStatus: pushResult.status,
    message
  });
}
