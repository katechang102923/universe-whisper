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

function getCoreReading(payload: SendTarotPayload) {
  const source = payload.premiumReading || payload.freeReading || "今晚的訊息已經為你收好，回到網站可以慢慢看。";
  return source.replace(/\s+/g, " ").slice(0, 180);
}

function buildLineMessage(payload: SendTarotPayload, resultUrl: string) {
  const cards = Array.isArray(payload.cards) ? payload.cards : [];
  const cardText = cards.length ? getCardText(cards) : "今晚抽到的牌已為你保存。";

  return `今晚宇宙給你的訊息

抽到的牌
${cardText}

簡短核心訊息
${getCoreReading(payload)}

查看完整訊息
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
