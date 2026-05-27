import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";

export type LineResultType = "tarot" | "daily" | "whisper";
export type LinePushStatus = "pending" | "sent" | "failed";

export type LineResultCard = {
  name?: string;
  nameEn?: string;
  nameZh?: string;
  suit?: string;
  orientation?: string;
  orientationLabel?: string;
  position?: string;
};

export type LineResultData = {
  type: LineResultType;
  question: string;
  cards: LineResultCard[];
  shortText: string;
  fullText: string;
  lineUserId?: string | null;
  lineDisplayName?: string | null;
  pushStatus: LinePushStatus;
  pushError?: string | null;
  resultUrl?: string;
};

export const LINE_RESULTS_COLLECTION = "lineResults";

export function getSiteUrl(request?: Request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (request ? new URL(request.url).origin : "http://localhost:3000")
  ).replace(/\/$/, "");
}

export function formatResultCards(cards: LineResultCard[]) {
  if (!cards.length) return "今晚抽到的牌已經替你收好了。";

  return cards
    .map((card, index) => {
      const position = card.position ? `${card.position}｜` : "";
      const orientation = card.orientationLabel ? `（${card.orientationLabel}）` : "";
      return `${index + 1}. ${position}${card.nameZh ?? card.name ?? "塔羅牌"}${orientation}`;
    })
    .join("\n");
}

function trimForLine(text: string, maxLength: number) {
  const normalized = text.replace(/\*\*/g, "").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 20)}\n...（回網站慢慢看完整訊息）` : normalized;
}

export function buildLineResultMessage(result: LineResultData, resultId: string, siteUrl: string) {
  const questionText = result.question?.trim() || "你把問題放在心裡，宇宙也有聽見。";
  const resultUrl = result.resultUrl || `${siteUrl}/tarot?result=${encodeURIComponent(resultId)}`;

  return `🌙 宇宙偷偷話｜完整解讀

你的問題：
${questionText}

你抽到的牌：
${formatResultCards(result.cards)}

✨ 宇宙訊息
${trimForLine(result.fullText || result.shortText || "今晚的訊息已經替你收好，可以回網站慢慢看。", 3600)}

——
想再問一次宇宙：
${resultUrl}`;
}

export async function pushLineTextMessage(lineUserId: string, message: string) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!accessToken) {
    console.error("[line] Missing LINE_CHANNEL_ACCESS_TOKEN.");
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured.");
  }

  console.info("[line/push] Sending push message", { hasAccessToken: Boolean(accessToken), lineUserId, messageLength: message.length });
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text: message }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("[line/push] LINE API error", { status: response.status, message: errorText });
    throw new Error(`LINE push failed: ${response.status} ${errorText}`);
  }

  console.info("[line/push] LINE API success", { status: response.status });
}

export async function pushResultToLine(resultId: string, lineUserId: string, siteUrl: string, displayName?: string | null) {
  const db = getAdminDb();
  const ref = db.collection(LINE_RESULTS_COLLECTION).doc(resultId);
  const snap = await ref.get();
  console.info("[line/push-result] Result lookup", { resultId, exists: snap.exists, lineUserId });

  if (!snap.exists) {
    throw new Error("Result not found.");
  }

  const result = snap.data() as LineResultData;
  const message = buildLineResultMessage(result, resultId, siteUrl);

  try {
    await pushLineTextMessage(lineUserId, message);
    await ref.set(
      {
        lineUserId,
        lineDisplayName: displayName ?? result.lineDisplayName ?? "",
        pushStatus: "sent",
        pushError: null,
        pushedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { ok: true as const, message };
  } catch (error) {
    const pushError = error instanceof Error ? error.message : "LINE push failed.";
    console.error("[line/push-result] Push failed", { resultId, lineUserId, pushError });
    await ref.set(
      {
        lineUserId,
        lineDisplayName: displayName ?? result.lineDisplayName ?? "",
        pushStatus: "failed",
        pushError,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    throw error;
  }
}
