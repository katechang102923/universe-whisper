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
  const ori    = card.position === "upright" ? "正位" : "逆位";
  const suit   = card.suit   ? `｜牌組：${card.suit}`   : "";
  const enName = card.nameEn ? `｜英文：${card.nameEn}` : "";
  const kw     = card.keywords?.length ? `｜關鍵字：${card.keywords.join("、")}` : "";

  // meaning = baseMeaning + topicMeaning 合體，三者只取其一避免 AI 看到重複內容
  // 優先用 meaning（最完整）；若沒有才分別給 base + topicMeaning
  let meaningLine: string;
  if (card.meaning) {
    meaningLine = `\n   牌義：${card.meaning}`;
  } else {
    const base  = card.baseMeaning  ? `\n   牌面核心：${card.baseMeaning}`  : "";
    const topic = card.topicMeaning ? `\n   主題牌義：${card.topicMeaning}` : "";
    meaningLine = base + topic;
  }

  return `牌位：${posLabel}｜${card.name}（${ori}）${suit}${enName}${kw}${meaningLine}`;
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
        // 對每張牌的 message 套用段落內去重（消除 AI 重複牌義句）
        message: deduplicateSentences(
          typeof entry.message === "string" ? entry.message : "這張牌的訊息正在凝聚中，請稍後再細細感受。"
        ),
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
    case "career":       return "工作上卡住了，主要是方向還沒確認清楚。先把真正想走的路說清楚，再決定下一步。";
    case "love":         return "這段感情還有可能，先觀察對方是否真的有靠近的行動，光靠你一個人努力是不夠的。";
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
        "Day 1～2｜先觀察\n先不要主動逼出答案，留意對方這幾天有沒有自然的靠近。要注意的是日常的小事（一條訊息、一個問候），這些比大動作更能反映真實態度。",
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
      return `這段時間先讓錢的流向變清楚，比急著賺更多重要。當你開始知道錢去哪裡，財務才會慢慢穩下來。財務問題很少需要大動作才能改善，有時候從一件小事開始整理，反而最有效。`;
    case "career":
      return `你不需要今晚就把所有未來想清楚。先看清楚目前手上能掌握的資源，再決定下一步要往哪裡走。工作上的卡關，常常是現在的位置和你真正想要的還有一段距離——知道這件事，就已經開始在改變了。`;
    case "love":
      return `如果這段關係讓你心動，也讓你不安，今晚先不要急著逼自己選邊站。真正適合你的人，不會只讓你猜，而會慢慢讓你感覺安定。觀察對方的行動，比反覆揣測對方的心意，要清楚得多。`;
    case "relationship":
      return `關係裡的誤解，很多時候不是壞心，只是大家都習慣不說出口。如果你覺得距離在拉大，先試著用一句話把你的感受說出來——不用說得完整，說真實的就好。`;
    case "health":
      return `身體給你的訊號，值得被認真對待。不一定要馬上改變所有習慣，先找出一個讓你持續消耗的來源，能減少一點是一點——這比同時改變很多事更容易撐下去。`;
    default:
      return `今晚先把最吵的念頭放下，有些事可以明天再想。從一件你能控制的小事開始行動，其他的事情會跟著慢慢清晰。`;
  }
}

