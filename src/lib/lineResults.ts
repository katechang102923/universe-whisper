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

// ── LINE 訊息解析工具（從 fullText 提取關鍵段落）─────────────────────────────

function parseLineSection(fullText: string, emoji: string): string {
  // 匹配 「{emoji} 標題\n\n{內容}」，取到下一個 emoji 標題前
  const pattern = new RegExp(`${emoji}[^\n]+\\n+([\\s\\S]*?)(?=\\n\\n[🎯🌙🌟🃏🕯️🌌💫⚠️]|$)`);
  return fullText.match(pattern)?.[1]?.trim() ?? "";
}

function parseLineOverallAnswer(fullText: string): string {
  const m = fullText.match(/整體答案[：:]\s*\n?([\s\S]*?)(?:\n\n為什麼|$)/);
  if (m?.[1]) return m[1].trim().slice(0, 200);
  return parseLineSection(fullText, "🌟").slice(0, 200);
}

function parseLineDirection(fullText: string): string {
  const m = fullText.match(/接下來的方向[：:]\s*\n?([\s\S]*?)(?:\n\n🃏|🕯|$)/);
  return m?.[1]?.trim().slice(0, 130) ?? "";
}

function parseLineCardOneLiner(fullText: string, cardIndex: number): string {
  // 先試 shortSummary
  const mSummary = fullText.match(
    new RegExp(`🃏 第${cardIndex + 1}張牌[\\s\\S]*?摘要：([^\n]+)`)
  );
  if (mSummary?.[1]) return mSummary[1].trim().slice(0, 55);
  // 再試「這張牌代表：」後面的第一句
  const mRepresent = fullText.match(
    new RegExp(`🃏 第${cardIndex + 1}張牌[\\s\\S]*?這張牌代表：([^\n]+)`)
  );
  if (mRepresent?.[1]) return mRepresent[1].trim().slice(0, 55);
  // fallback: 牌名行後的第一行非空文字
  const mCard = fullText.match(
    new RegExp(`🃏 第${cardIndex + 1}張牌：[^\n]+\n+([^\n]+)`)
  );
  return mCard?.[1]?.trim().slice(0, 55) ?? "";
}

function parseLineActionSummary(fullText: string): string {
  const m = fullText.match(/🕯️ 3～7 天行動建議\s*\n+([\s\S]*?)(?:\n\n🌌|$)/);
  if (!m?.[1]) return "";
  const steps = m[1].trim().split(/\n\n/).filter(Boolean);
  // 只取前三段，每段截斷到第一個換行
  return steps
    .slice(0, 3)
    .map(s => s.split("\n")[0]?.trim() ?? "")
    .filter(Boolean)
    .join("　");
}

function parseLineBlessing(fullText: string): string {
  const m = fullText.match(/💫 一句專屬祝福\s*\n+([\s\S]*?)(?:\n\n|$)/);
  return m?.[1]?.trim().slice(0, 60) ?? "";
}

// ── LINE 三張牌緊湊訊息（≤900字）──────────────────────────────────────────────

function buildLineThreeCardMessage(
  result: LineResultData,
  questionText: string,
  resultUrl: string,
  fullText: string
): string {
  const cardList = formatResultCards(result.cards);
  const overallAnswer = parseLineOverallAnswer(fullText);
  const direction = parseLineDirection(fullText);
  const actionSummary = parseLineActionSummary(fullText);
  const blessing = parseLineBlessing(fullText);

  // 每張牌只保留一句重點
  const cardLines = result.cards.map((card, i) => {
    const position = card.position ?? `第${i + 1}張`;
    const name = card.nameZh ?? card.name ?? `牌${i + 1}`;
    const ori = card.orientationLabel ?? "";
    const oneLiner = parseLineCardOneLiner(fullText, i) || "這張牌的訊息在完整解讀裡。";
    return `${position}｜${name}${ori ? `（${ori}）` : ""}：\n${oneLiner}`;
  });

  const parts: string[] = [
    `🌙 宇宙偷偷話｜塔羅訊息`,
    ``,
    `你的問題：\n${questionText}`,
    ``,
    `你抽到的牌：\n${cardList}`,
  ];

  if (overallAnswer) parts.push(``, `✨ 整體答案\n${overallAnswer}`);

  if (cardLines.length > 0) {
    parts.push(``, `🃏 三張牌提醒你\n${cardLines.join("\n\n")}`);
  }

  const actionText = direction || actionSummary;
  if (actionText) parts.push(``, `🕯️ 接下來建議\n${actionText}`);

  if (blessing) parts.push(``, `💫 ${blessing}`);

  parts.push(``, `🔮 完整解讀在這裡：\n${resultUrl}`);

  return parts.join("\n");
}

// ── LINE 單張牌緊湊訊息（≤600字）──────────────────────────────────────────────

function buildLineSingleCardMessage(
  result: LineResultData,
  questionText: string,
  resultUrl: string,
  fullText: string
): string {
  const cardList = formatResultCards(result.cards);
  // 取宇宙偷偷話（questionFocus）
  const cosmic = parseLineSection(fullText, "🌙").slice(0, 100);
  // 取「今天可以怎麼做」或「3～7 天行動」前兩句
  const action = fullText.match(/🐾[^\n]+\n+([\s\S]*?)(?:\n\n[🌌💫]|$)/)?.[1]?.trim().slice(0, 120) ?? "";
  const blessing = parseLineBlessing(fullText);

  const parts: string[] = [
    `🌙 宇宙偷偷話｜塔羅訊息`,
    ``,
    `你的問題：\n${questionText}`,
    ``,
    `你抽到的牌：\n${cardList}`,
  ];

  if (cosmic) parts.push(``, `✨ 宇宙說\n${cosmic}`);
  if (action) parts.push(``, `🐾 今天可以\n${action}`);
  if (blessing) parts.push(``, `💫 ${blessing}`);
  parts.push(``, `🔮 完整解讀在這裡：\n${resultUrl}`);

  return parts.join("\n");
}

// ── 主要 formatter ──────────────────────────────────────────────────────────────

export function buildLineResultMessage(result: LineResultData, resultId: string, siteUrl: string) {
  const questionText = result.question?.trim() || "你把問題放在心裡，宇宙也有聽見。";
  const resultUrl = result.resultUrl || `${siteUrl}/tarot?result=${encodeURIComponent(resultId)}`;
  const fullText = (result.fullText || result.shortText || "").replace(/\*\*/g, "").trim();

  if (result.cards.length === 3 && fullText) {
    return buildLineThreeCardMessage(result, questionText, resultUrl, fullText);
  }
  if (result.cards.length === 1 && fullText) {
    return buildLineSingleCardMessage(result, questionText, resultUrl, fullText);
  }

  // 最後兜底：短版
  return `🌙 宇宙偷偷話｜塔羅訊息\n\n你的問題：\n${questionText}\n\n你抽到的牌：\n${formatResultCards(result.cards)}\n\n🔮 完整解讀在這裡：\n${resultUrl}`;
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
