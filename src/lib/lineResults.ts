import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { normalizePlainText } from "@/lib/textUtils";

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
  /** 建立當時使用者是否已解鎖（付費或兌換碼）；控制分享頁與查詢頁是否顯示完整版 */
  unlocked?: boolean;
  /** LINE 解鎖狀態；"line_verified" 代表 LINE 加入驗證成功，視同 unlocked */
  unlockStatus?: string;
  unlockedBy?: string;
  unlockedAt?: unknown;
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
    // 不使用 "m" flag：$  只匹配字串結尾，避免在 multiline 模式下每行行尾都滿足
    // lookahead，導致 lazy [\s\S]*? 只抓到第一行就停止。
    const pattern = new RegExp(
      `(?:^|\\n)[^\\n]{0,8}${escaped}[^\\n]{0,40}\\n+` +
      `([\\s\\S]*?)` +
      `(?=\\n[^\\n]{0,8}(?:${NEXT_TITLES})|$)`,
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
  // 不使用 "m" flag：$ 只匹配字串結尾，確保多行子欄位內容完整抓取。
  const stopPart = stops ? `(?=\\n{1,2}(?:${stops})|$)` : `(?=$)`;
  const re = new RegExp(`${escaped}[：:]\\s*\\n?([\\s\\S]*?)${stopPart}`);
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

/**
 * LINE 專用：取文字前 n 句（以句號／驚歎號／問號斷句）
 * 若文字不含標點則原樣回傳
 */
function takeNSentences(text: string, n: number): string {
  if (!text) return "";
  const s = text.trim();
  const matches = [...s.matchAll(/[\s\S]*?[。！？]/g)];
  let result = "";
  let count = 0;
  for (const m of matches) {
    result += m[0];
    count++;
    if (count >= n) break;
  }
  return result.trim() || s;
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

// ── 結構化資料提取工具（供 LINE 與 Email 共用） ────────────────────────────────

/**
 * 從三張牌 fullText 中提取第 i 張牌（0-indexed）的完整段落文字
 */
export function extractCardSectionText(fullText: string, cardIndex: number): string {
  const nums = ["1", "2", "3"];
  const n = nums[cardIndex];
  if (!n) return "";
  return extractSection(fullText, `第${n}張牌`);
}

/**
 * 從一張牌的段落文字中解析結構化欄位
 * 支援 AI 生成格式（牌面重點／對你的問題代表／這張牌提醒你）與 fallback 單段格式
 */
export function parseCardFields(sectionContent: string): {
  cardPoint: string;
  questionMeaning: string;
  cardAdvice: string;
} {
  const cleaned = sectionContent.replace(/\*\*/g, "").trim();
  if (!cleaned) return { cardPoint: "", questionMeaning: "", cardAdvice: "" };

  const cardPoint = extractSubfield(
    cleaned, "牌面重點", "對你的問題代表", "在你的問題中代表", "這張牌提醒你",
  );
  const questionMeaning =
    extractSubfield(cleaned, "對你的問題代表", "這張牌提醒你") ||
    extractSubfield(cleaned, "在你的問題中代表", "這張牌提醒你");
  const cardAdvice = extractSubfield(cleaned, "這張牌提醒你");

  if (cardPoint || questionMeaning || cardAdvice) {
    return { cardPoint, questionMeaning, cardAdvice };
  }

  // Fallback：整段視為 cardPoint（去掉牌名行與摘要行）
  const lines = cleaned.split("\n");
  const body = lines
    .filter((l, i) => i > 0 && !l.startsWith("摘要："))
    .join("\n")
    .trim();
  return { cardPoint: body || cleaned, questionMeaning: "", cardAdvice: "" };
}

/**
 * 從 fullText 提取牌陣總結（整體答案 / 為什麼會這樣 / 接下來的方向）
 * 同時回傳 summaryRaw 供 Email fallback 使用（不影響 LINE 輸出）
 */
export function extractSpreadSummaryFields(fullText: string): {
  overallAnswer: string;
  whyThisHappens: string;
  actionAdvice: string;
  summaryRaw: string;
} {
  const summaryRaw = extractSection(fullText, "牌陣總結", "三張牌整合");

  // 逐層 fallback：子欄位 → 核心判斷 → 第一行去標題 → 第一個非空行 → 前兩句
  const firstNonEmptyLine = summaryRaw.split("\n").find((l) => l.trim())?.trim() ?? "";
  const overallAnswer =
    extractSubfield(summaryRaw, "整體答案", "為什麼會這樣", "接下來的方向") ||
    extractSubfield(summaryRaw, "核心判斷", "為什麼會這樣", "接下來的方向") ||
    stripLabelPrefix(firstNonEmptyLine, "整體答案", "核心判斷") ||
    // 最後 fallback：去掉可能被一起抓進來的 label 前綴，避免 formatter 再加一次造成重複
    stripLabelPrefix(firstTwoSentences(summaryRaw, 200), "整體答案", "核心判斷");

  const whyThisHappens = extractSubfield(summaryRaw, "為什麼會這樣", "接下來的方向");
  const actionAdvice =
    extractSubfield(summaryRaw, "接下來的方向") ||
    extractSection(fullText, "3～7 天行動建議", "行動建議", "溫柔提醒");
  return { overallAnswer, whyThisHappens, actionAdvice, summaryRaw };
}

/**
 * 從 fullText 提取心靈收束（溫柔提醒 + 一句祝福）
 */
export function extractSpiritualClosing(fullText: string): string {
  const gentleReminder = extractSection(fullText, "給你的溫柔提醒", "溫柔提醒");
  const blessing = extractSection(fullText, "一句專屬祝福", "一句祝福");
  return [gentleReminder, blessing].filter(Boolean).join("\n\n");
}

/**
 * 從 fullText 提取單張牌各欄位
 */
export function extractSingleCardFields(fullText: string): {
  cardPoint: string;
  questionMeaning: string;
  cardAdvice: string;
  overallAnswer: string;
  actionAdvice: string;
  spiritualClosing: string;
} {
  const cardPoint =
    extractSection(fullText, "這張牌正在說什麼", "針對你的問題") ||
    extractSection(fullText, "宇宙偷偷話", "針對你的問題");
  const questionMeaning =
    extractSection(fullText, "針對你的問題", "今天可以怎麼做", "接下來可以怎麼做") ||
    extractSection(fullText, "一句話結論", "今天可以怎麼做");
  const cardAdvice = extractSection(fullText, "今天可以怎麼做", "給你的溫柔提醒", "溫柔提醒");
  const overallAnswer =
    extractSection(fullText, "宇宙偷偷話", "這張牌正在說什麼") ||
    extractSection(fullText, "一句話結論", "這張牌正在說什麼");
  const actionAdvice = extractSection(fullText, "今天可以怎麼做", "給你的溫柔提醒", "溫柔提醒");
  const spiritualClosing = extractSpiritualClosing(fullText);
  return { cardPoint, questionMeaning, cardAdvice, overallAnswer, actionAdvice, spiritualClosing };
}

// ── 內容完整性驗證 ─────────────────────────────────────────────────────────────

export interface ContentValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateLineContent(
  result: LineResultData,
  fullText: string,
  resultId: string,
): ContentValidationResult {
  const errors: string[] = [];

  if (!fullText || fullText.length < 100) {
    errors.push("fullText 為空或過短");
  }
  if (!result.question?.trim()) {
    errors.push("question 為空");
  }
  if (!result.cards || result.cards.length === 0) {
    errors.push("cards 為空");
  }

  if (result.cards.length === 3 && fullText.length > 100) {
    const { overallAnswer } = extractSpreadSummaryFields(fullText);
    if (!overallAnswer) errors.push("牌陣總結整體答案 為空");
    const spiritualClosing = extractSpiritualClosing(fullText);
    if (!spiritualClosing) errors.push("心靈收束 為空");
    // 至少第一張牌有內容
    const card1Section = extractCardSectionText(fullText, 0);
    if (!card1Section) errors.push("第1張牌段落 為空");
  }

  if (result.cards.length === 1 && fullText.length > 100) {
    const { cardPoint } = extractSingleCardFields(fullText);
    if (!cardPoint) errors.push("單張牌解讀內容 為空");
    const spiritualClosing = extractSpiritualClosing(fullText);
    if (!spiritualClosing) errors.push("心靈收束 為空");
  }

  if (errors.length > 0) {
    console.error(
      `[lineResults/validate] 內容驗證失敗 resultId=${resultId}`,
      { errors, cardCount: result.cards.length, fullTextLength: fullText.length },
    );
  }

  return { valid: errors.length === 0, errors };
}

// ── LINE 三張牌訊息（精簡版，詳細版在 share 頁）──────────────────────────────

function buildLineThreeCardMessage(
  result: LineResultData,
  _questionText: string,
  resultUrl: string,
  fullText: string,
): string {
  const D = "━━━━━━━━━━━━";
  const DEFAULT_POSITIONS = ["過去", "現在", "未來"];

  const parts: string[] = [
    "宇宙聽到了你的聲音，這是為你抽出的牌組。",
  ];

  // ── 每張牌：位置｜牌名，然後三段內容直接並排（不顯示欄位標題）──────────────
  result.cards.forEach((card, i) => {
    const pos = card.position ?? DEFAULT_POSITIONS[i] ?? `第${i + 1}張`;
    const name = card.nameZh ?? card.name ?? "塔羅牌";
    const ori = card.orientationLabel ? `（${card.orientationLabel}）` : "";

    const cardSectionRaw = extractCardSectionText(fullText, i);
    const { cardPoint, questionMeaning, cardAdvice } = parseCardFields(cardSectionRaw);

    parts.push("", `${pos}｜${name}${ori}`);
    if (cardPoint)       parts.push(cardPoint);
    if (questionMeaning) parts.push(questionMeaning);
    if (cardAdvice)      parts.push(cardAdvice);
    if (!cardPoint && !questionMeaning && !cardAdvice) {
      const kw = card.keywords || "";
      if (kw) parts.push(`關鍵字：${kw}`);
    }
  });

  // ── 牌陣總結（壓短：整體答案 3 句、為什麼 2 句、建議 2 句）────────────────
  const { overallAnswer, whyThisHappens, actionAdvice } = extractSpreadSummaryFields(fullText);
  parts.push("", D, "", "✨ 牌陣總結");
  if (overallAnswer)   parts.push("", takeNSentences(overallAnswer, 3));
  if (whyThisHappens)  parts.push("", takeNSentences(whyThisHappens, 2));
  if (actionAdvice)    parts.push("", `接下來 3～7 天建議：\n${takeNSentences(actionAdvice, 2)}`);

  // ── 心靈收束（2 句）──────────────────────────────────────────────────────────
  const spiritualClosing = extractSpiritualClosing(fullText);
  parts.push("", D, "", "🧘 心靈收束");
  if (spiritualClosing) parts.push("", takeNSentences(spiritualClosing, 2));

  parts.push("", D, `📚 收藏版完整排版：\n${resultUrl}`);

  return parts.join("\n");
}

// ── LINE 單張牌訊息（精簡版，詳細版在 share 頁）──────────────────────────────

function buildLineSingleCardMessage(
  result: LineResultData,
  _questionText: string,
  resultUrl: string,
  fullText: string,
): string {
  const D = "━━━━━━━━━━━━";
  const card = result.cards[0] ?? {};
  const cardName = card.nameZh ?? card.name ?? "塔羅牌";
  const cardOri = card.orientationLabel ? `（${card.orientationLabel}）` : "";

  const {
    cardPoint,
    questionMeaning,
    cardAdvice,
    overallAnswer,
    actionAdvice,
    spiritualClosing,
  } = extractSingleCardFields(fullText);

  const parts: string[] = [
    "宇宙聽到了你的聲音，這是本次抽出的牌。",
    "",
    `${cardName}${cardOri}`,
  ];

  // 三段內容直接並排（不顯示欄位標題）
  if (cardPoint)       parts.push(cardPoint);
  if (questionMeaning) parts.push(questionMeaning);
  if (cardAdvice)      parts.push(cardAdvice);

  // ── 解讀總結（壓短：整體答案 3 句、建議 2 句）────────────────────────────────
  parts.push("", D, "", "✨ 解讀總結");
  if (overallAnswer) parts.push("", takeNSentences(overallAnswer, 3));
  if (actionAdvice)  parts.push("", `接下來 3～7 天建議：\n${takeNSentences(actionAdvice, 2)}`);

  // ── 心靈收束（2 句）──────────────────────────────────────────────────────────
  parts.push("", D, "", "🧘 心靈收束");
  if (spiritualClosing) parts.push("", takeNSentences(spiritualClosing, 2));

  parts.push("", D, `📚 收藏版完整排版：\n${resultUrl}`);

  return parts.join("\n");
}

// ── 主要 formatter ──────────────────────────────────────────────────────────────

export function buildLineResultMessage(result: LineResultData, resultId: string, siteUrl: string) {
  const questionText = result.question?.trim() || "你把問題放在心裡，宇宙也有聽見。";
  const resultUrl = result.resultUrl || `${siteUrl}/share/${resultId}`;
  const fullText = normalizePlainText(
    (result.fullText || result.shortText || "").replace(/\*\*/g, ""),
  );

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
    fullText ? `✨ 宇宙給你的重點\n\n${sliceAtSentence(fullText, 400)}` : "宇宙的訊息正在整理中。",
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
  const fullText = normalizePlainText(
    (result.fullText || result.shortText || "").replace(/\*\*/g, ""),
  );
  const validation = validateLineContent(result, fullText, resultId);
  if (!validation.valid) {
    const errMsg = `LINE 內容驗證失敗：${validation.errors.join("、")}`;
    await ref.set(
      { pushStatus: "failed", pushError: errMsg, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    throw new Error(errMsg);
  }

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
