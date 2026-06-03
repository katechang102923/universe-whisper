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
  keywords?: string;
};

export type LineResultData = {
  type: LineResultType;
  question: string;
  cards: LineResultCard[];
  shortText: string;
  fullText: string;
  /** 建立當時使用者是否已解鎖（付費或 FB 分享）；控制分享頁與查詢頁是否顯示完整版 */
  unlocked?: boolean;
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

// ── 伺服器端 AI 解讀文字解析工具 ────────────────────────────────────────────
// 匹配 AI 實際輸出的中文標題格式（宇宙偷偷話、牌陣總結、第1張牌 …等）

/**
 * 從 AI 解讀全文中提取指定標題關鍵字的段落本文
 * 支援「行首有 emoji 前綴」的格式，例如：「🌙 宇宙偷偷話：」
 */
function extractSection(text: string, ...keywords: string[]): string {
  const cleaned = text.replace(/\*\*/g, "").trim();
  if (!cleaned) return "";

  const NEXT_TITLES =
    "牌陣總結|三張牌整合|第[123一二三]張牌|行動建議|3～7|溫柔提醒|一句專屬祝福|一句祝福|健康提醒|" +
    "本次問題焦點|宇宙偷偷話|這張牌正在說|你現在的狀態|接下來可以|今天可以|7日能量|針對你的問題|" +
    "一句話結論|三張牌提醒|給你的溫柔提醒";

  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(?:^|\\n)[^\\n]{0,8}${escaped}[^\\n]{0,40}\\n+` +
      `([\\s\\S]*?)` +
      `(?=\\n[^\\n]{0,8}(?:${NEXT_TITLES})|$)`,
      "m",
    );
    const m = cleaned.match(pattern);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return "";
}

/**
 * 從一段文字中提取子欄位（如牌陣總結內的「整體答案：」子段落）
 */
function extractSubfield(text: string, keyword: string, ...stopKeywords: string[]): string {
  if (!text) return "";
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stops = stopKeywords
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const stopPart = stops ? `(?=\\n{1,2}(?:${stops})|$)` : "";
  const re = new RegExp(`${escaped}[：:]\\s*\\n?([\\s\\S]*?)${stopPart}`, "m");
  return text.match(re)?.[1]?.trim() || "";
}

/**
 * 從每張牌的段落文字中提取關鍵字（格式：「關鍵字：kw1、kw2、kw3」）
 */
function extractKeywordsFromSection(sectionText: string): string {
  const m = sectionText.match(/關鍵字[：:]\s*([^\n]+)/);
  return m?.[1]?.trim() || "";
}

/**
 * 截取文字，優先在句號/驚歎號/問號斷句，最多 maxChars 字
 */
function sliceAtSentence(text: string, maxChars: number): string {
  if (!text) return "";
  const s = text.trim();
  if (s.length <= maxChars) return s;
  const sub = s.slice(0, maxChars);
  const last = Math.max(sub.lastIndexOf("。"), sub.lastIndexOf("！"), sub.lastIndexOf("？"));
  if (last > maxChars * 0.45) return sub.slice(0, last + 1);
  return sub + "…";
}

/**
 * 取文字前兩句，不超過 maxChars 字
 */
function firstTwoSentences(text: string, maxChars: number): string {
  if (!text) return "";
  const s = text.trim().replace(/\n+/g, " ");
  const matches = s.matchAll(/[\s\S]*?[。！？]/g);
  let result = "";
  let count = 0;
  for (const m of matches) {
    result += m[0];
    count++;
    if (count >= 2) break;
  }
  const picked = result.trim() || s;
  return sliceAtSentence(picked, maxChars);
}

const DIVIDER = "━━━━━━━━━━━━━━";

/** 去除段落開頭的「標題：」前綴（避免 extractSubfield fallback 時重複顯示標題） */
function stripLabelPrefix(text: string, ...labels: string[]): string {
  let s = text.trim();
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(`^${escaped}[：:]\\s*`, ""), "");
  }
  return s.trim();
}

// ── LINE 三張牌訊息 ────────────────────────────────────────────────────────────

function buildLineThreeCardMessage(
  result: LineResultData,
  questionText: string,
  resultUrl: string,
  fullText: string,
): string {
  const LINE_DIVIDER = "━━━━━━━━━━━━";
  const DEFAULT_POSITIONS = ["過去", "現在", "未來"];

  // ── 整體答案：從牌陣總結提取 ─────────────────────────────────────────────────
  const summaryRaw = extractSection(fullText, "牌陣總結", "三張牌整合");
  const answerFromSub =
    extractSubfield(summaryRaw, "整體答案", "為什麼會這樣", "接下來的方向") ||
    extractSubfield(summaryRaw, "核心判斷", "為什麼會這樣", "接下來的方向");
  const overallAnswerRaw = answerFromSub || stripLabelPrefix(summaryRaw, "整體答案", "核心判斷");
  const overallAnswer = sliceAtSentence(overallAnswerRaw, 200);

  // ── 心靈收束：溫柔提醒 + 一句祝福 ───────────────────────────────────────────
  const gentleReminder = extractSection(fullText, "給你的溫柔提醒", "溫柔提醒");
  const blessing = extractSection(fullText, "一句專屬祝福", "一句祝福");
  const closingRaw = [gentleReminder, blessing].filter(Boolean).join("\n");
  const closingMessage = closingRaw
    ? firstTwoSentences(closingRaw, 150)
    : firstTwoSentences(overallAnswerRaw, 120);

  // ── 牌列表（牌名 + 關鍵字，各自獨立一行）────────────────────────────────────
  const cardListLines: string[] = [];
  result.cards.forEach((card, i) => {
    const pos = card.position ?? DEFAULT_POSITIONS[i] ?? `第${i + 1}張`;
    const name = card.nameZh ?? card.name ?? "塔羅牌";
    const ori = card.orientationLabel ? `（${card.orientationLabel}）` : "";
    const kw = card.keywords || "";
    cardListLines.push(`${i + 1}. ${pos}｜${name}${ori}`);
    if (kw) cardListLines.push(`   關鍵字：${kw}`);
  });

  // ── 組合訊息 ──────────────────────────────────────────────────────────────────
  const parts: string[] = [
    `你的問題：\n${questionText}`,
    "",
    "你抽到的牌：",
    "",
    cardListLines.join("\n"),
  ];

  parts.push("", LINE_DIVIDER, "", "✨ 牌陣總結", "", `整體答案：\n${overallAnswer}`);
  parts.push("", LINE_DIVIDER, "", "🧘 心靈收束", "", closingMessage);
  parts.push("", `📚 收藏版完整排版：\n${resultUrl}`);

  return parts.join("\n");
}

// ── LINE 單張牌訊息 ───────────────────────────────────────────────────────────

function buildLineSingleCardMessage(
  result: LineResultData,
  questionText: string,
  resultUrl: string,
  fullText: string,
): string {
  const LINE_DIVIDER = "━━━━━━━━━━━━";
  const card = result.cards[0] ?? {};
  const cardName = card.nameZh ?? card.name ?? "塔羅牌";
  const cardOri = card.orientationLabel ? `（${card.orientationLabel}）` : "";
  const kw = card.keywords || "";

  // ── 整體答案：宇宙訊息 / 針對你的問題 ───────────────────────────────────────
  const cosmicRaw = extractSection(fullText, "宇宙偷偷話", "針對你的問題");
  const questionAnswerRaw = extractSection(fullText, "針對你的問題", "今天可以怎麼做", "接下來可以怎麼做");
  const overallAnswerRaw = cosmicRaw || questionAnswerRaw || result.shortText || "";
  const overallAnswer = sliceAtSentence(overallAnswerRaw, 200);

  // ── 心靈收束：溫柔提醒 + 一句祝福 ───────────────────────────────────────────
  const gentleReminder = extractSection(fullText, "給你的溫柔提醒", "溫柔提醒");
  const blessing = extractSection(fullText, "一句專屬祝福", "一句祝福");
  const closingRaw = [gentleReminder, blessing].filter(Boolean).join("\n");
  const closingMessage = closingRaw
    ? firstTwoSentences(closingRaw, 150)
    : firstTwoSentences(overallAnswerRaw, 120);

  // ── 組合訊息 ──────────────────────────────────────────────────────────────────
  const parts: string[] = [
    `你的問題：\n${questionText}`,
    "",
    "你抽到的牌：",
    "",
    `${cardName}${cardOri}`,
  ];
  if (kw) parts.push(`關鍵字：${kw}`);

  parts.push("", LINE_DIVIDER, "", "✨ 宇宙訊息", "", `整體答案：\n${overallAnswer}`);
  parts.push("", LINE_DIVIDER, "", "🧘 心靈收束", "", closingMessage);
  parts.push("", `📚 收藏版完整排版：\n${resultUrl}`);

  return parts.join("\n");
}

// ── 主要 formatter ──────────────────────────────────────────────────────────────

export function buildLineResultMessage(result: LineResultData, resultId: string, siteUrl: string) {
  const questionText = result.question?.trim() || "你把問題放在心裡，宇宙也有聽見。";
  const resultUrl = result.resultUrl || `${siteUrl}/share/${resultId}`;
  const fullText = (result.fullText || result.shortText || "").replace(/\*\*/g, "").trim();

  if (result.cards.length === 3) {
    return buildLineThreeCardMessage(result, questionText, resultUrl, fullText);
  }
  if (result.cards.length >= 1) {
    return buildLineSingleCardMessage(result, questionText, resultUrl, fullText);
  }

  // 兜底（無牌資料）
  return [
    "宇宙偷偷話｜本次占卜結果",
    "",
    `你的問題：\n${questionText}`,
    "",
    fullText ? `✨ 宇宙給你的重點\n\n${sliceAtSentence(fullText, 200)}` : "宇宙的訊息正在整理中。",
    "",
    DIVIDER,
    "",
    `📚 收藏版完整排版：\n${resultUrl}`,
  ].join("\n");
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
