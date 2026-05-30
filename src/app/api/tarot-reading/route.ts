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
  questionFocus: string;
  cardMessage: string;
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
  message: string;
};

type ThreeCardReading = {
  spreadType: "three";
  category: string;
  questionFocus: string;
  cards: [ThreeCardEntry, ThreeCardEntry, ThreeCardEntry];
  combinedReading: string;
  next3To7Days: string;
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

function parseSingleCardJson(raw: string): SingleCardReading | null {
  try {
    const json   = extractJsonString(raw);
    if (!json) return null;
    const parsed = JSON.parse(json) as Partial<SingleCardReading>;
    if (parsed.spreadType !== "single") return null;
    if (!parsed.cardMessage || !parsed.oneLineConclusion || !parsed.todayAction) return null;
    return parsed as SingleCardReading;
  } catch {
    return null;
  }
}

/**
 * 解析三張牌 JSON，容許部分欄位缺失並補上預設值。
 * 只要 cards 陣列有至少 3 筆資料即視為可用。
 */
function parseThreeCardJson(raw: string): ThreeCardReading | null {
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
      return {
        position:    typeof entry.position    === "string" ? entry.position    : defaultPositions[i]!,
        cardName:    typeof entry.cardName    === "string" ? entry.cardName    : `第${i + 1}張牌`,
        orientation: typeof entry.orientation === "string" ? entry.orientation : "正位",
        message:     typeof entry.message     === "string" ? entry.message     : "這張牌的訊息正在凝聚中，請稍後再細細感受。",
      };
    }) as [ThreeCardEntry, ThreeCardEntry, ThreeCardEntry];

    return {
      spreadType:      "three",
      category:        typeof p.category      === "string" ? p.category      : "生活綜合",
      questionFocus:   typeof p.questionFocus === "string" ? p.questionFocus : "你的問題已收到，以下是這組牌的訊息。",
      cards,
      combinedReading: typeof p.combinedReading === "string" ? p.combinedReading : "這三張牌合在一起，指出了你目前最需要關注的方向，答案比你以為的更接近。",
      next3To7Days:    typeof p.next3To7Days   === "string" ? p.next3To7Days   : "Day 1–2：先觀察當下的狀態，不急著行動\nDay 3–4：選一件可以執行的小事開始\nDay 5–7：把注意力收回來，整理自己的感受",
      gentleReminder:  typeof p.gentleReminder === "string" ? p.gentleReminder : "答案就在你心裡，塔羅只是幫你照亮那個位置。",
      blessing:        typeof p.blessing       === "string" ? p.blessing       : "願你在尋找答案的路上，也記得溫柔地陪著自己。",
      safetyNote:      typeof p.safetyNote     === "string" && p.safetyNote ? p.safetyNote : undefined,
    };
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
    `✨ 這張牌正在說什麼\n\n${r.cardName}（${r.orientation}）\n${r.cardMessage}`,
    `🐾 今天可以怎麼做\n\n${r.todayAction}`,
    `🌌 給你的溫柔提醒\n\n${r.gentleReminder}`,
    `💫 一句專屬祝福\n\n${r.blessing}`,
  ];
  if (r.safetyNote) parts.push(`⚠️ 健康提醒\n\n${r.safetyNote}`);
  return parts.join("\n\n");
}

