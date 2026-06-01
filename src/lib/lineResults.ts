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

  // 所有可能的「下一段標題」關鍵字，用於截斷匹配
  const NEXT_TITLES =
    "牌陣總結|三張牌整合|第[123一二三]張牌|行動建議|3～7|溫柔提醒|一句專屬祝福|一句祝福|健康提醒|" +
    "本次問題焦點|宇宙偷偷話|這張牌正在說|你現在的狀態|接下來可以|今天可以|7日能量|針對你的問題|" +
    "一句話結論|三張牌提醒";

  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      // 行首，允許 emoji 前綴，含關鍵字的標題行
      `(?:^|\\n)[^\\n]{0,8}${escaped}[^\\n]{0,40}\\n+` +
      // 段落本文，直到下一個標題行
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
 * 取文字第一句，不超過 maxChars 字
 */
function firstSentence(text: string, maxChars: number): string {
  if (!text) return "";
  const s = text.trim().replace(/\n+/g, " ");
  const m = s.match(/^[\s\S]*?[。！？]/);
  return sliceAtSentence((m ? m[0] : s).trim(), maxChars);
}

// ── LINE 三張牌訊息（≤900字）────────────────────────────────────────────────

function buildLineThreeCardMessage(
  result: LineResultData,
  questionText: string,
  resultUrl: string,
  fullText: string,
): string {
  // 提取各段落（多組關鍵字依優先順序嘗試）
  const overallRaw = extractSection(fullText, "牌陣總結", "三張牌整合", "整體答案", "整體判斷");
  const c1Raw = extractSection(fullText, "第1張牌", "第一張牌");
  const c2Raw = extractSection(fullText, "第2張牌", "第二張牌");
  const c3Raw = extractSection(fullText, "第3張牌", "第三張牌");
  const actionRaw = extractSection(fullText, "3～7 天行動建議", "3～7天行動建議", "行動建議", "接下來可以怎麼做");

  const overall = sliceAtSentence(overallRaw || result.shortText || "", 110);

  // 每張牌取第一句關鍵訊息（不回傳「完整解讀裡」類的佔位文字）
  const getCardInsight = (raw: string): string => firstSentence(raw, 65);

  const c1 = getCardInsight(c1Raw);
  const c2 = getCardInsight(c2Raw);
  const c3 = getCardInsight(c3Raw);
  const action = sliceAtSentence(actionRaw, 80);

  // 牌列表：帶位置與正逆位
  const DEFAULT_POSITIONS = ["過去", "現在", "未來"];
  const cardListLines = result.cards.map((card, i) => {
    const pos = card.position ?? DEFAULT_POSITIONS[i] ?? `第${i + 1}張`;
    const name = card.nameZh ?? card.name ?? "塔羅牌";
    const ori = card.orientationLabel ? `（${card.orientationLabel}）` : "";
    return `${i + 1}. ${pos}｜${name}${ori}`;
  });

  const parts: string[] = [
    "🌙 宇宙偷偷話｜塔羅訊息",
    "",
    `你的問題：\n${questionText}`,
    "",
    `你抽到的牌：\n${cardListLines.join("\n")}`,
  ];

  if (overall) parts.push("", `✨ 宇宙給你的重點\n${overall}`);

  // 三張牌個別提醒
  const cardSections: string[] = [];
  result.cards.forEach((card, i) => {
    const pos = card.position ?? DEFAULT_POSITIONS[i] ?? `第${i + 1}張`;
    const name = card.nameZh ?? card.name ?? "塔羅牌";
    const insight = [c1, c2, c3][i];
    if (insight) cardSections.push(`${pos}｜${name}：\n${insight}`);
  });
  if (cardSections.length > 0) {
    parts.push("", `🔮 三張牌提醒你\n${cardSections.join("\n\n")}`);
  }

  if (action) parts.push("", `🌙 3～7天行動建議\n${action}`);

  parts.push("", `想看更完整排版與收藏版：\n${resultUrl}`);

  return parts.join("\n");
}

// ── LINE 單張牌訊息（≤700字）────────────────────────────────────────────────

function buildLineSingleCardMessage(
  result: LineResultData,
  questionText: string,
  resultUrl: string,
  fullText: string,
): string {
  // 提取各段落
  const cosmicRaw = extractSection(
    fullText,
    "宇宙偷偷話",
    "這張牌正在說什麼",
    "針對你的問題",
    "牌陣總結",
  );
  const insightRaw = extractSection(
    fullText,
    "你現在的狀態",
    "這張牌正在說什麼",
    "針對你的問題",
  );
  const actionRaw = extractSection(
    fullText,
    "接下來可以怎麼做",
    "今天可以怎麼做",
    "3～7 天行動建議",
    "3～7天行動建議",
    "7日能量提示",
  );

  const cosmic = sliceAtSentence(cosmicRaw || result.shortText || "", 110);
  // 避免 insight 與 cosmic 重複
  const insightCandidate = sliceAtSentence(insightRaw, 80);
  const insight = insightCandidate !== cosmic ? insightCandidate : "";
  const action = sliceAtSentence(actionRaw, 80);

  const cardLine = formatResultCards(result.cards);

  const parts: string[] = [
    "🌙 宇宙偷偷話｜塔羅訊息",
    "",
    `你的問題：\n${questionText}`,
    "",
    `你抽到的牌：\n${cardLine}`,
  ];

  if (cosmic) parts.push("", `✨ 宇宙給你的重點\n${cosmic}`);
  if (insight) parts.push("", `🔮 這張牌提醒你\n${insight}`);
  if (action) parts.push("", `🌙 3～7天行動建議\n${action}`);

  parts.push("", `想看更完整排版與收藏版：\n${resultUrl}`);

  return parts.join("\n");
}

// ── 主要 formatter ──────────────────────────────────────────────────────────────

export function buildLineResultMessage(result: LineResultData, resultId: string, siteUrl: string) {
  const questionText = result.question?.trim() || "你把問題放在心裡，宇宙也有聽見。";
  const resultUrl = result.resultUrl || `${siteUrl}/share/${resultId}`;
  // 優先使用完整 AI 解讀（fullText），fallback 到摘要（shortText）
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
    fullText ? `✨ 宇宙給你的重點\n${sliceAtSentence(fullText, 150)}` : "宇宙的訊息正在整理中。",
    "",
    `想看更完整排版與收藏版：\n${resultUrl}`,
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
