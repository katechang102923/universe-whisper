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

const CARD_DIVIDER = "--------------------";

function buildLineThreeCardMessage(
  result: LineResultData,
  questionText: string,
  resultUrl: string,
  fullText: string,
): string {
  // ── 提取牌陣總結及子欄位 ─────────────────────────────────────────────────────
  const summaryRaw = extractSection(fullText, "牌陣總結", "三張牌整合");

  // 先嘗試提取子欄位（不含標題前綴）
  const answerFromSub =
    extractSubfield(summaryRaw, "整體答案", "為什麼會這樣", "接下來的方向") ||
    extractSubfield(summaryRaw, "核心判斷", "為什麼會這樣", "接下來的方向");

  // fallback 到整段 summaryRaw，但要去掉可能殘留的標題前綴
  const overallAnswerRaw = answerFromSub ||
    stripLabelPrefix(summaryRaw, "整體答案", "核心判斷");

  const overallAnswer = sliceAtSentence(overallAnswerRaw, 160);
  const whyThisHappened = sliceAtSentence(
    extractSubfield(summaryRaw, "為什麼會這樣", "接下來的方向"),
    140,
  );
  const nextDirection = sliceAtSentence(
    extractSubfield(summaryRaw, "接下來的方向"),
    140,
  );

  // ── 心靈收束：溫柔提醒 + 祝福 ────────────────────────────────────────────────
  const reminderRaw = extractSection(fullText, "給你的溫柔提醒", "溫柔提醒");
  const blessingRaw = extractSection(fullText, "一句專屬祝福", "一句祝福");
  const closingMessage = sliceAtSentence(reminderRaw || blessingRaw || "", 130);

  // ── 行動建議 ──────────────────────────────────────────────────────────────────
  const actionRaw = extractSection(fullText, "3～7 天行動建議", "3～7天行動建議", "行動建議");
  const actionAdvice = sliceAtSentence(actionRaw || "", 200);

  // ── 逐張牌資料 ────────────────────────────────────────────────────────────────
  const DEFAULT_POSITIONS = ["過去", "現在", "未來"];
  const cardSectionRaws = [
    extractSection(fullText, "第1張牌", "第一張牌"),
    extractSection(fullText, "第2張牌", "第二張牌"),
    extractSection(fullText, "第3張牌", "第三張牌"),
  ];

  // ── 牌列表行 ─────────────────────────────────────────────────────────────────
  const cardListLines = result.cards.map((card, i) => {
    const pos = card.position ?? DEFAULT_POSITIONS[i] ?? `第${i + 1}張`;
    const name = card.nameZh ?? card.name ?? "塔羅牌";
    const ori = card.orientationLabel ? `（${card.orientationLabel}）` : "";
    return `${i + 1}. ${pos}｜${name}${ori}`;
  });

  // ── 組合訊息 ──────────────────────────────────────────────────────────────────
  const parts: string[] = [
    "🌙 宇宙偷偷話｜塔羅訊息",
    "",
    `你的問題：\n${questionText}`,
    "",
    `你抽到的牌：\n${cardListLines.join("\n")}`,
  ];

  // 牌陣總結區塊：只有真正有內容才加標題
  const summaryParts: string[] = [];
  if (overallAnswer) summaryParts.push(`整體答案\n\n${overallAnswer}`);
  if (whyThisHappened) summaryParts.push(`為什麼會這樣\n\n${whyThisHappened}`);
  if (nextDirection) summaryParts.push(`接下來的方向\n\n${nextDirection}`);
  if (closingMessage) summaryParts.push(`心靈收束\n\n${closingMessage}`);

  if (summaryParts.length > 0) {
    parts.push("", DIVIDER, "", "✨ 牌陣總結", "", summaryParts.join("\n\n"));
  }

  // 三張牌個別提醒
  const cardReminderParts: string[] = [];
  result.cards.forEach((card, i) => {
    const pos = card.position ?? DEFAULT_POSITIONS[i] ?? `第${i + 1}張`;
    const name = card.nameZh ?? card.name ?? "塔羅牌";
    const ori = card.orientationLabel ? `（${card.orientationLabel}）` : "";
    const sectionRaw = cardSectionRaws[i] || "";

    // 關鍵字：優先用儲存的 card.keywords，再從 fullText 提取
    const kw = card.keywords || extractKeywordsFromSection(sectionRaw);

    // 提醒文字：從牌的 message 段取前兩句（去掉牌名行與摘要行）
    const cleanedSection = sectionRaw
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        if (!t) return false;
        // 去掉「牌名（正/逆位）」開頭行
        if (/^[\S]+（(?:正位|逆位)）/.test(t)) return false;
        // 去掉「摘要：」行
        if (/^摘要[：:]/.test(t)) return false;
        // 去掉「關鍵字：」行（已單獨顯示）
        if (/^關鍵字[：:]/.test(t)) return false;
        return true;
      })
      .join(" ")
      .trim();
    const reminder = firstTwoSentences(cleanedSection, 130);

    // 格式：「位置｜牌名（正逆位）」為標題，不重複牌名
    const block: string[] = [`${pos}｜${name}${ori}`];
    if (kw) {
      block.push("", `關鍵字：\n${kw}`);
    }
    if (reminder) {
      block.push("", `提醒：\n${reminder}`);
    }
    cardReminderParts.push(block.join("\n"));
  });

  if (cardReminderParts.length > 0) {
    parts.push(
      "", DIVIDER, "", "🔮 三張牌提醒你", "",
      cardReminderParts.join(`\n\n${CARD_DIVIDER}\n\n`),
    );
  }

  if (actionAdvice) {
    parts.push("", DIVIDER, "", "🌙 3～7天行動建議", "", actionAdvice);
  }

  parts.push("", DIVIDER, "", `📚 收藏版完整排版：\n${resultUrl}`);

  return parts.join("\n");
}