function formatThreeCardReading(r: ThreeCardReading): string {
  // null-safe guard：任何欄位缺失都補上預設值，絕不 throw
  const safe = {
    category:        r.category        || "生活綜合",
    questionFocus:   r.questionFocus   || "以下是這組牌對你問題的訊息。",
    combinedReading: r.combinedReading || "這三張牌合在一起，指出你目前最需要關注的方向。",
    next3To7Days:    r.next3To7Days    || "Day 1–2：先觀察當下狀態\nDay 3–4：選一件可執行的小事\nDay 5–7：整理自己的感受",
    gentleReminder:  r.gentleReminder  || "答案就在你心裡，塔羅只是幫你照亮那個位置。",
    blessing:        r.blessing        || "願你在尋找答案的路上，也記得溫柔地陪著自己。",
  };

  const cards = Array.isArray(r.cards) ? r.cards : [];
  const cardParts = cards.map(
    (c, i) => {
      const pos = c?.position    || `第${i + 1}張`;
      const name = c?.cardName   || `牌${i + 1}`;
      const ori  = c?.orientation|| "正位";
      const msg  = c?.message    || "這張牌的訊息正在凝聚中。";
      return `🃏 第${i + 1}張牌：${pos}\n\n${name}（${ori}）\n${msg}`;
    }
  );

  const parts: string[] = [
    `🎯 本次問題焦點\n\n${safe.category}`,
    `🌙 宇宙偷偷話\n\n${safe.questionFocus}`,
    ...cardParts,
    `🔮 三張牌整合訊息\n\n${safe.combinedReading}`,
    `🕯️ 3～7 天行動建議\n\n${safe.next3To7Days}`,
    `🌌 給你的溫柔提醒\n\n${safe.gentleReminder}`,
    `💫 一句專屬祝福\n\n${safe.blessing}`,
  ];
  if (r.safetyNote) parts.push(`⚠️ 健康提醒\n\n${r.safetyNote}`);
  return parts.join("\n\n");
}

// ═════════════════════════════════════════════════════════════════════════════
// Fallback 靜態文字輔助函式（AI 不可用時使用）
// ═════════════════════════════════════════════════════════════════════════════

function getFallbackConclusion(focus: QuestionFocus): string {
  switch (focus.primary) {
    case "finance":      return "近期財運偏穩健，比起衝刺大機會，更適合先整理支出、讓財務流動順暢。";
    case "career":       return "工作上有調整的能量，方向比速度重要，先確認自己真正想走的路再行動。";
    case "love":         return "感情狀態需要多一點耐心，真正的靠近不靠催促，先讓自己穩下來。";
    case "relationship": return "人際關係正在轉化，保持適當距離同時也保留溝通的空間。";
    case "health":       return "身心需要補充能量，這段時間先把休息和壓力管理放在第一位。";
    default:             return "現在的狀態正在轉變，先整理自己，方向會慢慢清晰。";
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
      return `Day 1–2：整理近期收支，找出最大支出漏洞\nDay 3–4：留意有沒有被忽略的收入機會或可推進的財務決定\nDay 5–7：執行一個具體的小行動：增加一筆收入，或刪除一項非必要支出`;
    case "career":
      return `Day 1–2：用 3 個關鍵字寫下你想要的工作狀態\nDay 3–4：觀察目前工作中有沒有正在出現的小機會或訊號\nDay 5–7：選一個可以推進的行動：一封信、一次對話，或一個申請`;
    case "love":
      return `Day 1–2：先看對方有沒有自然靠近，不要主動逼答案\nDay 3–4：留意日常互動的溫度，比衝動時更能看清楚真實感受\nDay 5–7：如果有話想說，選一個輕鬆的時機開口，不用完美`;
    case "relationship":
      return `Day 1–2：讓自己先冷靜，不要在情緒高漲時行動\nDay 3–4：試探一次輕鬆的溝通機會，看看對方的反應\nDay 5–7：不管結果如何，都記得把自己的感受放在第一位`;
    case "health":
      return `Day 1–2：把睡眠時間補回來，其他事可以等\nDay 3–4：減少一個耗能習慣，增加一個充電的小行為\nDay 5–7：做一件純粹讓心情變好的事，不帶任何目的`;
    default:
      return `Day 1–2：先離開反覆想像的房間，把心拉回當下\nDay 3–4：留意可能出現的小訊號或轉機\nDay 5–7：跟著事實走，不要只跟著害怕走`;
  }
}

