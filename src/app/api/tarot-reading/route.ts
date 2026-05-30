// ─────────────────────────────────────────────────────────────────────────────
// 宇宙偷偷話 — 塔羅解牌 API Route
// 本檔案只調整 AI 解牌邏輯（prompt / fallback / JSON 解析）
// 不修改：UI、FB 分享、LINE、付款、抽牌動畫、免費次數、登入流程
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from "openai";
import { NextResponse } from "next/server";
import { checkAndIncrementLimit, type RateLimitFeature } from "@/lib/rateLimit";
import { verifyAdminIdToken } from "@/lib/verifyAdmin";
import {
  TAROT_READING_STYLE_RULES,
  TAROT_READING_SYSTEM_PROMPT,
} from "@/lib/tarotReadingPromptConfig";

export const runtime = "nodejs";

const DEFAULT_MODEL = "gpt-5.4-mini";

// ── 輸入型別 ──────────────────────────────────────────────────────────────────

const validTopics        = ["love", "career", "ambiguous", "general"] as const;
const validPositions     = ["upright", "reversed"] as const;
const validSpreadPositions = ["past", "present", "future"] as const;
const validReadingModes  = ["free", "ad", "premium"] as const;

type TarotReadingTopic    = (typeof validTopics)[number];
type TarotReadingPosition = (typeof validPositions)[number];
type TarotSpreadPosition  = (typeof validSpreadPositions)[number];
type TarotReadingMode     = (typeof validReadingModes)[number];

type TarotReadingCard = {
  name: string;
  nameEn?: string;
  nameZh?: string;
  suit?: string;
  position: TarotReadingPosition;
  spreadPosition?: TarotSpreadPosition;
  keywords?: string[];
  baseMeaning?: string;
  topicMeaning?: string;
  meaning?: string;
};

// ── JSON 解讀結構型別 ─────────────────────────────────────────────────────────

type SingleCardReading = {
  spreadType: "single";
  category: string;
  cardName: string;
  orientation: string;
  questionFocus: string;       // 宇宙偷偷話：直接回應使用者當下最在意的心情
  cardMessage: string;         // 這張牌正在說什麼：只說牌義，不提問題
  questionAnswer?: string;     // 針對你的問題：把牌義連回使用者原始問題
  oneLineConclusion: string;
  todayAction: string;
  gentleReminder: string;
  blessing: string;
  safetyNote?: string;
};

type ThreeCardEntry = {
  position: string;
  cardName: string;
  orientation: string;
  keywords?: string[];             // 3 個關鍵字（卡片快速摘要用）
  shortSummary?: string;           // 一句話摘要（40-50 字，卡片顯示用）
  message: string;                 // 完整解讀文字（完整解讀區塊用）
};

type ThreeCardReading = {
  spreadType: "three";
  category: string;
  questionFocus: string;
  overallSummary: string;          // 牌陣總結（一兩句核心結論）
  cards: [ThreeCardEntry, ThreeCardEntry, ThreeCardEntry];
  combinedReading: string;
  actionSteps: string[];           // 3～7 天具體行動（陣列，各1句）
  next3To7Days: string;            // 保留供 fallback 使用
  gentleReminder: string;
  blessing: string;
  safetyNote?: string;
};

// ── 問題焦點型別 ──────────────────────────────────────────────────────────────

type QuestionFocusPrimary =
  | "finance" | "career" | "love" | "relationship" | "health" | "general";

type QuestionFocus = {
  primary: QuestionFocusPrimary;
  secondary?: Exclude<QuestionFocusPrimary, "general">;
};

// ── 型別守衛 ──────────────────────────────────────────────────────────────────

function isTopic(v: unknown): v is TarotReadingTopic {
  return typeof v === "string" && validTopics.includes(v as TarotReadingTopic);
}
function isPosition(v: unknown): v is TarotReadingPosition {
  return typeof v === "string" && validPositions.includes(v as TarotReadingPosition);
}
function isSpreadPosition(v: unknown): v is TarotSpreadPosition {
  return typeof v === "string" && validSpreadPositions.includes(v as TarotSpreadPosition);
}
function isReadingMode(v: unknown): v is TarotReadingMode {
  return typeof v === "string" && validReadingModes.includes(v as TarotReadingMode);
}

function getRequestIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

// ── 牌卡正規化 ────────────────────────────────────────────────────────────────
// 容錯：接受 name / cardName / title 作為牌名來源；position / orientation 兩種欄位名

function normalizeCards(cards: unknown): TarotReadingCard[] | null {
  if (!Array.isArray(cards) || cards.length === 0 || cards.length > 3) return null;

  const normalized = cards.map((card) => {
    if (!card || typeof card !== "object") return null;
    const s = card as Record<string, unknown>;

    // 容錯：支援 name / cardName / title 三種欄位名
    const rawName =
      (typeof s.name     === "string" && s.name.trim())     ||
      (typeof s.cardName === "string" && s.cardName.trim()) ||
      (typeof s.title    === "string" && s.title.trim())    ||
      null;
    if (!rawName) return null;

    // 容錯：支援 position（"upright"/"reversed"）和 orientation（"正位"/"逆位"）
    let pos: TarotReadingPosition;
    if (isPosition(s.position)) {
      pos = s.position;
    } else if (typeof s.orientation === "string") {
      pos = s.orientation === "正位" ? "upright" : "reversed";
    } else {
      return null;
    }

    // keywords：支援 string[] 或逗號分隔 string
    let keywords: string[] | undefined;
    if (Array.isArray(s.keywords)) {
      keywords = (s.keywords as unknown[]).filter(
        (k): k is string => typeof k === "string" && k.trim().length > 0
      );
    } else if (typeof s.keywords === "string" && s.keywords.trim()) {
      keywords = s.keywords.split(/[,，、]/).map((k) => k.trim()).filter(Boolean);
    }

    return {
      name:           rawName,
      nameEn:         typeof s.nameEn  === "string" ? s.nameEn.trim()  : undefined,
      nameZh:         typeof s.nameZh  === "string" ? s.nameZh.trim()  : undefined,
      suit:           typeof s.suit    === "string" ? s.suit.trim()    : undefined,
      position:       pos,
      spreadPosition: isSpreadPosition(s.spreadPosition) ? s.spreadPosition : undefined,
      keywords,
      baseMeaning:    typeof s.baseMeaning  === "string" ? s.baseMeaning.trim()  : undefined,
      topicMeaning:   typeof s.topicMeaning === "string" ? s.topicMeaning.trim() : undefined,
      meaning:
        typeof s.meaning  === "string" ? s.meaning.trim()  :
        typeof s.meanings === "string" ? s.meanings.trim() :
        undefined,
    };
  });

  if (normalized.some((c) => c === null)) return null;
  return normalized as TarotReadingCard[];
}

// ═════════════════════════════════════════════════════════════════════════════
// 問題焦點偵測
// ═════════════════════════════════════════════════════════════════════════════

const FOCUS_KEYWORDS: Record<Exclude<QuestionFocusPrimary, "general">, string[]> = {
  finance: [
    "財運", "金錢", "收入", "支出", "投資", "股票", "ETF", "基金",
    "薪水", "加薪", "獎金", "副業", "兼職", "理財", "存款", "現金流",
    "貸款", "房貸", "賺錢", "偏財", "財務", "錢", "財",
  ],
  career: [
    "工作", "職場", "離職", "轉職", "升遷", "主管", "老闆", "同事",
    "面試", "創業", "事業", "公司", "接案", "職涯",
  ],
  love: [
    "感情", "愛情", "曖昧", "交往", "復合", "前任", "告白", "分手",
    "喜歡", "對象", "桃花", "結婚", "對方",
  ],
  relationship: [
    "朋友", "家人", "同學", "合作", "人際", "相處", "誤會", "衝突", "溝通",
  ],
  health: [
    "健康", "身體", "生病", "手術", "醫院", "體力", "睡眠", "壓力",
    "焦慮", "痘痘", "皮膚", "病", "傷",
  ],
};

const FOCUS_PRIORITY: Exclude<QuestionFocusPrimary, "general">[] = [
  "finance", "career", "love", "relationship", "health",
];

function detectQuestionFocus(question: string): QuestionFocus {
  if (!question) return { primary: "general" };
  let primary: QuestionFocusPrimary = "general";
  let secondary: Exclude<QuestionFocusPrimary, "general"> | undefined;

  for (const f of FOCUS_PRIORITY) {
    if (FOCUS_KEYWORDS[f].some((k) => question.includes(k))) {
      if (primary === "general") primary = f;
      else { secondary = f; break; }
    }
  }
  return secondary ? { primary, secondary } : { primary };
}

function getFocusLabel(focus: QuestionFocus): string {
  const labels: Record<QuestionFocusPrimary, string> = {
    finance: "財運", career: "工作", love: "感情",
    relationship: "人際關係", health: "健康", general: "生活綜合",
  };
  const pri = labels[focus.primary];
  return focus.secondary ? `${pri}與${labels[focus.secondary]}` : pri;
}

function getTopicLabel(topic: TarotReadingTopic): string {
  return { love: "愛情", career: "工作", ambiguous: "曖昧", general: "生活" }[topic];
}

// ── 主題聚焦指令 ──────────────────────────────────────────────────────────────