function getFallbackBlessing(focus: QuestionFocus): string {
  switch (focus.primary) {
    case "finance":      return `願你的每一份收入與支出，都慢慢走向安穩與自由。`;
    case "career":       return `願你的努力被看見，也願你有勇氣選擇真正適合自己的路。`;
    case "love":         return `願你喜歡的人，不只讓你心動，也能讓你安心。`;
    case "relationship": return `願你在面對複雜的關係時，也能記得：你值得被清楚、被溫柔地對待。`;
    case "health":       return `願你慢慢把照顧自己排進每天的行程裡，哪怕只是一件小事，也算數。`;
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

  // meaning = baseMeaning + topicMeaning 合體，只取其一避免重複串接
  const cardMeaningLines: string[] = [];
  if (meaningPart) {
    cardMeaningLines.push(meaningPart);
  } else {
    if (basePart)  cardMeaningLines.push(basePart);
    if (topicPart && topicPart !== basePart) cardMeaningLines.push(topicPart);
  }

  const coreMeaning = deduplicateSentences(cardMeaningLines.join("　") ||
    (isUpright
      ? `${card.name}正位出現，說明此刻有具體的方向可以往前走，只是你可能還在猶豫要不要踏出那一步。`
      : `${card.name}逆位出現，代表這個面向目前受到阻礙，先看清楚是什麼讓自己動不了，才能找到出路。`));

  // 宇宙偷偷話：直接回應使用者心情，不複述問題
  const questionFocusText = (() => {
    if (focus.primary === "love") return isUpright
      ? "你其實不是不想靠近，只是害怕期待落空，又要自己一個人收拾。"
      : "你一直在等對方給一個明確的訊號，但同時也在懷疑自己是不是等錯了。";
    if (focus.primary === "career") return isUpright
      ? "你知道自己想要什麼，只是不確定現在是不是對的時機。"
      : "你其實比你以為的更清楚問題在哪裡，只是不想正面承認那個答案。";
    if (focus.primary === "finance") return isUpright
      ? "你可能已經很努力了，但真正需要的是把錢的流向看清楚，才能知道哪裡可以動。"
      : "財務上的焦慮，很可能是有些選擇一直在迴避，把那件事先面對，會比繼續繞開它輕鬆。";
    if (focus.primary === "relationship") return isUpright
      ? "你已經感覺到有些話需要說，只是不確定對方願不願意聽。"
      : "這段關係裡，你一直在衡量值不值得開口——其實那個遲疑本身就是答案。";
    return question
      ? "你已經想了夠久了，現在需要的是一個方向，不是更多的思考。"
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
      ? "財務上的機會是存在的，但需要你主動整理現況，等不來的。先把近期的收支狀況看清楚，才能知道哪裡有空間可以動。"
      : "財務上遇到阻礙，可能是目前有些東西還沒看清楚。先停下來，不要倉促做任何大的財務決定，整理之後會更明白。";
  }
  if (focus.primary === "career") {
    return isUpright
      ? "工作上的方向是有的，只是你可能還在等一個更確定的訊號才願意踏出。現在的狀態已經可以開始行動，不需要等到一切都準備好。"
      : "工作上卡住，主要是現在的方向和你真正想走的路之間有落差。停下來想清楚「我真正想要的是什麼」，比繼續硬撐更重要。";
  }
  if (focus.primary === "love") {
    return isUpright
      ? "感情上有靠近的可能，但需要你更清楚地表達自己想要什麼，對方才能真正靠近。"
      : "感情上的停滯，可能是雙方都在等對方先開口。先把你自己的感受說清楚，不要繼續等了。";
  }
  return isUpright
    ? "目前可以往前走，先把心裡最擔心的那個問題說清楚，行動就會有方向。"
    : "目前有些東西被卡住了，先停下來看清楚是什麼讓自己動不了，再重新出發。";
}

// ─────────────────────────────────────────────────────────────────────────────
// 三張牌 per-card reminder（依位置 × topic × 正逆位，保證三張不重複）
// posIndex: 0=過去/背景  1=現在/阻礙  2=未來/建議
// ─────────────────────────────────────────────────────────────────────────────

function getCardReminderByIndex(
  card: TarotReadingCard,
  posIndex: number,
  focus: QuestionFocus
): string {
  const up = card.position === "upright";
  const f  = focus.primary;

  // ── 愛情 ────────────────────────────────────────────────────────────────────
  if (f === "love") {
    if (posIndex === 0) return up
      ? `${card.name}在過去位置出現，說明你帶進這段關係的心意本來是溫暖的。提醒你：過去的付出已經發生，重要的是看清楚它有沒有被對等接收，別繼續單方面加碼。`
      : `${card.name}逆位在過去的位置，代表這段關係裡有些傷口還沒完全癒合。提醒你：帶著沒說清楚的委屈進入下一階段，會讓模式重演。先把最在意的那件事說出來。`;
    if (posIndex === 1) return up
      ? `${card.name}在目前位置說明雙方之間還有空間。提醒你：真正的靠近靠的不是單方面努力，先觀察對方是否也在往你的方向移動，再決定要不要繼續主動。`
      : `${card.name}逆位目前擋住了你們靠近的可能。提醒你：卡住的地方，很可能是你們都不願意先承認有問題。先開口說出「我有一點擔心」，往往就能打開對話空間。`;
    return up
      ? `${card.name}在未來位置給出的方向是開放的。提醒你：接下來可以給這段關係一次機會，但不要把所有期待一下子壓上去。先觀察對方有沒有穩定的行動，再慢慢調整投入的比例。`
      : `${card.name}逆位在未來提醒你：先不要急著推進，觀察對方的行動多於言語。如果對方一直讓你猜、讓你等，那不是考驗，那是一個答案。`;
  }

  // ── 工作 / 事業 ─────────────────────────────────────────────────────────────
  if (f === "career") {
    if (posIndex === 0) return up
      ? `${card.name}在過去位置說明你有過有能力的狀態。提醒你：過去累積的資歷和能力是真實的，不要讓最近的卡關讓你懷疑整段過去。`
      : `${card.name}逆位在背景位置，說明這份工作上的壓力不是最近才有的。提醒你：長期承受卻沒有處理的東西，現在開始影響你的判斷力——先把這個部分拆開來看。`;
    if (posIndex === 1) return up
      ? `${card.name}在目前位置，工作上是有條件往前走的。提醒你：不要因為還沒準備好就繼續等待，現在的狀態已經可以主動出手——投履歷、提案、或直接說出你的想法。`
      : `${card.name}逆位出現在目前，說明有個核心問題你一直在迴避面對。提醒你：不管是不滿意職位、還是關係問題，繼續拖著只會讓決定更難。先把那個迴避的部分命名出來。`;
    return up
      ? `${card.name}在未來位置是正向的。提醒你：接下來適合有計畫地前進，而不是衝動裸辭或躊躇不前。先把你真正想去的方向確認好，再決定下一步動作。`
      : `${card.name}逆位在未來提醒你：暫時不適合做太大的職涯決定。先把手上的資源整理清楚，再想下一步。倉促的決定在這個階段容易讓你陷入更亂的處境。`;
  }

  // ── 財運 ────────────────────────────────────────────────────────────────────
  if (f === "finance") {
    if (posIndex === 0) return up
      ? `${card.name}在背景位置，財務上的底子是有的。提醒你：過去也許有過不錯的收入或機會，重要的是看清楚那時候什麼做對了，現在哪裡走偏了。`
      : `${card.name}逆位在背景，說明財務上有些舊的漏洞還沒堵住。提醒你：在還沒找到新收入之前，先把支出最大的那個洞看清楚。`;
    if (posIndex === 1) return up
      ? `${card.name}在目前位置說明財務有改善的條件。提醒你：機會不會自己找上門，主動整理收支、找出可動用的資源，才能讓機會真正發揮出來。`
      : `${card.name}逆位目前讓財務卡住了。提醒你：這個時間點不適合衝動投資或做大額支出決定，先守住現金流，看清楚卡在哪裡再動。`;
    return up
      ? `${card.name}在未來位置提示財務有好轉的可能。提醒你：接下來可以小幅嘗試新的收入機會，但不要孤注一擲，保留安全緩衝比全押在一個選項上更穩。`
      : `${card.name}逆位在未來提醒你：這段時間先以守為主，不適合做高風險的財務決定。把現有的錢和負擔整理清楚，比急著賺更多重要。`;
  }

  // ── 人際 ────────────────────────────────────────────────────────────────────
  if (f === "relationship") {
    if (posIndex === 0) return up
      ? `${card.name}在背景位置，說明這段關係或互動的基礎原本是穩的。提醒你：現在的誤解不代表整段關係都有問題，找到最初的摩擦點，比從頭否定有效。`
      : `${card.name}逆位在過去，說明這段關係有些積累的誤解還沒解開。提醒你：說清楚一件事就好，不需要把所有問題一次搬出來。`;
    if (posIndex === 1) return up
      ? `${card.name}在目前位置，溝通的機會是有的。提醒你：說話比沉默更有效，但要先把你真正想表達的整理清楚，才不會說了更多但說不到點上。`
      : `${card.name}逆位現在說明有些話你不確定說了會不會讓事情更糟。提醒你：保持沉默也許讓你感覺更安全，但距離會越來越大——選一個輕的話題先開口。`;
    return up
      ? `${card.name}在未來位置提示這段關係可以往前走。提醒你：主動溝通的時機快到了，但要把話說清楚，不要靠猜，也不要讓對方猜。`
      : `${card.name}逆位在未來提醒你：先把自己的界線拉回來，不要為了討好所有人而失去立場。守住自己的需求，反而讓關係更能持續。`;
  }

  // ── 一般 (general / health / 其他) ──────────────────────────────────────────
  const generalByPos: Array<[string, string]> = [
    [
      `${card.name}在背景位置說明你走到這裡不是偶然。提醒你：過去的選擇不需要後悔，但需要從中找到「我下次要不一樣的是什麼」。`,
      `${card.name}逆位在過去位置提醒你：有些事情當時沒解決，現在仍在影響你。先把最耗費你精力的那一件事找出來，處理它比忽略它輕鬆。`,
    ],
    [
      `${card.name}在目前位置說明你已經有足夠資訊做出下一步選擇。提醒你：不要因為害怕出錯而一直等——現在行動比繼續觀望更能帶來改變。`,
      `${card.name}逆位在目前提醒你：你正在用舊的方式應對一個需要新思路的處境。停下來想想「如果這件事換個方式處理，會有什麼不同」。`,
    ],
    [
      `${card.name}在未來位置給出的是可以往前走的訊號。提醒你：把你真正想抵達的目標說清楚，再選擇行動方式，不要讓別人的期待替你決定方向。`,
      `${card.name}逆位在未來提醒你：這段時間先不要做難以回頭的大決定。讓事情再沉澱一下，等你看清楚全局再出手，比現在衝更穩。`,
    ],
  ];

  const [u, r] = generalByPos[posIndex] ?? generalByPos[1]!;
  return up ? u : r;
}

/** 三張牌「對你的問題代表」— 依位置 × topic × 正逆位動態產生，避免模板句 */
function getCardQuestionAnswerByIndex(
  card: TarotReadingCard,
  posIndex: number,
  focus: QuestionFocus,
  question: string
): string {
  const up = card.position === "upright";
  const f  = focus.primary;
  const qPrefix = question ? `你問的是「${question}」。` : "";

  if (f === "love") {
    if (posIndex === 0) return up
      ? `${qPrefix}${card.name}在這個位置說明感情裡有真實的溫度，這段關係還有可能。但靠近需要雙方都在動，不能只靠你一個人維持。`
      : `${qPrefix}這張牌出現在過去，代表這段感情裡有些情緒或期待還沒有被消化掉。在往前走之前，先把那個沒說清楚的部分整理一下。`;
    if (posIndex === 1) return up
      ? `${qPrefix}目前的狀態對這段感情來說是可以溝通的，雙方之間有空間。但「有空間」不等於「會自動靠近」——需要有人先邁出那一步。`
      : `${qPrefix}目前的困難在於雙方都在等對方先有所行動，形成僵局。如果你先把你的感受說出來，至少讓對方知道你在意，才有機會打破這個循環。`;
    return up
      ? `${qPrefix}接下來的走向對這段感情是相對正向的，可以慢慢給一次機會。但要觀察對方的行動是否穩定、持續，而不是只看一時的甜言蜜語。`
      : `${qPrefix}接下來如果對方持續讓你猜、讓你等，這張牌的提示是：你不需要一直替對方找理由。先把重心放回自己，讓答案自然浮現。`;
  }

  if (f === "career") {
    if (posIndex === 0) return up
      ? `${qPrefix}過去的工作資歷和能力是你真實擁有的底氣，這張牌提醒你不要在卡關時全盤否定自己。現在需要的是重新確認方向，不用懷疑自己的能力。`
      : `${qPrefix}工作上累積的壓力比你意識到的更重。這張牌建議你先把「哪些事耗費了你最多精力」列出來——轉職或調整之前，先看清楚自己在逃離什麼。`;
    if (posIndex === 1) return up
      ? `${qPrefix}目前的工作狀態是有條件行動的。如果你在考慮換工作或爭取機會，現在可以開始準備，不需要等到完全準備好才動。`
      : `${qPrefix}工作上卡住的原因，可能不只是外在環境，還有你自己在迴避的一個決定。這張牌提示你：那個你一直拖著沒做的事，現在可以先面對它了。`;
    return up
      ? `${qPrefix}接下來的方向是可以推進的，但要有計畫而不是衝動。先把你真正想去的職位或環境說清楚，再決定下一步動作，避免只是在「逃離現在」而不是「走向想要的地方」。`
      : `${qPrefix}接下來先不適合做大的職涯決定。把手上的資源整理好，讓自己有備案，再考慮要不要動。`;
  }

  if (f === "finance") {
    if (posIndex === 0) return up
      ? `${qPrefix}財務背景是穩的，代表你有可以運用的資源。提醒你：回顧一下過去哪些收入來源比較穩定，把那個方向繼續強化。`
      : `${qPrefix}財務上有些舊習慣或決定的後遺症還在。提醒你：先把目前最大的支出或負擔找出來，這才是需要優先處理的，不是急著找新收入。`;
    if (posIndex === 1) return up
      ? `${qPrefix}目前財務有改善的條件，但機會需要你主動整理出來。把近期的收支狀況具體寫下來，你會看到哪裡有空間可以調整。`
      : `${qPrefix}目前財務上有個你沒有正視的漏洞。先把支出最大的項目找出來，不要只靠感覺，看數字才能知道問題在哪裡。`;
    return up
      ? `${qPrefix}接下來財務有機會改善，可以小幅嘗試新的收入方式。但不要因為看到機會就全押，先試小的，確認可行再加碼。`
      : `${qPrefix}接下來先以守為主，這不是好的時機做高風險財務決定。先確保現金流穩定，再談擴張或投資。`;
  }

  // general / relationship / health / 其他
  const byPos = [
    up ? `${qPrefix}過去的背景說明你帶著一定的底氣走到現在。提醒你：過去的選擇有它的脈絡，不需要一概否定，找出哪裡可以做不一樣的選擇就好。`
       : `${qPrefix}過去有些東西還沒有被整理清楚，仍在影響你現在的判斷。先把那個影響你最深的舊習慣找出來，才能真正往前走。`,
    up ? `${qPrefix}目前有條件可以行動。提醒你：不要因為還沒完全準備好就繼續等——選一件最小但能做到的事，從那裡開始。`
       : `${qPrefix}目前有個你一直在迴避的核心問題。這張牌提示你：把它說清楚，比繼續繞著它打轉要有效得多。`,
    up ? `${qPrefix}接下來的方向是往前走的，但要先確認你真正想抵達的地方，而不是被環境推著走。`
       : `${qPrefix}接下來先暫停，讓自己有時間重新看清楚全局。不是所有事情都需要現在決定，等你看清楚再動比衝動決定更穩。`,
  ];
  return byPos[posIndex] ?? byPos[1]!;
}

// ─────────────────────────────────────────────────────────────────────────────
// 三張牌 message 去重：提取「這張牌提醒你」段落，偵測重複後替換
// ─────────────────────────────────────────────────────────────────────────────

function extractCardReminder(message: string): string {
  const m = message.match(/這張牌提醒你[：:]\s*\n?([\s\S]*)$/);
  return m?.[1]?.trim() ?? "";
}

function replaceCardReminder(message: string, newReminder: string): string {
  return message.replace(
    /這張牌提醒你[：:]\s*\n?[\s\S]*$/,
    `這張牌提醒你：\n${newReminder}`
  );
}

function replaceCardQuestionAnswer(message: string, newQA: string): string {
  return message.replace(
    /(對你的問題代表[：:]\s*\n?)[\s\S]*?(\n\n這張牌提醒你)/,
    `$1${newQA}$2`
  );
}

/**
 * 簡單相似度：去空白後重疊字元比率
 */
function textSimilarity(a: string, b: string): number {
  const sa = a.replace(/\s/g, "");
  const sb = b.replace(/\s/g, "");
  if (!sa || !sb) return 0;
  let match = 0;
  const shorter = sa.length < sb.length ? sa : sb;
  for (const ch of shorter) if (sa.includes(ch) && sb.includes(ch)) match++;
  return match / Math.max(sa.length, sb.length);
}

/**
 * 對三張牌的 message 做去重：
 * - 「這張牌提醒你」完全相同 → 替換
 * - 相似度 > 0.72 → 替換
 * - 「對你的問題代表」為固定模板句 → 替換
 */
function deduplicateCardMessages(
  cards: [ThreeCardEntry, ThreeCardEntry, ThreeCardEntry],
  rawCards: TarotReadingCard[],
  focus: QuestionFocus,
  question: string
): [ThreeCardEntry, ThreeCardEntry, ThreeCardEntry] {
  const TEMPLATE_QA =
    "它的出現說明你目前這個面向的狀態有值得深入看清楚的地方——不是要你立刻採取行動，而是先讓自己真正理解這裡發生了什麼。";

  const reminders = cards.map((c) => extractCardReminder(c.message));

  const result = cards.map((entry, i) => {
    let msg = entry.message;

    // ① 替換固定模板 QA
    if (msg.includes(TEMPLATE_QA)) {
      const raw = rawCards[i];
      if (raw) {
        const newQA = getCardQuestionAnswerByIndex(raw, i, focus, question);
        msg = replaceCardQuestionAnswer(msg, newQA);
      }
    }

    // ② 偵測 reminder 是否與之前任一張重複（或高度相似）
    const thisReminder = reminders[i] ?? "";
    const isDup = reminders.some((r, j) => {
      if (j >= i) return false; // 只比較前面的牌
      return r === thisReminder || textSimilarity(r, thisReminder) > 0.72;
    });

    if (isDup) {
      const raw = rawCards[i];
      if (raw) {
        const newReminder = getCardReminderByIndex(raw, i, focus);
        msg = replaceCardReminder(msg, newReminder);
        // 更新 reminders 陣列讓後續比較用新值
        reminders[i] = newReminder;
      }
    }

    return { ...entry, message: msg };
  }) as [ThreeCardEntry, ThreeCardEntry, ThreeCardEntry];

  return result;
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

    // meaningPart = basePart + " " + topicPart（cosmicMessage 的組成方式）
    // 若 meaning 存在，直接用 meaning，不再另加 base/topic，避免重複串接
    const coreLines: string[] = [];
    if (meaningPart) {
      coreLines.push(meaningPart); // 已包含 base + topic
    } else {
      if (basePart)  coreLines.push(basePart);
      if (topicPart && topicPart !== basePart) coreLines.push(topicPart);
    }

    // 取第一句核心意義（去除過長描述，控制在 80 字以內）
    const firstSentence = (() => {
      const full = deduplicateSentences(coreLines.join("　") || (isUpright
        ? `${card.name}正位代表目前有具體的方向可以往前走，只是需要先確認好步驟再行動。`
        : `${card.name}逆位代表這個面向遇到了阻力，需要先停下來看清楚卡在哪裡，再決定怎麼做。`));
      // 取第一個句子，控制在 80 字
      const m = full.match(/^[^。！？]+[。！？]/);
      const s = m ? m[0] : full.slice(0, 80);
      return s.length > 80 ? s.slice(0, 77) + "…" : s;
    })();
    const coreMeaning = firstSentence;

    // 三小段格式：牌面重點 / 對你的問題代表 / 這張牌提醒你
    // 「對你的問題代表」與「這張牌提醒你」都依位置 × topic × 正逆位動態產生
    const questionAnswerText = getCardQuestionAnswerByIndex(card, i, focus, question);
    const reminderText       = getCardReminderByIndex(card, i, focus);
    const msg = [
      `牌面重點：`,
      `${card.name}（${ori}）${kw ? `，關鍵字「${kw}」。` : "。"}`,
      `這張牌代表：${coreMeaning}`,
      ``,
      `對你的問題代表：`,
      questionAnswerText,
      ``,
      `這張牌提醒你：`,
      reminderText,
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
    questionFocus:   question ? `你的問題是「${question}」，以下是這三張牌從三個面向給你的完整解讀。` : "你把問題放在心裡，這三張牌從不同面向回應了此刻的狀況。",
    overallSummary:  getFallbackOverallSummary(focus, cardNamesStr, cards),
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
/** Fallback 牌陣總結（overallSummary），三段結構：整體答案 + 為什麼會這樣（含三牌關係）+ 接下來的方向 */
function getFallbackOverallSummary(focus: QuestionFocus, cardNamesStr: string, cards?: TarotReadingCard[]): string {
  const c1 = cards?.[0];
  const c2 = cards?.[1];
  const c3 = cards?.[2];
  const n1 = c1 ? `${c1.name}（${c1.position === "upright" ? "正位" : "逆位"}）` : "第一張牌";
  const n2 = c2 ? `${c2.name}（${c2.position === "upright" ? "正位" : "逆位"}）` : "第二張牌";
  const n3 = c3 ? `${c3.name}（${c3.position === "upright" ? "正位" : "逆位"}）` : "第三張牌";

  switch (focus.primary) {
    case "finance":
      return `整體答案：\n近期財務有可以調整的空間，但你真正卡住的點是還沒看清楚「錢去哪裡了、哪裡可以減少、哪裡可以增加」。在這三件事看清楚之前，先不要做大的財務決定。\n\n為什麼會這樣：\n${n1} 反映你目前的財務背景與資源狀況。${n2} 指出讓你卡住的阻力——可能是舊的支出習慣、還沒解決的負擔、或是一個你一直迴避的財務決定。${n3} 則告訴你接下來財務可以往哪個方向走。三張牌合起來的脈絡是：出路是有的，只是你還沒把現況真正看清楚就急著往前衝，導致財務空間一直被佔住。\n\n接下來的方向：\n先把近期收支具體記錄下來，找出最大的支出漏洞，從縮減那裡開始。如果有投資或大額支出的計畫，這個階段先暫停評估，等現金流穩定後再決定。`;
    case "career":
      return `整體答案：\n工作上卡住了，主要是方向還沒確認清楚。在方向說清楚之前，不管是留下來硬撐還是衝動離職，都容易讓你陷入更亂的處境。\n\n為什麼會這樣：\n${n1} 說明你過去或目前承受的工作壓力與背景。${n2} 點出你在職涯上真正卡住的核心——可能是不確定方向、責任過重、環境不適合，或是你一直沒有正視的某個決定。${n3} 給你接下來比較適合走的方向提示。三張牌合起來：問題不只是工作本身，你一直在用舊有的方式應對一個已經需要重新選擇的處境。\n\n接下來的方向：\n先把「我真正想要的工作型態是什麼」用具體文字寫下來，要寫真正讓你有動力的狀態，而不是「應該」想要的。確認方向後，再決定要主動爭取機會、整理履歷、或先建立備案——動作要有順序，不能同時衝所有事。`;
    case "love":
      return `整體答案：\n這段感情還有可能，但目前讓你焦慮的，是你不確定對方是否真的在往你的方向靠近。在看清楚對方是否有實際行動之前，先不要急著做最終決定。\n\n為什麼會這樣：\n${n1} 反映這段感情的過去或現有的情緒基礎——有些真實的感覺，但也有些東西還沒說清楚。${n2} 指出雙方目前的阻礙：可能是沒說出口的期待、距離感、或是其中一方還沒準備好真正投入。${n3} 告訴你接下來感情可以往哪個方向走。三張牌合起來的核心：這段關係還有溫度，只是有些話沒說清楚讓雙方都在等，這種等待在慢慢把距離拉大。\n\n接下來的方向：\n接下來 3～7 天，觀察對方在日常生活裡是否有自然靠近的行動。注意的是小事上的主動（一條訊息、一個問候），比大表態更能反映真實態度。如果對方有穩定行動，可以慢慢給一次機會；如果仍然讓你猜、讓你等，那個本身就是答案。`;
    case "relationship":
      return `整體答案：\n這段人際關係的誤解不會自己消失，需要有人先開口。「先開口」是讓對方知道你有感受到這件事，讓關係有機會找到出路，不是要你單方面妥協。\n\n為什麼會這樣：\n${n1} 反映這段關係的過去背景，雙方之間原本有的基礎或已經存在的裂縫。${n2} 指出目前讓你們距離拉遠的核心原因——可能是誤解、沒說清楚的話、或是雙方都不願意先邁一步。${n3} 告訴你接下來修復或釐清這段關係比較適合的方式。三張牌的脈絡：問題有解，只是雙方都在等對方先動，這種等待讓距離慢慢固定下來。\n\n接下來的方向：\n找一個相對平靜的時機，輕輕開啟對話，不需要把所有問題一次解決——先說出一件最在意的事就夠了。如果對方願意回應，關係就有空間繼續。如果對方完全不接收，那也是一個重要資訊，幫你決定這段關係要怎麼對待。`;
    case "health":
      return `整體答案：\n你的身心狀態有持續被消耗的跡象，先找出哪一個來源消耗你最多精力，從那裡開始調整，不用一次改變全部習慣。\n\n為什麼會這樣：\n${n1} 說明目前身心狀態的背景，你是如何來到這個消耗點的。${n2} 指出讓你持續耗損的核心原因——可能是特定的習慣、環境、人際或情緒模式。${n3} 告訴你接下來要往哪個方向恢復。三張牌合起來：你目前的狀態有解，只是還沒找到讓自己真正充電的方式，或是知道但一直在迴避。\n\n接下來的方向：\n先把睡眠補回來，這是其他一切的基礎。接著找出一個讓你每天消耗最多的習慣或情境，這週先減少一點——不需要完全改掉，減少就有差。如果有持續的身體不適，不要再拖，去確認一下。`;
    default:
      return `整體答案：\n這件事有解，只是先不要急著做最終決定。這三張牌給你的方向是：先把目前最核心的卡點找出來，從你能控制的一件事開始處理，不要試圖同時解決全部。\n\n為什麼會這樣：\n${n1} 反映你走到這裡的背景或情緒狀態。${n2} 指出讓你現在動不了的核心問題——可能是同時有太多事等待你決定，或是有個你一直在迴避的選擇。${n3} 告訴你接下來比較適合走的方向。三張牌合起來的脈絡是：你有資源，也有能力，只是目前被太多方向分散，讓你找不到起點。找到最核心的那個問題，集中資源處理它，其他的事情會跟著動起來。\n\n接下來的方向：\n把你現在反覆在想的事情分成兩欄：「我能控制的」和「我不能控制的」。把注意力放在能控制的那欄，從最小但能做到的一件事開始行動。完成一件事之後，你會發現其他事情也開始有了空間。`;
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
      return `把這三張牌放在一起看，${card1}（${ori1}）說的是你目前工作上的背景狀態，${card2}（${ori2}）指出你在職涯上真正卡住的地方，而 ${card3}（${ori3}）則是接下來比較適合走的方向。\n\n三張牌合起來的脈絡是：你在工作上的卡關，主要是你一直在用舊的方式應對一個已經需要重新選擇的處境。真正需要先做的是：認真問自己「我現在最想要的工作型態是什麼」，把這件事說清楚，行動才有方向。`;
    case "love":
      return `把這三張牌放在一起看，${card1}（${ori1}）說的是這段感情目前的背景，${card2}（${ori2}）指出雙方關係中真正的阻礙是什麼，而 ${card3}（${ori3}）則是接下來感情可以往前走的方向。\n\n三張牌合起來的脈絡是：這段關係還有可能，只是有些沒說清楚的事情正在讓雙方的距離拉遠。真正卡住的點，是雙方都在等對方先有所行動，這種等待讓感情陷入停滯。需要有人先把感受說出來，溝通比等待更有效。`;
    default:
      return `把這三張牌放在一起看，${card1}（${ori1}）反映你目前正在面對的背景與狀態，${card2}（${ori2}）指出讓你卡住的核心問題在哪裡，而 ${card3}（${ori3}）則是接下來可以走的方向。\n\n三張牌合起來的脈絡是：你目前的困境是幾個面向疊加在一起造成的。先把最核心的那個問題找出來，集中資源處理它，而不是試圖一次解決全部。接下來，選一件你可以控制的事情開始行動，其他的事情會跟著慢慢清晰。`;
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
    finance:      `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n近期財運有機會，先把收支整理清楚，才能知道哪裡可以動。`,
    career:       `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n工作上的走向，這組牌提示你：方向比速度重要，先把真正想走的路確認清楚，再決定要衝還是等。`,
    love:         `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n感情的走向，這組牌看見的是：雙方之間還有空間，但需要更清楚的溝通，而不是繼續等待。`,
    relationship: `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n人際關係的問題，這組牌提示你：先釐清誤解的來源，溝通會比沉默更有效。`,
    health:       `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n身心狀態需要被照顧，這組牌提醒你：先把休息補回來，再談其他事。`,
    general:      `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n這組牌給你的方向很直接：先把最在意的問題找出來，從那裡開始行動。`,
  };

  const stateHint = isSingle
    ? "這張牌正在說的，比看起來更貼近你現在的狀態。有些事正在成形，需要你先看清楚卡住的位置。"
    : "這組牌正在提醒你：牌義裡的正逆位代表的是方向，看的是哪裡有條件往前、哪裡需要先注意。有些事正在成形，有些事則需要你先看清卡住的位置。";

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
  ✓ 應該像：「你其實想靠近，只是害怕自己又一次失望。」

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
4. 全文避免報告型句子（「整體而言」「這意味著你」）、命令式語氣（「你需要」→「可以先」）、心靈雞湯（「你值得更好的未來」「宇宙會帶你去對的地方」）。
5. 依主題給具體方向：感情→對方有沒有行動；工作→適合準備還是行動，是否要投履歷；財運→進攻還是守，守現金流/整理支出。

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
  const msgSpec    = depth === "deep" ? "180～280字（三小段合計）" : "160～240字（三小段合計）";
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
      "message": "牌面重點：\\n${card.name}（${ori}），關鍵字「${card.keywords?.slice(0,3).join("、") ?? "（關鍵字）"}」。\\n這張牌代表：（一句白話說明這張牌的核心意思，60～110字以內，最多不超過130字，不要像塔羅教科書，不要重複上一行的關鍵字意思）\\n\\n對你的問題代表：\\n（2～3句，約80～160字，白話直接回答使用者問題，說清楚這張牌在「${posLabel}」位置代表什麼：${card.position === "upright" ? "正向牌說明可以怎麼做或現在往哪個方向走" : "逆位牌說明什麼在阻礙或需要先停下來處理哪件事"}，要明確連回使用者的問題，不重複牌面重點，不寫抽象句）\\n\\n這張牌提醒你：\\n（1～2句，50～120字，【強制】必須依「${card.name}」（${ori}）這張牌的專屬牌義寫，正位牌說可以怎麼做，逆位牌說要注意什麼或什麼不建議做，三張牌的提醒不能說同樣的話，不重複牌面重點）"
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

2. overallSummary（格式固定為三段）：
   「整體答案：」→ 2～3句，50～80字，像占卜師直接回答使用者的問題，說出這組牌顯示的狀況。
     範例（愛情）：「這段感情還有可能，但先不要急著做最終決定。接下來先觀察對方有沒有實際行動，如果對方一直讓你猜，就先把重心收回自己。」
     範例（工作）：「轉職可以考慮，但這段時間適合準備，不建議衝動裸辭。先把履歷和你想要的工作條件整理好，再去投遞幾個職缺看看市場反應。」
     範例（財運）：「近期適合守，先把支出整理清楚，確認現金流穩定。可以小幅試探新收入，但大額投資這段時間先暫緩。」
   「為什麼會這樣：」→ 3～5句，100～180字，說明三張牌（${cardNamesForHint}）各自代表什麼，以及使用者真正卡住的點是什麼。要有具體分析，不寫抽象模板。用直述句，少用「這說明你處於某種狀態」「這代表你正在經歷轉變」這類報告型句子。
   「接下來的方向：」→ 2～3句，60～120字，給一個明確具體的行動建議。
     感情：說靠近/觀察/溝通還是拉距離，對方有沒有行動比感覺更重要。
     工作：說更新履歷/投遞/面試，是否先不要裸辭，現在適合準備還是行動。
     財運：說守現金流/整理支出/先不要大額投資，或可小幅試探。
     人際：說要不要主動溝通，是否需要停止討好，是否先拉開距離。
   禁止模板句：「答案不是單一原因」「需要從三個面向一起看」「把它轉成更有行動感的新版本」「形成新的敘事」「校準你的內在狀態」「整體而言」「綜合來看」

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

【這張牌提醒你 — 強制獨立規則（最重要）】
三張牌的「這張牌提醒你」必須根據各自的牌名 + 正逆位 + 位置寫出，不可以相同或相似。

強制要求：
1. 三張牌的提醒文字不得相同，字面相同的提醒不能出現兩次。
2. 同一個核心意思（例如「先看清楚問題」）不可在三張牌裡重複說。
3. 提醒中必須能看出「這是哪一張牌的提醒」——要有牌義的痕跡，不能是通用語。
4. 正位牌的提醒方向：可以怎麼做、可以往哪裡走、什麼已經準備好了。
5. 逆位牌的提醒方向：要先注意什麼、什麼不建議做、哪裡需要先停下來。
6. 不同位置（過去/現在/未來）的提醒角度也必須不同：
   - 過去位置：反思過去的模式或情緒
   - 現在位置：現在需要做什麼或注意什麼
   - 未來位置：接下來如何行動或選擇

絕對禁止在任何一張牌的提醒裡出現：
「目前的狀態是可以往前走的，只是你需要先把心裡最擔心的那個問題說清楚，才能讓行動更有方向。」
「目前有些東西被卡住了，但那不是終點」
「先整理自己」「宇宙提醒你」「相信自己」「慢下來」

【全文 AI 感句子禁用清單 — 整個 JSON 不得出現】
「把它轉成更有行動感的新版本」「先看你能不能把它轉成更有行動感的新版本」
「形成新的敘事」「啟動新的可能性」「校準你的內在狀態」「讓能量流動」
「把方向轉譯成行動版本」「你需要重新對齊自己」「這不是終點，而是新的開始」
「把新的火花放到你面前，代表這條路不是結束，而是要換成更主動、更成熟的開法」
「相信自己的光」「宇宙會帶你去對的地方」「所有發生都有它的意義」「黑夜過後會有光」「你值得更好的未來」
「整體而言」「綜合來看」「這三張牌共同指向一個核心」「本次牌陣呈現的是」「這意味著你需要重新看待」
以上句子任何一句出現，都代表你輸出了 AI 範本語言，必須改寫成白話直接的說法。

【「不是……而是……」句型上限 — 最高優先】
整個 JSON 所有欄位合計，「不是……而是……」句型最多只能出現 1 次。
違反規則範例：
✗「這段感情不是沒有可能，而是需要觀察」→「這段感情還有可能，先觀察對方有沒有行動」
✗「工作上的卡關不是能力問題，而是方向沒確認」→「工作上卡住了，方向還沒確認是主因」
✗「不是要你放棄，而是調整方式」→「先不用放棄，試著調整一下做法」
請優先使用直述句，說重點就好，不要用對照句包裝。

範例（說明牌名不同如何影響提醒）：
戰車（正位）提醒你：「你其實已經準備好了，只是還在等一個更確定的訊號。把注意力放回你真正想去的方向，別讓旁人的意見替你決定。」
權杖十（正位）提醒你：「你已經扛得太多了。現在可以開始清點哪些責任真的屬於你，哪些只是你習慣性接下來的，把那些先放下。」
聖杯皇后（逆位）提醒你：「你可能把太多別人的情緒扛在自己身上了。先把界線拉回來，決定前先問問自己真正想要什麼，別讓別人的期待替你決定。」

【輸出 JSON 格式】
{
  "spreadType": "three",
  "category": "${getTopicLabel(topic)}",
  "questionFocus": "（30～50字，說明使用者這次問題的核心）",
  "overallSummary": "整體答案：\\n（2～3句，50～80字，白話直接回答使用者問題，像占卜師說話，不用通用療癒語，不用「先整理自己」「方向會清楚」「這不是終點而是新的開始」）\\n\\n為什麼會這樣：\\n（3～5句，100～180字，分別說明每張牌各自代表什麼，必須引用全部三張牌名：${cardNamesForHint}，最後說出使用者真正卡住的點。不寫「把它轉成更有行動感的新版本」「形成新的敘事」等AI感句子）\\n\\n接下來的方向：\\n（2～3句，60～120字，給具體行動建議：愛情→說靠近/觀察/溝通/收回重心；工作→說先準備履歷/投遞/不要衝動裸辭；財運→說守現金流/整理支出；不可空泛說「調整方向」「看清楚內心」）",
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
      // 去重：偵測「這張牌提醒你」重複並替換
      const focus = detectQuestionFocus(question);
      parsed.cards = deduplicateCardMessages(parsed.cards, cards, focus, question);
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