function getFallbackGentleReminder(focus: QuestionFocus): string {
  switch (focus.primary) {
    case "finance":
      return `財運的門，不一定是大機會才算敲開。你每天做的小選擇，都在悄悄改變錢的流向。`;
    case "career":
      return `工作上的累，有一部分是你把標準設得比別人高。宇宙不是叫你放棄，只是想讓你喘口氣後，看清楚下一步真正想走的方向 ☁️`;
    case "love":
      return `你不用把自己說得很漂亮，才值得被喜歡。真正想靠近你的人，會願意聽你慢慢講。`;
    case "relationship":
      return `關係裡的誤解，很多時候不是壞心，只是大家都習慣不說出口。願意先邁一步，是勇氣，不是軟弱。`;
    case "health":
      return `身體在照顧你，你也要學會照顧它。早一點睡、少滑一點手機——這些小事加起來，就是你給自己最好的療癒 🌿`;
    default:
      return `今晚先把沒說出口的話，輕輕放在枕邊吧。你不用全部想通，明天的你會多懂一點點。`;
  }
}

function getFallbackBlessing(focus: QuestionFocus): string {
  switch (focus.primary) {
    case "finance":      return `願你在整理財務的同時，也記得整理一下對自己的溫柔——你比你以為的更有能力讓事情慢慢變好。`;
    case "career":       return `願你在還沒找到完美方向之前，也能相信：每一步的摸索，都是在為對的路鋪光。`;
    case "love":         return `願你在還不確定的夜裡，也能先好好待在自己身邊——那是你給自己最好的禮物。`;
    case "relationship": return `願你在面對複雜的關係時，也能記得：你值得被清楚、被溫柔地對待。`;
    case "health":       return `願你在照顧所有人之前，先記得把自己的能量杯裝滿——你滿了，才能溢出給別人。`;
    default:             return `願你在還不確定的夜裡，也能慢慢相信自己的光。`;
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
  const focus    = detectQuestionFocus(question);
  const focusLabel = getFocusLabel(focus);
  const ori      = card.position === "upright" ? "正位" : "逆位";
  const cardHint = card.topicMeaning || card.meaning || card.baseMeaning || "";

  const cardMessage = cardHint
    ? `${card.name}（${ori}）出現在你的提問裡——${cardHint}。這正是此刻最需要被看見的訊號。`
    : `${card.name}（${ori}）出現在你的提問裡，提示你目前的能量走向值得仔細留意，先看清楚狀況再採取行動。`;

  return formatSingleCardReading({
    spreadType:        "single",
    category:          focusLabel,
    cardName:          card.name,
    orientation:       ori,
    questionFocus:     question ? `你的問題是：「${question}」` : "你把問題放在心裡，牌仍然接住了此刻的能量。",
    cardMessage,
    oneLineConclusion: getFallbackConclusion(focus),
    todayAction:       getFallbackTodayAction(focus),
    gentleReminder:    getFallbackGentleReminder(focus),
    blessing:          getFallbackBlessing(focus),
    safetyNote:        getHealthSafetyNote(focus),
  });
}

function buildThreeCardFallback(
  cards: TarotReadingCard[],
  _topic: TarotReadingTopic,
  question: string
): string {
  const focus      = detectQuestionFocus(question);
  const focusLabel = getFocusLabel(focus);
  const spreadLabels = getSpreadLabels();

  const defaultPositions = ["目前狀態", "阻礙或盲點", "接下來的建議"];

  const cardEntries: ThreeCardEntry[] = cards.map((card, i) => {
    const ori      = card.position === "upright" ? "正位" : "逆位";
    const posLabel = card.spreadPosition
      ? spreadLabels[card.spreadPosition]
      : (defaultPositions[i] ?? `第${i + 1}張`);
    const hint     = card.topicMeaning || card.meaning || card.baseMeaning;
    const msg      = hint
      ? `${card.name}（${ori}）在「${posLabel}」的位置說的是：${hint}。`
      : `${card.name}（${ori}）出現在「${posLabel}」的位置，提示你此刻這個面向的能量走向值得留意。`;
    return { position: posLabel, cardName: card.name, orientation: ori, message: msg };
  });

  const cardNamesStr = cards.map((c) => c.name).join("、");

  return formatThreeCardReading({
    spreadType:      "three",
    category:        focusLabel,
    questionFocus:   question ? `你的問題是：「${question}」` : "你把問題放在心裡，牌陣接住了此刻的能量。",
    cards:           cardEntries as [ThreeCardEntry, ThreeCardEntry, ThreeCardEntry],
    combinedReading: `${cardNamesStr} 這三張牌合在一起指出：${getFallbackConclusion(focus)}`,
    next3To7Days:    getFallbackNext3To7Days(focus),
    gentleReminder:  getFallbackGentleReminder(focus),
    blessing:        getFallbackBlessing(focus),
    safetyNote:      getHealthSafetyNote(focus),
  });
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
  const focusLabel = getFocusLabel(focus);
  const isSingle   = cards.length === 1;
  const spreadLabels = getSpreadLabels();
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
    general:      `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n宇宙不是來替你宣布答案，而是把一盞小燈放在你心裡，讓你重新聽見自己。`,
  };

  const stateHint = isSingle
    ? "這張牌正在說的，比看起來更貼近你現在的狀態。有些事正在成形，需要你先看清楚卡住的位置。"
    : "這組牌正在提醒你：牌義裡的正逆位不是好壞判決，而是能量流動的方向。有些事正在成形，有些事則需要你先看清卡住的位置。";

  return `🎯 本次問題焦點

${focusLabel}

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

/** 單張牌 Prompt（快速宇宙訊息）*/
function buildSingleCardPrompt(
  card: TarotReadingCard,
  topic: TarotReadingTopic,
  question: string,
  depth: "standard" | "deep",
  antiSimilarityHint = ""
): string {
  const focus        = detectQuestionFocus(question);
  const focusLabel   = getFocusLabel(focus);
  const topicGuidance = getTopicGuidance(topic, focus);
  const ori          = card.position === "upright" ? "正位" : "逆位";
  const kw           = card.keywords?.length ? `關鍵字：${card.keywords.join("、")}` : "";
  const base         = card.baseMeaning  ? `牌面核心：${card.baseMeaning}`  : "";
  const topicMeaning = card.topicMeaning ? `主題牌義：${card.topicMeaning}` : "";
  const msgHint      = card.meaning      ? `牌面訊息：${card.meaning}`      : "";
  const cardDetails  = [kw, base, topicMeaning, msgHint].filter(Boolean).join("\n");

  const shortHint = question && question.length < 10
    ? `\n【短問題提示】此問題字數少，請推測核心意圖，在 questionFocus 和 oneLineConclusion 直接給出結論性回答。`
    : "";

  const depthNote = depth === "deep"
    ? "cardMessage 請寫 3-4 句，深入挖掘這張牌在此問題脈絡下的細膩含義。"
    : "cardMessage 請寫 2-3 句，精準聚焦核心訊息。";

  return `請根據以下資料，以 JSON 格式解讀塔羅牌。只回傳純 JSON，不加說明文字。

【抽牌模式】單張牌（快速宇宙訊息）
【問題】${question || "（未填寫問題）"}
【問題焦點】${focusLabel}
【牌卡】
  牌名：${card.name}（${ori}）
  牌組：${card.suit ?? ""}
  英文名：${card.nameEn ?? ""}
  ${cardDetails}

${TAROT_READING_STYLE_RULES}
${topicGuidance}
${shortHint}
${antiSimilarityHint}

【單張牌解讀規則】
1. 只能根據這一張牌（${card.name} ${ori}）解讀，不要引入其他牌的概念。
2. cardMessage 必須明確引用牌名「${card.name}」及其${ori}含義——不可以是與牌面無關的通用文字。
3. oneLineConclusion 必須直接回答使用者的問題，不超過 30 字。
4. ${depthNote}
5. 保留宇宙偷偷話風格：溫柔、神秘、療癒。

【輸出 JSON 格式】
{
  "spreadType": "single",
  "category": "（${focusLabel}）",
  "cardName": "（牌的中文名稱）",
  "orientation": "（正位 或 逆位）",
  "questionFocus": "（1句話說明這次解讀的核心問題）",
  "cardMessage": "（${depthNote.includes("3-4") ? "3-4" : "2-3"}句，這張牌的專屬訊息，必須引用牌名和正逆位含義）",
  "oneLineConclusion": "（1句直接結論，不超過30字，直接回答使用者問題）",
  "todayAction": "（1-2句具體行動建議，必須來自這張牌的牌義）",
  "gentleReminder": "（1-2句溫柔收尾，宇宙偷偷話療癒風格）",
  "blessing": "（1句祝福語）",
  "safetyNote": "（若問題涉及身體健康：如果症狀持續、惡化，或已經影響生活，建議尋求皮膚科或專業醫療協助。 否則為空字串）"
}`;
}

/** 三張牌陣 Prompt（完整解讀）*/
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
    ? `\n【短問題提示】此問題字數少，請推測核心意圖，在 questionFocus 直接給出結論性回答。`
    : "";

  const depthNote = depth === "deep"
    ? "每張牌的 message 寫 3-4 句，深入分析該牌在此位置的含義；combinedReading 寫 3-4 句。"
    : "每張牌的 message 寫 2-3 句；combinedReading 寫 2-3 句。";

  const positionSchema = cards.map((card, i) => {
    const defaultPos = defaultPositions[i] ?? `第${i + 1}張`;
    const posLabel   = card.spreadPosition ? spreadLabels[card.spreadPosition] : defaultPos;
    const ori        = card.position === "upright" ? "正位" : "逆位";
    return `    {
      "position": "${posLabel}",
      "cardName": "${card.name}",
      "orientation": "${ori}",
      "message": "（2-4句，必須引用牌名「${card.name}」的${ori}含義，聚焦在「${posLabel}」這個位置的意義）"
    }`;
  }).join(",\n");

  return `請根據以下牌陣資料，以 JSON 格式解讀塔羅牌陣。只回傳純 JSON，不加說明文字。

【抽牌模式】三張牌陣（完整解讀）
【問題】${question || "（未填寫問題）"}
【問題焦點】${focusLabel}

【牌陣資訊】
${cardDescriptions}

${TAROT_READING_STYLE_RULES}
${topicGuidance}
${shortHint}
${antiSimilarityHint}

【三張牌解讀規則】
1. 每張牌的 message 必須明確引用該牌名（${cardNamesForHint}）及其正逆位含義。
2. combinedReading 必須同時提到三張牌名，說明三張牌之間的關係和整體判斷。
3. next3To7Days 必須用 Day1-2 / Day3-4 / Day5-7 分段，給出具體可執行的建議，不能只說「相信自己」「慢慢來」。
4. ${depthNote}
5. 三張牌的整體解讀深度必須明顯高於單張牌，要反映牌陣的完整脈絡與三牌關係。

【輸出 JSON 格式】
{
  "spreadType": "three",
  "category": "（${focusLabel}）",
  "questionFocus": "（1句話說明這次解讀的核心問題）",
  "cards": [
${positionSchema}
  ],
  "combinedReading": "（${depth === "deep" ? "3-4" : "2-3"}句，整合三張牌的完整判斷，必須同時提到三張牌名）",
  "next3To7Days": "（Day 1–2：具體行動\\nDay 3–4：具體行動\\nDay 5–7：具體行動）",
  "gentleReminder": "（1-2句溫柔收尾）",
  "blessing": "（1句祝福語）",
  "safetyNote": "（若問題涉及身體健康：如果症狀持續、惡化，或已經影響生活，建議尋求皮膚科或專業醫療協助。 否則為空字串）"
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
      const parsed = parseSingleCardJson(raw);
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
      const parsed = parseThreeCardJson(raw);
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

      // 三張牌 token 限制在 1400（不超時），單張維持 1000
      const reading = isSingle
        ? await callSingleCard(client, model, cards[0], topic, question, "standard", 1000)
        : await callThreeCard (client, model, cards,    topic, question, "standard", 1400);

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
      ? await callSingleCard(client, model, cards[0], topic, question, "deep", 1400)
      : await callThreeCard (client, model, cards,    topic, question, "deep", 1600);

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