function getTopicGuidance(topic: TarotReadingTopic, focus: QuestionFocus): string {
  switch (focus.primary) {
    case "finance":
      return `【財運強制聚焦】至少 70% 內容圍繞：收入狀態、支出壓力、理財方向、投資機會/風險、現金流、財務瓶頸。
第一個回應欄位必須直接說明近期財運走向，不可用「宇宙照顧你」「你值得被愛」取代財務分析。`;
    case "career":
      return `【工作強制聚焦】至少 70% 內容圍繞：工作發展機會、職場環境、離職/轉職/升遷判斷、與主管同事互動、具體行動建議。
情緒療癒不超過 30%，不要大量討論感情。`;
    case "love":
      return `【感情強制聚焦】至少 70% 內容圍繞：對方態度、關係走向、復合機率/曖昧進展、溝通問題、是否值得繼續投入。
避免整篇都是自我療癒，不回應關係問題。`;
    case "relationship":
      return `【人際關係聚焦】至少 70% 內容圍繞：對方態度、誤解或衝突來源、溝通方式、如何應對改善。`;
    case "health":
      return `【身心健康聚焦】至少 70% 內容圍繞：壓力來源、作息、飲食習慣、情緒循環、身體警訊、過度消耗或恢復期。
不提供醫療診斷，但從牌面給予身心狀態提醒。safetyNote 欄位必須填入：「如果症狀持續、惡化，或已經影響生活，建議尋求皮膚科或專業醫療協助。」`;
    default:
      return {
        love:      "請偏向愛情關係、情緒需求、關係中的真實問題與是否值得繼續投入。",
        career:    "請偏向工作狀態、職涯選擇、機會判斷、卡住原因與接下來可採取的行動。",
        ambiguous: "請偏向曖昧關係、試探與拉扯、對方心態、訊息冷熱、是否該主動，以及如何保護自己的安全感。",
        general:   "請偏向生活狀態、內在整理、目前課題與溫柔提醒。",
      }[topic];
  }
}

// ── 牌卡說明文字（注入 prompt）────────────────────────────────────────────────

function getSpreadLabels(): Record<TarotSpreadPosition, string> {
  return {
    past:    "過去背景",
    present: "目前狀態",
    future:  "接下來的走向",
  } satisfies Record<TarotSpreadPosition, string>;
}

function describeCard(card: TarotReadingCard, posLabel: string): string {
  const ori       = card.position === "upright" ? "正位" : "逆位";
  const suit      = card.suit    ? `｜牌組：${card.suit}`    : "";
  const enName    = card.nameEn  ? `｜英文：${card.nameEn}`  : "";
  const kw        = card.keywords?.length ? `｜關鍵字：${card.keywords.join("、")}` : "";
  const base      = card.baseMeaning   ? `\n   牌面核心：${card.baseMeaning}`   : "";
  const topicMeaning = card.topicMeaning  ? `\n   主題牌義：${card.topicMeaning}`  : "";
  const msg       = card.meaning       ? `\n   已抽牌訊息：${card.meaning}`      : "";

  return `牌位：${posLabel}｜${card.name}（${ori}）${suit}${enName}${kw}${base}${topicMeaning}${msg}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// 品質檢查（避免通用模板）
// ═════════════════════════════════════════════════════════════════════════════

const BANNED_GENERIC_PHRASES = [
  "你需要好好休息",
  "你需要照顧自己",
  "身心需要補充能量",
  "宇宙提醒你慢下來",
  "先把自己放在第一位",
  "你現在正在轉變",
  "先整理自己",
  "方向會慢慢清晰",
  "明天的你會更懂",
  "相信自己的光",
  "宇宙正在提醒你",
  "有些舊的模式在鬆動",
  "新的方向還沒完全成形",
  "先把心收回來",
];

/**
 * 回傳 true 表示這段文字太像通用模板，需要重試
 * 條件：(1) 抽到的牌名沒有出現在文字中，或 (2) 禁用通用句出現 ≥ 3 個
 */
function isGenericResponse(text: string, cards: TarotReadingCard[]): boolean {
  const allCardsMentioned = cards.every((c) => text.includes(c.name));
  if (!allCardsMentioned) return true;

  const bannedCount = BANNED_GENERIC_PHRASES.filter((p) => text.includes(p)).length;
  if (bannedCount >= 3) return true;

  return false;
}

const ANTI_SIMILARITY_HINT = `

【重試指令：上一版回答太通用，請重新生成】
1. cardMessage / message 欄位必須明確引用牌名及正逆位含義。
2. 禁止出現：「你需要好好休息」「你需要照顧自己」「身心需要補充能量」「宇宙提醒你慢下來」「先把自己放在第一位」。
3. 根據這次實際抽到的牌，提供明顯不同的具體判斷。`;

// ═════════════════════════════════════════════════════════════════════════════
// 去重工具（消除 AI 重複句）
// ═════════════════════════════════════════════════════════════════════════════

/**
 * 以句號/驚嘆號/問號/換行分句，去除完全相同的句子（保留第一次出現）。
 * 只用於單張牌 cardMessage / questionAnswer，不影響任何傳送格式。
 */
function deduplicateSentences(text: string): string {
  if (!text) return text;
  // 分句：在句末標點後 + 空白或換行 處斷開，保留標點
  const sentences = text.split(/(?<=[。！？\n])/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const s of sentences) {
    const key = s.replace(/\s/g, "");
    if (!seen.has(key)) {
      seen.add(key);
      result.push(s);
    }
  }
  return result.join("").trim();
}

// ═════════════════════════════════════════════════════════════════════════════
// JSON 解析
// ═════════════════════════════════════════════════════════════════════════════

function extractJsonString(raw: string): string {
  // 移除 markdown 代碼塊
  let s = raw.replace(/^```json\s*/m, "").replace(/^```\s*/m, "").replace(/```\s*$/m, "").trim();
  const start = s.indexOf("{");
  const end   = s.lastIndexOf("}");
  if (start === -1 || end === -1) return "";
  return s.slice(start, end + 1);
}

/**
 * forcedCategory：用使用者選擇的分類（愛情/工作/生活）覆蓋 AI 輸出的 category，
 * 防止 AI 返回「生活綜合」等錯誤分類。
 */
function parseSingleCardJson(raw: string, forcedCategory?: string): SingleCardReading | null {
  try {
    const json   = extractJsonString(raw);
    if (!json) return null;
    const parsed = JSON.parse(json) as Partial<SingleCardReading>;
    if (parsed.spreadType !== "single") return null;
    if (!parsed.cardMessage || !parsed.oneLineConclusion || !parsed.todayAction) return null;
    if (forcedCategory) parsed.category = forcedCategory;
    // 對 cardMessage / questionAnswer 做句子去重
    if (parsed.cardMessage)    parsed.cardMessage    = deduplicateSentences(parsed.cardMessage);
    if (parsed.questionAnswer) parsed.questionAnswer = deduplicateSentences(parsed.questionAnswer);
    return parsed as SingleCardReading;
  } catch {
    return null;
  }
}

/**
 * 解析三張牌 JSON，容許部分欄位缺失並補上預設值。
 * forcedCategory：用使用者選擇的分類覆蓋 AI 輸出的 category。
 */