// ── LINE 單張牌訊息 ───────────────────────────────────────────────────────────

function buildLineSingleCardMessage(
  result: LineResultData,
  questionText: string,
  resultUrl: string,
  fullText: string,
): string {
  const card = result.cards[0] ?? {};
  const cardName = card.nameZh ?? card.name ?? "塔羅牌";
  const cardOri = card.orientationLabel ? `（${card.orientationLabel}）` : "";
  const cardKw = card.keywords || extractKeywordsFromSection(
    extractSection(fullText, "這張牌正在說什麼", "宇宙偷偷話"),
  );

  // ── 提取各段落 ────────────────────────────────────────────────────────────────
  const cosmicRaw = extractSection(fullText, "宇宙偷偷話", "針對你的問題");
  const cardMessageRaw = extractSection(fullText, "這張牌正在說什麼", "針對你的問題");
  const questionAnswerRaw = extractSection(fullText, "針對你的問題", "今天可以怎麼做", "接下來可以怎麼做");
  const actionRaw = extractSection(
    fullText,
    "今天可以怎麼做",
    "接下來可以怎麼做",
    "3～7 天行動建議",
    "3～7天行動建議",
  );
  const reminderRaw = extractSection(fullText, "給你的溫柔提醒", "溫柔提醒");
  const blessingRaw = extractSection(fullText, "一句專屬祝福", "一句祝福");

  // ── 組合各區段 ────────────────────────────────────────────────────────────────
  const mainAnswer = sliceAtSentence(cosmicRaw || result.shortText || "", 150);
  const whyThisHappened = sliceAtSentence(
    cardMessageRaw
      .replace(/^[^\n]*（(?:正位|逆位)）[^\n]*/m, "")
      .replace(/^關鍵字[：:][^\n]*/m, "")
      .trim(),
    130,
  );
  const nextDirection = sliceAtSentence(questionAnswerRaw || actionRaw || "", 130);
  const closingMessage = sliceAtSentence(reminderRaw || blessingRaw || "", 120);
  const cardReminder = sliceAtSentence(reminderRaw || cosmicRaw || "", 100);
  const actionAdvice = sliceAtSentence(actionRaw || questionAnswerRaw || "", 150);

  // ── 組合訊息 ──────────────────────────────────────────────────────────────────
  const parts: string[] = [
    "🌙 宇宙偷偷話｜塔羅訊息",
    "",
    `你的問題：\n${questionText}`,
    "",
    `你抽到的牌：\n${cardName}${cardOri}`,
  ];

  // 宇宙給你的訊息區塊
  const messageParts: string[] = [];
  if (mainAnswer) messageParts.push(mainAnswer);
  if (whyThisHappened && whyThisHappened !== mainAnswer) messageParts.push(`為什麼會這樣\n\n${whyThisHappened}`);
  if (nextDirection && nextDirection !== whyThisHappened) messageParts.push(`接下來的方向\n\n${nextDirection}`);
  if (closingMessage) messageParts.push(`心靈收束\n\n${closingMessage}`);

  if (messageParts.length > 0) {
    parts.push("", DIVIDER, "", "✨ 宇宙給你的訊息", "", messageParts.join("\n\n"));
  }

  // 這張牌提醒你
  const cardReminderLines: string[] = [`${cardName}${cardOri}${cardKw ? `｜關鍵字：${cardKw}` : ""}`];
  if (cardReminder) cardReminderLines.push("", cardReminder);

  parts.push("", DIVIDER, "", "🔮 這張牌提醒你", "", cardReminderLines.join("\n"));

  if (actionAdvice) {
    parts.push("", DIVIDER, "", "🌙 3～7天行動建議", "", actionAdvice);
  }

  parts.push("", DIVIDER, "", `📚 收藏版完整排版：\n${resultUrl}`);

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
    "🌙 宇宙偷偷話｜塔羅訊息",
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