function parseThreeCardJson(raw: string, forcedCategory?: string): ThreeCardReading | null {
  try {
    const json = extractJsonString(raw);
    if (!json) return null;
    const p = JSON.parse(json) as Record<string, unknown>;

    // cards 必須有 3 筆（核心結構）
    if (!Array.isArray(p.cards) || p.cards.length < 3) {
      console.warn("[tarot-reading] parseThreeCardJson: cards length <3, raw snippet:", raw.slice(0, 200));
      return null;
    }

    const defaultPositions = ["目前狀態", "阻礙或盲點", "接下來的建議"];
    const cards = (p.cards as unknown[]).slice(0, 3).map((c, i): ThreeCardEntry => {
      const entry = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      // keywords 支援 string[] 或逗號分隔字串
      let keywords: string[] | undefined;
      if (Array.isArray(entry.keywords)) {
        keywords = (entry.keywords as unknown[])
          .filter((k): k is string => typeof k === "string")
          .slice(0, 3);
      } else if (typeof entry.keywords === "string") {
        keywords = entry.keywords.split(/[,，、]/).map((k) => k.trim()).filter(Boolean).slice(0, 3);
      }
      return {
        position:     typeof entry.position    === "string" ? entry.position    : defaultPositions[i]!,
        cardName:     typeof entry.cardName    === "string" ? entry.cardName    : `第${i + 1}張牌`,
        orientation:  typeof entry.orientation === "string" ? entry.orientation : "正位",
        keywords,
        shortSummary: typeof entry.shortSummary === "string" ? entry.shortSummary : undefined,
        message:      typeof entry.message     === "string" ? entry.message     : "這張牌的訊息正在凝聚中，請稍後再細細感受。",
      };
    }) as [ThreeCardEntry, ThreeCardEntry, ThreeCardEntry];

    // actionSteps 支援 string[] 或換行分隔字串
    let actionSteps: string[] = [];
    if (Array.isArray(p.actionSteps)) {
      actionSteps = (p.actionSteps as unknown[])
        .filter((s): s is string => typeof s === "string")
        .slice(0, 5);
    } else if (typeof p.actionSteps === "string") {
      actionSteps = p.actionSteps.split(/\n|；/).map((s) => s.trim()).filter(Boolean).slice(0, 5);
    }
    if (!actionSteps.length) {
      actionSteps = ["Day 1–2：先觀察當下的狀態，不急著行動", "Day 3–4：選一件可以執行的小事開始", "Day 5–7：把注意力收回來，整理自己的感受"];
    }

    const result: ThreeCardReading = {
      spreadType:      "three",
      // forcedCategory 永遠優先（使用者選擇的分類），防止 AI 返回錯誤類別
      category:        forcedCategory ?? (typeof p.category === "string" ? p.category : "生活綜合"),
      questionFocus:   typeof p.questionFocus  === "string" ? p.questionFocus  : "你的問題已收到，以下是這組牌的訊息。",
      overallSummary:  typeof p.overallSummary === "string" ? p.overallSummary : "整體答案：\n這組牌指出你目前面對的核心問題，以及下一步最需要關注的方向。\n\n為什麼會這樣：\n三張牌的脈絡顯示，你目前的困境有幾個面向交疊，需要先找出最核心的那個，再集中資源處理。",
      cards,
      combinedReading: typeof p.combinedReading === "string" ? p.combinedReading : "",
      actionSteps,
      next3To7Days:    actionSteps.join("\n"),
      gentleReminder:  typeof p.gentleReminder === "string" ? p.gentleReminder : "今晚先把最吵的念頭放下，從一件你能控制的小事開始行動。",
      blessing:        typeof p.blessing       === "string" ? p.blessing       : "願你在尋找答案的路上，也能慢慢找回自己的節奏。",
      safetyNote:      typeof p.safetyNote     === "string" && p.safetyNote ? p.safetyNote : undefined,
    };
    return result;
  } catch (err) {
    console.error("[tarot-reading] parseThreeCardJson failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// JSON → 文字格式化（前端收到的 reading 欄位仍是純文字）
// ═════════════════════════════════════════════════════════════════════════════

function formatSingleCardReading(r: SingleCardReading): string {
  const parts: string[] = [
    `🎯 本次問題焦點\n\n${r.category}`,
    `🔮 一句話結論\n\n${r.oneLineConclusion}`,
    `🌙 宇宙偷偷話\n\n${r.questionFocus}`,
    // cardMessage 只說牌義；格式與前端解析器相容（標題仍為「這張牌正在說什麼」）
    `✨ 這張牌正在說什麼\n\n${r.cardName}（${r.orientation}）\n${deduplicateSentences(r.cardMessage)}`,
  ];
  // 若有 questionAnswer（針對你的問題），獨立成段
  if (r.questionAnswer) {
    parts.push(`🔍 針對你的問題\n\n${deduplicateSentences(r.questionAnswer)}`);
  }
  parts.push(
    `🐾 今天可以怎麼做\n\n${r.todayAction}`,
    `🌌 給你的溫柔提醒\n\n${r.gentleReminder}`,
    `💫 一句專屬祝福\n\n${r.blessing}`,
  );
  if (r.safetyNote) parts.push(`⚠️ 健康提醒\n\n${r.safetyNote}`);
  return parts.join("\n\n");
}

function formatThreeCardReading(r: ThreeCardReading): string {
  // null-safe：任何欄位缺失都補預設值，絕不 throw
  const safe = {
    category:        r.category        || "生活綜合",
    questionFocus:   r.questionFocus   || "以下是這組牌對你問題的訊息。",
    overallSummary:  r.overallSummary  || "",
    combinedReading: r.combinedReading || "這三張牌之間有一條清晰的脈絡，需要從三個面向一起看才能完整理解。",
    gentleReminder:  r.gentleReminder  || "今晚先把最吵的念頭放下，從一件你能控制的小事開始行動。",
    blessing:        r.blessing        || "願你在尋找答案的路上，也能慢慢找回自己的節奏。",
  };

  const cardsArr = Array.isArray(r.cards) ? r.cards : [];

  // 卡片段落：每張牌包含 shortSummary（摘要）和 message（完整）
  const cardParts = cardsArr.map((c, i) => {
    const pos  = c?.position    || `第${i + 1}張`;
    const name = c?.cardName    || `牌${i + 1}`;
    const ori  = c?.orientation || "正位";
    const msg  = c?.message     || "這張牌的訊息正在凝聚中。";
    const kw   = Array.isArray(c?.keywords) && c.keywords.length
      ? `關鍵字：${c.keywords.slice(0, 3).join("、")}`
      : "";
    const short = c?.shortSummary || "";
    // 格式：CARD_SECTION 標記讓前端新版解析器可辨識
    return [
      `🃏 第${i + 1}張牌：${pos}`,
      ``,
      `${name}（${ori}）${kw ? `｜${kw}` : ""}`,
      short ? `摘要：${short}` : "",
      ``,
      msg,
    ].filter((l) => l !== "").join("\n");
  });

  // actionSteps 格式化：用 \n\n 分隔各步驟，讓前端可以正確分組
  const actionStepsText = Array.isArray(r.actionSteps) && r.actionSteps.length
    ? r.actionSteps.join("\n\n")
    : (r.next3To7Days || "Day 1–2：先觀察當下狀態\nDay 3–4：選一件可執行的小事\nDay 5–7：整理自己的感受");

  const parts: string[] = [
    `🎯 本次問題焦點\n\n${safe.category}`,
    `🌙 宇宙偷偷話\n\n${safe.questionFocus}`,
  ];

  // 牌陣總結（若有）
  if (safe.overallSummary) {
    parts.push(`🌟 牌陣總結\n\n${safe.overallSummary}`);
  }

  parts.push(...cardParts);
  // 「三張牌整合訊息」已移除（內容合併進「牌陣總結」的「為什麼會這樣」段落）
  parts.push(`🕯️ 3～7 天行動建議\n\n${actionStepsText}`);
  parts.push(`🌌 給你的溫柔提醒\n\n${safe.gentleReminder}`);
  parts.push(`💫 一句專屬祝福\n\n${safe.blessing}`);

  if (r.safetyNote) parts.push(`⚠️ 健康提醒\n\n${r.safetyNote}`);

  return parts.join("\n\n");
}

// ═════════════════════════════════════════════════════════════════════════════
// Fallback 靜態文字輔助函式（AI 不可用時使用）
// ═════════════════════════════════════════════════════════════════════════════

function getFallbackConclusion(focus: QuestionFocus): string {
  switch (focus.primary) {
    case "finance":      return "近期財務有機會調整，但需要先把收支看清楚，而不是等待大機會自己出現。";
    case "career":       return "工作上的卡關不是能力問題，而是還沒確認真正想走的方向——先把這件事說清楚，再決定下一步。";
    case "love":         return "這段感情不是沒有可能，但需要觀察對方是否真的有靠近的行動，而不是只靠你一個人努力。";
    case "relationship": return "人際的誤解需要有人先開口，溝通比沉默更能讓關係找到出路。";
    case "health":       return "身體發出的訊號需要被認真對待，先找出是什麼讓你持續消耗，再談其他事。";
    default:             return "目前的問題有解，但需要先把最核心的那個卡點找出來，集中資源處理它。";
  }
}

function getFallbackTodayAction(focus: QuestionFocus): string {
  switch (focus.primary) {
    case "finance":
      return "先把近期收支大概整理一下，讓自己知道錢去哪裡；再找一個可以減少不必要支出的小行動。";
    case "career":
      return "把「我想要的工作狀態」用幾個字寫下來，對照現在的落差，那就是現在最需要動的地方。";
    case "love":
      return "先把自己最在意的問題具體說清楚（哪怕只在心裡說給自己聽），再決定要不要主動溝通。";
    case "relationship":
      return "先確認自己想要的結果是修復還是保持距離，以結果為出發點決定下一步。";
    case "health":
      return "這週先安排一件照顧自己的事：好好睡覺、減少一個耗能習慣、或做一件讓心情變輕的小事。";
    default:
      return "選一件能讓自己更穩的小行動，把注意力從反覆猜測帶回當下。";
  }
}

function getFallbackNext3To7Days(focus: QuestionFocus): string {
  switch (focus.primary) {
    case "finance":
      return [
        "Day 1～2｜先釐清收支\n今天就把近期的收支用任何方式記下來（手機備忘錄也好），找出最大的支出項目和最容易調整的地方，不要只靠感覺，要看數字。",
        "Day 3～4｜尋找機會\n留意有沒有可以跟進的收入機會，或是之前一直拖著沒做的財務決定（例如申請、詢價、整理資產）——這種時候有行動比繼續等更有用。",
        "Day 5～7｜執行一件事\n選一件小但具體的財務行動：刪除一個訂閱、增加一筆小收入來源、或認真研究一個你一直有興趣但沒有深入了解的理財方法。",
      ].join("\n\n");
    case "career":
      return [
        "Day 1～2｜確認方向\n用 10 分鐘寫下「我真正想要的工作狀態是什麼」——不是你覺得應該想要的，而是真實感覺上讓你有動力、有安全感的狀態，盡量具體。",
        "Day 3～4｜找出落差\n對照你目前的工作，找出最大的落差在哪一點。如果落差很大，開始更新履歷或作品集；如果只是一個卡關，試著找一個可以信任的人聊一次。",
        "Day 5～7｜推進一步\n選一個可以推進的小行動：傳一封信、約一次對話、或申請一件你之前一直在觀望的事。不要繼續等到「準備好了」才動。",
      ].join("\n\n");
    case "love":
      return [
        "Day 1～2｜先觀察\n先不要主動逼出答案，留意對方這幾天有沒有自然的靠近——不是大動作，而是日常的小事（一條訊息、一個問候），這些比宣言更能反映真實態度。",
        "Day 3～4｜整理感受\n如果你有話想說，先在心裡或紙上把它說一遍，幫自己整理清楚「我最在意的是什麼、我最需要對方給我的是什麼」。",
        "Day 5～7｜說出口\n選一個輕鬆的時機，說出你想說的話，不用說得漂亮，說真實的就好。清楚的表達，比繼續猜測更能讓這段關係往前走。",
      ].join("\n\n");
    case "relationship":
      return [
        "Day 1～2｜先冷靜\n不要在情緒最高漲的時候做決定。可以把自己的感受寫下來，但先不要傳出去，讓情緒沉澱一下。",
        "Day 3～4｜輕輕開口\n找一個相對平靜的時機，試著輕輕開啟對話——不需要解決全部，只要讓對方知道「你有感受到這件事」就夠了。",
        "Day 5～7｜確認自己的需求\n不管這段關係最後走向哪裡，都記得問自己：「我在這段關係裡有沒有好好照顧到自己的需求？」答案很重要。",
      ].join("\n\n");
    case "health":
      return [
        "Day 1～2｜補回睡眠\n這兩天最重要的事是把睡眠補回來。如果睡眠沒問題，找出一個讓你持續消耗精力的習慣，看看能不能先暫停或減少。",
        "Day 3～4｜找出規律\n記錄一下這幾天什麼時候最感到疲累或焦慮，找出規律。是特定時間、情境、還是特定的人？知道來源，才能針對性地調整。",
        "Day 5～7｜充電時間\n安排一件純粹讓自己充電的事——不是為了變好、不是為了任何目的，只是因為你喜歡或覺得放鬆。給自己這個時間，不是浪費，是必要的。",
      ].join("\n\n");
    default:
      return [
        "Day 1～2｜寫下來\n把你這幾天反覆在想的那件事，完整地用文字寫下來。不用寫得漂亮，把它從腦子裡移到紙上，你的思路會清晰很多。",
        "Day 3～4｜分類行動\n把那件事分成「我能控制的部分」和「我不能控制的部分」兩欄，把注意力放在你能控制的那欄，先在那裡採取一個小行動。",
        "Day 5～7｜完成一件\n選一件你一直拖著沒做但其實不難的事，今天就完成它。完成後你會發現，推進一件事的成就感，會帶動其他事情也開始動起來。",
      ].join("\n\n");
  }
}

function getFallbackGentleReminder(focus: QuestionFocus): string {
  switch (focus.primary) {
    case "finance":
      return `這段時間最重要的不是立刻賺更多，而是先讓錢的流向變得清楚。當你開始知道錢去哪裡，財運才會慢慢穩下來。不是每個財務問題都需要大動作，有時候從一件小事開始整理，反而最有效。`;
    case "career":
      return `你不需要今晚就把所有未來想清楚。先看清楚目前手上能掌握的資源，再決定下一步要往哪裡走。工作上的卡關，常常不是因為你不夠好，而是現在的位置和你真正想要的還有一段距離——知道這件事，就已經開始在改變了。`;
    case "love":
      return `如果這段關係讓你心動，也讓你不安，今晚先不要急著逼自己選邊站。真正適合你的人，不會只讓你猜，而會慢慢讓你感覺安定。觀察對方的行動，比反覆揣測對方的心意，要清楚得多。`;
    case "relationship":
      return `關係裡的誤解，很多時候不是壞心，只是大家都習慣不說出口。如果你覺得距離在拉大，先試著用一句話把你的感受說出來——不用說得完整，說真實的就好。`;
    case "health":
      return `身體給你的訊號，值得被認真對待。不一定要馬上改變所有習慣，先找出一個讓你持續消耗的來源，能減少一點是一點——這比同時改變很多事更容易撐下去。`;
    default:
      return `今晚先把最吵的念頭放下，不是所有事都需要今晚想清楚。從一件你能控制的小事開始行動，其他的事情會跟著慢慢清晰。`;
  }
}

function getFallbackBlessing(focus: QuestionFocus): string {
  switch (focus.primary) {
    case "finance":      return `願你的每一份收入與支出，都慢慢走向安穩與自由。`;
    case "career":       return `願你的努力被看見，也願你有勇氣選擇真正適合自己的路。`;
    case "love":         return `願你喜歡的人，不只讓你心動，也能讓你安心。`;
    case "relationship": return `願你在面對複雜的關係時，也能記得：你值得被清楚、被溫柔地對待。`;
    case "health":       return `願你慢慢學會把照顧自己當成一件重要的事，而不是做完所有事之後才剩下的選擇。`;
    default:             return `願你在不確定裡，也能一步一步走回自己的節奏。`;
  }
}

function getHealthSafetyNote(focus: QuestionFocus): string {
  if (focus.primary !== "health") return "";
  return "如果症狀持續、惡化，或已經影響生活，建議尋求皮膚科或專業醫療協助。";
}

// ═════════════════════════════════════════════════════════════════════════════
// 靜態 Fallback（AI 不可用時）
// ═════════════════════════════════════════════════════════════════════════════

function buildSingleCardFallback(
  card: TarotReadingCard,
  _topic: TarotReadingTopic,
  question: string
): string {
  const focus      = detectQuestionFocus(question);
  // 永遠使用使用者選擇的分類，而非 detectQuestionFocus 的結果
  const focusLabel = getTopicLabel(_topic);
  const ori        = card.position === "upright" ? "正位" : "逆位";
  const isUpright  = card.position === "upright";
  const kw         = card.keywords?.slice(0, 3).join("、") || "";

  // 利用牌面資訊組合有深度的牌義說明
  const basePart    = card.baseMeaning   ? card.baseMeaning   : "";
  const topicPart   = card.topicMeaning  ? card.topicMeaning  : "";
  const meaningPart = card.meaning       ? card.meaning       : "";

  // 組合出 120~200 字的牌義說明
  const cardMeaningLines: string[] = [];
  if (basePart)   cardMeaningLines.push(basePart);
  if (topicPart && topicPart !== basePart)  cardMeaningLines.push(topicPart);
  if (meaningPart && meaningPart !== basePart && meaningPart !== topicPart) cardMeaningLines.push(meaningPart);

  const coreMeaning = cardMeaningLines.join("；") ||
    (isUpright
      ? `${card.name}正位的能量是清晰前行的，它的出現說明此刻有具體的方向可以踩踏，只是你可能還在猶豫是否要踏出那一步。`
      : `${card.name}逆位出現，代表這個面向的能量正在受阻或被壓抑，需要先看清楚是什麼在阻礙流動，才能找到真正的出路。`);

  // 宇宙偷偷話：直接回應使用者心情，不複述問題
  const questionFocusText = (() => {
    if (focus.primary === "love") return isUpright
      ? "你其實不是不想靠近，只是害怕期待落空，又要自己一個人收拾。"
      : "你一直在等對方給一個明確的訊號，但同時也在懷疑自己是不是等錯了。";
    if (focus.primary === "career") return isUpright
      ? "你知道自己想要什麼，只是不確定現在是不是對的時機。"
      : "你其實比你以為的更清楚問題在哪裡，只是不想正面承認那個答案。";
    if (focus.primary === "finance") return isUpright
      ? "你一直覺得再努力一點就能解決，但真正缺的不是努力，而是把錢的流向看清楚。"
      : "財務上的焦慮不是因為你能力不夠，而是有些選擇一直在迴避。";
    if (focus.primary === "relationship") return isUpright
      ? "你已經感覺到有些話需要說，只是不確定對方願不願意聽。"
      : "這段關係裡，你一直在衡量值不值得開口——其實那個遲疑本身就是答案。";
    return question
      ? "你把這個問題帶進來，代表你已經想得夠久了，現在需要的不是繼續想，而是一個方向。"
      : "你把問題放在心裡，這張牌接住了你此刻最需要被看見的部分。";
  })();

  // cardMessage：只說牌義，不提問題
  const cardMessage = deduplicateSentences(
    `${card.name}（${ori}）${kw ? `，關鍵字「${kw}」。` : "。"}${coreMeaning}`
  );

  // questionAnswer：把牌義連回使用者問題，給具體方向
  const questionAnswer = getFallbackFocusMessage(focus, isUpright);

  return formatSingleCardReading({
    spreadType:        "single",
    category:          focusLabel,
    cardName:          card.name,
    orientation:       ori,
    questionFocus:     questionFocusText,
    cardMessage,
    questionAnswer,
    oneLineConclusion: getFallbackConclusion(focus),
    todayAction:       getFallbackTodayAction(focus),
    gentleReminder:    getFallbackGentleReminder(focus),
    blessing:          getFallbackBlessing(focus),
    safetyNote:        getHealthSafetyNote(focus),
  });
}

/** 依焦點回傳正/逆位的具體提示訊息（用於 fallback 牌義延伸）*/
function getFallbackFocusMessage(focus: QuestionFocus, isUpright: boolean): string {
  if (focus.primary === "finance") {
    return isUpright
      ? "財務上的機會是存在的，但它需要你主動整理現況，而不是等待時機自己出現。先把近期的收支狀況看清楚，才能知道哪裡有空間可以動。"
      : "財務上的阻礙不是你能力不足，而是目前有些東西還沒有被看清楚。先停下來，不要倉促做任何大的財務決定，整理之後會更明白。";
  }
  if (focus.primary === "career") {
    return isUpright
      ? "工作上的方向是有的，只是你可能還在等一個更確定的訊號才願意踏出。這張牌在說：現在的狀態已經可以開始行動，不需要等到一切都準備好。"
      : "工作上的卡關，不是你做得不夠好，而是現在的方向和你真正想走的路之間有落差。停下來想清楚「我真正想要的是什麼」，比繼續硬撐更重要。";
  }
  if (focus.primary === "love") {
    return isUpright
      ? "感情上有流動的可能，這張牌說的是：此刻的能量是開放的，但需要你更清楚地表達自己想要什麼，對方才能真正靠近。"
      : "感情上的停滯，可能來自雙方都在等對方先開口。逆位的能量在說：先把你自己的感受說清楚，不要只是等待。";
  }
  return isUpright
    ? "目前的狀態是可以往前走的，只是你需要先把心裡最擔心的那個問題說清楚，才能讓行動更有方向。"
    : "目前有些東西被卡住了，但那不是終點——只是在提示你需要先停下來，看清楚是什麼讓自己動不了，再重新出發。";
}

function buildThreeCardFallback(
  cards: TarotReadingCard[],
  _topic: TarotReadingTopic,
  question: string
): string {
  const focus      = detectQuestionFocus(question);
  // 永遠使用使用者選擇的分類，而非 detectQuestionFocus 的結果
  const focusLabel = getTopicLabel(_topic);
  const spreadLabels = getSpreadLabels();

  const defaultPositions = ["目前狀態", "阻礙或盲點", "接下來的建議"];
  const positionRoles = [
    "代表你目前正在面對或已經在走的狀態與背景",
    "代表讓你卡住、看不清楚、或需要正視的阻力與盲點",
    "代表接下來比較適合走的方向，以及宇宙給你的提示",
  ];

  const cardEntries: ThreeCardEntry[] = cards.map((card, i) => {
    const ori        = card.position === "upright" ? "正位" : "逆位";
    const isUpright  = card.position === "upright";
    const posLabel   = card.spreadPosition
      ? spreadLabels[card.spreadPosition]
      : (defaultPositions[i] ?? `第${i + 1}張`);
    const posRole    = positionRoles[i] ?? positionRoles[0];
    const kw         = card.keywords?.slice(0, 3).join("、") || "";
    const basePart   = card.baseMeaning  || "";
    const topicPart  = card.topicMeaning || "";
    const meaningPart = card.meaning     || "";

    const coreLines: string[] = [];
    if (basePart)                                       coreLines.push(basePart);
    if (topicPart  && topicPart   !== basePart)         coreLines.push(topicPart);
    if (meaningPart && meaningPart !== basePart && meaningPart !== topicPart) coreLines.push(meaningPart);

    const coreMeaning = coreLines.join("；") || (isUpright
      ? `${card.name}正位代表這個面向的能量是清晰可動的，有具體的可能性正在成形。`
      : `${card.name}逆位代表這個面向的能量受到阻礙或壓抑，需要先正視才能解開。`);

    // 三小段格式：牌面重點 / 對你的問題代表 / 這張牌提醒你
    const msg = [
      `牌面重點：`,
      `${card.name}（${ori}）${kw ? `，關鍵字「${kw}」。` : "。"}${coreMeaning}`,
      ``,
      `對你的問題代表：`,
      `這張牌在「${posLabel}」的位置，${posRole}。它的出現說明你目前這個面向的狀態有值得深入看清楚的地方——不是要你立刻採取行動，而是先讓自己真正理解這裡發生了什麼。`,
      ``,
      `這張牌提醒你：`,
      getFallbackFocusMessage(focus, isUpright),
    ].join("\n");

    return {
      position:    posLabel,
      cardName:    card.name,
      orientation: ori,
      message:     msg,
      shortSummary: `${card.name}（${ori}）——${coreMeaning.slice(0, 40)}`,
    };
  });

  const cardNamesStr = cards.map((c) => c.name).join("、");

  // combinedReading：依焦點給出有深度的三牌整合
  const combinedReading = getFallbackCombinedReading(focus, cardNamesStr, cards);

  const actionStepsText = getFallbackNext3To7Days(focus);
  const actionSteps = actionStepsText.split("\n").map((s) => s.trim()).filter(Boolean);

  return formatThreeCardReading({
    spreadType:      "three",
    category:        focusLabel,
    questionFocus:   question ? `你的問題是「${question}」，以下是這三張牌從三個面向給你的完整解讀。` : "你把問題放在心裡，這三張牌從不同角度接住了此刻的能量。",
    overallSummary:  getFallbackOverallSummary(focus, cardNamesStr),
    cards:           cardEntries as [ThreeCardEntry, ThreeCardEntry, ThreeCardEntry],
    combinedReading,
    actionSteps,
    next3To7Days:    actionStepsText,
    gentleReminder:  getFallbackGentleReminder(focus),
    blessing:        getFallbackBlessing(focus),
    safetyNote:      getHealthSafetyNote(focus),
  });
}

/** Fallback 牌陣總結（overallSummary），兩段格式：整體答案 + 為什麼會這樣 */
function getFallbackOverallSummary(focus: QuestionFocus, cardNamesStr: string): string {
  switch (focus.primary) {
    case "finance":
      return `整體答案：\n近期財務不是沒有機會，但真正卡住的是你還沒看清楚「錢去哪裡了、哪裡可以省、哪裡可以增加」。先把這三件事找清楚，財務才能開始流動。\n\n為什麼會這樣：\n${cardNamesStr} 這三張牌的脈絡顯示，財務壓力有一部分來自舊的支出習慣或還沒解決的負擔，正在佔據你的財務空間。接下來的方向是先把收支看清楚，再做決定，不要在資訊不明的狀態下衝動行動。`;
    case "career":
      return `整體答案：\n工作上的卡關不是能力問題，而是你還沒確認「接下來真正想走的方向」——先把這件事說清楚，再決定要衝還是等。\n\n為什麼會這樣：\n${cardNamesStr} 這三張牌顯示，你目前的狀態是在用舊有方式應對一個需要重新選擇的處境。不是硬撐，不是倉促離職，而是先把「我真正想要的工作型態」說清楚，再決定下一步行動方向。`;
    case "love":
      return `整體答案：\n這段感情不是沒有可能，但目前需要觀察對方是否真的有靠近的行動，而不是只靠你一個人努力在維持。\n\n為什麼會這樣：\n${cardNamesStr} 這三張牌反映出，感情裡的停滯不是因為沒有感覺，而是有些話還沒說清楚，讓雙方距離慢慢拉大。接下來的方向：如果對方有穩定行動，可以給一次機會；如果持續讓你反覆焦慮，就需要開始把重心放回自己。`;
    case "relationship":
      return `整體答案：\n人際的誤解不會自己消失，需要有人先把話說清楚，溝通比沉默更能讓關係找到出路。\n\n為什麼會這樣：\n${cardNamesStr} 這三張牌顯示，目前的距離感來自雙方都在等對方先開口。接下來適合主動溝通，但不需要一次解決全部，先讓對方知道「你有感受到這件事」就夠了。`;
    case "health":
      return `整體答案：\n身體發出的訊號需要被認真對待，現在最重要的不是改變所有習慣，而是先找出最大的消耗來源。\n\n為什麼會這樣：\n${cardNamesStr} 這三張牌顯示，你目前的身心狀態有持續被消耗的跡象。接下來的方向：先把睡眠補回來，找出一個讓你持續耗損的習慣，從減少那件事開始調整。`;
    default:
      return `整體答案：\n目前的問題有解，但需要先把最核心的那個卡點找出來，集中資源處理它，而不是試圖同時解決全部。\n\n為什麼會這樣：\n${cardNamesStr} 這三張牌共同指向一個核心：你現在的困境是幾個面向疊加讓你動不了。接下來的方向：選一件你能控制的事情開始行動，其他的事情會跟著慢慢清晰——不需要等到全部想通才能動。`;
  }
}

/** Fallback 三張牌整合訊息（combinedReading），依焦點回傳 150～250 字 */
function getFallbackCombinedReading(focus: QuestionFocus, cardNamesStr: string, cards: TarotReadingCard[]): string {
  const card1 = cards[0]?.name ?? "第一張";
  const card2 = cards[1]?.name ?? "第二張";
  const card3 = cards[2]?.name ?? "第三張";
  const ori1  = cards[0]?.position === "upright" ? "正位" : "逆位";
  const ori2  = cards[1]?.position === "upright" ? "正位" : "逆位";
  const ori3  = cards[2]?.position === "upright" ? "正位" : "逆位";

  switch (focus.primary) {
    case "finance":
      return `把這三張牌放在一起看，${card1}（${ori1}）說的是你目前的財務背景和現況，${card2}（${ori2}）指出是什麼讓你在財務上動彈不得，而 ${card3}（${ori3}）則是接下來財務可以流動的方向。\n\n三張牌合起來的脈絡是：目前的財務壓力有一部分來自舊的支出習慣或還沒解決的負擔，這些東西正在佔據你的財務空間，讓新的機會難以進來。真正卡住的點，是你還沒有完整地看清楚「錢去哪裡了、哪裡可以省、哪裡可以增加」。接下來的方向，是先把這些看清楚，再做決定，而不是在資訊不清楚的狀態下倉促行動。`;
    case "career":
      return `把這三張牌放在一起看，${card1}（${ori1}）說的是你目前工作上的背景狀態，${card2}（${ori2}）指出你在職涯上真正卡住的地方，而 ${card3}（${ori3}）則是接下來比較適合走的方向。\n\n三張牌合起來的脈絡是：你在工作上的卡關，不是因為你不夠努力，而是你一直在用旧的方式應對一個已經在改變的處境。真正需要調整的是：你有沒有認真問過自己「我現在最想要的工作型態是什麼」。方向清楚了，行動才有意義。`;
    case "love":
      return `把這三張牌放在一起看，${card1}（${ori1}）說的是這段感情目前的背景，${card2}（${ori2}）指出雙方關係中真正的阻礙是什麼，而 ${card3}（${ori3}）則是接下來感情可以往前走的方向。\n\n三張牌合起來的脈絡是：這段關係並不是完全沒有可能性，而是有些沒說清楚的事情正在讓雙方的距離拉遠。真正卡住的點，是雙方都在等對方先有所行動，這種等待讓感情陷入停滯。接下來的方向，是需要有人先把感受說出來，溝通比等待更有效。`;
    default:
      return `把這三張牌放在一起看，${card1}（${ori1}）反映你目前正在面對的背景與狀態，${card2}（${ori2}）指出讓你卡住的核心問題在哪裡，而 ${card3}（${ori3}）則是宇宙給你的方向提示。\n\n三張牌合起來的脈絡是：你目前的困境不是單一原因造成的，而是幾個面向疊加在一起。最重要的是先把最核心的那個問題找出來，而不是試圖一次解決全部。接下來，選一件你可以控制的事情開始行動，其他的事情會跟著慢慢清晰。`;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 免費版靜態解讀（無 AI，僅顯示前三段作為預覽）
// ═════════════════════════════════════════════════════════════════════════════

function buildFreeReading(
  cards: TarotReadingCard[],
  topic: TarotReadingTopic,
  question: string
): string {
  const focus      = detectQuestionFocus(question);
  const isSingle   = cards.length === 1;
  const spreadLabels = getSpreadLabels();
  // 永遠使用使用者選擇的分類（topic），不要用 detectQuestionFocus 的結果
  const topicLabel = getTopicLabel(topic);

  const cardLine = cards
    .map((c) => {
      const ori   = c.position === "upright" ? "正位" : "逆位";
      const label = c.spreadPosition ? spreadLabels[c.spreadPosition] : "此刻";
      return `${label}的 ${c.name}（${ori}）`;
    })
    .join("、");

  const questionLine = question
    ? `你放進宇宙的問題是：「${question}」`
    : "你沒有把問題說出口，但牌面仍接住了此刻的感受。";

  // 第一段依焦點給出直接回應（非通用療癒）
  const directAnswer: Record<QuestionFocusPrimary, string> = {
    finance:      `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n近期財運不是完全沒有機會，而是能量需要先整理——看清楚收支，才能讓財務開始流動。`,
    career:       `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n工作上的走向，這組牌提示你：方向比速度重要，先把真正想走的路確認清楚，再決定要衝還是等。`,
    love:         `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n感情的走向，這組牌看見的是：雙方之間還有空間，但需要更清楚的溝通，而不是繼續等待。`,
    relationship: `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n人際關係的問題，這組牌提示你：先釐清誤解的來源，溝通會比沉默更有效。`,
    health:       `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n身心狀態需要被照顧，這組牌提醒你：先把休息補回來，再談其他事。`,
    general:      `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n宇宙給你的方向不是一個大答案，而是提醒你先把最吵的那個問題找出來，從那裡開始行動。`,
  };

  const stateHint = isSingle
    ? "這張牌正在說的，比看起來更貼近你現在的狀態。有些事正在成形，需要你先看清楚卡住的位置。"
    : "這組牌正在提醒你：牌義裡的正逆位不是好壞判決，而是能量流動的方向。有些事正在成形，有些事則需要你先看清卡住的位置。";

  return `🎯 本次問題焦點

${topicLabel}

🌙 宇宙偷偷話

${questionLine}

${directAnswer[focus.primary]}

🔮 ${isSingle ? "這張牌正在說什麼" : "這組牌正在說什麼"}

${stateHint}

🐈 你現在的狀態

你其實不是沒有答案，只是最近太習慣把自己的聲音放得很小。
先不要急著證明什麼，把心收回來，答案會變得比較清楚。`;
}

// ═════════════════════════════════════════════════════════════════════════════
// AI Prompt 建構
// ═════════════════════════════════════════════════════════════════════════════

/** 單張牌 Prompt — 完整版（Facebook 解鎖後才看到，必須有解鎖價值）*/
function buildSingleCardPrompt(
  card: TarotReadingCard,
  topic: TarotReadingTopic,
  question: string,
  depth: "standard" | "deep",
  antiSimilarityHint = ""
): string {
  const focus         = detectQuestionFocus(question);
  const focusLabel    = getFocusLabel(focus);
  const topicGuidance = getTopicGuidance(topic, focus);
  const ori           = card.position === "upright" ? "正位" : "逆位";
  const kw            = card.keywords?.length ? `關鍵字：${card.keywords.join("、")}` : "";
  const base          = card.baseMeaning  ? `牌面核心：${card.baseMeaning}`  : "";
  const topicMeaning  = card.topicMeaning ? `主題牌義：${card.topicMeaning}` : "";
  const msgHint       = card.meaning      ? `牌面訊息：${card.meaning}`      : "";
  const cardDetails   = [kw, base, topicMeaning, msgHint].filter(Boolean).join("\n");

  const shortHint = question && question.length < 10
    ? `\n【短問題提示】此問題字數少（「${question}」），請先推測使用者最想確認的核心，在 questionFocus 和 oneLineConclusion 直接給出結論性回答，不要輸出通用療癒內容。`
    : "";

  const isUpright = card.position === "upright";
  const directionHint = (() => {
    if (focus.primary === "love") return isUpright
      ? "（正向牌：可以給一次機會，但觀察對方行動，不要把全部期待壓上去）"
      : "（逆向牌：先觀察對方是否真的有靠近行動；若持續讓你消耗，放手或拉開距離會更輕鬆）";
    if (focus.primary === "career") return isUpright
      ? "（正向牌：可以主動爭取、提出想法，適合讓別人看見你的能力）"
      : "（逆向牌：先整理資源與備案，不要衝動離職或硬碰硬，再做決定）";
    if (focus.primary === "finance") return isUpright
      ? "（正向牌：可以小幅嘗試，但保留安全預算）"
      : "（逆向牌：不適合衝動投資或大額花費，先守住現金流）";
    if (focus.primary === "relationship") return isUpright
      ? "（正向牌：可以主動溝通，把話說清楚）"
      : "（逆向牌：先守住界線，不要急著討好所有人）";
    return "";
  })();

  // 每個欄位的字數與職責規格
  const depthSpec = depth === "deep" ? {
    questionFocus:   "30～50字，像朋友說話，直接回應使用者當下最在意的心情或擔憂，不要複述問題，不要說「你問的是…這張牌就是…」",
    cardMessage:     "60～100字，只說這張牌（${card.name}，${ori}）本身的象徵與正逆位意義，不提使用者問題，不要說「這張牌出現在你這個問題裡」，牌名最多出現 1 次",
    questionAnswer:  "80～120字，把牌義連回使用者的原始問題，明確說出：這組牌對這個問題的判斷是什麼、目前適合前進/等待/調整/觀察哪一種方向${directionHint}",
    todayAction:     "80～140字，提供 2 個具體可執行的行動，每個說清楚怎麼做，不給「整理自己」這類抽象建議",
    gentleReminder:  "50～90字，溫柔但具體，呼應本次牌面和問題，不可以用通用療癒語",
  } : {
    questionFocus:   "20～40字，像朋友說話，直接回應使用者當下最在意的心情或擔憂",
    cardMessage:     "50～80字，只說這張牌（${card.name}，${ori}）本身的象徵與正逆位意義，牌名最多出現 1 次，不提問題",
    questionAnswer:  "60～100字，把牌義連回使用者問題，說出方向${directionHint}",
    todayAction:     "60～100字，提供 1～2 個具體行動",
    gentleReminder:  "40～70字，呼應本次牌面和問題",
  };

  return `請根據以下資料，以 JSON 格式解讀塔羅牌。只回傳純 JSON，不加說明文字。

【重要提示】這是使用者分享 Facebook 後才能解鎖的完整版，內容必須有真正的解鎖價值。

【抽牌模式】單張牌完整解讀
【問題】${question || "（未填寫問題）"}
【問題焦點】${focusLabel}
【牌卡資訊】
  牌名：${card.name}（${ori}）
  牌組：${card.suit ?? ""}
  英文名：${card.nameEn ?? ""}
  ${cardDetails}

${TAROT_READING_STYLE_RULES}
${topicGuidance}
${shortHint}
${antiSimilarityHint}

【各欄位職責 — 嚴格遵守，不能越界】
每個欄位只能負責自己的功能，同一意思在不同欄位只能說一次，不得重複。

• questionFocus（宇宙偷偷話）：${depthSpec.questionFocus}
  ✗ 禁止：「你問的是 XXX，而這張牌就是宇宙給你的回應」
  ✓ 應該像：「你其實不是不想靠近，而是害怕自己又一次失望。」

• cardMessage（這張牌正在說什麼）：${depthSpec.cardMessage}
  ✗ 禁止：重複牌義、說「這張牌出現在你這個問題裡」、提到使用者問題
  ✓ 應該像：「${card.name}${ori}代表……（純牌義，不提問題）」

• questionAnswer（針對你的問題）：${depthSpec.questionAnswer}
  ✓ 這裡才可以直接連回使用者問題，給出明確方向

• oneLineConclusion：20～40字，直接回答使用者問題，不用「你現在的狀態」開頭。

• todayAction：${depthSpec.todayAction}

• gentleReminder：${depthSpec.gentleReminder}

• blessing：20～40字，依本次分類（${getTopicLabel(topic)}）動態生成，不可每次都一樣。
  愛情：「願你喜歡的人，不只讓你心動，也能讓你安心。」（範例，請自行生成不同版本）
  工作：「願你的努力慢慢被看見，也願你有勇氣選擇真正適合你的路。」（範例）
  財運：「願你的每一步財務決定，都走向更安穩的自由。」（範例）

【嚴格禁止重複規則】
1. 同一句話不得在不同欄位重複出現。
2. 不得連續兩句表達相同意思（換個說法說同一件事也算違反）。
3. 不得為了湊字數重複牌義。
4. cardMessage 中牌名只能出現 1 次。
5. 禁止出現：「援助正在靠近」重複兩次、「走出匱乏感」重複等任何句子重複。

【解讀品質規範】
1. 只根據這一張牌（${card.name} ${ori}）解讀，不引入其他牌的概念。
2. oneLineConclusion 第一句直接回答使用者問題，不從牌義背景說起。
3. questionAnswer 必須給明確方向：正位牌 → 可以怎麼做；逆位牌 → 要注意什麼、什麼不建議做。

【輸出 JSON 格式】
{
  "spreadType": "single",
  "category": "${getTopicLabel(topic)}",
  "cardName": "${card.name}",
  "orientation": "${ori}",
  "questionFocus": "（${depthSpec.questionFocus}）",
  "oneLineConclusion": "（20～40字，直接回答使用者問題的結論）",
  "cardMessage": "（${depthSpec.cardMessage}）",
  "questionAnswer": "（${depthSpec.questionAnswer}）",
  "todayAction": "（${depthSpec.todayAction}）",
  "gentleReminder": "（${depthSpec.gentleReminder}）",
  "blessing": "（20～40字祝福語，每次不同）",
  "safetyNote": "（若問題涉及身體健康：如果症狀持續、惡化，或已經影響生活，建議尋求皮膚科或專業醫療協助。否則為空字串）"
}`;
}

/** 三張牌陣 Prompt — 完整版（Facebook 解鎖後才看到，必須明顯優於免費版）*/
function buildThreeCardPrompt(
  cards: TarotReadingCard[],
  topic: TarotReadingTopic,
  question: string,
  depth: "standard" | "deep",
  antiSimilarityHint = ""
): string {
  const focus         = detectQuestionFocus(question);
  const focusLabel    = getFocusLabel(focus);
  const topicGuidance = getTopicGuidance(topic, focus);
  const spreadLabels  = getSpreadLabels();

  const defaultPositions = ["目前狀態", "阻礙或盲點", "接下來的建議"];
  const cardDescriptions  = cards.map((card, i) => {
    const posLabel = card.spreadPosition
      ? spreadLabels[card.spreadPosition]
      : (defaultPositions[i] ?? `第${i + 1}張`);
    return `第${i + 1}張牌（位置：${posLabel}）：\n${describeCard(card, posLabel)}`;
  }).join("\n\n");

  const cardNamesForHint = cards.map((c, i) => {
    const defaultPos = defaultPositions[i] ?? `第${i + 1}張`;
    const pos = c.spreadPosition ? spreadLabels[c.spreadPosition] : defaultPos;
    const ori = c.position === "upright" ? "正位" : "逆位";
    return `${c.name}（${ori}，${pos}）`;
  }).join("、");

  const shortHint = question && question.length < 10
    ? `\n【短問題提示】此問題字數少（「${question}」），請先推測使用者最想確認的核心，在 questionFocus 和 overallSummary 直接給出結論性回答，不要輸出通用療癒內容。`
    : "";

  // 根據深度設定字數規格
  const msgSpec    = depth === "deep" ? "150～220字" : "120～180字";
  const combSpec   = depth === "deep" ? "200～300字" : "150～220字";
  const summSpec   = depth === "deep" ? "80～150字"  : "60～100字";
  const stepSpec   = depth === "deep" ? "50～80字"   : "40～60字";
  const remindSpec = depth === "deep" ? "80～150字"  : "60～100字";

  const positionSchema = cards.map((card, i) => {
    const defaultPos = defaultPositions[i] ?? `第${i + 1}張`;
    const posLabel   = card.spreadPosition ? spreadLabels[card.spreadPosition] : defaultPos;
    const ori        = card.position === "upright" ? "正位" : "逆位";
    const cardKw     = card.keywords?.slice(0, 3).join("、") ?? "";
    return `    {
      "position": "${posLabel}",
      "cardName": "${card.name}",
      "orientation": "${ori}",
      "keywords": ${cardKw ? `["${card.keywords?.slice(0,3).join('", "')}"]` : '["（關鍵字1）", "（關鍵字2）", "（關鍵字3）"]'},
      "shortSummary": "（30～50字摘要，直接說這張牌在「${posLabel}」位置對問題的核心提示，供未解鎖使用者看${cardKw ? `，可用關鍵字：${cardKw}` : ""}）",
      "message": "牌面重點：\\n（60-80字，說明「${card.name}」（${ori}）本身的核心牌義和這個方向的能量，必須引用牌名）\\n\\n對你的問題代表：\\n（60-80字，說明這張牌在「${posLabel}」位置如何回應使用者的問題，說清楚代表什麼狀況或原因，不要複製牌面重點的內容）\\n\\n這張牌提醒你：\\n（40-60字，給一個明確具體的提醒，不要和另外兩張牌的提醒重複，不要用通用療癒語句）"
    }`;
  }).join(",\n");

  return `請根據以下牌陣資料，以 JSON 格式解讀塔羅牌陣。只回傳純 JSON，不加說明文字。

【重要提示】這是使用者分享 Facebook 後才能解鎖的完整版。
使用者抽了三張牌，期待看到比單張牌更完整、更有深度的解讀。
每個欄位都要有真實的洞察，不可以過短、不可以像制式模板、不可以每個欄位只寫一句話打發。

【抽牌模式】三張牌陣完整解讀
【問題】${question || "（未填寫問題）"}
【問題焦點】${focusLabel}

【牌陣資訊】
${cardDescriptions}

${TAROT_READING_STYLE_RULES}
${topicGuidance}
${shortHint}
${antiSimilarityHint}

【解讀品質規範 — 嚴格遵守】
1. 每張牌的 message（${msgSpec}）必須用三小段格式：
   「牌面重點：」→ 說明這張牌本身的核心牌義（引用牌名）
   「對你的問題代表：」→ 直接回應使用者的問題，說清楚這張牌在這個位置代表什麼狀況或原因
   「這張牌提醒你：」→ 給一個具體可行的提醒，說清楚要做什麼，不要用通用語

2. overallSummary（格式固定為兩段）：
   「整體答案：」→ 30～50字，直接回答使用者的問題。說出這組牌顯示的狀況。
     範例（愛情）：「這段感情目前不是沒有機會，但需要你先觀察對方是否有實際靠近的行動，而不是只靠你一個人努力。」
     範例（工作）：「工作上的卡關不是能力問題，而是你還沒確認真正想走的方向。先把這件事說清楚，再決定要衝還是等。」
   「為什麼會這樣：」→ 80～150字，說明三張牌（${cardNamesForHint}）之間的關係，使用者真正卡住的點，以及接下來應該前進/等待/調整/放下/觀察哪一種方向。
   禁止模板句：「答案不是單一原因」「需要從三個面向一起看」

3. combinedReading（${combSpec}）：留空字串即可（"combinedReading": ""），不需填寫。

4. actionSteps（3個，每個${stepSpec}）：
   每個行動都要具體可執行，說清楚怎麼做，不要只給抽象建議。
   禁止：「先整理自己」「多觀察」「不要害怕」「慢下來」
   應該像：「今天先列出三個讓你卡住的原因，分成「我能控制」和「我不能控制」兩欄，不要急著做決定。」

5. gentleReminder（${remindSpec}）：
   要療癒，但必須呼應本次牌陣和問題，不可以每次都用一樣的通用療癒語。
   依分類（${getTopicLabel(topic)}）調整語氣：
   愛情→聚焦感情裡的安定感；工作→聚焦方向與價值；財運→聚焦財務清晰；生活→聚焦找回節奏。

6. blessing（20～40字）：依本次分類（${getTopicLabel(topic)}）和牌面動態生成，不可每次都一樣。
   愛情類：「願你喜歡的人，不只讓你心動，也能讓你安心。」（此為範例，請根據本次牌面生成不同版本）
   工作類：「願你的努力慢慢被看見，也願你有勇氣選擇真正適合自己的路。」（此為範例）
   財運類：「願你的每一步財務決定，都走向更安穩的自由。」（此為範例）

7. 三張牌整體字數目標：900～1400字。每張牌解讀要有明顯差異，不可以三張說一樣的話。

【anti-repetition 規則】
三張牌的 message 中，禁止讓不同牌出現相同的核心提醒。
例如不可以三張牌都說「先把問題看清楚」「可以重新選擇」「心與行動不一致」「先停下來」。
每張牌的提醒必須根據牌名和位置有明顯差異。

【輸出 JSON 格式】
{
  "spreadType": "three",
  "category": "${getTopicLabel(topic)}",
  "questionFocus": "（30～50字，說明使用者這次問題的核心）",
  "overallSummary": "整體答案：\\n（30～50字，一句話直接回答使用者問題，說出這組牌顯示的狀況，不要用「先整理自己」「方向會清楚」這種通用語）\\n\\n為什麼會這樣：\\n（80～150字，說明三張牌共同指向的原因，必須引用全部三張牌名：${cardNamesForHint}，說明三張牌之間的關係、使用者真正卡住的點、接下來應該前進/等待/調整/放下/重新評估哪一種方向，以及為什麼）",
  "cards": [
${positionSchema}
  ],
  "combinedReading": "",
  "actionSteps": [
    "Day 1～2｜（2-4字動詞短語，例如「先釐清」「整理帳務」）\\n（50-70字，具體說明怎麼做）",
    "Day 3～4｜（2-4字動詞短語）\\n（50-70字，具體行動，不能和Day1-2重複）",
    "Day 5～7｜（2-4字動詞短語）\\n（50-70字，說明觀察什麼變化或下一步走向）"
  ],
  "gentleReminder": "（${remindSpec}，療癒但要呼應本次牌陣，不能用「先整理自己」「宇宙提醒你」等通用語）",
  "blessing": "（20～40字祝福語，每次不同）",
  "safetyNote": "（若問題涉及身體健康：如果症狀持續、惡化，或已經影響生活，建議尋求皮膚科或專業醫療協助。否則為空字串）"
}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// AI 呼叫 + JSON 解析 + 品質重試（單張牌）
// ═════════════════════════════════════════════════════════════════════════════

async function callSingleCard(
  client: OpenAI,
  model: string,
  card: TarotReadingCard,
  topic: TarotReadingTopic,
  question: string,
  depth: "standard" | "deep",
  maxTokens: number
): Promise<string | null> {
  const tryGenerate = async (antiHint: string): Promise<string | null> => {
    try {
      const res = await client.responses.create({
        model,
        input: [
          { role: "system", content: TAROT_READING_SYSTEM_PROMPT },
          { role: "user",   content: buildSingleCardPrompt(card, topic, question, depth, antiHint) },
        ],
        max_output_tokens: maxTokens,
      });
      const raw = res.output_text?.trim();
      if (!raw) return null;
      // 強制使用使用者選擇的分類（topic），不讓 AI 覆蓋
      const parsed = parseSingleCardJson(raw, getTopicLabel(topic));
      if (!parsed) return null;
      return formatSingleCardReading(parsed);
    } catch {
      return null;
    }
  };

  // 第一次嘗試
  const first = await tryGenerate("");
  if (!first) return null;

  // 品質檢查：若太通用則重試一次
  if (isGenericResponse(first, [card])) {
    const retry = await tryGenerate(ANTI_SIMILARITY_HINT);
    return retry ?? first;
  }

  return first;
}

// ═════════════════════════════════════════════════════════════════════════════
// AI 呼叫 + JSON 解析 + 品質重試（三張牌）
// 硬性限制：單次 AI 呼叫最多 22 秒；最多重試 1 次；超時直接返回 null
// ═════════════════════════════════════════════════════════════════════════════

const THREE_CARD_TIMEOUT_MS = 22000;

async function callThreeCard(
  client: OpenAI,
  model: string,
  cards: TarotReadingCard[],
  topic: TarotReadingTopic,
  question: string,
  depth: "standard" | "deep",
  maxTokens: number
): Promise<string | null> {
  const tryGenerate = async (antiHint: string): Promise<string | null> => {
    try {
      // 用 Promise.race 強制 timeout，避免 AI 呼叫無限等待
      const aiCall = client.responses.create({
        model,
        input: [
          { role: "system", content: TAROT_READING_SYSTEM_PROMPT },
          { role: "user",   content: buildThreeCardPrompt(cards, topic, question, depth, antiHint) },
        ],
        max_output_tokens: maxTokens,
      });
      const timeoutGuard = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("three_card_ai_timeout")), THREE_CARD_TIMEOUT_MS)
      );

      const res = await Promise.race([aiCall, timeoutGuard]);
      const raw = (res as Awaited<typeof aiCall>).output_text?.trim() ?? "";

      console.log("[tarot-reading] AI raw response first 300 chars:", raw.slice(0, 300));

      if (!raw) return null;
      // 強制使用使用者選擇的分類（topic），不讓 AI 覆蓋
      const parsed = parseThreeCardJson(raw, getTopicLabel(topic));
      const parseSuccess = parsed !== null;
      console.log("[tarot-reading] parse success:", parseSuccess);
      if (!parsed) return null;
      return formatThreeCardReading(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[tarot-reading] callThreeCard error:", msg);
      return null;
    }
  };

  // 第一次嘗試
  const first = await tryGenerate("");
  if (!first) return null;

  // 放寬品質檢查：只要至少一張牌名出現即可，不強制全部出現
  // （三張牌 AI 可能把某些牌名寫成不同格式）
  const anyCardMentioned = cards.some((c) => first.includes(c.name));
  const tooManyBannedPhrases =
    BANNED_GENERIC_PHRASES.filter((p) => first.includes(p)).length >= 3;

  if (!anyCardMentioned || tooManyBannedPhrases) {
    console.log("[tarot-reading] quality check failed, retrying once...");
    const retry = await tryGenerate(ANTI_SIMILARITY_HINT);
    return retry ?? first; // 重試失敗也返回 first，不返回 null
  }

  return first;
}

// ═════════════════════════════════════════════════════════════════════════════
// POST Handler
// 最外層 try/catch 確保任何情況都不 throw 502，永遠回傳 JSON
// 業務邏輯不改：限流 / admin / 付款
// ═════════════════════════════════════════════════════════════════════════════

export async function POST(request: Request) {
  const start = Date.now();

  // ── 全域 try/catch：任何未預期錯誤都走 fallback，不 throw 502 ───────────────
  try {
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "請提供有效的解讀資料。" }, { status: 400 });
    }

    const source = body as {
      cards?: unknown;
      topic?: unknown;
      question?: unknown;
      readingMode?: unknown;
      anonymousId?: unknown;
      paidMode?: unknown;
    };

    const cards       = normalizeCards(source.cards);
    const topic       = isTopic(source.topic) ? source.topic : null;
    const question    = typeof source.question === "string" ? source.question.trim().slice(0, 600) : "";
    const readingMode = isReadingMode(source.readingMode) ? source.readingMode : "premium";
    const anonymousId = typeof source.anonymousId === "string" ? source.anonymousId.slice(0, 128) : null;
    const paidMode    = source.paidMode === true;

    const idToken = request.headers.get("x-firebase-id-token");
    const isAdmin = await verifyAdminIdToken(idToken);

    if (!cards) {
      return NextResponse.json({ error: "請提供 1 到 3 張有效牌卡。" }, { status: 400 });
    }
    if (!topic) {
      return NextResponse.json({ error: "請提供有效的解讀主題。" }, { status: 400 });
    }

    const isSingle   = cards.length === 1;
    const spreadType = isSingle ? "single" : "three";

    // ── debug log ──────────────────────────────────────────────────────────────
    console.log("[tarot-reading] spreadType:", spreadType);
    console.log("[tarot-reading] cards length:", cards.length);
    console.log("[tarot-reading] normalized cards:", cards.map((c) => c.name));
    console.log("[tarot-reading] readingMode:", readingMode);
    console.log("[tarot-reading] question:", question.slice(0, 80));

    // ── 免費版（靜態，Firestore 限流）────────────────────────────────────────────
    if (readingMode === "free" || readingMode === "premium") {
      const ip: string = getRequestIp(request);
      const feature: RateLimitFeature = isSingle ? "single_tarot" : "three_card";

      if (!isAdmin && !paidMode) {
        try {
          const limitResult = await checkAndIncrementLimit({
            ip, anonymousId, lineUserId: null, feature,
          });
          if (!limitResult.allowed) {
            return NextResponse.json({ error: limitResult.message }, { status: 429 });
          }
        } catch (err) {
          console.error("[rate-limit] checkAndIncrementLimit failed:", err);
        }
      }

      if (readingMode === "free") {
        return NextResponse.json({
          readingMode,
          reading: buildFreeReading(cards, topic, question),
          success: true,
          fallback: false,
        });
      }
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const model  = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

    // ── 廣告解鎖版（standard 深度）──────────────────────────────────────────────
    if (readingMode === "ad") {
      if (!apiKey) {
        console.log("[tarot-reading] fallback: no API key (ad)");
        return NextResponse.json({
          readingMode,
          reading: isSingle
            ? buildSingleCardFallback(cards[0], topic, question)
            : buildThreeCardFallback(cards, topic, question),
          success: true,
          fallback: true,
        });
      }

      const client = new OpenAI({ apiKey });

      // ad 版 token（standard 深度）
      const reading = isSingle
        ? await callSingleCard(client, model, cards[0], topic, question, "standard", 1800)
        : await callThreeCard (client, model, cards,    topic, question, "standard", 2600);

      const usedFallback = !reading;
      console.log("[tarot-reading] fallback:", usedFallback);
      console.log("[tarot-reading] total ms:", Date.now() - start);

      return NextResponse.json({
        readingMode,
        reading: reading ?? (
          isSingle
            ? buildSingleCardFallback(cards[0], topic, question)
            : buildThreeCardFallback(cards, topic, question)
        ),
        success: true,
        fallback: usedFallback,
      });
    }

    // ── Premium 版（deep 深度）────────────────────────────────────────────────
    if (!apiKey) {
      console.log("[tarot-reading] fallback: no API key (premium)");
      return NextResponse.json({
        readingMode,
        reading: isSingle
          ? buildSingleCardFallback(cards[0], topic, question)
          : buildThreeCardFallback(cards, topic, question),
        success: true,
        fallback: true,
      });
    }

    const client = new OpenAI({ apiKey });

    // 三張牌 premium token 限制在 1600，單張 1400
    const reading = isSingle
      // premium 版 token（deep 深度）
      ? await callSingleCard(client, model, cards[0], topic, question, "deep", 2400)
      : await callThreeCard (client, model, cards,    topic, question, "deep", 3600);

    const usedFallback = !reading;
    console.log("[tarot-reading] fallback:", usedFallback);
    console.log("[tarot-reading] total ms:", Date.now() - start);

    // ── 永遠回傳 200，永遠有 reading，不再回傳 502 ────────────────────────────
    return NextResponse.json({
      readingMode,
      reading: reading ?? (
        isSingle
          ? buildSingleCardFallback(cards[0], topic, question)
          : buildThreeCardFallback(cards, topic, question)
      ),
      success: true,
      fallback: usedFallback,
    });

  } catch (unexpectedErr) {
    // 最後一道防線：任何未預期錯誤，記錄並回傳 200 + error 訊息
    const errMsg = unexpectedErr instanceof Error ? unexpectedErr.message : String(unexpectedErr);
    console.error("[tarot-reading] UNEXPECTED ERROR:", errMsg);
    console.log("[tarot-reading] total ms:", Date.now() - start);

    return NextResponse.json({
      readingMode: "premium",
      reading: "宇宙訊息暫時無法傳遞，請重新抽牌試試。這不是你的問題，是宇宙在整理訊號中 🌙",
      success: false,
      fallback: true,
      error: process.env.NODE_ENV === "development" ? errMsg : undefined,
    });
  }
}
