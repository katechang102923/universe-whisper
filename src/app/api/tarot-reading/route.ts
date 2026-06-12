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

const validTopics        = ["love", "career", "finance", "ambiguous", "general"] as const;
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

// ── 投資理財問題專用關鍵字（細分判斷）────────────────────────────────────────
const INVESTMENT_KEYWORDS = [
  // 市場名稱
  "台股", "美股", "大盤", "股市", "指數", "加權指數", "加權",
  // 股票 / ETF 通用
  "股票", "ETF", "基金", "投資標的",
  // 常見ETF代碼
  "0050", "00878", "00940", "00948", "00929", "00919", "006208", "00646",
  // 漲跌問法
  "還會漲", "還會跌", "會漲嗎", "會跌嗎", "繼續漲", "繼續跌",
  "會不會漲", "會不會跌", "還能漲", "還能跌",
  // 買賣操作
  "進場", "出場", "要不要買", "要不要賣", "可不可以買", "可以買嗎",
  "適合買", "適合賣", "現在買", "現在賣", "買進", "賣出", "能不能買",
  "該買", "該賣", "要賣", "要買",
  "買進", "賣出", "漲", "跌",
  // 技術操作
  "停損", "停利", "加碼", "減碼", "持倉", "空手", "定期定額",
  "波段", "多頭", "空頭",
  // 技術分析
  "籌碼", "技術線", "支撐", "壓力", "回檔", "反彈",
  // 加密貨幣
  "加密貨幣", "比特幣", "以太幣", "BTC", "ETH", "幣圈", "加密",
  // 投資風險問法
  "適合進場", "適合出場",
];

// ── 生活／居住決策關鍵字（買房/租屋/搬家/換房/住宅）──────────────────────────
// 這類問題雖涉及金錢，但不是股票投資題，禁止套用「進場/加碼/停損/獲利/訊號」等市場語氣。
// 註：外地發展/換城市改歸「relocation」場景；開店/加盟/展店改歸「business/franchise/expansion」。
const HOUSING_LIFE_KEYWORDS = [
  "買房", "買屋", "購屋", "這間房", "這房子", "房子", "套房", "公寓", "華廈", "透天",
  "租屋", "租這間", "租房", "承租", "退租",
  "搬家", "搬到", "搬去", "換房", "換屋", "遷居", "搬遷",
  "居住", "住處", "住哪", "定居", "住宅", "適合住", "適合居住",
];

// 明確問「房產投資/出租投報/會不會漲」時，才回到投資語境
const HOUSING_INVEST_KEYWORDS = [
  "投資", "投報", "報酬率", "報酬", "會不會漲", "會漲", "增值", "轉手", "包租",
  "出租", "買來投資", "投資出租", "房地產投資", "房產投資", "賺",
];

// ── 外地發展關鍵字（獨立場景：新環境/生活成本/支援系統/落腳條件，非離職/投資/財運）──
const RELOCATION_KEYWORDS = [
  "外地發展", "去外地", "外地工作", "外地", "外縣市", "換城市", "搬去外地",
  "異地發展", "異地", "離開原本城市", "到外地", "外派", "到外縣市",
];

type BizLifeScenario =
  | "relocation" | "business_success" | "business_location" | "franchise" | "expansion";

/** business_success / business_location / franchise / expansion 統稱「經營決策」的子集 */
type BusinessScenario = Exclude<BizLifeScenario, "relocation">;

/**
 * 細分創業/開店/加盟/展店/外地發展場景（純語境判斷，用於選對結論文案）。
 * 順序：加盟 > 地點適配 > 展店時機 > 開店創業成敗 > 外地發展。回傳 null 表示不屬於這幾類。
 *  - business_location：問「地點/商圈/這裡」適不適合（地理條件），優先於展店與開店成敗。
 *  - expansion：問「展店時機/要不要開第二家」（既有店擴張決策）。
 *  - business_success：問「開店/創業會不會成功、做不做得起來」（經營成敗）。
 */
function getBizLifeScenario(question: string): BizLifeScenario | null {
  if (!question) return null;
  const q = question;
  if (/加盟/.test(q)) return "franchise";
  // 地點/商圈適配題：先於展店與開店成敗判斷（「這個地點適合開店嗎」「這裡適合展店嗎」）
  const isLocationQ =
    /商圈|選址|立地|地段|店址/.test(q) ||
    /地點/.test(q) ||
    (/這裡|這邊|這個地方|這個位置|這個點|這地方|這一區|這附近/.test(q) &&
      /適合|開店|展店|做生意|擺攤|開|租/.test(q)) ||
    (/店面/.test(q) && /適合|位置|地點|在這/.test(q));
  if (isLocationQ) return "business_location";
  if (/展店|開第二間|第二間店|第二家|開第二家|擴店|擴點|拓點|分店|開分店|再開一間|多開一間|多一間店/.test(q)) return "expansion";
  if (/開店|創業|開業|開公司|開工作室|自己做生意|做生意|擺攤|頂讓|店面|開一間店/.test(q)) return "business_success";
  if (RELOCATION_KEYWORDS.some((k) => q.includes(k))) return "relocation";
  return null;
}

/** 是否為創業/開店/地點/加盟/展店題（不含外地發展）*/
function isBusinessStartupQuestion(question: string): boolean {
  const s = getBizLifeScenario(question);
  return s !== null && s !== "relocation";
}

/** 是否為外地發展題（新環境/生活成本/支援系統，非離職、非投資）*/
function isRelocationQuestion(question: string): boolean {
  return getBizLifeScenario(question) === "relocation";
}

/** 判斷是否為生活／居住決策題（買房/租屋/搬家/換房），且非房產投資、非創業/外地發展題 */
function isHousingLifeQuestion(question: string): boolean {
  if (!question) return false;
  if (getBizLifeScenario(question)) return false; // 開店/加盟/展店/外地發展不歸居住類
  const isHousing = HOUSING_LIFE_KEYWORDS.some((k) => question.includes(k));
  if (!isHousing) return false;
  const isHousingInvest = HOUSING_INVEST_KEYWORDS.some((k) => question.includes(k));
  return !isHousingInvest;
}

/** 判斷是否為投資/股市問題（finance 的子類別，需要市場導向解讀） */
function isInvestmentQuestion(question: string): boolean {
  if (!question) return false;
  // 居住決策、創業開店、外地發展都不算股票投資（避免「該買/賺」等字誤判成進場題）
  if (isHousingLifeQuestion(question) || getBizLifeScenario(question)) return false;
  return INVESTMENT_KEYWORDS.some((k) => question.includes(k));
}

// ── 業績/成交/追單問題關鍵字 ──────────────────────────────────────────────────
const BUSINESS_TARGET_KEYWORDS = [
  "業績", "達標", "成交", "簽約", "報價", "追單", "訂單", "獎金",
  "KPI", "業務", "銷售", "客戶", "本月業績", "本週業績", "工作績效",
];

/** 判斷是否為業績/成交/追單問題（career 的子類別，需要業務導向解讀） */
function isBusinessTargetQuestion(question: string): boolean {
  if (!question) return false;
  return BUSINESS_TARGET_KEYWORDS.some((k) => question.includes(k));
}

// ── 轉職/離職問題關鍵字 ───────────────────────────────────────────────────────
const CAREER_CHANGE_KEYWORDS = [
  "離職", "轉職", "換工作", "跳槽", "面試", "履歷", "裸辭", "換公司", "新工作",
];

/** 判斷是否為轉職/離職問題（必須明確提到才算） */
function isCareerChangeQuestion(question: string): boolean {
  if (!question) return false;
  return CAREER_CHANGE_KEYWORDS.some((k) => question.includes(k));
}

// ── 考試/學業/證照/升學問題關鍵字 ─────────────────────────────────────────────
// 注意：刻意不含「面試」「履歷」（那屬於轉職類），避免把求職面試誤判成考試。
const EXAM_KEYWORDS = [
  "考試", "考運", "考上", "考過", "期末考", "期中考", "段考", "模擬考", "小考",
  "會考", "學測", "指考", "統測", "分科測驗", "國考", "高普考", "公職",
  "證照", "檢定", "多益", "托福", "雅思", "日檢", "駕照",
  "論文", "口試", "畢業", "升學", "讀書", "複習", "唸書", "補習", "學業",
  "選哪間學校", "選學校", "錄取分數", "上榜",
];

/** 判斷是否為考試/學業/證照/升學問題（career 的姊妹類別，需要學業導向解讀） */
function isExamQuestion(question: string): boolean {
  if (!question) return false;
  return EXAM_KEYWORDS.some((k) => question.includes(k));
}

// ── 日常運勢關鍵字 ────────────────────────────────────────────────────────────
const DAILY_FORTUNE_KEYWORDS = [
  "今天", "今日", "明天", "最近狀態", "最近運勢", "這幾天", "運勢如何",
  "宇宙今天", "今天適合", "明天適合", "今天運", "明天運",
];

function isDailyFortuneQuestion(question: string): boolean {
  if (!question) return false;
  return DAILY_FORTUNE_KEYWORDS.some((k) => question.includes(k));
}

// ── 主題分類器 ────────────────────────────────────────────────────────────────

type QuestionTopic =
  | "businessTarget"  // 業績/成交/追單
  | "careerChange"    // 轉職/離職/職涯困境
  | "investment"      // 股票/投資/市場
  | "exam"            // 考試/學業/證照/升學
  | "love"            // 感情/關係
  | "relationship"    // 人際/朋友/同事/合作/家人
  | "health"          // 身心健康/壓力
  | "daily"           // 日常運勢
  | "general";        // 其他綜合

const QUESTION_TOPIC_LABELS: Record<QuestionTopic, string> = {
  businessTarget: "業績／工作目標類",
  careerChange:   "職涯困境／職場人際類",
  investment:     "投資／股票／市場類",
  exam:           "考試／學業／升學類",
  love:           "情感／關係類",
  relationship:   "人際／合作／家人類",
  health:         "身心健康／壓力調適類",
  daily:          "日常運勢／短期提醒類",
  general:        "綜合運勢類",
};

/**
 * 根據使用者原始問題判斷主題，優先順序：
 * 投資 > 業績 > 考試 > 轉職 > 感情 > 人際 > 健康 > 日常 > 綜合
 * （考試早於轉職：考試關鍵字刻意不含面試/履歷，兩者不會互搶）
 */
function detectQuestionTopic(question: string, focus: QuestionFocus): QuestionTopic {
  if (!question) return "general";
  if (isInvestmentQuestion(question))                                    return "investment";
  if (isBusinessTargetQuestion(question) && !isCareerChangeQuestion(question)) return "businessTarget";
  if (isExamQuestion(question))                                          return "exam";
  if (isCareerChangeQuestion(question))                                  return "careerChange";
  if (focus.primary === "love")                                          return "love";
  if (focus.primary === "relationship")                                  return "relationship";
  if (focus.primary === "health")                                        return "health";
  if (isDailyFortuneQuestion(question))                                  return "daily";
  return "general";
}

/**
 * 根據問題主題產生術語邊界規則，注入到 prompt 最前面作為最高強制約束。
 */
function getTopicBoundaryRules(topic: QuestionTopic, question: string): string {
  const q = question || "（使用者未填寫問題）";
  const topicLabel = QUESTION_TOPIC_LABELS[topic];

  const header = `【⚠️ 核心主題分類器 — 最高強制規則，優先於一切其他指示】
本次使用者問題：「${q}」
本次問題主題分類：${topicLabel}
本次解讀必須 100% 回答使用者原始問題，不得自行延伸成其他主題，不得使用不屬於本分類的術語。
每個欄位（牌面重點、對你的問題代表、這張牌提醒你、整體答案、為什麼會這樣、接下來方向、3～7 天建議、心靈收束）都必須符合本分類。`;

  switch (topic) {
    case "businessTarget":
      return `${header}

✅ 本次允許討論：業績、目標、成交、客戶、追單、報價、簽約、訂單、KPI、工作績效、執行力、行動效率、競爭狀態、小單累積、舊客回訪、名單整理、成交節奏
❌ 本次嚴禁提及（整個解讀不得出現以下任何字詞）：轉職、離職、換工作、跳槽、履歷、投履歷、面試、裸辭、換公司、新工作、感情、復合、股票、投資操作

【牌義轉譯強制原則】
若牌義出現「改變、離開、重新開始、轉型」意象，必須轉譯為業績情境：
✓ 調整客戶名單 / 改變追單方式 / 放掉低機率案子 / 重新整理報價策略 / 找回成交節奏
✗ 不得轉譯為：轉職、換環境、離職、更新履歷

解讀結尾（接下來的方向、3～7 天建議）必須圍繞：業績追回策略、名單整理、精準追單行動。`;

    case "careerChange":
      return `${header}

✅ 本次允許討論：職涯方向、工作環境、主管、同事、職場人際、是否留下、是否轉職、面試、履歷、離職規劃
❌ 本次嚴禁：把主題轉成業績達標、股票操作或感情問題`;

    case "investment":
      return `${header}

✅ 本次允許討論：牌面偏漲、牌面偏弱、續漲力道、短線震盪、追高風險、觀望、支撐、壓力、部位控制、分批、停損、停利、風險控管、市場情緒
❌ 本次嚴禁業績語氣：主動追單、聯絡客戶、提高行動力、努力衝刺、拜訪客戶、報價、成交
❌ 本次嚴禁絕對承諾：一定會漲、一定會跌、可以放心買、保證獲利、馬上歐印、快點加碼

【必填免責聲明】safetyNote 必須填入：「以上為塔羅牌面參考，不構成投資建議，實際操作仍請自行評估風險。」`;

    case "exam":
      return `${header}

✅ 本次允許討論：準備狀態、讀書效率、理解程度、複習策略、臨場反應、粗心風險、考運起伏、時間分配、錄取/上榜機率、心態調整
❌ 本次嚴禁（整個解讀不得出現以下任何方向）：衝動離職、換工作、轉職、業績、客戶成交、創業、投資理財、破財、桃花、前任復合、感情考驗、靈魂課題、靈魂伴侶
牌義若出現「改變、放下、重新開始」意象，必須轉譯成學業情境：調整讀書方法、放掉沒效率的複習方式、重新分配時間，不得轉譯成職涯或感情。
是非題（能不能考上/過/錄取）必須在牌陣總結或每張牌給明確傾向：偏向有利／偏向不利／機會普通／需要調整後才有機會。`;

    case "love":
      return `${header}

✅ 本次允許討論：情感連結、心理投射、溝通落差、相處氛圍、安全感、依戀、距離感、關係節奏、復合可能、雙方狀態
❌ 本次嚴禁：業績、客戶、報價、追單、履歷、轉職、股票、投資操作
❌ 本次嚴禁絕對斷言：一定會結婚、一定會分手、一定會復合、對方一定愛你`;

    case "relationship":
      return `${header}

✅ 本次允許討論：對方真實態度、信任程度、溝通誤會、利益衝突、合作風險、界線感、關係是否失衡、家人相處、修復可能
❌ 本次嚴禁（整個解讀不得出現以下任何方向）：感情復合、曖昧追求、桃花、業績達標、客戶成交、股票投資、轉職離職、考試錄取（除非使用者問題明確提及）
這是人際／合作／家人關係，不是愛情題：不要把「對方態度」解讀成戀愛好感，而是友情、同事、合作或家人之間的信任與誤會。
分析型問題（對方是不是討厭我／可不可信任）要直接講對方態度（偏正面／偏防備／有保留），不要硬給「有機會／沒機會」。`;

    case "health":
      return `${header}

✅ 本次允許討論：身心狀態、壓力來源、睡眠作息、情緒循環、體力與恢復、過度消耗、生活步調調整、身體警訊
❌ 本次嚴禁（整個解讀不得出現以下任何方向）：職涯發展、離職、轉職、升遷、業績達標、客戶追單、股票投資、感情復合、人生方向、靈魂課題
牌義若出現「改變、放下、結束」意象，必須轉譯成身心情境：調整作息、放掉一個耗能習慣、讓自己恢復、減壓，不得轉譯成職涯或感情。
不提供醫療診斷，但可從牌面給身心狀態提醒。`;

    case "daily":
      return `${header}

✅ 本次允許討論：當天能量、短期氛圍、心態提醒、注意事項、人際互動、行動節奏、情緒狀態
❌ 本次嚴禁延伸成重大決策：離職、分手、投資買賣、業績達標（除非使用者問題明確提及）`;

    default:
      return `${header}

不得自行加入股票操作建議、業績追單建議或轉職建議，除非使用者問題明確提及。`;
  }
}

// ── 是非題 / 達標題關鍵字 ─────────────────────────────────────────────────────
const YES_NO_KEYWORDS = [
  // 達標類
  "達標", "達到目標", "達成目標", "完成目標", "業績目標",
  "業績達", "業績會", "業績能", "業績是否", "業績可以",
  // 成功類
  "會成功", "能成功", "成功嗎", "成功嘛", "是否成功", "可以成功", "有沒有機會成功",
  "會不會成功", "能不能成功",
  // 成交類
  "會成交", "能成交", "成交嗎", "成交嘛", "是否成交", "可以成交",
  "會不會成交", "案子能", "合約會", "合約能", "訂單會", "訂單能",
  // 有沒有結果 / 有沒有機會
  "有沒有結果", "有結果嗎", "會有結果", "有沒有機會", "有機會嗎",
  "會有機會", "是否有機會", "有希望嗎", "有沒有希望",
  // 對方回覆 / 主動類
  "會回覆嗎", "會回嗎", "會主動嗎", "會主動聯絡", "會找我嗎", "會有消息嗎", "有消息嗎",
  "會有消息", "他會主動", "對方會主動", "會不會主動",
  // 考試 / 面試 / 申請類
  "考上嗎", "錄取嗎", "上嗎", "通過嗎", "過嗎",
  "面試會過", "面試能過", "面試通過", "會被錄取",
  "會不會錄取", "能不能錄取", "會錄取", "能錄取",
  "能不能考上", "會不會考上", "能考上", "考得上嗎", "考得過嗎",
  // 感情結果類（復合 / 在一起 / 結婚 / 對方心意）
  "會不會復合", "會復合", "能不能復合", "能復合", "復合嗎",
  "會不會在一起", "能不能在一起", "會在一起", "能在一起",
  "會不會結婚", "能不能結婚", "會結婚", "結得成嗎",
  // 註：對方心意（喜不喜歡我/愛不愛我…）改歸「分析型」，見 ANALYSIS_KEYWORDS
  // 業績 / 簽約 / 成交結果類
  "會簽約", "簽約嗎", "會不會簽約", "簽得成嗎", "會不會下單", "會下單",
  // 財運 / 投資結果類（會不會賺、破財、加薪、收入、拿得回來）
  "會賺錢", "賺錢嗎", "會賺嗎", "賺嗎", "會不會賺", "會不會賺錢", "賺得到嗎", "有沒有賺頭",
  "拿得回來", "拿得回來嗎", "拿得回嗎", "要得回來嗎", "討得回來嗎",
  "會破財", "破財嗎", "會不會破財", "會加薪", "加薪嗎", "會不會加薪",
  "收入會增加", "收入增加嗎", "會不會漲薪",
  // 一般性達成問
  "能達到", "可以達到", "做得到嗎", "做得成嗎",
];

/** 判斷是否為是非題 / 達標題（需要先給明確傾向判斷） */
function isYesNoQuestion(question: string): boolean {
  if (!question) return false;
  return YES_NO_KEYWORDS.some((k) => question.includes(k));
}

// ── 問題回答類型分類（結論語氣依類型切換，避免全部套「有機會/沒機會」模板）──────
// 第一類 result：問結果會不會發生 → 用「有機會/難度偏高/不太看好」傾向詞
// 第二類 choice：問該不該做某事 → 用「偏向適合/可以考慮/暫時不建議/風險偏高」
// 第三類 analysis：問原因/對方想法 → 不給有機會/沒機會，直接分析狀態與卡點
// 第四類 timing：問何時發生 → 用「短期內/未來一到三個月/時機未到」，不給精確日期

const CHOICE_KEYWORDS = [
  "要不要", "該不該", "需不需要", "值不值得", "值得嗎", "該選", "要選哪",
  "選哪個", "選哪一", "適不適合", "適合嗎", "接不接受", "接受這份", "接受這個",
  "去不去", "留不留", "換不換", "分不分", "要接受", "要不要接受", "要不要去",
  "可不可以做", "能不能放下", "該放下嗎", "該離開嗎", "要離職嗎", "要不要離職",
  "要不要創業", "要不要投資", "要不要結婚", "要不要搬家", "要不要復合",
  // 「應該／該／適合 + 動作」句型（涵蓋「我這個月應該要離職換跑道嗎」）
  "應不應該", "應該要", "應該離職", "該離職", "該不該離職", "適合離職",
  "應該換", "該換", "該不該換", "適合換工作", "適合換跑道", "適合創業",
  "適合投資", "適合搬家", "該不該創業", "該不該分手", "要不要分手",
  // 生活選擇 / 買房 / 搬家 / 合作（涵蓋「這間房子適合我嗎」「要不要合作」）
  "適合我嗎", "適合我", "要不要買房", "適合買房", "適合搬家嗎", "該不該買",
  "該不該搬", "要不要去外地", "要不要合作", "該不該合作", "值得買嗎",
  "要不要跟他合作", "適合去", "該攤牌嗎", "該不該攤牌",
  // 居住 / 店面決策（涵蓋「適合自住嗎」「適合開店嗎」「適合租嗎」）
  "適合自住", "適合居住", "適合住", "適合開店", "適合租", "適合承租",
  "適合做生意", "這個地點適合", "適合開", "要不要租", "要不要搬",
];

const ANALYSIS_KEYWORDS = [
  "怎麼看我", "怎麼看待", "印象如何", "印象怎樣", "對我的看法", "怎麼想",
  "在想什麼", "心裡在想", "目前的想法", "為什麼", "為何", "什麼原因",
  "怎麼會", "怎麼回事", "哪裡出問題", "卡在哪", "為什麼一直", "為什麼總是",
  "遲遲不", "為什麼還不", "對我有沒有意見", "怎麼評價", "如何看我",
  // 對方心意 / 態度（屬分析題：要分析好感與穩定度，不給「有機會/沒機會」）
  "喜不喜歡我", "喜歡我嗎", "愛不愛我", "在不在意我", "有沒有喜歡我",
  "對我有沒有感覺", "對我有意思嗎", "在乎我嗎", "還喜歡我嗎", "對我的感覺",
  "是不是認真", "認真的嗎", "是不是真心", "有沒有第三者", "有第三者嗎",
  "會不會後悔", "怎麼看我", "現在怎麼看",
  // 人際／合作態度（分析對方真實態度，不給有機會/沒機會）
  "是不是討厭", "討厭我嗎", "討厭我", "是不是針對", "針對我", "在利用我",
  "是不是在利用", "可以信任嗎", "值得信任嗎", "是不是對我有意見", "對我有意見嗎",
];

const TIMING_KEYWORDS = [
  "什麼時候", "何時", "幾月", "多久", "什麼時機", "哪時候", "幾時",
  "多快", "要等多久", "什麼時候會", "何時能", "何時才", "什麼時候才",
];

function isChoiceQuestion(question: string): boolean {
  if (!question) return false;
  return CHOICE_KEYWORDS.some((k) => question.includes(k));
}
function isAnalysisQuestion(question: string): boolean {
  if (!question) return false;
  return ANALYSIS_KEYWORDS.some((k) => question.includes(k));
}
function isTimingQuestion(question: string): boolean {
  if (!question) return false;
  return TIMING_KEYWORDS.some((k) => question.includes(k));
}

type AnswerType = "result" | "choice" | "analysis" | "timing" | "none";

/**
 * 判斷問題的回答類型，決定結論語氣。
 * 優先序：時間 > 選擇 > 分析 > 結果
 *  - 時間最高：「什麼時候達標」要給時間區間，不是給機率
 *  - 選擇優先於結果：「要不要離職」是選擇題，不該套「達標機率」
 *  - 分析優先於結果：「他怎麼看我」要分析心態，不該硬給有/沒機會
 */
function detectAnswerType(question: string): AnswerType {
  if (!question) return "none";
  if (isTimingQuestion(question))   return "timing";
  if (isChoiceQuestion(question))   return "choice";
  if (isAnalysisQuestion(question)) return "analysis";
  if (isYesNoQuestion(question))    return "result";
  return "none";
}

/**
 * 依回答類型產生「結論語氣強制規則」，注入 prompt（最高優先）。
 * result 型沿用既有 yesNoHint 機制，這裡只處理 choice / analysis / timing。
 * conclusionField：單張牌為 "oneLineConclusion"，三張牌為 "overallSummary 的「整體答案：」"
 */
function getAnswerTypeHint(answerType: AnswerType, question: string, conclusionField: string): string {
  const q = question || "（未填寫問題）";
  switch (answerType) {
    case "choice":
      return `\n【選擇型問題 — 結論語氣強制規則（最高優先）】
使用者問的是「${q}」，這是「該不該做某件事」的選擇題，不是「會不會發生」的結果題。
${conclusionField} 的第一句必須給出選擇傾向，只能用以下語氣（擇一）：
「偏向適合」「可以考慮」「需要再觀察」「暫時不建議」「風險偏高」。
✗ 嚴禁套用結果題模板：「非常有機會」「成功率高」「達標機率」「錄取率高」「會成功」（這對選擇題不自然）。
必須說明「為什麼適合或不適合」：目前條件成不成熟、資源夠不夠、時機對不對、貿然行動的風險是什麼。
範例：「這組牌比較偏向暫時不建議離職，目前新機會還沒成熟，貿然離開反而容易增加壓力。」`;

    case "analysis":
      return `\n【分析型問題 — 結論語氣強制規則（最高優先）】
使用者問的是「${q}」，這是想知道「原因／對方想法／現況」的分析題，不是預測結果。
✗ 嚴禁硬給：「有機會」「沒機會」「成功率高」「達標機率」這類結果型結論（這會答非所問）。
${conclusionField} 與每張牌必須直接分析四件事：目前狀態是什麼、背後真實原因、核心卡點在哪、後續可能怎麼發展。
語氣可用：「目前比較像……」「真正的原因可能是……」「最大的卡點是……」「接下來若不變，容易……」。
範例：「這組牌顯示主管其實有注意到你的能力，但對穩定度還在觀察，所以評價是保留偏正面。」`;

    case "timing":
      return `\n【時間型問題 — 結論語氣強制規則（最高優先）】
使用者問的是「${q}」，這是想知道「何時發生」的時間題。
✗ 嚴禁亂給精確日期（幾月幾號）。✗ 嚴禁只用「有機會/沒機會」帶過。
${conclusionField} 必須給時間感的判斷，只能用以下語氣（擇一或組合）：
「短期內」「未來一到三個月」「中期發展」「需要較長時間」「目前時機未到」。
並說明「為什麼是這個時間區間」：目前進展快或慢、卡在哪個環節、什麼條件到位才會發生。
範例：「這組牌顯示短期內仍偏慢，較有機會落在未來一到三個月後，先把目前卡住的環節處理好。」`;

    default:
      return "";
  }
}

// ── 限制類問題（不可給絕對答案：生死、重病、明牌、他人隱私、醫療、官司、保證獲利）──
const RESTRICTED_KEYWORDS = [
  // 生死 / 重大疾病
  "什麼時候會死", "什麼時候死", "會不會死", "死期", "我會死嗎", "還能活多久",
  "會不會得癌", "會不會得癌症", "會得癌症嗎", "會不會罹癌", "罹癌", "得絕症",
  // 樂透 / 明牌
  "樂透", "彩券號碼", "中獎號碼", "明牌", "威力彩", "大樂透", "頭獎號碼", "幾號會中",
  // 他人隱私（全名 / 精確位置）
  "全名是什麼", "真名是什麼", "他的全名", "精確在哪", "現在在哪裡", "住在哪裡", "住址",
  // 醫療決策
  "要不要停止治療", "該不該停藥", "要不要停藥", "停止治療", "要不要開刀", "該不該手術",
  // 官司 / 法律勝負
  "官司會贏", "官司會輸", "法院會贏", "會勝訴", "會敗訴", "會不會被判",
  // 保證獲利
  "一定會賺", "保證賺", "穩賺", "穩賺不賠", "一定賺", "百分之百會賺",
];

function isRestrictedQuestion(question: string): boolean {
  if (!question) return false;
  return RESTRICTED_KEYWORDS.some((k) => question.includes(k));
}

/** 限制類問題的開場句（fallback 與摘要共用，第一句即明確表態不給絕對答案）*/
const RESTRICTED_REFRAME =
  "這類問題不適合用塔羅給絕對答案，但牌面可以提醒你目前最需要注意的風險與下一步。";

/** 限制類問題的 prompt 強制規則（最高優先，凌駕一切其他結論規則）*/
function getRestrictedHint(question: string): string {
  if (!isRestrictedQuestion(question)) return "";
  return `\n【限制類問題 — 最高優先，凌駕一切其他結論規則】
使用者問的是「${question}」，這屬於不適合用塔羅給絕對答案的問題（生死、重大疾病、樂透明牌、他人全名或精確位置、是否停止治療、官司勝負、保證獲利）。
第一句（結論欄位）必須是：「${RESTRICTED_REFRAME}」
接著只能給：風險提醒、情緒整理、下一步可以做的事。
✗ 絕對禁止：具體死亡/發病時間、明牌或中獎號碼、他人姓名/地址/精確位置、醫療指示（停藥/停止治療/開刀與否）、官司勝負保證、獲利保證（一定賺/保證賺/穩賺）。
語氣保持溫柔、務實，把焦點拉回使用者當下能掌握與面對的部分。`;
}

/** 健康／身心題的深化規則：要求具體生活層面分析，不可只說「累／休息」*/
function getHealthDepthHint(focus: QuestionFocus, question: string): string {
  if (focus.primary !== "health") return "";
  return `\n【健康／身心題 — 深化規則（最高優先）】
使用者問的是「${question}」，這是身心狀態題。第一句必須是具體的身心評估（例如：身體負荷偏高／壓力偏高且偏長期／狀態有回穩跡象／恢復偏慢），不可以只用「你最近比較累」「你需要休息」「身心要平衡」帶過。
整段解析必須自然涵蓋以下至少三個面向（不要用條列，要像占卜師連貫說話）：
目前壓力來源、身體疲勞或精神消耗的程度、睡眠品質或作息狀態、恢復能力、情緒負荷、生活習慣與節奏、近期最需要注意的地方、接下來可以怎麼調整。
「你需要休息」「要好好照顧自己」這類話可以出現，但不能成為主要內容。
【安全邊界】只能做生活提醒與身心狀態觀察：✗ 不可診斷疾病或病名、✗ 不可判斷是否罹癌或重大疾病、✗ 不可建議停藥/停治療/延誤就醫、✗ 不可說「你一定生病了」「你一定沒事」「不用看醫生」。
若使用者已有明顯不適，要補一句：實際狀況仍以醫師檢查為準，塔羅只能提醒近期狀態與需要注意的方向。`;
}

// ── 牌面強弱訊號 → 結論力度 ────────────────────────────────────────────────────
// 強訊號：出現明顯有利的強牌（太陽/世界/星星/皇帝/女皇/聖杯二/聖杯十/權杖六/錢幣十）
//          且負面牌極少 → 結論力度可升級（很有機會／機率偏高／趨勢明顯有利）
// 弱訊號：出現明顯負面強牌（高塔/惡魔/寶劍十/寶劍三/月亮逆位/錢幣五/權杖十逆位）
//          且正面支撐不足 → 結論力度可下修（難度偏高／目前不太看好／短期不樂觀）

type SpreadSignal = "strong" | "weak" | "neutral";

/** 判斷單張牌是否為強正面 / 強負面牌（避免宮廷牌「○○皇后」被誤判成女皇）*/
function classifyCardStrength(card: TarotReadingCard): "pos" | "neg" | null {
  const up = card.position === "upright";
  const n = `${card.name ?? ""}${card.nameZh ?? ""}`;
  const isMinorOrCourt = /權杖|聖杯|寶劍|錢幣/.test(n);

  // 強正面牌（只在正位算強；逆位削弱不計）
  const strongPos = isMinorOrCourt
    ? /聖杯二|聖杯十|權杖六|錢幣十/.test(n)
    : /太陽|世界|星星|皇帝|皇后|女皇/.test(n); // major Empress=皇后；宮廷皇后已被上面分流排除
  if (strongPos && up) return "pos";

  // 強負面牌：高塔/惡魔/寶劍十/寶劍三/錢幣五 正位，月亮/權杖十 逆位
  const strongNegUp = (isMinorOrCourt ? /寶劍十|寶劍三|錢幣五/.test(n) : /高塔|惡魔/.test(n)) && up;
  const strongNegRev = !up && /月亮|權杖十/.test(n);
  if (strongNegUp || strongNegRev) return "neg";

  return null;
}

/**
 * 綜合牌陣強弱：
 * 強訊號 = 至少一張強正牌、沒有強負牌、且逆位牌不過半（負面極少）
 * 弱訊號 = 至少一張強負牌、且沒有強正牌（正面支撐不足）
 * 其餘為中性
 */
function getSpreadSignal(cards: TarotReadingCard[]): SpreadSignal {
  let strongPos = 0;
  let strongNeg = 0;
  let reversed = 0;
  for (const c of cards) {
    const cls = classifyCardStrength(c);
    if (cls === "pos") strongPos++;
    else if (cls === "neg") strongNeg++;
    if (c.position === "reversed") reversed++;
  }
  const total = cards.length || 1;
  if (strongPos >= 1 && strongNeg === 0 && reversed <= Math.floor(total / 2)) return "strong";
  if (strongNeg >= 1 && strongPos === 0) return "weak";
  return "neutral";
}

/** 牌面強弱 → 結論力度的 prompt 強制規則（注入 AI prompt，最高優先）*/
function getStrengthHint(cards: TarotReadingCard[]): string {
  const signal = getSpreadSignal(cards);
  if (signal === "neutral") return "";
  const names = cards
    .map((c) => `${c.name ?? c.nameZh ?? ""}（${c.position === "upright" ? "正位" : "逆位"}）`)
    .join("、");
  if (signal === "strong") {
    return `\n【牌面強度 → 結論力度（強訊號，最高優先）】
本次牌面（${names}）出現明顯有利的強牌，且負面牌極少。結論力度必須跟著拉高：
請用「很有機會／機率偏高／趨勢明顯有利」這類更肯定的說法，不要把明顯偏多的牌還只講成「有機會／需要再觀察／仍有變數」。
仍不可給絕對保證：不使用「一定會」「保證」「百分之百」「穩贏」。`;
  }
  return `\n【牌面強度 → 結論力度（弱訊號，最高優先）】
本次牌面（${names}）出現明顯的負面強牌，且正面支撐不足。結論力度必須跟著下修：
請用「難度偏高／目前不太看好／短期不樂觀」這類說法，不要把明顯偏弱的牌還含糊講成「有機會／仍有變數／需要觀察」。
但不要恐嚇或斷言絕對的壞結果，仍保留「調整後仍可能改善」的空間。`;
}

/** 居住搬遷類（買房/租屋/搬家/換房/住宅）— 禁止股票投資語氣 */
function getHousingChoiceHint(question: string): string {
  if (!isHousingLifeQuestion(question)) return "";
  return `\n【居住搬遷類問題 — 嚴禁投資語氣（最高優先）】
使用者問的是「${question}」，這是搬家／搬遷／租屋／買房／換房／住宅這類居住決策，不是股票投資題。
✗ 整段解讀絕對禁止出現這些市場用語：進場、加碼、減碼、停損、停利、短線、波段、獲利、賺、投資標的、訊號、等訊號、報酬率、風險報酬、資金丟進去、回本、滿倉、部位、控倉。
✓ 回答重點只圍繞：變動時機是否成熟、新環境是否適合、是否值得變動、財務與成本風險（貸款／租金壓力、生活成本、維護成本）、適應期，以及交通與生活機能。
【牌義轉譯】每張牌請依牌位（過去/現在/未來）＋正逆位，把牌義轉成居住語言：買房→居住需求、貸款壓力、生活機能、長期承擔；搬家→新環境、適應期、生活成本、人際支援。逆位不要只寫「卡住」，要說在居住決策上卡在哪、為什麼、下一步確認什麼。
第一句仍要直接給選擇傾向（可以考慮／需要再觀察／暫時不建議／風險偏高），再說明要先確認哪些實際條件。
（例外：只有當使用者明確問「房子會不會漲／投報率／買來投資／轉手賺錢」時，才允許投資語境。）`;
}

/** 創業／開店／地點／加盟／展店類 — 依細分場景給專屬回答重點，禁止當成財運/股票/離職/業績 */
function getStartupChoiceHint(question: string): string {
  const scn = getBizLifeScenario(question);
  if (scn === null || scn === "relocation") return "";

  // 各場景：✓ 必談重點 / ✗ 禁止語境（依問題類型嚴格區隔）
  const focusMap: Record<BusinessScenario, string> = {
    business_success:  "客群、產品定位、成本、營運能力、現金流、回本週期。",
    business_location: "商圈、人流、租金、停車、競爭店、目標客群。",
    franchise:         "加盟金、抽成、總部支援、教育訓練、回本速度、合約限制。",
    expansion:         "原店穩定度、店長人選、人力配置、管理制度、現金流、資源分散風險。",
  };
  const forbidMap: Record<BusinessScenario, string> = {
    business_success:  "方向不明、工作卡住、先觀察（空泛帶過）、離職、轉職、履歷、業績達標、進場加碼停損",
    business_location: "工作狀態、職涯規劃、離職、轉職、履歷、業績、進場加碼停損、感情",
    franchise:         "工作卡住、方向不明、離職、轉職、履歷、業績達標、感情、進場加碼停損",
    expansion:         "換工作、離職、履歷、求職、職涯方向、業績達標、進場加碼停損、感情",
  };
  const transMap: Record<BusinessScenario, string> = {
    business_success:  "開店成敗→客群/產品/成本/營運能力/現金流/回本週期",
    business_location: "地點適配→商圈/人流/租金/停車/競爭店/目標客群",
    franchise:         "加盟→加盟金/抽成/總部支援/教育訓練/回本速度/合約限制",
    expansion:         "展店→原店穩定度/店長人選/人力配置/管理制度/現金流/資源分散風險",
  };
  const labelMap: Record<BusinessScenario, string> = {
    business_success:  "開店創業成敗",
    business_location: "店面地點適配",
    franchise:         "加盟",
    expansion:         "展店",
  };

  return `\n【${labelMap[scn]}類問題 — 嚴禁套財運/股票/離職/業績模板（最高優先）】
使用者問的是「${question}」，這是${labelMap[scn]}這類經營決策。
✓ 回答重點只圍繞：${focusMap[scn]}
✗ 整段解讀絕對禁止出現以下語境：${forbidMap[scn]}。
【牌義轉譯】每張牌請依牌位（過去/現在/未來）＋正逆位，把牌義轉成這個經營場景的語言（${transMap[scn]}）。逆位不要只寫「卡住」，要說在經營上卡在哪、為什麼、下一步確認什麼。
第一句要直接給經營傾向（可以考慮／需要再評估／風險偏高／暫時不建議），但只要用到「風險偏高／條件未成熟／再評估／先觀察」，後面一定要接著說清楚：風險在哪、卡在哪個條件、下一步要先確認什麼，不可只丟空泛結論。
結論與每張牌都要至少出現上述「✓ 回答重點」裡的幾個專屬概念，否則視為跑題。`;
}

/**
 * 經營決策題（含地點/商圈/店面）禁用「工作/職涯」語境的最高規則。
 * 只要問題出現 開店/創業/加盟/展店/商圈/店面/地點，且不是真的在問工作，
 * 就禁止出現 履歷/離職/求職/工作型態/職涯方向。
 */
function getBusinessJobWordGuard(question: string): string {
  if (!question) return "";
  const hasBizWord = /開店|創業|加盟|展店|商圈|店面|地點/.test(question);
  if (!hasBizWord) return "";
  // 問題本身真的在問工作去留時，不套此禁令（例：「該繼續上班還是離職開店」）
  const reallyAboutJob = /上班|工作|職場|主管|老闆|同事|升遷|薪水/.test(question) && isCareerChangeQuestion(question);
  if (reallyAboutJob) return "";
  return `\n【經營決策題 — 禁用求職/職涯語境（最高優先）】
使用者這題在問經營決策（開店／創業／加盟／展店／商圈／店面／地點）。整段解讀絕對禁止出現：履歷、離職、求職、找工作、工作型態、職涯方向、轉職、跳槽。
牌義若帶「改變／離開／重新開始」意象，一律轉成經營語言（客群、商圈、人流、成本、現金流、加盟金、原店、人力、管理），不得轉成換工作或職涯規劃。`;
}

/** 外地發展類 — 新環境/生活成本/支援系統/落腳條件，禁止只當離職或投資/感情 */
function getRelocationHint(question: string): string {
  if (!isRelocationQuestion(question)) return "";
  return `\n【外地發展類問題 — 嚴禁只套離職/投資/感情模板（最高優先）】
使用者問的是「${question}」，這是去外地／換城市／異地發展這類人生地點決策，重點不只是「離不離職」。
✗ 絕對禁止只回答成離職／工作卡住，也不可套投資、單純財運或感情模板。
✓ 回答重點圍繞：新環境適應、生活成本、支援系統（人脈／家人／資源）、工作機會與收入來源、落腳條件（住處）、風險承擔、是否準備好了。
【牌義轉譯 — 依牌位×正逆位，套到「離開熟悉環境」這件事】
・聖杯類（如聖杯一/二/十）正位＝你曾對新生活有期待、想過重新開始；逆位＝想離開卻捨不得、還沒放下熟悉生活的安全感。
・聖杯八逆位（多在現在位置）＝想走又捨不得走、知道該變動但安全感還沒準備好、在「想走」與「怕走錯」之間拉扯。
・聖杯四逆位（多在未來位置）＝不是停滯，而是對新生活重新產生興趣、封閉心態開始鬆動、未來會慢慢打開只是要等你真的願意。
其他牌也一樣：逆位不要只寫「卡住／延遲」，要說在「離開熟悉環境」這件事上卡在哪、為什麼、跟你的問題的關係、下一步該確認什麼（住處／收入／支援系統）。
過去位＝你帶著什麼心態走到這裡；現在位＝此刻真正卡住或推動你的是什麼；未來位＝接下來會打開或仍受阻的是什麼。
第一句要直接給傾向（可以考慮／需要再觀察／暫時不建議／風險偏高），再說明住處、收入、支援系統等落腳條件要先確認什麼。`;
}

// ── 禁止空泛結論（最高優先，凌駕一切結論規則）────────────────────────────────
/**
 * 「風險偏高／條件未成熟／先觀察／再評估／不要衝動」這類話可以出現，但不能單獨出現，
 * 必須說清楚：風險在哪、卡在哪個條件、下一步要確認什麼。注入每個 prompt 最前段。
 */
const VAGUE_CONCLUSION_GUARD = `
【⚠️ 禁止空泛結論 — 本次最高優先，凌駕其他結論規則】
以下詞語可以用，但「絕對禁止單獨出現」：「風險偏高」「條件未成熟」「先觀察」「再評估」「再看看」「不要衝動」「目前不明朗」「再評估看看」。
只要用到上述任何一個，後面一定要在同一段把三件事說清楚：
(1) 風險／問題具體在哪裡；(2) 卡點卡在哪一個條件上；(3) 下一步要先確認或補齊什麼。
✗ 違規：「這件事風險偏高，建議再評估。」（沒講風險在哪、卡在哪、要確認什麼）
✗ 違規：「條件還沒成熟，先觀察。」
✓ 正確：「這件事風險偏高，卡在現金流還沒算清楚，下一步先把每月固定支出和回本週期確認過再決定。」`;

// ── 情境結論品質檢查：結論需含問題專屬關鍵字，否則重生 ─────────────────────────
type ScenarioKeywordSpec = { label: string; keywords: string[] };

/**
 * 依問題場景回傳「結論必含的專屬關鍵字」。回傳 null 表示此題不做關鍵字硬檢查。
 * 用於 AI 輸出後的品質檢查：結論完全沒帶到任一關鍵字時，重生一次。
 */
function getScenarioConclusionKeywords(question: string): ScenarioKeywordSpec | null {
  const scn = getBizLifeScenario(question);
  if (scn === "business_success")  return { label: "開店創業成敗", keywords: ["客群", "產品", "成本", "營運", "現金流", "回本"] };
  if (scn === "business_location") return { label: "店面地點適配", keywords: ["商圈", "人流", "租金", "停車", "競爭", "客群"] };
  if (scn === "franchise")         return { label: "加盟", keywords: ["加盟金", "抽成", "總部", "教育訓練", "回本", "合約"] };
  if (scn === "expansion")         return { label: "展店", keywords: ["原店", "店長", "人力", "管理", "現金流", "資源"] };
  if (scn === "relocation")        return { label: "外地發展", keywords: ["住處", "收入", "生活成本", "適應", "支援系統", "落腳"] };
  if (isHousingLifeQuestion(question)) return { label: "居住買房", keywords: ["貸款", "生活機能", "合約", "長期", "租金", "生活成本"] };
  return null;
}

/** 從整份解讀文字擷取「結論區塊」（單張：一句話結論；三張：牌陣總結）做關鍵字檢查 */
function extractConclusionForCheck(reading: string): string {
  const single = reading.match(/🔮 一句話結論\n\n([\s\S]*?)(?:\n\n[🌙🔍✨🐾🌌💫⚠️]|$)/);
  if (single?.[1]) return single[1];
  const three = reading.match(/🌟 牌陣總結\n\n([\s\S]*?)(?:\n\n🃏|$)/);
  if (three?.[1]) return three[1];
  return reading;
}

/** 結論區塊是否帶到至少一個專屬關鍵字 */
function scenarioKeywordsPresent(spec: ScenarioKeywordSpec, reading: string): boolean {
  const concl = extractConclusionForCheck(reading);
  return spec.keywords.some((k) => concl.includes(k));
}

/** 缺關鍵字時的重生指令（注入 antiHint）*/
function getScenarioKeywordRegenHint(spec: ScenarioKeywordSpec): string {
  return `

【重試指令：上一版結論太空泛，沒扣回「${spec.label}」這題的專屬重點，必須重寫】
這題是「${spec.label}」決策，一句話結論與牌陣總結至少要自然出現以下幾個概念：${spec.keywords.join("、")}。
不可只丟「風險偏高／條件未成熟／再評估／先觀察」這類空泛結論，必須說清楚卡在哪個條件、下一步要先確認什麼。`;
}

// ── 敘事模式輪替（每次隨機選一種語氣，避免所有回答長得一樣）──────────────────
const NARRATIVE_MODES: { key: string; desc: string }[] = [
  { key: "觀察型",     desc: "像坐在你對面觀察，點出你自己可能沒留意到的細節與慣性。" },
  { key: "畫面型",     desc: "用一個具體的生活情境／畫面把狀態說清楚（畫面放在第一句之後，不可用畫面開場）。" },
  { key: "朋友聊天型", desc: "像熟朋友跟你講白話，語氣直接、口語、不端架子。" },
  { key: "直球分析型", desc: "條理清楚地拆解：為什麼是這個判斷、哪張牌造成、下一步怎麼辦。" },
  { key: "提問型",     desc: "用一兩個切中要害的反問把你帶到重點（反問放在答案之後，不可用問句開場）。" },
];

function pickNarrativeMode(): { key: string; desc: string } {
  return NARRATIVE_MODES[Math.floor(Math.random() * NARRATIVE_MODES.length)]!;
}

/** 降低模板感的品質規則：敘事模式輪替、去模板、逆位多面向、結論給根據、牌與牌互動敘事 */
function getNarrativeRules(isThree: boolean, mode: { key: string; desc: string }): string {
  const base = `\n【降低 AI 套公式感 — 本次最高品質要求】
★（最高優先：問題語境 × 牌位 × 正逆位，凌駕牌義直譯）
   最終答案絕對不可只是把每張牌的牌義字面相加。每張牌都必須同時揉合三件事：
   (1) 使用者的問題語境（這題實際在問什麼，例如「換城市生活」就要落到熟悉感、安全感、住處、收入、適應）；
   (2) 牌位角色（過去＝你帶著什麼走到這裡／現在＝此刻真正卡住或推動你的是什麼／未來＝接下來會打開或仍受阻的是什麼）；
   (3) 正逆位張力（正位＝順向、已成形；逆位＝內在拉扯、鬆動、過度或還沒放下，而不是單純「卡住」）。
   逆位請說出：在這個問題語境下，它代表什麼樣的拉扯、為什麼卡、卡在哪、跟使用者問題的關係、下一步要確認什麼。
   範例（問題：換城市生活）：聖杯八逆位（現在）＝想離開卻捨不得、還沒放下熟悉生活的安全感；聖杯四逆位（未來）＝對新生活重新產生興趣、封閉心態開始鬆動；聖杯一正位（過去）＝你曾對新生活有期待、想過重新開始。
★（禁止泛用詞，除非說清楚）不可單獨丟「卡住／延遲／阻礙／條件未成熟／先觀察／再看看／目前不明朗」這類空詞；只要用到，後面一定要接著說明「卡在哪裡、為什麼卡、和這個問題有什麼關係、下一步該確認什麼」。
0.（敘事模式輪替）本次請採「${mode.key}」語氣：${mode.desc}
   不要每題都長一樣——這次明顯走「${mode.key}」的味道。但無論哪種模式，第一段（第一句結論）一律是直接回答問題的判斷，禁止用故事、畫面、比喻、反問或心靈雞湯開場；模式只影響「第一句之後」的展開方式。
1.（宇宙偷偷話禁止套模板）questionFocus 必須由「這次抽到的牌 ＋ 使用者問題類型 ＋ 牌面情緒」三者共同生成，不可以是一句換個題目也能用的萬用句。
   嚴格禁止這些固定模板：「有些路不是不能走，而是要先學會不再勉強自己」「答案會在慢下來後更清楚」「先不要急著決定」「宇宙正在提醒你」。
   同一張牌在不同問題下這句要明顯不同：感情題偏情緒與互動、工作／離職題偏選擇與壓力、財運／投資題偏風險與節奏。
2.（逆位不要只會寫卡住）逆位牌不要每張都用「卡住／延遲／阻礙／不順」。請依牌義改用更精準的面向：過度投入、過度控制、不願放手、反覆循環、逃避面對、失衡、執著、補償心理、情緒內耗、能量耗損。
   例：錢幣六逆位不要只寫「互動失衡」，可寫「習慣一直給，卻忘了讓自己也被回饋」。
3.（結論要有根據）第一句直接回答問題後，後面必須說明「為什麼」——是哪張牌帶出阻力、哪張牌保留了空間，讓判斷看得出是從牌面推導出來的，不要只丟一句「有機會」就結束。
4.（每種問題專屬語氣，禁止共用一套）感情→情緒與互動；工作→執行與資源；投資→風險與報酬；買房→財務負擔、生活機能、長期規劃；簽約→條件、談判、流程；考試→準備程度、穩定度、臨場表現；離職→轉職風險、下一步是否成形。
5.（收尾金句不要像勵志語錄）gentleReminder 與 blessing 必須跟這次牌陣內容直接相關，禁止「相信自己／順其自然／宇宙會給你答案／一切都是最好的安排」這類萬用語錄，也不要和 questionFocus 講同一個意思。
   例（買房）：「別被怕買不到推著走，算清楚比搶得快重要。」例（感情）：「與其猜他在想什麼，不如看他願不願意做什麼。」例（業績）：「把最有機會成交的先談完，比追全部名單有效。」`;
  if (!isThree) return base;
  return `${base}
6.（牌陣必須互動，不能各講各的）不要「過去牌講完、現在牌講完、未來牌講完就收工」。請寫成因果鏈：先解釋牌A，再解釋牌B並說明A如何影響B，再解釋牌C並說明B如何推動C。
   反例（禁止）：「寶劍六逆位代表延遲。命運之輪逆位代表不穩定。權杖五代表競爭。」
   正例：「前面一直沒解決的事拖進了現在，命運之輪逆位讓整體節奏失控，所以未來才會冒出權杖五那種競爭與拉扯。」
   overallSummary 的「為什麼會這樣」與每張牌的「對你的問題代表」要彼此呼應，讀起來像同一個故事，而不是三段各說各話。`;
}

const FOCUS_KEYWORDS: Record<Exclude<QuestionFocusPrimary, "general">, string[]> = {
  finance: [
    "財運", "金錢", "收入", "支出", "投資", "股票", "ETF", "基金",
    "薪水", "加薪", "獎金", "副業", "兼職", "理財", "存款", "現金流",
    "貸款", "房貸", "賺錢", "偏財", "財務", "錢", "財",
    "付款", "買進", "賣出", "漲", "跌",
    // 投資理財細項
    "台股", "美股", "大盤", "股市", "0050", "00878", "00940", "00948",
    "波段", "進場", "出場", "停損", "停利", "多頭", "空頭", "籌碼",
    "還會漲", "還會跌", "會漲嗎", "會跌嗎", "繼續漲", "繼續跌",
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

/**
 * 將使用者選擇的分類（topic）映射為 QuestionFocusPrimary。
 * 用於 fallback：當問題關鍵字偵測落到 general 時，改以使用者實際選的分類為準，
 * 避免財運問題的靜態 fallback 跑出愛情/通用文案。
 */
function focusPrimaryFromTopic(topic: TarotReadingTopic): QuestionFocusPrimary {
  switch (topic) {
    case "finance":   return "finance";
    case "career":    return "career";
    case "love":      return "love";
    case "ambiguous": return "love";
    default:          return "general";
  }
}

/** 合併焦點：問題關鍵字偵測為 general 時，退回使用者選擇的分類 */
function mergeFocusWithTopic(focus: QuestionFocus, topic: TarotReadingTopic): QuestionFocus {
  if (focus.primary !== "general") return focus;
  const fromTopic = focusPrimaryFromTopic(topic);
  return fromTopic === "general" ? focus : { primary: fromTopic };
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
  return { love: "愛情", career: "工作", finance: "財運", ambiguous: "曖昧", general: "生活" }[topic];
}

// ── 分類強制鎖定（依「使用者實際選擇的分類」，最高優先，凌駕問題關鍵字偵測）──────
// 修正跑題 bug：使用者選財運但問題無投資關鍵字時，舊的 detectQuestionTopic 會落到
// general，導致沒有財運鎖定也沒有禁止愛情詞。本函式直接用 topic 強制鎖定語境。

/** 財運分類禁用的感情語境詞（同時用於 prompt 禁止與輸出防呆偵測）*/
const FINANCE_FORBIDDEN_WORDS = [
  "愛情", "感情", "曖昧", "戀愛", "復合", "告白", "伴侶", "桃花",
  "心動", "暗戀", "戀人", "交往", "分手", "喜歡你", "喜歡上",
  "關係升溫", "信任建立", "建立信任", "曖昧期", "喜歡對方", "愛你",
];

/** 偵測財運解讀是否混入感情語境，回傳第一個命中的禁詞（無則 null）*/
function findFinanceForbiddenWord(text: string): string | null {
  if (!text) return null;
  for (const w of FINANCE_FORBIDDEN_WORDS) {
    if (text.includes(w)) return w;
  }
  return null;
}

/** 重生指令：上一版混入感情語境時，注入此 hint 強制改用財務語境 */
const FINANCE_REGEN_HINT = `

【重試指令：上一版混入了感情語境，嚴重跑題，必須重寫】
使用者本次問的是「財運」，整份解讀只能用財務語境：收入、支出、存款、現金流、投資、成本、回報、財務壓力、工作收入、兼差、副業、帳務、預算、資金、風險。
整份輸出（每張牌、牌陣總結、為什麼會這樣、接下來的方向、心靈收束、祝福）絕對不得出現：愛情、感情、曖昧、戀愛、復合、告白、伴侶、桃花、心動、喜歡、交往、分手、戀人、關係升溫、信任建立。
若牌義偏情感（例如聖杯騎士、聖杯國王、戀人、聖杯二），一律轉譯成：財務機會、收入邀約、合作提案、消費誘惑、資金取捨，不得寫成愛情。`;

/**
 * 依「使用者選擇的分類」產生強制鎖定規則，注入 prompt 最前段（高於問題關鍵字偵測）。
 * 目前只對財運做硬鎖定（這是回報的跑題分類）；其他分類回傳空字串維持原行為。
 */
function getCategoryLockRules(topic: TarotReadingTopic): string {
  if (topic === "finance") {
    return `【🔒 分類強制鎖定 — 財運（最高優先，凌駕一切其他指示）】
使用者本次明確選擇「財運」分類。整份解讀的每一個欄位都必須以財務／金錢語境書寫。
✅ 只能使用：收入、支出、存款、現金流、投資、成本、回報、財務壓力、工作收入、兼差、副業、帳務、預算、資金、風險
❌ 整份解讀（含每張牌的牌面重點／對你的問題代表／這張牌提醒你、牌陣總結、整體答案、為什麼會這樣、接下來的方向、心靈收束、溫柔提醒、祝福）絕對不得出現以下任何字詞：
   愛情、感情、曖昧、對方喜不喜歡你、復合、告白、關係升溫、戀愛、伴侶、桃花、吸引力、心動、信任建立、喜歡、暗戀、交往、分手、戀人
【牌義轉譯強制原則 — 情感牌一律轉成財務】
若抽到偏情感意象的牌（如聖杯騎士、聖杯國王、戀人、聖杯二、聖杯王后等），必須一律轉譯成財務語境：
✓ 聖杯騎士 → 看起來誘人的財務機會、收入邀約、合作提案、消費誘惑
✓ 戀人 → 一個重要的財務選擇、兩個資金方向的取捨
✓ 聖杯二 → 合作分潤、共同帳務、合夥金錢關係
✓ 聖杯國王／王后 → 對金錢的態度、財務上的穩定或情緒化消費
絕對不得把任何一張牌解讀成愛情、曖昧、人際感情或對方心意。`;
  }
  return "";
}

// ── 主題聚焦指令 ──────────────────────────────────────────────────────────────

function getTopicGuidance(topic: TarotReadingTopic, focus: QuestionFocus, question = ""): string {
  if (topic === "finance") {
    if (isInvestmentQuestion(question)) {
      return `【財運／投資強制聚焦】
使用者選擇的是財運分類，且問題涉及投資或市場。至少 80% 內容必須圍繞：金錢、投資、收入、支出、股票、台股、財務風險與財務決策。
請優先用財務與市場語氣回應，不要轉成工作、感情或生活療癒問題。
safetyNote 欄位必須填入：「以上為塔羅牌面參考，不構成投資建議，實際操作仍請自行評估風險。」`;
    }

    return `【財運強制聚焦】
使用者選擇的是財運分類。至少 80% 內容必須圍繞：金錢、投資、收入、支出、股票、台股、財務風險與財務決策。
第一個回應欄位必須直接說明近期財運或財務決策方向，不可轉成工作、感情或生活療癒問題。`;
  }

  switch (focus.primary) {
    case "finance":
      // ── 投資/股市問題：使用市場導向解讀 ───────────────────────────────────
      if (isInvestmentQuestion(question)) {
        return `【股票/投資/市場走勢 — 最高優先強制規則】
使用者問的是股票/投資/市場問題，請用「市場直觀解讀」。
這不是業績達標題，股市不是使用者靠行動就能直接改變的事情。

【第一句必須給牌面傾向判斷 — 必須使用以下詞彙之一】
正位偏多：「牌面偏漲」「短線有支撐」「動能仍在」「市場情緒偏樂觀」
正位偏觀望：「牌面偏觀望」「漲勢趨緩」「需等量能確認」
逆位偏空：「牌面偏弱」「續漲力道不足」「短線容易震盪」「壓力升高」
逆位風險：「目前不適合追高」「這張牌不支持盲目進場」「不是沒機會，但風險正在升高」

【解讀框架 — 每個欄位都必須套用】
1. oneLineConclusion / overallSummary「整體答案」：
   第一句必須是「牌面偏漲/偏弱/偏觀望」+ 一句具體說明
   ✓「牌面偏弱，短線容易震盪，目前不適合追高。」
   ✓「牌面偏觀望，漲勢趨緩，需等量能放大再確認方向。」
   ✓「牌面偏漲，但動能不強，控制倉位比追高更重要。」
   ✗ 不能說「停下來看清方向」「多觀察」「保持耐心」（這些是空話，不是傾向判斷）

2. questionAnswer / 對你的問題代表：
   先給傾向（偏漲/偏弱/偏觀望），再說這張牌的市場含義，再給操作參考。

3. 操作建議聚焦在：
   ✓ 不追高 / 控制部位 / 分批觀察 / 設停損停利 / 看支撐壓力 / 避免情緒交易
   ✗ 絕對禁止業績邏輯：「主動追單」「聯絡客戶」「提高行動力」「積極開發」「努力衝刺」
   ✗ 不給絕對承諾：「一定會漲」「一定會跌」「可以放心買」「保證獲利」「馬上賣掉」

4. safetyNote 欄位必須填入以下固定文字（字完全一樣，不要改）：
   「以上為塔羅牌面參考，不構成投資建議，實際操作仍請自行評估風險。」

絕對禁止出現以下內容（整個解讀不得出現）：
✗ 放下執著　✗ 核心課題　✗ 內在成長　✗ 靈魂功課　✗ 宇宙安排
✗ 整理自己　✗ 先把心收回來　✗ 你需要好好休息　✗ 身心能量
✗ 你現在的狀態　✗ 內在轉變　✗ 放慢腳步　✗ 努力就會有結果

【聖杯四正位在股票題的解讀示範】
若使用者問「台股還會繼續漲嗎」且抽到聖杯四正位：
正確示範：「這張牌給的答案偏保留。聖杯四正位不像強勢續漲的牌，代表市場熱度轉冷、追價意願下降，短線容易進入觀望或漲不太動的狀態。若問『還會不會一路漲』，這張牌偏向提醒：續漲力道不足，不適合盲目追高。」
錯誤示範：「停下來沉澱，看清方向後再行動」（這是業績邏輯，不是股市邏輯）`;
      }
      // ── 一般財運問題 ───────────────────────────────────────────────────────
      return `【財運強制聚焦】至少 70% 內容圍繞：收入狀態、支出壓力、理財方向、投資機會/風險、現金流、財務瓶頸。
第一個回應欄位必須直接說明近期財運走向，不可用「宇宙照顧你」「你值得被愛」取代財務分析。`;
    case "career":
      // ── 業績/成交/追單問題：禁止轉職內容 ────────────────────────────────────
      if (isBusinessTargetQuestion(question) && !isCareerChangeQuestion(question)) {
        return `【業績/成交/目標達標 — 最高優先強制規則】
使用者問的是「${question}」，這是業績、成交或目標達標問題，不是轉職問題。

【嚴格禁止（整個解讀不得出現以下任何字詞）】
✗ 轉職　✗ 離職　✗ 換工作　✗ 跳槽　✗ 更新履歷　✗ 投履歷　✗ 面試　✗ 裸辭　✗ 換環境　✗ 找工作　✗ 新公司

【牌義轉譯原則】
如果牌義出現「改變、離開、重新開始」意象，必須轉譯成業績情境，例如：
✓ 調整客戶名單　✓ 改變追單方式　✓ 換一批更有機會成交的客戶
✓ 放掉低機率案子　✓ 重新整理報價與成交節奏

【解讀必須包含的核心內容】
1. 目前達標機率傾向（高/中/偏低）
2. 卡點在哪裡（客戶猶豫/競爭激烈/追單節奏失焦/內耗）
3. 哪些機會還能追回來
4. 未來 3～7 天具體追單行動
5. 結論要回到「業績是否有機會達標」

【可用語氣】
✓「有機會，但過程不輕鬆。」
✓「照目前節奏，達標會偏吃力。」
✓「不是完全沒機會，但不能靠等客戶主動。」
✓「這組牌顯示業績有追回空間，但需要靠小單累積與精準追單。」
✓「如果繼續分心或內耗，達標機率會下降。」

【不可使用】
✗「你該思考是否換工作。」
✗「可以開始更新履歷。」
✗「適合尋找新環境。」

至少 80% 內容圍繞：業績達標、成交機率、客戶跟進、報價策略、具體追單行動。`;
      }
      if (isYesNoQuestion(question)) {
        return `【工作達標/成功/成交題 — 最高優先】
使用者問的是「會不會達標 / 成功 / 成交 / 有沒有結果」這類是非題。

強制格式：
1. oneLineConclusion 第一句必須給出明確傾向判斷，例如：
   ✓「照目前狀態，業績達標機率偏低。」
   ✓「這張牌給的答案偏保留：照現在這種被動等的節奏，達標機率不高。」
   ✓「不是完全沒機會，但照目前節奏繼續，會很吃力。」
   ✗ 不能說「停下來看清方向比繼續衝更重要」（這是迴避問題）
   ✗ 不能說「這段時間適合沉澱」（這不是回答「會不會達標」）

2. questionAnswer 必須：
   - 先說這張牌對問題的判斷（達標機率高/中/偏低/低），直接說清楚
   - 再說明為什麼（根據牌義：主動/被動、有方向/失焦、機會已有/尚未出現）
   - 最後說：如果要改變這個結果，使用者需要做什麼

3. 對於「被動/倦怠/錯失機會型」的牌（例如聖杯四、倒掛人、力量逆位等）在達標題出現時：
   - 必須說明「照目前狀態機率偏低」
   - 補充「問題不是沒機會，而是使用者對已出現的機會反應太慢」
   - 行動建議要聚焦「整理既有名單/機會，主動跟進」而非「廣撒網衝刺」

4. todayAction / actionSteps 的重點：
   - 先整理出 3～5 個最接近成交/達標的機會，優先追進
   - 不是叫使用者盲目衝，而是「把已有的機會接住」
   - 避免說「更努力衝業績」這種無方向建議

5. gentleReminder 要點：
   - 不要說「休息一下很重要」（這會和判斷「需主動追」打架）
   - 應說：你嘴上想達標，但行動上有點失焦——找回那幾個有機會的案子比廣撒網有效

6. 至少 70% 內容圍繞：業績達標、成交機率、客戶跟進、具體追單行動。`;
      }
      return `【工作強制聚焦】至少 70% 內容圍繞：工作發展機會、職場環境、離職/轉職/升遷判斷、與主管同事互動、具體行動建議。
情緒療癒不超過 30%，不要大量討論感情。`;
    case "love":
      if (isYesNoQuestion(question)) {
        return `【感情是非題 — 必須先給明確傾向】
使用者問的是「對方會不會回/主動/有沒有機會復合/會不會在一起」這類是非題。
oneLineConclusion 第一句必須給出明確傾向，例如：
✓「照目前狀況，對方主動回來的機率偏低。」
✓「這張牌給的答案偏保留：對方目前沒有要主動靠近的跡象。」
✓「有機會，但不能靠等的，需要你先給一個明確訊號。」
不能只說「先沉澱」「觀察」「宇宙在安排」而不給判斷。
至少 70% 內容圍繞：對方態度、關係走向、復合機率/曖昧進展、溝通問題、是否值得繼續投入。`;
      }
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
        finance:   "請偏向金錢、投資、收入、支出、股票、台股、財務風險與財務決策。",
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
 */
function deduplicateSentences(text: string): string {
  if (!text) return text;
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

// ── 新增：取第一句話，最多 maxChars 字 ───────────────────────────────────────

function firstSentence(text: string, maxChars: number): string {
  if (!text) return text;
  const m = text.match(/^[\s\S]*?[。！？]/);
  const s = (m ? m[0] : text).trim();
  if (s.length <= maxChars) return s;
  // 在 maxChars 以內找最後一個標點截斷
  const sub = s.slice(0, maxChars);
  const lastPunct = Math.max(
    sub.lastIndexOf("。"), sub.lastIndexOf("！"), sub.lastIndexOf("？"),
    sub.lastIndexOf("，"), sub.lastIndexOf("、")
  );
  return lastPunct > maxChars / 2 ? sub.slice(0, lastPunct + 1) : sub + "…";
}

// ── 新增：以「欄位名稱」為邊界提取段落內容（容許行內混合格式）──────────────────

function extractSectionByPosition(text: string, sectionName: string, stopNames: string[]): string {
  const markerRe = new RegExp(`${sectionName}[：:]\\s*`);
  const markerM  = text.match(markerRe);
  if (!markerM || markerM.index == null) return "";
  const start = markerM.index + markerM[0].length;
  let end = text.length;
  for (const stop of stopNames) {
    const stopM = text.slice(start).match(new RegExp(`${stop}[：:]`));
    if (stopM?.index != null) end = Math.min(end, start + stopM.index);
  }
  return text.slice(start, end).trim();
}

// ── 新增：清理牌面重點文字（硬性規則）────────────────────────────────────────

/**
 * cleanCardPointText：
 * 1. 移除欄位標題前綴
 * 2. 移除「牌名（正位/逆位）」行
 * 3. 移除「關鍵字：」行
 * 4. 切斷在「對你的問題代表」或「這張牌提醒你」之前
 * 5. 只保留第一句，最多 60 字
 */
function cleanCardPointText(rawText: string): string {
  if (!rawText) return rawText;
  let t = rawText
    .replace(/^(牌面重點|這張牌代表|關鍵字)[：:]\s*/g, "")
    .replace(/[^\n]*（(?:正位|逆位)）[^\n]*/g, "")
    .replace(/^關鍵字[：:][^\n]*/gm, "")
    .trim();
  // 切斷在下一個欄位邊界
  for (const b of ["對你的問題代表", "這張牌提醒你", "這張牌代表："]) {
    const idx = t.indexOf(b);
    if (idx !== -1) t = t.slice(0, idx).trim();
  }
  return firstSentence(t, 60);
}

// ── 新增：清理「對你的問題代表」文字（硬性規則）──────────────────────────────

/**
 * cleanQuestionAnswerText：
 * 1. 移除欄位標題前綴
 * 2. 切斷在「這張牌提醒你」之前（防止提醒文混入）
 * 3. 移除「建議你」「可以先」「接下來」等行動建議前綴（移到第一個行動詞之前）
 */
function cleanQuestionAnswerText(rawText: string): string {
  if (!rawText) return rawText;
  let t = rawText.replace(/^(對你的問題代表|牌面重點)[：:]\s*/g, "").trim();
  // 切斷在「這張牌提醒你」之前
  const reminderIdx = t.indexOf("這張牌提醒你");
  if (reminderIdx !== -1) t = t.slice(0, reminderIdx).trim();
  // 切斷在「牌面重點：」之前（防止 core 混入）
  const coreIdx = t.indexOf("牌面重點：");
  if (coreIdx !== -1) t = t.slice(0, coreIdx).trim();
  return t.trim();
}

/**
 * 清理三張牌 card message 的各段落：
 * 1. 使用位置偵測提取各段（容許行內混合格式，不需強制換行分隔）
 * 2. 對「牌面重點」套用 cleanCardPointText（≤60字、無牌名/正逆位/關鍵字）
 * 3. 對「對你的問題代表」套用 cleanQuestionAnswerText（切斷在提醒文之前）
 * 4. 跨欄位去重：避免 question 與 core 重複，reminder 與前兩者重複
 */
function cleanCardMessageSections(msg: string): string {
  if (!msg) return msg;

  // ── 位置偵測提取（比 regex lookbehind 更能處理行內混合格式）────────────────
  const coreRaw     = extractSectionByPosition(msg, "牌面重點",     ["對你的問題代表", "這張牌提醒你"]);
  const questionRaw = extractSectionByPosition(msg, "對你的問題代表", ["這張牌提醒你"]);
  const reminderRaw = extractSectionByPosition(msg, "這張牌提醒你",  []);

  // 若三段都是空的，嘗試舊版 regex（向下相容）
  if (!coreRaw && !questionRaw && !reminderRaw) {
    const coreM     = msg.match(/牌面重點[：:]\s*\n?([\s\S]*?)(?=\n\n?對你的問題代表[：:]|$)/);
    const questionM = msg.match(/對你的問題代表[：:]\s*\n?([\s\S]*?)(?=\n\n?這張牌提醒你[：:]|$)/);
    const reminderM = msg.match(/這張牌提醒你[：:]\s*\n?([\s\S]*)$/);
    if (!coreM?.[1] && !questionM?.[1] && !reminderM?.[1]) return msg;
  }

  // ── 硬性清理 ────────────────────────────────────────────────────────────────
  let core     = cleanCardPointText(coreRaw);
  let question = cleanQuestionAnswerText(questionRaw);
  let reminder = reminderRaw.trim();

  // ── 跨欄位去重 ──────────────────────────────────────────────────────────────
  const extractSentenceSet = (text: string): Set<string> =>
    new Set(text.split(/[。！？\n]/).map(s => s.replace(/\s/g, "")).filter(Boolean));

  if (core && question) {
    const coreKeys = extractSentenceSet(core);
    question = question
      .split(/(?<=[。！？])/)
      .filter(s => !coreKeys.has(s.replace(/\s/g, "")))
      .join("")
      .trim();
  }

  if (reminder && (core || question)) {
    const prevKeys = extractSentenceSet(core + "。" + question);
    reminder = reminder
      .split(/(?<=[。！？])/)
      .filter(s => !prevKeys.has(s.replace(/\s/g, "")))
      .join("")
      .trim();
  }

  // ── 重新組合（保留標題作為前端 parser 用的 marker）──────────────────────────
  const parts: string[] = [];
  if (core)     parts.push(`牌面重點：\n${core}`);
  if (question) parts.push(`對你的問題代表：\n${question}`);
  if (reminder) parts.push(`這張牌提醒你：\n${reminder}`);
  if (!parts.length) return msg;

  return parts.join("\n\n");
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
 * 修復 AI 偶發產生的非標準 JSON（不改動合法 JSON，只在 JSON.parse 失敗時當作備援）。
 * 處理兩類最常見問題：
 *  (1) 字串內含未轉義的換行/Tab（造成 "Bad control character"）→ 用狀態機只在字串內轉義。
 *  (2) 陣列元素或物件成員之間漏逗號（造成 "Expected ',' or ']'"）→ 結構層補逗號。
 */
function repairJsonString(input: string): string {
  // ── Pass 1：只在「字串字面值內」轉義裸控制字元 ────────────────────────────────
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (esc) { out += ch; esc = false; continue; }
    if (ch === "\\") { out += ch; esc = true; continue; }
    if (ch === '"') { inStr = !inStr; out += ch; continue; }
    if (inStr) {
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
    }
    out += ch;
  }
  // ── Pass 2：結構層補逗號 / 去尾逗號（字串內換行已轉義，下列只會命中結構空白）──
  out = out
    .replace(/,(\s*[}\]])/g, "$1")       // 去除多餘尾逗號：,] 或 ,}
    .replace(/}(\s*)\{/g, "},$1{")        // 物件陣列元素之間漏逗號：}{ → },{
    .replace(/](\s*)\{/g, "],$1{")        // 陣列後緊接物件漏逗號（罕見）
    .replace(/"(\s*\n\s*)"/g, '",$1"')    // 兩個字串/成員之間（跨行）漏逗號
    .replace(/}(\s*\n\s*)"/g, '},$1"')    // 物件值後接下一個 key 漏逗號
    .replace(/](\s*\n\s*)"/g, '],$1"');   // 陣列值後接下一個 key 漏逗號
  return out;
}

/**
 * 安全解析：先用原始字串 JSON.parse；失敗時才套用 repairJsonString 再試一次。
 * 合法 JSON 永遠走第一條路徑、不被修改；只有壞掉的才嘗試修復。
 */
function safeJsonParse(json: string): unknown | null {
  try {
    return JSON.parse(json);
  } catch {
    try {
      const repaired = repairJsonString(json);
      const result = JSON.parse(repaired);
      console.warn("[tarot-reading] JSON 解析失敗，已用 repairJsonString 修復成功");
      return result;
    } catch (err) {
      console.error("[tarot-reading] JSON 修復後仍解析失敗：", err instanceof Error ? err.message : err);
      return null;
    }
  }
}

/**
 * forcedCategory：用使用者選擇的分類（愛情/工作/生活）覆蓋 AI 輸出的 category，
 * 防止 AI 返回「生活綜合」等錯誤分類。
 */
function parseSingleCardJson(raw: string, forcedCategory?: string): SingleCardReading | null {
  try {
    const json   = extractJsonString(raw);
    if (!json) return null;
    const parsed = safeJsonParse(json) as Partial<SingleCardReading> | null;
    if (!parsed || typeof parsed !== "object") return null;
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
    const p = safeJsonParse(json) as Record<string, unknown> | null;
    if (!p || typeof p !== "object") {
      console.warn("[tarot-reading] parseThreeCardJson: JSON 解析失敗（含修復），raw snippet:", raw.slice(0, 200));
      return null;
    }

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
        // 對每張牌的 message 套用清理+去重：移除冗餘標題行、跨欄位去重
        message: cleanCardMessageSections(deduplicateSentences(
          typeof entry.message === "string" ? entry.message : "這張牌的訊息正在凝聚中，請稍後再細細感受。"
        )),
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
      actionSteps = ["Day 1～2｜先把現在最想問的那件事寫下來，看清楚問題在哪裡", "Day 3～4｜選一件你能控制的小事，先動起來再說", "Day 5～7｜觀察這幾天的實際變化，再決定下一步要怎麼走"];
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
  if (r.safetyNote) {
    const isInvestDisclaimer = r.safetyNote.includes("不構成投資建議");
    parts.push(`⚠️ ${isInvestDisclaimer ? "投資聲明" : "健康提醒"}\n\n${r.safetyNote}`);
  }
  return parts.join("\n\n");
}

// ── 單張牌四區塊去重（一句話／宇宙偷偷話／解讀總結／心靈收束）────────────────────
// 只服務單張牌結果文字組裝，不影響三張牌解析。

function normForSim(s: string): string {
  return (s || "").replace(/[\s，。、！？：；「」『』（）()…—\-~～·]/g, "");
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const g of a) if (b.has(g)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** 2-gram Jaccard：抓「逐字或近乎逐字」的重複（完全相同回 1）*/
function bigramSimilarity(a: string, b: string): number {
  const sa = normForSim(a);
  const sb = normForSim(b);
  if (!sa || !sb) return 0;
  if (sa === sb) return 1;
  const grams = (s: string): Set<string> => {
    const set = new Set<string>();
    if (s.length === 1) { set.add(s); return set; }
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  return jaccard(grams(sa), grams(sb));
}

/** 字元集合 Jaccard：抓「換句話說但重用同一批字詞」的改寫重複 */
function unigramSimilarity(a: string, b: string): number {
  const sa = normForSim(a);
  const sb = normForSim(b);
  if (!sa || !sb) return 0;
  return jaccard(new Set(sa), new Set(sb));
}

const SINGLE_DUP_THRESHOLD = 0.7;

/** 兩段文字是否「完全相同或 70% 以上相似」（逐字 bigram 或重用字詞 unigram 任一過線即算）*/
function fieldsTooSimilar(a: string, b: string): boolean {
  if (!a || !b) return false;
  return (
    bigramSimilarity(a, b) >= SINGLE_DUP_THRESHOLD ||
    unigramSimilarity(a, b) >= SINGLE_DUP_THRESHOLD
  );
}

/**
 * 單張牌四區塊去重改寫：
 * 一句話(oneLineConclusion)／宇宙偷偷話(questionFocus)／解讀總結(questionAnswer)／心靈收束(gentleReminder)
 * 若兩塊完全相同或相似度 ≥ 0.7，改寫「後者」成獨立的情緒安撫／焦點答案／溫柔提醒文字。
 * 這是最後一道保證（AI prompt 已先要求不重複），確保使用者看不到重複內容。
 */
function dedupeSingleCardFields(
  r: SingleCardReading,
  card: TarotReadingCard,
  focus: QuestionFocus,
  question: string
): SingleCardReading {
  const isUpright = card.position === "upright";
  const flavor = getQuestionFlavor(question, focus);
  const concl = r.oneLineConclusion ?? "";

  // 宇宙偷偷話 不得與 一句話 重複 → 改寫成純情緒安撫
  if (r.questionFocus && fieldsTooSimilar(concl, r.questionFocus)) {
    r.questionFocus = getFlavorQuestionFocus(flavor, isUpright);
  }

  // 解讀總結 不得與 一句話 重複 → 改寫成焦點導向的具體答案
  if (r.questionAnswer && fieldsTooSimilar(concl, r.questionAnswer)) {
    r.questionAnswer = getFallbackFocusMessage(focus, isUpright);
  }

  // 心靈收束 不得與 解讀總結 或 一句話 重複 → 改寫成溫柔提醒
  if (r.gentleReminder) {
    const dupQA = !!r.questionAnswer && fieldsTooSimilar(r.questionAnswer, r.gentleReminder);
    const dupConcl = fieldsTooSimilar(concl, r.gentleReminder);
    if (dupQA || dupConcl) r.gentleReminder = getFlavorGentleReminder(flavor);
  }

  // 宇宙偷偷話 與 心靈收束 也不得重複（兩者都偏提醒語氣，最易撞）
  if (r.questionFocus && r.gentleReminder && fieldsTooSimilar(r.questionFocus, r.gentleReminder)) {
    r.gentleReminder = getFlavorGentleReminder(flavor);
  }

  return r;
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

  if (r.safetyNote) {
    const isInvestDisclaimer = r.safetyNote.includes("不構成投資建議");
    parts.push(`⚠️ ${isInvestDisclaimer ? "投資聲明" : "健康提醒"}\n\n${r.safetyNote}`);
  }

  return parts.join("\n\n");
}

// ═════════════════════════════════════════════════════════════════════════════
// Fallback 靜態文字輔助函式（AI 不可用時使用）
// ═════════════════════════════════════════════════════════════════════════════

/**
 * 外地發展／開店創業／加盟／展店 四種場景的第一句結論（依強弱四檔）。
 * 各場景回答重點互不重疊，禁止套用離職/業績/投資/財運模板。
 */
function getBizLifeConclusion(
  scenario: BizLifeScenario,
  tier: "strong" | "weak" | "posMild" | "negMild"
): string {
  const T: Record<BizLifeScenario, Record<"strong" | "weak" | "posMild" | "negMild", string>> = {
    relocation: {
      strong:  "可以考慮換個城市生活，你心裡其實已經準備好離開熟悉的環境，住處、收入來源和生活成本都接得上，支援系統也在，適應期會比想像中順。",
      weak:    "現在還不適合急著換城市，卡的不是外地沒機會，而是落腳條件還沒到位——住處、收入來源和生活成本都還沒安排好，支援系統也不足，適應期會很吃力。",
      posMild: "換城市可以考慮，但真正要先確認的是落腳條件：住處、收入來源、生活成本，以及那邊有沒有支援系統，還有自己撐不撐得過適應期。",
      negMild: "換城市的機會還在，但你還在「想走」和「捨不得」之間拉扯，落腳條件也還沒到位——先把住處、收入來源、生活成本和支援系統算清楚，也給自己一段適應期。",
    },
    business_success: {
      strong:  "開店成功的機會不錯，客群和產品定位都對得上，把成本和現金流控好，回本週期也算得出來，就能穩穩做起來。",
      weak:    "這間店短期不太樂觀，客群和營運能力還沒到位，成本和現金流壓力下貿然開風險偏高——卡在客群不夠明確，先把回本週期和現金流確認過再決定。",
      posMild: "開店不是沒機會，但能不能做起來要看客群、成本和營運撐不撐得住。先把目標客群、產品定位、每月成本和現金流回本週期算清楚再開。",
      negMild: "想法有吸引力，但客群、成本和現金流目前還沒站穩——卡在營運能力還沒準備好，先把目標客群和回本週期確認清楚再說。",
    },
    business_location: {
      strong:  "這個地點挺適合的，商圈人流和目標客群都對得上，租金在可負擔範圍，停車和周邊競爭店也不算吃虧，可以進一步談。",
      weak:    "這個地點目前不太適合，商圈人流或目標客群對不上，租金和競爭店壓力偏高——卡在人流和客群不匹配，先把商圈條件和租金確認過再決定。",
      posMild: "這個地點可以考慮，但要先確認商圈人流、租金負擔、停車和周邊競爭店。人流對不對得上你的目標客群，是這個點能不能做的關鍵。",
      negMild: "這個地點還有機會，但商圈人流、租金和競爭店條件還沒看清楚——卡在人流跟目標客群的匹配度，先把商圈和租金算清楚再說。",
    },
    franchise: {
      strong:  "這個加盟其實條件不錯，總部支援和教育訓練都到位，把抽成、合約限制和加盟金的回本速度算清楚就能談。",
      weak:    "這個加盟短期不太建議，合約限制、加盟金的回本速度或總部支援還沒看清楚，貿然簽約風險偏高——卡在合約和回本條件不明，先把總部支援和抽成問清楚再決定。",
      posMild: "加盟可以考慮，但別只看品牌名氣，重點是加盟金、抽成、合約限制和總部支援、教育訓練到不到位，以及加盟金的回本速度划不划算。",
      negMild: "加盟還有機會，但合約限制、抽成、回本速度和總部支援都還沒釐清——卡在這套模式適不適合你，先把加盟金和教育訓練問清楚再決定。",
    },
    expansion: {
      strong:  "展店時機算成熟，原店穩、店長人選和現金流也撐得住，把人力配置和管理制度排好就可以推進第二家。",
      weak:    "展店時機還沒到，原店穩定度、人力或現金流還沒站穩，現在擴點容易稀釋資源、反過來拉扯原本的店——卡在店長人選和管理制度還沒到位。",
      posMild: "展店時機還沒完全成熟，但可以開始準備，關鍵是原店穩定度、店長人選、人力配置、管理制度和現金流要先穩住，否則開第二家會稀釋原本的資源。",
      negMild: "展店的方向可以，但原店的穩定度和現金流還不夠——卡在店長人選和管理制度沒補上，先把人力配置補起來，再談開第二家。",
    },
  };
  return T[scenario][tier];
}

/** 四場景的「為什麼會這樣／接下來的方向」段落（避免掉回工作/離職模板）*/
function getBizLifeWhyDirection(scenario: BizLifeScenario): { why: string; direction: string } {
  const M: Record<BizLifeScenario, { why: string; direction: string }> = {
    relocation: {
      why: "這組牌不是在說外地沒有機會，而是提醒你，目前真正卡住的是落腳條件還不夠穩。過去累積的能力可以帶著走，但現在的焦慮和消耗感，容易讓你把換個地方想成一次解決所有問題。",
      direction: "先確認外地住處、收入來源怎麼接上、生活成本能不能承擔，還有那邊有沒有可以依靠的支援系統，給自己一段適應期，再決定是否行動，不要只靠一股想離開現況的衝動。",
    },
    business_success: {
      why: "這組牌不是說這個生意做不起來，而是提醒你，能不能撐成長期生意，要看客群、產品定位和成本控管夠不夠扎實。想法的吸引力和實際的營運能力是兩回事。",
      direction: "先把目標客群、產品定位、開店成本、每月現金流和回本週期算到具體數字，再決定開業時機與規模，別只憑一股熱情就開下去。",
    },
    business_location: {
      why: "這組牌提醒你，這個地點能不能做，不在你有多喜歡它，而在商圈人流、租金負擔和周邊競爭店配不配得上你的目標客群。地點選錯，再好的產品也難回本。",
      direction: "先在不同時段實地觀察商圈人流、確認租金和停車條件、盤點周邊競爭店，再判斷這個商圈的人流跟你的目標客群合不合，別急著簽租約。",
    },
    franchise: {
      why: "這組牌提醒你，加盟的成敗不在品牌名氣，而在加盟金、抽成、合約限制和回本速度。總部支援和教育訓練到不到位、這套標準化模式適不適合你的經營方式，比招牌更關鍵。",
      direction: "先把加盟金、抽成、合約限制、回本速度、總部支援和教育訓練一條條問清楚，再評估這套模式適不適合自己，別急著被名氣推著簽約。",
    },
    expansion: {
      why: "這組牌比較像在提醒你，問題不是不能擴張，而是原店的營運、店長人選、人力和現金流還需要再穩一點。若現在硬開第二家，管理壓力會放大，資源被分散，反而拖累原本的店。",
      direction: "先檢查原店能不能不靠你一直盯著也穩定運作、有沒有可獨當一面的店長人選，再評估人力配置、管理制度和現金流。展店不是不能做，但要等制度比熱情更穩。",
    },
  };
  return M[scenario];
}

/** 四場景的 3～7 天行動建議（取代會掉回履歷/離職的工作版）*/
function getBizLifeActionSteps(scenario: BizLifeScenario): string {
  const M: Record<BizLifeScenario, string> = {
    relocation: [
      "Day 1～2｜盤點落腳條件\n把外地的住處、預估生活成本和收入要怎麼接上，具體列出來，看哪一塊還沒著落。",
      "Day 3～4｜確認支援系統\n看看外地有沒有可以依靠的人脈或資源，以及離開熟悉環境後，情緒和生活有沒有支撐。",
      "Day 5～7｜先小規模試水溫\n有機會先短期過去走一趟、或遠端接觸當地機會，用實際體驗代替想像，再決定要不要長期搬。",
    ].join("\n\n"),
    business_success: [
      "Day 1～2｜定客群與產品\n寫清楚目標客群是誰、主力產品是什麼，以及他們為什麼會選你而不是別家。",
      "Day 3～4｜算成本與回本\n把開店成本、每月固定支出和現金流算出來，估一個大概的回本週期。",
      "Day 5～7｜小規模驗證\n先用擺攤、預購或快閃測客群的真實反應，再決定正式開店的規模與時機。",
    ].join("\n\n"),
    business_location: [
      "Day 1～2｜實地看人流\n在不同時段到這個商圈走幾趟，記錄人流量和客層，看跟你的目標客群合不合。",
      "Day 3～4｜算租金與競爭\n確認租金、押金和停車條件，盤點周邊有幾家競爭店、生意如何。",
      "Day 5～7｜綜合評估\n把人流、租金、競爭店和客群匹配度放在一起評估，再決定要不要簽這個店面。",
    ].join("\n\n"),
    franchise: [
      "Day 1～2｜看懂合約\n把加盟合約的限制、加盟金、權利金和合約年限一條條看懂，別漏掉退場條款。",
      "Day 3～4｜查總部與回本\n了解總部的實際支援、商圈保護，並打聽同品牌其他加盟主大概多久回本。",
      "Day 5～7｜評估適配度\n誠實評估這套標準化模式適不適合你的個性與經營節奏，再決定簽不簽。",
    ].join("\n\n"),
    expansion: [
      "Day 1～2｜檢查原店\n確認原本的店在你不盯著時能不能穩定運作，把最依賴你的環節列出來。",
      "Day 3～4｜算人力與現金流\n評估第二個點需要的人手、租金和啟動資金，確認現金流撐不撐得起兩邊。",
      "Day 5～7｜選點與建制度\n看新地點的人流與條件，同時把可複製的營運制度整理好，制度穩了再展店。",
    ].join("\n\n"),
  };
  return M[scenario];
}

/**
 * 依「回答類型」產生直接回答問題的第一句結論（fallback 與摘要共用）。
 * 對應四類問題的明確結論語氣，避免迴避式開頭（「這件事有解」「先不要急著做決定」）。
 * 回傳空字串代表 answerType=none，呼叫端沿用原本焦點導向的結論。
 */
function getDirectConclusionSentence(
  answerType: AnswerType,
  focus: QuestionFocus,
  question: string,
  hasReversed: boolean,
  signal: SpreadSignal = "neutral"
): string {
  const q = question || "";
  const f = focus.primary;
  const isExam = isExamQuestion(q);
  const isInvest = isInvestmentQuestion(q);
  // 感情語境（用於 focus 落在 general 但問句明顯是感情時，仍走感情語氣）
  const loveCtx = /復合|結婚|交往|分手|告白|曖昧|追求|挽回|聯絡他|聯絡她|主動聯絡|脫單|喜歡|對方|前任/.test(q);

  // ── 限制類問題：第一句即明確表態不給絕對答案 ─────────────────────────────────
  if (isRestrictedQuestion(q)) return RESTRICTED_REFRAME;

  // ── 健康／身心：直接評估身心狀態，不只說「累／休息」（最高優先於答案類型）──────
  if (f === "health") {
    if (/壓力/.test(q)) {
      return hasReversed
        ? "這組牌顯示你的壓力偏高，而且比較像長期累積，不是單一事件造成的，身體已經在反映了。"
        : "這組牌顯示你的壓力目前還在可承受範圍，但已經開始累積，要留意別讓它變成慢性負荷。";
    }
    if (/睡眠|失眠|睡不|作息/.test(q)) {
      return hasReversed
        ? "這組牌顯示睡眠改善偏慢，作息還不夠穩定，得先把睡前節奏和上床時間固定下來。"
        : "這組牌顯示睡眠有機會慢慢改善，但前提是先把作息和睡前習慣調回規律。";
    }
    return hasReversed
      ? "這組牌顯示你最近身體負荷偏高，疲勞累積得比你以為的明顯，尤其要注意睡眠品質與壓力釋放。"
      : "這組牌顯示你的狀態有回穩跡象，但恢復速度還偏慢，作息與情緒負荷是接下來的關鍵。";
  }

  // ── 選擇型：偏向適合 / 可以考慮 / 暫時不建議 / 風險偏高 ──────────────────────
  if (answerType === "choice") {
    // 外地發展／開店創業／加盟／展店 — 各自獨立語境，嚴禁套離職/業績/投資/財運模板，最先判斷
    const bizScn = getBizLifeScenario(q);
    if (bizScn) return getBizLifeConclusion(bizScn, hasReversed ? "negMild" : "posMild");
    // 生活／居住決策（買房/租屋/搬家）— 嚴禁投資語氣，先於投資判斷
    if (isHousingLifeQuestion(q)) {
      if (/租/.test(q)) {
        return hasReversed
          ? "這間房子目前偏向再觀察，先把租金負擔、生活機能和合約細節確認清楚，別急著簽。"
          : "這間房子可以考慮租下來，但先把租金負擔、生活機能與合約細節看清楚再決定。";
      }
      if (/搬家|搬到|搬去|遷居|搬遷/.test(q)) {
        return hasReversed
          ? "搬家目前偏向再觀察，別只看當下喜歡，新環境的生活成本和適應問題要先想清楚。"
          : "搬家可以考慮，但別太倉促，新環境的生活成本、通勤和適應狀況先評估過再決定。";
      }
      return hasReversed
        ? "這間房子可以再考慮，但目前不建議急著決定，貸款壓力、生活成本與後續維護條件都還要算清楚。"
        : "這間房子可以考慮，但現在不必急著下決定，先把財務負擔、交通生活機能與合約細節確認清楚再出手。";
    }
    if (isInvest || /買股|買這檔|這檔|加碼|要不要買進/.test(q)) {
      return hasReversed
        ? "這筆投資風險偏高，偏向暫時不建議衝動進場，先觀望等訊號明確再說。"
        : "這筆投資可以考慮，但別急著重壓，先控制部位、分批進場比較穩。";
    }
    if (/合作|合夥/.test(q)) {
      return hasReversed
        ? "這個合作偏向再觀察，條件還沒談清楚前先別急著答應。"
        : "這個合作可以談，但條件要寫清楚，不適合只靠信任就投入。";
    }
    if (f === "career" || /離職|換工作|換跑道|跳槽/.test(q)) {
      return hasReversed
        ? "這組牌偏向暫時不建議現在離職，新方向還沒穩定成形，貿然轉換容易讓壓力變大。"
        : "這組牌顯示換跑道可以考慮，但不適合立刻衝動執行，先確認收入、職缺與下一步規劃再動。";
    }
    if (f === "love" || loveCtx) {
      return hasReversed
        ? "這組牌偏向需要再觀察，現在還不是主動的好時機，先看對方有沒有穩定的回應再決定。"
        : "這組牌顯示可以考慮，但先別急著主動，再觀察一陣子對方的態度會更穩。";
    }
    if (f === "finance") {
      return hasReversed
        ? "這組牌偏向暫時不建議現在投入，目前風險偏高、資源準備還不夠。"
        : "這組牌顯示這個想法不是不行，但現階段先別急著全押，準備足夠再行動。";
    }
    return hasReversed
      ? "這組牌偏向暫時不建議現在行動，條件還沒成熟，先再觀察一下。"
      : "這組牌顯示這件事可以考慮，但不適合立刻衝動執行，先把準備補齊再動。";
  }

  // ── 分析型：直接分析對方態度 / 核心原因，不給有機會、沒機會 ─────────────────
  if (answerType === "analysis") {
    if (f === "relationship" || /朋友|同事|合夥|合作|討厭|針對|利用|信任/.test(q)) {
      return hasReversed
        ? "這組牌顯示對方不是完全對你有意見，但目前對你有些防備，誤會需要有人先講開。"
        : "這組牌顯示對方對你大致是正面的，只是有些小誤會還沒說清楚。";
    }
    if (f === "love" || loveCtx || /喜歡|愛|在意|他|她/.test(q)) {
      if (/認真|真心/.test(q)) {
        return hasReversed
          ? "這組牌顯示對方的認真度還有保留，目前比較像在觀望，沒有把態度說明白。"
          : "這組牌顯示對方有一定的真心，但還在觀察階段，還沒完全把心定下來。";
      }
      if (/放下|忘記/.test(q)) {
        return hasReversed
          ? "這組牌顯示對方其實還沒完全放下，只是選擇壓著、不表現出來。"
          : "這組牌顯示對方還有在意，沒有真的放下，只是行動上比較收。";
      }
      if (/逃避|躲/.test(q)) {
        return "這組牌顯示對方比較像在逃避面對，不是沒感覺，而是還沒準備好把話說開。";
      }
      return hasReversed
        ? "這組牌顯示對方對你有過好感，但目前行動力不足，喜歡的感覺還不夠穩定。"
        : "這組牌顯示對方對你有好感，只是還沒到穩定投入的程度。";
    }
    if (f === "career" || /主管|老闆|客戶|同事|面試官/.test(q)) {
      return hasReversed
        ? "這組牌顯示對方其實有看到你的能力，但對穩定度仍在觀察，所以態度偏保留。"
        : "這組牌顯示對方對你的評價是保留偏正面，有肯定，但也還在觀察。";
    }
    return "這組牌顯示目前的卡點不在表面，而在一個還沒被正視的核心原因。";
  }

  // ── 時間型：時間區間，不給精確日期（依場景換語境）──────────────────────────
  if (answerType === "timing") {
    if (f === "love" || loveCtx || /脫單|桃花|對象|曖昧|聯絡|復合/.test(q)) {
      return hasReversed
        ? "短期內桃花跡象還不明顯，比較有機會落在未來一到三個月，先把生活過得有光，互動機會自然會多。"
        : "近期已經開始有一些互動的苗頭，未來一到三個月較有機會遇到對的人，保持開放、別急著定義。";
    }
    if (f === "career" || /工作|職缺|錄取|offer|轉職/.test(q)) {
      return hasReversed
        ? "短期內機會還不明朗，較可能落在未來一到三個月，這段時間先把履歷和方向準備好。"
        : "近期開始有一些苗頭，未來一到三個月較有機會有明確的工作消息，先備好條件再等時機。";
    }
    return hasReversed
      ? "這件事短期內跡象還不明顯，較有機會落在未來一到三個月後，先把眼前能做的做好。"
      : "這件事短期內已開始有起色，未來一到三個月較有機會看到明確進展。";
  }

  // ── 結果型：依「問題場景 × 牌面強弱」客製第一句，禁止跨場景套句 ─────────────────
  if (answerType === "result") {
    // 外地發展／開店創業／加盟／展店 — 各自獨立場景，最先判斷（依強弱四檔）
    const bizScn = getBizLifeScenario(q);
    if (bizScn) {
      const tier = signal === "strong" ? "strong" : signal === "weak" ? "weak" : (hasReversed ? "negMild" : "posMild");
      return getBizLifeConclusion(bizScn, tier);
    }
    // 場景判斷（順序：面試 > 考試 > 投資 > 簽約 > 業績 > 感情 > 其他）
    const isInterview = /面試/.test(q) || (/錄取|會不會上|有沒有上|上不上得了/.test(q) && !isExam);
    const isDeal      = /簽約|這張單|這筆案子|案子會成|客戶會不會|客戶最後|下單|訂單|成交|談成|報價會過|會不會接這/.test(q);
    const isTarget    = /業績|達標|年度目標|月目標|這個月業績|下半年業績|本季業績|銷售目標|KPI/.test(q);
    const cat =
      isInterview ? "interview" :
      isExam ? "exam" :
      (isInvest || /投資|股票|這檔|賺錢|破財|拿得回來|要得回來|討得回來/.test(q)) ? "invest" :
      isDeal ? "deal" :
      isTarget ? "target" :
      (f === "love" || /復合|在一起|結婚/.test(q)) ? "love" :
      (f === "career" || f === "finance") ? "target" :
      "general";

    const TEXT: Record<string, { strong: string; weak: string; posMild: string; negMild: string }> = {
      target: {
        strong:  "這個月業績很有機會補上來，牌面站在你這邊，把最後幾筆名單推進就能把數字做出來。",
        weak:    "照目前的跟進節奏，業績達標難度偏高，差距得靠更精準的客戶推進，別再平均灑力氣。",
        posMild: "業績有機會補上來，但關鍵在最後幾筆名單能不能推進，先挑成交率高的集中跟。",
        negMild: "數字摸得到邊，但差距不小，得先把最有機會成交的那幾筆顧好，才追得回來。",
      },
      deal: {
        strong:  "這張單很有機會簽下來，牌面偏向順利，把條件和時程確認好就能推到拍板。",
        weak:    "這張單短期內不太看好，客戶顧慮和條件還沒解開，硬催反而容易把對方推遠。",
        posMild: "簽約有機會，但下一步要把報價、時程和對方真正擔心的點講清楚，單才推得動。",
        negMild: "這張單還沒死，但目前卡在條件確認和客戶顧慮沒完全解開，先別急著逼對方拍板。",
      },
      interview: {
        strong:  "這次錄取機會偏高，牌面對你有利，把自己的優勢講清楚，臨門一腳問題不大。",
        weak:    "這次錄取難度偏高，競爭和職缺條件還沒站在你這邊，最後評估前得把差距補起來。",
        posMild: "錄取有機會，但還不是穩上，關鍵在主管最後怎麼比人選，把優勢講清楚會加分。",
        negMild: "不是沒機會，只是職缺條件和對方的評估還沒定下來，主管心裡那把尺還在比。",
      },
      exam: {
        strong:  "這次考試過關機會偏高，牌面穩，維持節奏別大意，分數站得住。",
        weak:    "這次過關難度偏高，弱項若不補，光靠臨場運氣很容易差幾分。",
        posMild: "這次考試有機會過關，但準備穩定度還要再補強，弱項先補起來比較保險。",
        negMild: "分數摸得到門檻，但不太穩，粗心和臨場狀態是變數，不能靠運氣硬撐。",
      },
      invest: {
        strong:  "這筆牌面偏多、有獲利空間，但仍建議分批、控好資金，別追在最高點。",
        weak:    "這筆短期風險偏高，目前不太看好，不適合重壓，先觀望避開波動。",
        posMild: "獲利不是沒可能，但短期波動不小，控管資金、別重壓比追高更重要。",
        negMild: "牌面偏弱、短期風險偏高，進出節奏一亂就容易把利潤吐回去，先保守。",
      },
      love: {
        strong:  "復合機會其實不小，關係溫度還在，對方也有靠近的意願，把舊問題談開就有機會。",
        weak:    "短期內復合不太樂觀，對方主動性偏弱，舊問題沒解開前很難直接回到穩定。",
        posMild: "復合不是完全沒機會，但短期內對方主動性偏弱，需要有人先把話說開。",
        negMild: "這段感情還沒完全斷，只是目前缺少真正把話說開的契機，進展會偏慢。",
      },
      general: {
        strong:  "這件事很有機會，牌面趨勢明顯站在你這邊，順著現在的動能去做就對了。",
        weak:    "這件事目前不太看好、難度偏高，得先把最大的那個卡點處理掉再說。",
        posMild: "這件事有機會，但要先把最關鍵的一步做到位，不能只等它自己成。",
        negMild: "目前難度偏高，機會還在，但得先補上那個一直沒解決的關鍵缺口。",
      },
    };
    const t = TEXT[cat]!;
    if (signal === "strong") return t.strong;
    if (signal === "weak")   return t.weak;
    return hasReversed ? t.negMild : t.posMild;
  }

  // ── 外地發展／開店／加盟／展店：即使 answerType 落在 none，也給場景化結論 ──────────
  const bizScnFallback = getBizLifeScenario(q);
  if (bizScnFallback) return getBizLifeConclusion(bizScnFallback, hasReversed ? "negMild" : "posMild");
  // ── 居住搬遷：即使 answerType 落在 none，也給場景化結論（不回成投資）──────────────
  if (isHousingLifeQuestion(q)) {
    return hasReversed
      ? "這個居住變動目前偏向再觀察，時機還不夠成熟，生活成本、環境適應和變動風險要先算清楚。"
      : "這個居住變動可以考慮，但別太倉促，先確認時機、環境適不適合，以及財務與適應期撐不撐得住。";
  }

  return "";
}

function getFallbackConclusion(focus: QuestionFocus, question = "", cards?: TarotReadingCard[]): string {
  // 先依問題回答類型給直接結論，避免迴避式開頭；牌面強弱影響結論力度
  const answerType  = detectAnswerType(question);
  const signal      = cards?.length ? getSpreadSignal(cards) : "neutral";
  const hasReversed = cards?.some((c) => c.position === "reversed") ?? false;
  const direct = getDirectConclusionSentence(answerType, focus, question, hasReversed, signal);
  if (direct) return direct;

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

function getFallbackNext3To7Days(focus: QuestionFocus, question = ""): string {
  // 外地發展／開店／加盟／展店：用場景行動，避免掉回履歷/離職的工作版
  const bizScn = getBizLifeScenario(question);
  if (bizScn) return getBizLifeActionSteps(bizScn);
  switch (focus.primary) {
    case "finance":
      if (isInvestmentQuestion(question)) {
        return [
          "Day 1～2｜確認停損點\n把目前持有部位的停損設好，或確認你能承受的最大損失範圍，這比預測漲跌更重要。",
          "Day 3～4｜控制倉位\n檢視目前持倉比例，若單一標的超過總資金三到四成，考慮分批減碼到安全比例。",
          "Day 5～7｜等量能訊號\n不要在這幾天倉促加碼或全出，先觀察成交量和大盤方向，等訊號更清楚再決定下一步。",
        ].join("\n\n");
      }
      return [
        "Day 1～2｜釐清收支\n把近期收支記下來，找出最大的支出項目，看清楚錢去哪裡。",
        "Day 3～4｜尋找機會\n留意有沒有可跟進的收入機會，或之前拖著沒做的財務決定（申請、詢價、整理資產）。",
        "Day 5～7｜執行一件事\n選一件具體的財務行動：刪除一個訂閱、增加一筆小收入、或研究一個感興趣的理財方法。",
      ].join("\n\n");
    case "career":
      if (isBusinessTargetQuestion(question) && !isCareerChangeQuestion(question)) {
        return [
          "Day 1～2｜整理名單\n把目前最有機會成交的客戶列出來，每個都確認一下目前卡在哪個環節，優先排程跟進。",
          "Day 3～4｜精準追單\n針對已報價但還沒回覆的客戶，發一封具體詢問信或簡訊，不要等對方主動，先接住這幾個還在考慮的案子。",
          "Day 5～7｜累積小單\n若大案短期難拿下，先把小額但確定性高的單接起來，用累積方式補齊業績缺口。",
        ].join("\n\n");
      }
      return [
        "Day 1～2｜確認方向\n用 10 分鐘寫下「我真正想要的工作狀態是什麼」，要寫真正讓你有動力的，不是「應該」想要的。",
        "Day 3～4｜盤點落差\n找出你現在工作最大的落差在哪。落差很大就考慮評估下一步；只是卡關就找人聊一次。",
        "Day 5～7｜推進一步\n選一個小行動：傳一封信、約一次對話、或把觀望已久的事做一個決定，不要等到「準備好了」才動。",
      ].join("\n\n");
    case "love":
      return [
        "Day 1～2｜先觀察\n留意對方這幾天有沒有自然靠近的小動作（一條訊息、一個問候），這些比大表態更能反映真實態度。",
        "Day 3～4｜整理感受\n在心裡或紙上整理清楚「我最在意的是什麼、我最需要對方給我的是什麼」。",
        "Day 5～7｜說出口\n選一個輕鬆的時機說出你想說的話，說真實的就好，比繼續猜測更能讓這段關係往前走。",
      ].join("\n\n");
    case "relationship":
      return [
        "Day 1～2｜先冷靜\n把感受寫下來但先不要傳出去，讓情緒沉澱一下，不要在高漲時做決定。",
        "Day 3～4｜輕輕開口\n找平靜的時機讓對方知道「你有感受到這件事」就夠了，不需要一次解決全部。",
        "Day 5～7｜確認需求\n問自己「我在這段關係裡有沒有好好照顧到自己的需求」，這個答案很重要。",
      ].join("\n\n");
    case "health":
      return [
        "Day 1～2｜補睡眠\n這兩天把睡眠補回來，或找出一個持續消耗精力的習慣，先暫停或減少。",
        "Day 3～4｜找出規律\n記錄什麼時候最疲累或焦慮，是特定時間、情境還是特定的人？知道來源才能調整。",
        "Day 5～7｜充電\n安排一件純粹讓自己放鬆的事，不為任何目的，只是因為你喜歡或覺得輕鬆。",
      ].join("\n\n");
    default:
      return [
        "Day 1～2｜寫下來\n把這幾天反覆在想的事用文字寫下來，從腦子裡移到紙上，思路會清晰很多。",
        "Day 3～4｜分類行動\n把那件事分成「我能控制的」和「我不能控制的」兩欄，把注意力放在能控制的那欄。",
        "Day 5～7｜完成一件\n選一件拖著沒做但不難的事，今天就完成它，完成一件事會帶動其他事情也開始動起來。",
      ].join("\n\n");
  }
}

// ── 句庫去重：依「問題風味」選不同的宇宙偷偷話／提醒／祝福，避免同焦點問題撞句 ──────
// 這只是「選不同的人話文字」的內部工具，不改動任何分類/路由/signal 邏輯。
type QuestionFlavor =
  | "love_feel" | "love_reunite" | "love_action" | "love_single"
  | "biz_target" | "biz_deal" | "invest" | "housing" | "startup" | "relocation" | "exam"
  | "career_change" | "career_general" | "finance_general"
  | "relationship" | "health" | "general";

/** 依問題內容挑一個「文字風味」鍵（重用既有偵測，不新增分類系統）*/
function getQuestionFlavor(question: string, focus: QuestionFocus): QuestionFlavor {
  const q = question || "";
  const at = detectAnswerType(q);
  if (isBusinessStartupQuestion(q)) return "startup";
  if (isRelocationQuestion(q)) return "relocation";
  if (isHousingLifeQuestion(q)) return "housing";
  if (isExamQuestion(q) || /面試|錄取|口試|複試/.test(q)) return "exam";
  // 健康早於投資：避免「壓力（身心）」撞到投資關鍵字「壓力（壓力區）」而誤選文案
  if (focus.primary === "health" || /壓力|睡眠|失眠|疲勞|身心|作息|焦慮|健康/.test(q)) return "health";
  if (isInvestmentQuestion(q) || /投資|股票|這檔|報酬|賺/.test(q)) return "invest";
  if (isCareerChangeQuestion(q) || /離職|轉職|換工作|跳槽/.test(q)) return "career_change";
  if (isBusinessTargetQuestion(q)) {
    return /簽約|客戶|成交|下單|訂單|報價|談成/.test(q) ? "biz_deal" : "biz_target";
  }
  const loveCtx = /復合|結婚|交往|分手|告白|曖昧|追求|挽回|聯絡|脫單|喜歡|對方|前任|心意|在一起|喜不喜歡|愛不愛/.test(q);
  if (focus.primary === "love" || loveCtx) {
    if (at === "timing" || /脫單|什麼時候|何時/.test(q)) return "love_single";
    if (at === "choice") return "love_action";
    if (at === "result" || /復合|在一起|結婚|會不會/.test(q)) return "love_reunite";
    return "love_feel";
  }
  if (focus.primary === "career") return "career_general";
  if (focus.primary === "finance") return "finance_general";
  if (focus.primary === "relationship") return "relationship";
  return "general"; // health 已於前面（壓力/睡眠/身心）提早處理
}

/** 宇宙偷偷話（單張 fallback 用）：依風味 × 牌面情緒（正/逆）給不同人話 */
function getFlavorQuestionFocus(flavor: QuestionFlavor, isUpright: boolean): string {
  const M: Record<QuestionFlavor, [string, string]> = {
    // [正位偏向, 逆位偏向]
    love_feel:     ["對方其實有在意你，只是還沒打算把態度說得很明白。", "你一直在讀對方的反應，但越解讀，反而越看不清他真正的心。"],
    love_reunite:  ["你心裡其實還留著位置，只是不確定對方走的是不是同一個方向。", "你想要的不是回到過去，而是這次能不能真的不一樣。"],
    love_action:   ["你想主動，又怕主動之後換來的是更明顯的冷淡。", "你不是不敢開口，而是還在等一個讓自己不那麼狼狽的時機。"],
    love_single:   ["你嘴上說隨緣，心裡其實已經在偷偷期待了。", "你不是遇不到人，而是還在從上一段裡慢慢走出來。"],
    biz_target:    ["你知道數字還差一段，只是不確定該衝量還是顧好手上這幾個。", "你有點累了，業績的壓力讓你開始懷疑是不是方法出了問題。"],
    biz_deal:      ["這筆你很想成，但又怕太主動會把對方推遠。", "對方遲遲不點頭，你心裡其實已經在猜是不是哪個條件卡住了。"],
    invest:        ["你想知道能不能進，但其實更怕的是買了就套。", "你已經有點被情緒帶著走，越想凹回來，越容易做錯決定。"],
    housing:       ["你對這個地方有感覺，只是那筆長期的負擔讓你不敢太快點頭。", "你怕的不是買貴，而是買了之後生活被綁得太緊。"],
    startup:       ["你對這個開店的點子有熱情，只是還不確定市場和客群撐不撐得起來。", "你想衝，但心裡也清楚資金和商圈這關還沒真的算過。"],
    relocation:    ["你嚮往換個城市重來，只是還沒確定那邊的生活和收入接不接得住。", "你想離開現在的環境，但心裡也清楚，落腳的條件還沒真的安排好。"],
    exam:          ["你準備了，但心裡那個『會不會還是不夠』的聲音一直在。", "你不是沒讀，而是讀得有點散，抓不到重點讓你更焦慮。"],
    career_change: ["你想走，只是還沒確定外面那條路是不是真的比較好。", "你受夠的不一定是工作本身，而是那種一直耗著的感覺。"],
    career_general:["你其實知道自己要什麼，只是不確定現在是不是動的時機。", "你比你以為的更清楚問題在哪，只是還不想正面承認那個答案。"],
    finance_general:["你已經很努力了，真正需要的是把錢的流向看清楚。", "財務上的焦慮，多半來自一個你一直繞開、沒去面對的選擇。"],
    relationship:  ["你已經感覺到有些話該說了，只是不確定對方願不願意聽。", "你一直在衡量值不值得開口，那個遲疑本身就是答案。"],
    health:        ["你嘴上說還撐得住，身體其實已經在跟你抗議了。", "你不是不知道要休息，而是一直把自己排在所有事情的最後。"],
    general:       ["你已經想得夠久了，現在需要的是一個方向，不是更多思考。", "有件事你一直繞著走，先把它說清楚，其他才會跟著清楚。"],
  };
  const [up, down] = M[flavor];
  return isUpright ? up : down;
}

/** 收尾金句（gentleReminder）依風味給不同人話，避免撞句 */
function getFlavorGentleReminder(flavor: QuestionFlavor): string {
  const M: Record<QuestionFlavor, string> = {
    love_feel:     "與其一直猜他的心意，不如看他願不願意為你做一點具體的事——行動比表情誠實。",
    love_reunite:  "要不要再續，不急著今天決定。先看對方是回到關係，還是只是回到習慣。",
    love_action:   "主動沒有錯，但把姿態放輕一點：先丟一個輕鬆的話題，比一上來就攤牌更容易有回應。",
    love_single:   "緣分快不來，但你可以先把生活過得有光，對的人通常是在你發亮的時候靠近的。",
    biz_target:    "別再廣撒網了。把最有機會成交的那幾個先顧好，比追一堆不確定的名單實在。",
    biz_deal:      "對方沒簽，多半是還有一個顧慮沒被解決。與其催，不如直接問他最在意的是哪一點。",
    invest:        "先把能承受的最大虧損想清楚，再決定要不要進。紀律會替你擋掉大部分的衝動。",
    housing:       "別被『現在不買就沒了』的急迫感推著走。把每月實際負擔算到底，安心比划算更重要。",
    startup:       "開店別只看裝潢和熱情，先把客群、商圈和能撐多久的資金算清楚，活下來比開起來更難。",
    relocation:    "換城市別只看當下的嚮往，先把住處、收入來源和能依靠的支援系統安排好，落得了腳才走得久。",
    exam:          "與其再讀新的，不如把錯過的、不熟的補起來——穩住基本盤比衝難題更能保分。",
    career_change: "離開或留下都可以，但先確認你是走向想要的，而不是只想逃離現在的。",
    career_general:"先看清楚手上能掌握的資源，再決定往哪走。方向比速度重要。",
    finance_general:"先讓錢的流向變清楚，比急著賺更多有用。從一件小事開始整理就好。",
    relationship:  "關係裡的誤會很少自己消失。用一句真實的話先開口，比一直憋著更能找到出路。",
    health:        "先找出最消耗你的那一件事，減少一點是一點，比一次改變全部更撐得住。",
    general:       "今晚先把最吵的念頭放下，從一件你能控制的小事開始，其他會慢慢清楚。",
  };
  return M[flavor];
}

/** 祝福句（blessing）依風味給不同人話，避免財運/工作/感情/投資撞同一句 */
function getFlavorBlessing(flavor: QuestionFlavor): string {
  const M: Record<QuestionFlavor, string> = {
    love_feel:     "願你喜歡的人，不只讓你心動，也願意讓你安心。",
    love_reunite:  "願這段關係無論走向哪裡，都讓你越來越清楚自己要的是什麼。",
    love_action:   "願你願意主動的那份心意，遇到一個值得、也接得住的人。",
    love_single:   "願對的人出現時，你剛好也準備好把心打開。",
    biz_target:    "願你的每一分力氣，都換成看得見的成績。",
    biz_deal:      "願你談的每一筆，都在對的條件下順利落地。",
    invest:        "願你進退都有紀律，賺的時候不貪，虧的時候不慌。",
    housing:       "願你選的那個家，住起來安心，也撐得起往後的日子。",
    startup:       "願你的店不只開得成，也經營得久，撐得過最辛苦的前幾個月。",
    relocation:    "願你去到的那個城市，不只讓你嚮往，也接得住你的生活與往後的日子。",
    exam:          "願你讀過的每一頁，都在關鍵的那一刻幫上你。",
    career_change: "願你的去留，都是想清楚之後的選擇，而不是逃。",
    career_general:"願你的能力被看見，也願你走到更適合自己的位置。",
    finance_general:"願你的收入與支出，慢慢走向安穩與自由。",
    relationship:  "願你在複雜的關係裡，也記得自己值得被好好對待。",
    health:        "願你把照顧自己排進每一天，哪怕只是一件很小的事。",
    general:       "願你在不確定裡，也能一步一步走回自己的節奏。",
  };
  return M[flavor];
}

function getFallbackGentleReminder(focus: QuestionFocus, question = ""): string {
  // 投資題保留風險紀律版；其餘走風味句庫去重
  if (focus.primary === "finance" && isInvestmentQuestion(question)) {
    return `市場走勢沒有人能精準預測，塔羅給的是這個時間點的牌面傾向，不是保證。這段時間最重要的事：控制部位，不讓單一判斷影響整體資金。情緒進出是最常見的虧損來源，先把能承受的最大虧損想清楚，讓紀律替你做決定。`;
  }
  return getFlavorGentleReminder(getQuestionFlavor(question, focus));
}

function getFallbackBlessing(focus: QuestionFocus, question = ""): string {
  return getFlavorBlessing(getQuestionFlavor(question, focus));
}

const INVESTMENT_DISCLAIMER = "以上為塔羅牌面參考，不構成投資建議，實際操作仍請自行評估風險。";

function getSafetyNote(focus: QuestionFocus, question = ""): string {
  if (focus.primary === "health") return "如果症狀持續、惡化，或已經影響生活，建議尋求皮膚科或專業醫療協助。";
  if (focus.primary === "finance" && isInvestmentQuestion(question)) return INVESTMENT_DISCLAIMER;
  return "";
}

/** @deprecated 請改用 getSafetyNote(focus, question) */
function getHealthSafetyNote(focus: QuestionFocus, question = ""): string {
  return getSafetyNote(focus, question);
}

// ═════════════════════════════════════════════════════════════════════════════
// 靜態 Fallback（AI 不可用時）
// ═════════════════════════════════════════════════════════════════════════════

function buildSingleCardFallback(
  card: TarotReadingCard,
  _topic: TarotReadingTopic,
  question: string
): string {
  // 問題關鍵字偵測為 general 時退回使用者選擇的分類，避免財運問題跑出愛情/通用 fallback
  // 外地發展/開店/加盟/展店：強制 focus=general，避免焦點文案掉回工作/離職模板。
  const focus      = getBizLifeScenario(question)
    ? ({ primary: "general" } as QuestionFocus)
    : mergeFocusWithTopic(detectQuestionFocus(question), _topic);
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
  // 宇宙偷偷話：依「問題風味 × 牌面情緒」挑不同人話，避免同焦點問題撞同一句
  const questionFocusText = question
    ? getFlavorQuestionFocus(getQuestionFlavor(question, focus), isUpright)
    : "你把問題放在心裡，這張牌接住了你此刻最需要被看見的部分。";

  // cardMessage：只說牌義，不提問題
  const cardMessage = deduplicateSentences(
    `${card.name}（${ori}）${kw ? `，關鍵字「${kw}」。` : "。"}${coreMeaning}`
  );

  // questionAnswer：把牌義連回使用者問題，給具體方向
  const questionAnswer = getFallbackFocusMessage(focus, isUpright);

  // 四區塊去重：保證一句話／宇宙偷偷話／解讀總結／心靈收束 不重複
  const reading: SingleCardReading = {
    spreadType:        "single",
    category:          focusLabel,
    cardName:          card.name,
    orientation:       ori,
    questionFocus:     questionFocusText,
    cardMessage,
    questionAnswer,
    oneLineConclusion: getFallbackConclusion(focus, question, [card]),
    todayAction:       getFallbackTodayAction(focus),
    gentleReminder:    getFallbackGentleReminder(focus, question),
    blessing:          getFallbackBlessing(focus, question),
    safetyNote:        getSafetyNote(focus, question),
  };
  return formatSingleCardReading(dedupeSingleCardFields(reading, card, focus, question));
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
  focus: QuestionFocus,
  question = ""
): string {
  const up = card.position === "upright";
  const f  = focus.primary;

  // ── 投資/股市問題：優先走市場導向提醒 ──────────────────────────────────────
  if (f === "finance" && isInvestmentQuestion(question)) {
    const investReminders: Array<[string, string]> = [
      [
        `${card.name}正位在過去位置，說明這段時間市場有過一波上漲動能。提醒你：這個漲勢的基礎是否還在，是判斷接下來能否續漲的關鍵，先確認基本面有沒有變化。`,
        `${card.name}逆位在過去，代表市場之前出現過明顯壓力或修正。提醒你：如果你在高點進場，先確認停損位置，不要讓帳面損失擴大才行動。`,
      ],
      [
        `${card.name}正位在目前，市場情緒偏穩，有支撐。提醒你：可以維持現有持倉，但先不要追高加碼，設好停利點，讓獲利有機會跑出來。`,
        `${card.name}逆位在目前，市場有不確定性，資金偏向觀望。提醒你：這個時間點先不要倉促進場，等待成交量回升、方向確認後再決定操作方向。`,
      ],
      [
        `${card.name}正位在未來，接下來有繼續走升的可能。提醒你：可以小幅布局，但控制倉位在總資金的三到五成，留一部分現金應對短線波動。`,
        `${card.name}逆位在未來，接下來仍有修正壓力。提醒你：先以守為主，不要在下跌趨勢中逢低攤平，等趨勢轉向再考慮重新進場。`,
      ],
    ];
    const [u, r] = investReminders[posIndex] ?? investReminders[1]!;
    return up ? u : r;
  }

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

  // ── 投資/股市問題：市場導向 Q&A ─────────────────────────────────────────────
  if (f === "finance" && isInvestmentQuestion(question)) {
    const byPos = [
      up
        ? `${qPrefix}${card.name}正位在過去位置，代表這段行情過去有過明確的上漲動能或正向資金流入。這說明市場的基礎不是憑空而來，有一定支撐在。`
        : `${qPrefix}${card.name}逆位在過去，代表市場之前已有過壓力期或修正訊號。過去的走勢讓目前的反彈動能受限，回升需要更多時間確認。`,
      up
        ? `${qPrefix}目前市場情緒偏穩，${card.name}正位說明這個時間點有支撐、不容易急跌。但「有支撐」不等於一定繼續漲，需要等量能放大才能確認突破。`
        : `${qPrefix}目前${card.name}逆位出現，代表市場情緒猶豫或有下跌壓力，資金在觀望。這個時間點進場風險偏高，先等方向確認。`,
      up
        ? `${qPrefix}接下來${card.name}正位指出市場有機會繼續走升，短線仍有向上動能。可以考慮保留或小幅布局，但要設好停損，避免波段高點被套。`
        : `${qPrefix}接下來${card.name}逆位指出仍有修正壓力，操作上不建議追漲或加碼。等到逆勢訊號消失、量能回穩後再評估是否重新進場。`,
    ];
    return byPos[posIndex] ?? byPos[1]!;
  }

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
        const newReminder = getCardReminderByIndex(raw, i, focus, question);
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
  // 問題關鍵字偵測為 general 時退回使用者選擇的分類，避免財運問題跑出愛情/通用 fallback
  // 外地發展/開店/加盟/展店：強制 focus=general，避免 per-card 等焦點文案掉回工作/離職模板。
  const focus      = getBizLifeScenario(question)
    ? ({ primary: "general" } as QuestionFocus)
    : mergeFocusWithTopic(detectQuestionFocus(question), _topic);
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

    // 取第一句核心意義（控制在 60 字以內）
    const firstSentence = (() => {
      const full = deduplicateSentences(coreLines.join("　") || (isUpright
        ? `${card.name}正位代表目前有方向可以往前走，只是需要先確認好步驟。`
        : `${card.name}逆位代表這個面向遇到阻礙，先看清楚卡在哪裡再決定怎麼做。`));
      // 取第一個句子，控制在 60 字
      const m = full.match(/^[^。！？]+[。！？]/);
      const s = m ? m[0] : full.slice(0, 60);
      return s.length > 60 ? s.slice(0, 57) + "…" : s;
    })();
    const coreMeaning = firstSentence;

    // 三小段格式：牌面重點 / 對你的問題代表 / 這張牌提醒你
    // 「對你的問題代表」與「這張牌提醒你」都依位置 × topic × 正逆位動態產生
    const questionAnswerText = getCardQuestionAnswerByIndex(card, i, focus, question);
    const reminderText       = getCardReminderByIndex(card, i, focus, question);
    // 牌面重點只留一句，不含牌名/正逆位/關鍵字/前綴（前台已有標題顯示這些資訊）
    const msg = [
      `牌面重點：`,
      coreMeaning,
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
      shortSummary: coreMeaning.slice(0, 50),
    };
  });

  const cardNamesStr = cards.map((c) => c.name).join("、");

  // combinedReading：依焦點給出有深度的三牌整合
  const combinedReading = getFallbackCombinedReading(focus, cardNamesStr, cards);

  const actionStepsText = getFallbackNext3To7Days(focus, question);
  const actionSteps = actionStepsText.split("\n").map((s) => s.trim()).filter(Boolean);

  return formatThreeCardReading({
    spreadType:      "three",
    category:        focusLabel,
    questionFocus:   question ? `你的問題是「${question}」，以下是這三張牌從三個面向給你的完整解讀。` : "你把問題放在心裡，這三張牌從不同面向回應了此刻的狀況。",
    overallSummary:  getFallbackOverallSummary(focus, cardNamesStr, cards, question),
    cards:           cardEntries as [ThreeCardEntry, ThreeCardEntry, ThreeCardEntry],
    combinedReading,
    actionSteps,
    next3To7Days:    actionStepsText,
    gentleReminder:  getFallbackGentleReminder(focus, question),
    blessing:        getFallbackBlessing(focus, question),
    safetyNote:      getHealthSafetyNote(focus),
  });
}

/** Fallback 牌陣總結（overallSummary），兩段格式：整體答案 + 為什麼會這樣 */
/** Fallback 牌陣總結（overallSummary），三段結構：整體答案 + 為什麼會這樣（含三牌關係）+ 接下來的方向 */
function getFallbackOverallSummary(focus: QuestionFocus, cardNamesStr: string, cards?: TarotReadingCard[], question = ""): string {
  const c1 = cards?.[0];
  const c2 = cards?.[1];
  const c3 = cards?.[2];
  const n1 = c1 ? `${c1.name}（${c1.position === "upright" ? "正位" : "逆位"}）` : "第一張牌";
  const n2 = c2 ? `${c2.name}（${c2.position === "upright" ? "正位" : "逆位"}）` : "第二張牌";
  const n3 = c3 ? `${c3.name}（${c3.position === "upright" ? "正位" : "逆位"}）` : "第三張牌";
  const hasRevCard = cards?.some(c => c.position === "reversed") ?? false;

  const base = ((): string => {
  switch (focus.primary) {
    case "finance":
      // 投資/股市問題：市場導向解讀
      if (isInvestmentQuestion(question)) {
        return hasRevCard
          ? `整體答案：\n這組牌顯示市場目前情緒不穩，短線有修正壓力。建議暫時觀望，先不要追高或加碼，等量能回穩、趨勢方向確認後再行動。\n\n為什麼會這樣：\n${n1} 顯示過去市場的推動力道，${n2} 出現逆位，指出目前有阻力或資金在觀望。${n3} 給出接下來的方向提示，整體看來這段時間波動偏大。\n\n接下來的方向：\n先設好停損位置，不要滿倉操作；等待成交量回升再考慮進場。如果已持倉，可以先減碼到較安全的比例，保留現金等待機會。`
          : `整體答案：\n這組牌顯示市場情緒偏正向，短線仍有支撐。但不建議全倉追進，先確認手上持倉的停損點，保留部分現金應對波動。\n\n為什麼會這樣：\n${n1} 顯示市場過去的上漲動能，${n2} 提示目前是中繼整理或觀察期。${n3} 正位出現，指出接下來有繼續往上的可能，但需要搭配量能確認。\n\n接下來的方向：\n可以維持現有持倉，但先不要追高加碼。設好停損點（約 5～8%），觀察大盤量能是否放大，有支撐再決定是否續抱或擴倉。`;
      }
      return `整體答案：\n近期財務有可以調整的空間，但你還沒把「錢去哪裡了、哪裡可以減少、哪裡可以增加」看清楚。在這件事確認之前，不適合做大的財務決定，先從整理收支開始。\n\n為什麼會這樣：\n${n1} 反映你目前財務背景，${n2} 指出讓你卡住的阻力（舊的支出習慣或一直迴避的決定）。${n3} 告訴你接下來財務可以往哪個方向走，財務空間一直被佔住，是因為有些東西還沒處理乾淨。\n\n接下來的方向：\n先把近期收支記錄下來，找出最大的支出漏洞，從縮減那裡開始。有投資或大額支出計畫的，等現金流穩定後再決定。`;
    case "career":
      return `整體答案：\n工作上卡住了，主要是方向還沒確認清楚。在方向說清楚之前，不管是留下來硬撐還是衝動離職，都容易讓你陷入更亂的處境。先把想要的工作狀態具體說清楚，再決定下一步。\n\n為什麼會這樣：\n${n1} 說明你目前承受的工作背景，${n2} 點出你在職涯上真正卡住的核心。${n3} 給你接下來比較適合走的方向提示，問題在於你一直在用舊有的方式應對一個已經需要重新選擇的處境。\n\n接下來的方向：\n先把真正想要的工作型態用具體文字寫下來，確認方向後，再決定要整理履歷、爭取機會、或先建立備案——動作要有順序，不能同時衝所有事。`;
    case "love":
      return `整體答案：\n這段感情還有可能，但目前讓你焦慮的，是你不確定對方是否真的在往你的方向靠近。先不要急著做最終決定，先觀察對方有沒有實際行動。\n\n為什麼會這樣：\n${n1} 反映這段感情的過去基礎，${n2} 指出雙方目前的阻礙（期待落差或距離感）。${n3} 告訴你接下來感情可以往哪個方向走，有些話沒說清楚讓雙方都在等，等待在慢慢把距離拉大。\n\n接下來的方向：\n觀察對方這幾天有沒有自然靠近的行動——小事上的主動比大表態更能反映真實態度。如果對方有穩定行動，可以慢慢給一次機會；如果仍然讓你猜、讓你等，那個本身就是答案。`;
    case "relationship":
      return `整體答案：\n這段人際關係的誤解不會自己消失，需要有人先開口。「先開口」是讓對方知道你有感受到這件事，讓關係有機會找到出路，不是要你單方面妥協。\n\n為什麼會這樣：\n${n1} 反映這段關係的過去背景，${n2} 指出目前讓距離拉遠的核心原因（誤解或沒說清楚的話）。${n3} 告訴你接下來比較適合的方式，問題在於雙方都在等對方先動，這種等待讓距離慢慢固定下來。\n\n接下來的方向：\n找一個平靜的時機輕輕開口，不需要一次解決所有問題，先說出最在意的一件事就夠了。如果對方完全不接收，那也是一個重要資訊，幫你決定這段關係要怎麼對待。`;
    case "health":
      return `整體答案：\n你的身心狀態有持續被消耗的跡象，先找出哪一個來源消耗你最多精力，從那裡開始調整，不用一次改變全部習慣。\n\n為什麼會這樣：\n${n1} 說明你目前身心狀態的背景，${n2} 指出讓你持續耗損的核心原因（特定習慣、環境或情緒模式）。${n3} 告訴你接下來恢復的方向，你知道答案，只是一直在迴避執行。\n\n接下來的方向：\n先把睡眠補回來，再找出一個讓你每天消耗最多的習慣，這週先減少一點。如果有持續的身體不適，不要再拖，去確認一下。`;
    default:
      return `整體答案：\n這件事有解，只是先不要急著做最終決定。先把目前最核心的卡點找出來，從你能控制的一件事開始處理，不要試圖同時解決全部。\n\n為什麼會這樣：\n${n1} 反映你走到這裡的背景，${n2} 指出讓你現在動不了的核心問題。${n3} 告訴你接下來比較適合走的方向，你有資源，只是目前被太多方向分散，讓你找不到起點。\n\n接下來的方向：\n把現在在想的事分成「我能控制的」和「我不能控制的」兩欄，把注意力放在能控制的那欄，從最小但能做到的一件事開始行動。`;
  }
  })();

  // 外地發展／開店／加盟／展店：整段（整體答案＋為什麼＋接下來方向）都用場景文案，
  // 不能掉回 career/finance base（避免出現履歷、離職、工作狀態、進場等誤套語）。
  const bizScn = getBizLifeScenario(question);
  if (bizScn) {
    const sig = cards?.length ? getSpreadSignal(cards) : "neutral";
    const tier = sig === "strong" ? "strong" : sig === "weak" ? "weak" : (hasRevCard ? "negMild" : "posMild");
    const wd = getBizLifeWhyDirection(bizScn);
    return `整體答案：\n${getBizLifeConclusion(bizScn, tier)}\n\n為什麼會這樣：\n${wd.why}\n\n接下來的方向：\n${wd.direction}`;
  }

  // 依問題回答類型，用直接結論覆蓋「整體答案」第一段，保留「為什麼會這樣／接下來的方向」。
  // 修正：考試題不再回「這件事有解」、離職題不再回「留下來硬撐還是衝動離職」。
  // 牌面強弱影響結論力度（強→很有機會；弱→難度偏高）。
  const answerType = detectAnswerType(question);
  const signal = cards?.length ? getSpreadSignal(cards) : "neutral";
  const direct = getDirectConclusionSentence(answerType, focus, question, hasRevCard, signal);
  if (!direct) return base;

  const why       = extractSectionByPosition(base, "為什麼會這樣", ["接下來的方向"]);
  const direction = extractSectionByPosition(base, "接下來的方向", []);
  const parts = [`整體答案：\n${direct}`];
  if (why)       parts.push(`為什麼會這樣：\n${why}`);
  if (direction) parts.push(`接下來的方向：\n${direction}`);
  return parts.join("\n\n");
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
    career:       isYesNoQuestion(question)
      ? `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n這組牌對你問的問題給出了答案，但完整的判斷需要解鎖才能看到——包含目前達標機率的傾向、你現在最容易錯失的是什麼，以及接下來應該先接住哪些機會。`
      : `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n工作上的走向，這組牌提示你：方向比速度重要，先把真正想走的路確認清楚，再決定要衝還是等。`,
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
  const focus              = detectQuestionFocus(question);
  const questionTopic      = detectQuestionTopic(question, focus);
  const topicBoundaryRules = getTopicBoundaryRules(questionTopic, question);
  // 外地發展/開店/加盟/展店：不套財運鎖定（改由場景 hint 主導）
  const categoryLockRules  = getBizLifeScenario(question) ? "" : getCategoryLockRules(topic);
  const focusLabel         = getFocusLabel(focus);
  // 外地發展/開店/加盟/展店：不套用工作/財運的 topicGuidance（改由場景 hint 主導），避免「離職/履歷/進場」誤套
  const topicGuidance      = getBizLifeScenario(question) ? "" : getTopicGuidance(topic, focus, question);
  const ori           = card.position === "upright" ? "正位" : "逆位";
  const kw            = card.keywords?.length ? `關鍵字：${card.keywords.join("、")}` : "";
  const base          = card.baseMeaning  ? `牌面核心：${card.baseMeaning}`  : "";
  const topicMeaning  = card.topicMeaning ? `主題牌義：${card.topicMeaning}` : "";
  const msgHint       = card.meaning      ? `牌面訊息：${card.meaning}`      : "";
  const cardDetails   = [kw, base, topicMeaning, msgHint].filter(Boolean).join("\n");

  const shortHint = question && question.length < 10
    ? `\n【短問題提示】此問題字數少（「${question}」），請先推測使用者最想確認的核心，在 questionFocus 和 oneLineConclusion 直接給出結論性回答，不要輸出通用療癒內容。`
    : "";

  // 限制類問題：最高優先，不給絕對答案
  const restrictedHint = getRestrictedHint(question);
  // 健康／身心題：要求具體生活層面分析，不可只說「累/休息」
  const healthDepthHint = getHealthDepthHint(focus, question);
  // 生活／居住決策題：禁止股票投資語氣
  const housingHint = getHousingChoiceHint(question);
  // 創業／開店／地點決策題：禁止當成財運或股票投資
  const startupHint = getStartupChoiceHint(question);
  // 經營決策題：禁用履歷/離職/求職/職涯語境
  const jobWordGuard = getBusinessJobWordGuard(question);
  // 外地發展決策題：禁止只當離職或投資
  const relocationHint = getRelocationHint(question);
  // 牌面強弱 → 結論力度
  const strengthHint = getStrengthHint([card]);
  // 降低模板感：敘事模式輪替、宇宙偷偷話去模板、逆位多面向、結論給根據
  const narrativeRules = getNarrativeRules(false, pickNarrativeMode());

  // 回答類型：選擇/分析/時間題用對應結論語氣（結果型沿用下方 yesNoHint）
  const answerType    = detectAnswerType(question);
  const answerTypeHint = getAnswerTypeHint(answerType, question, "oneLineConclusion");

  // 是非題 / 達標題（結果型）：強制先給明確傾向判斷
  const yesNoHint = answerType === "result"
    ? `\n【是非題強制規則 — 最高優先】
使用者問的是「${question}」，這是一個需要明確答案的問題。

必須遵守：
1. oneLineConclusion 第一句必須是傾向判斷，格式如下其中一種：
   ・「照目前狀態下去，[達標/成功/成交/有回音]的機率偏低。」
   ・「這張牌給的答案偏保留，[結果/機會]不會自己送上門。」
   ・「目前傾向是可以[成/達標]，但不能靠等的。」
   ・「有機會，但照現在這種節奏繼續，[業績/這件事]會很吃力。」
   ✗ 絕對不能用「停下來看清方向比繼續衝更重要」這類繞過問題的句子。

2. questionAnswer 第一句也必須是傾向判斷：
   先說「這張牌（${card.name}）對你的問題判斷偏向……」
   再說為什麼（根據牌義：主動/被動、有方向/失焦、機會出現了/還沒有）
   最後說：如果要改變這個結果，使用者需要做什麼具體行動。

3. 如果這張牌的牌義屬於「被動、倦怠、失焦、錯失機會、等待」類型：
   必須明確說「照目前狀態，[達標/成功/成交]機率偏低」
   補充說明「問題不是沒機會，而是你對已出現的機會反應太慢」
   行動建議是「整理既有名單/機會，主動接住那些已出現的機會」而非「廣撒網」。`
    : "";

  // 股票/投資題：強制給牌面傾向詞彙
  const investmentHint = (focus.primary === "finance" && isInvestmentQuestion(question))
    ? `\n【股票/投資強制規則 — 與是非題規則並列最高優先】
使用者問的是「${question}」，這是股票/市場問題，不是業績問題。

必須遵守：
1. oneLineConclusion 第一句必須使用以下詞彙之一：
   「牌面偏漲」「牌面偏弱」「牌面偏觀望」「續漲力道不足」「短線容易震盪」
   「目前不適合追高」「這張牌不支持盲目進場」「不是沒機會，但風險正在升高」
   ✗ 不能說「停下來看清方向」「多觀察即可」「保持耐心」（這是空話）

2. questionAnswer 第一句也必須是牌面傾向判斷（「牌面偏漲/偏弱/偏觀望」），
   再說市場含義，再給操作參考（控倉/設停損/分批觀察）。

3. 操作建議聚焦風險控管，絕對禁止業績語氣：
   ✗ 主動追單 / 聯絡客戶 / 提高行動力 / 積極開發 / 努力衝刺
   ✓ 控制倉位 / 分批觀察 / 設停損 / 等量能確認 / 避免追高

4. safetyNote 必須填入：「以上為塔羅牌面參考，不構成投資建議，實際操作仍請自行評估風險。」`
    : "";

  const isUpright = card.position === "upright";
  const directionHint = (() => {
    if (focus.primary === "love") return isUpright
      ? "（正向牌：可以給一次機會，但觀察對方行動，不要把全部期待壓上去）"
      : "（逆向牌：先觀察對方是否真的有靠近行動；若持續讓你消耗，放手或拉開距離會更輕鬆）";
    if (focus.primary === "career") {
      if (isBusinessTargetQuestion(question) && !isCareerChangeQuestion(question)) {
        return isUpright
          ? "（業績/成交問題正位牌：說明達標機率傾向，給具體追單/接單/客戶跟進建議，禁止提轉職）"
          : "（業績/成交問題逆位牌：說明目前達標壓力來源，建議調整追單重心，禁止提轉職或離職）";
      }
      return isUpright
        ? "（正向牌：可以主動爭取、提出想法，適合讓別人看見你的能力）"
        : "（逆向牌：先整理資源與備案，不要衝動離職或硬碰硬，再做決定）";
    }
    if (focus.primary === "finance" && isInvestmentQuestion(question)) return isUpright
      ? "（股票正位：給牌面傾向＋控倉建議，不給絕對進場承諾）"
      : "（股票逆位：給牌面偏弱/不支持進場判斷＋風險提示）";
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
    questionFocus:   "40～60字，純情緒安撫／溫柔提醒，2句。不可重複一句話結論、不可複述問題、不可寫成「你現在最想確認的，其實不是…」這種心理剖析。像在拍拍肩膀：先接住情緒，再給一點放鬆的提醒",
    cardMessage:     "60～90字，2～3句，說明這張牌（${card.name}，${ori}）的能量，以及它和你目前處境的關聯（現況連結），牌名最多出現 1 次。只描述能量與關聯，不下結論、不重複一句話",
    questionAnswer:  "80～120字，這是「解讀總結」：給本次占卜的實際答案，要比一句話更具體。明確包含 (1) 偏向 yes／no／觀望 (2) 風險點 (3) 適合怎麼做${directionHint}，不可與一句話結論相同",
    todayAction:     "80～140字，提供 2 個具體可執行的行動，每個說清楚怎麼做，不給「整理自己」這類抽象建議",
    gentleReminder:  "60～90字，2～3句，這是「心靈收束」：收尾並給下一步行動提醒，不可與解讀總結重複，不可用通用療癒語",
  } : {
    questionFocus:   "30～45字，純情緒安撫／溫柔提醒，不可重複一句話結論、不可複述問題、不可寫「你現在最想確認的，其實不是…」",
    cardMessage:     "50～80字，2～3句，說明這張牌（${card.name}，${ori}）的能量與你目前處境的關聯，牌名最多出現 1 次，不下結論、不重複一句話",
    questionAnswer:  "60～100字，「解讀總結」：實際答案，含偏向 yes／no／觀望＋風險點＋適合怎麼做${directionHint}，不可與一句話相同",
    todayAction:     "60～100字，提供 1～2 個具體行動",
    gentleReminder:  "50～80字，2～3句「心靈收束」：收尾＋下一步提醒，不可與解讀總結重複",
  };

  return `請根據以下資料，以 JSON 格式解讀塔羅牌。只回傳純 JSON，不加說明文字。

【重要提示】這是使用者分享 Facebook 後才能解鎖的完整版，內容必須有真正的解鎖價值。

${topicBoundaryRules}
${categoryLockRules}

【抽牌模式】單張牌完整解讀
【問題】${question || "（未填寫問題）"}
【問題焦點】${focusLabel}
【牌卡資訊】
  牌名：${card.name}（${ori}）
  牌組：${card.suit ?? ""}
  英文名：${card.nameEn ?? ""}
  ${cardDetails}

${VAGUE_CONCLUSION_GUARD}
${TAROT_READING_STYLE_RULES}
${topicGuidance}
${shortHint}
${restrictedHint}
${healthDepthHint}
${housingHint}
${startupHint}
${jobWordGuard}
${relocationHint}
${strengthHint}
${narrativeRules}
${answerTypeHint}
${yesNoHint}
${investmentHint}
${antiSimilarityHint}

【各欄位職責 — 嚴格遵守，不能越界】
每個欄位只能負責自己的功能，同一意思在不同欄位只能說一次，不得重複。

• oneLineConclusion（一句話）：30～45字，只當最精簡結論，直接回答使用者問題。
  ✗ 禁止：寫心理狀態、用「你現在的狀態」開頭、寫「你現在最想確認的是…」。
  ✓ 應該像：「今天偏短線有機會，但不適合追高，先看支撐是否站穩。」

• questionFocus（宇宙偷偷話）：${depthSpec.questionFocus}
  ✗ 禁止：「你問的是 XXX，而這張牌就是宇宙給你的回應」、複述問題、重複一句話結論、「你現在最想確認的，其實不是…」
  ✓ 應該像：「你可以有期待，但今天不需要急著證明什麼。先讓局勢多走一步，答案會比現在更清楚。」

• cardMessage（這張牌正在說什麼）：${depthSpec.cardMessage}
  ✗ 禁止：重複一句話結論、重複牌義後又講一樣的意思、說「這張牌出現在你這個問題裡」
  ✓ 應該像：「${card.name}${ori}的能量偏向……，對應到你現在的處境，正好說明……」

• questionAnswer（解讀總結）：${depthSpec.questionAnswer}
  ✓ 這裡整理本次占卜的實際答案：偏向 yes／no／觀望、風險點、適合怎麼做，可比一句話更具體，但不得與一句話相同。

• todayAction：${depthSpec.todayAction}

• gentleReminder（心靈收束）：${depthSpec.gentleReminder}

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

【四區塊去重 — 最高優先，凌駕其他規則】
oneLineConclusion（一句話）、questionFocus（宇宙偷偷話）、questionAnswer（解讀總結）、gentleReminder（心靈收束）這四塊各有不同任務，內容必須明顯不同：
・一句話＝最精簡結論（直接回答）。
・宇宙偷偷話＝純情緒安撫／溫柔提醒（不給結論、不複述問題）。
・解讀總結＝實際答案（yes／no／觀望＋風險＋做法，比一句話具體）。
・心靈收束＝收尾＋下一步行動提醒。
任兩塊不得字面相同，也不得換句話說同一件事（語意重疊超過七成視為違規）。尤其「一句話」與「宇宙偷偷話」絕對不可以一樣或高度相似。

【解讀品質規範】
1. 只根據這一張牌（${card.name} ${ori}）解讀，不引入其他牌的概念。
2. oneLineConclusion 第一句直接回答使用者問題，不從牌義背景說起。
3. questionAnswer 必須給明確方向：正位牌 → 可以怎麼做；逆位牌 → 要注意什麼、什麼不建議做。
4. 全文避免報告型句子（「整體而言」「這意味著你」）、命令式語氣（「你需要」→「可以先」）、心靈雞湯（「你值得更好的未來」「宇宙會帶你去對的地方」）。
5. 依本次主題分類給具體方向（請嚴格參照上方【核心主題分類器】的術語邊界）：
   感情→對方有沒有行動；業績/成交→達標機率與追單方向；轉職→是否留下或換工作；財運→進攻還是守；投資→控倉/停損/觀察量能。

【輸出 JSON 格式】
{
  "spreadType": "single",
  "category": "${getTopicLabel(topic)}",
  "cardName": "${card.name}",
  "orientation": "${ori}",
  "questionFocus": "（${depthSpec.questionFocus}）",
  "oneLineConclusion": "（30～45字，最精簡結論，直接回答使用者問題，不寫心理狀態、不寫「你現在最想確認的是…」）",
  "cardMessage": "（${depthSpec.cardMessage}）",
  "questionAnswer": "（${depthSpec.questionAnswer}）",
  "todayAction": "（${depthSpec.todayAction}）",
  "gentleReminder": "（${depthSpec.gentleReminder}）",
  "blessing": "（20～40字祝福語，每次不同）",
  "safetyNote": "（依問題類型填入：身體健康問題→「如果症狀持續、惡化，或已經影響生活，建議尋求皮膚科或專業醫療協助。」；股票/投資/市場問題→「以上為塔羅牌面參考，不構成投資建議，實際操作仍請自行評估風險。」；其他問題→空字串）"
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
  const focus              = detectQuestionFocus(question);
  const questionTopic      = detectQuestionTopic(question, focus);
  const topicBoundaryRules = getTopicBoundaryRules(questionTopic, question);
  // 外地發展/開店/加盟/展店：不套財運鎖定（改由場景 hint 主導）
  const categoryLockRules  = getBizLifeScenario(question) ? "" : getCategoryLockRules(topic);
  const focusLabel         = getFocusLabel(focus);
  // 外地發展/開店/加盟/展店：不套用工作/財運的 topicGuidance（改由場景 hint 主導），避免「離職/履歷/進場」誤套
  const topicGuidance      = getBizLifeScenario(question) ? "" : getTopicGuidance(topic, focus, question);
  const spreadLabels       = getSpreadLabels();

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

  // 限制類問題：最高優先，不給絕對答案
  const restrictedHint = getRestrictedHint(question);
  // 健康／身心題：要求具體生活層面分析，不可只說「累/休息」
  const healthDepthHint = getHealthDepthHint(focus, question);
  // 生活／居住決策題：禁止股票投資語氣
  const housingHint = getHousingChoiceHint(question);
  // 創業／開店／地點決策題：禁止當成財運或股票投資
  const startupHint = getStartupChoiceHint(question);
  // 經營決策題：禁用履歷/離職/求職/職涯語境
  const jobWordGuard = getBusinessJobWordGuard(question);
  // 外地發展決策題：禁止只當離職或投資
  const relocationHint = getRelocationHint(question);
  // 牌面強弱 → 結論力度
  const strengthHint = getStrengthHint(cards);
  // 降低模板感：敘事模式輪替、去模板、逆位多面向、結論給根據、牌與牌互動敘事
  const narrativeRules = getNarrativeRules(true, pickNarrativeMode());

  // 回答類型：選擇/分析/時間題用對應結論語氣（結果型沿用下方 yesNoHint）
  const answerType     = detectAnswerType(question);
  const answerTypeHint = getAnswerTypeHint(answerType, question, "overallSummary 的「整體答案：」");

  // 是非題 / 達標題（結果型）：強制先給明確傾向判斷（三張牌版）
  const threeCardYesNoHint = answerType === "result"
    ? `\n【是非題強制規則 — 最高優先】
使用者問的是「${question}」，這是一個需要明確答案的問題。

必須遵守：
1. overallSummary 的「整體答案：」第一句必須是傾向判斷：
   ✓「照目前這三張牌的走向，[達標/成功/成交/有回音]的機率偏低。」
   ✓「這組牌給的答案偏保留：[結果]不會自然發生。」
   ✓「有機會，但照現在這個節奏繼續，[業績/這件事]會很吃力。」
   ✗ 不能只說「先整理方向」「觀察一下」「宇宙在安排」

2. 每張牌的「對你的問題代表」也要先給判斷，再說為什麼：
   先說：「這張牌（在[位置]）對你問的[達標/成交]問題，傾向……」
   再說：根據牌義（主動/被動、有方向/失焦）說明判斷原因。

3. 如果其中一張牌的牌義屬於「被動/倦怠/失焦/等待/錯失機會」類型：
   必須說明「這張牌拉低了整體機率」
   不能把它解讀成「需要休息」或「先沉澱」
   而是「對已出現的機會反應太慢，這是影響結果的主因」`
    : "";

  // 股票/投資題：強制給牌面傾向詞彙（三張牌版）
  const threeCardInvestmentHint = (focus.primary === "finance" && isInvestmentQuestion(question))
    ? `\n【股票/投資強制規則 — 最高優先】
使用者問的是「${question}」，這是股票/市場問題，不是業績問題。

overallSummary 的「整體答案：」第一句必須使用以下詞彙之一：
「牌面偏漲」「牌面偏弱」「牌面偏觀望」「續漲力道不足」「短線容易震盪」「目前不適合追高」

每張牌的「對你的問題代表」也要先給牌面傾向詞彙，再說市場含義，再給操作參考。

操作建議只能是：控制倉位/分批觀察/設停損/等量能確認/避免追高
絕對禁止業績語氣：主動追單/聯絡客戶/提高行動力/積極開發/努力衝刺

safetyNote 必須填入：「以上為塔羅牌面參考，不構成投資建議，實際操作仍請自行評估風險。」`
    : "";

  // 根據深度設定字數規格（已縮短以加快生成：每張牌三小段合計最多 230 字）
  const msgSpec    = "三小段合計最多230字：牌面重點≤45字、對你的問題代表≤100字、這張牌提醒你≤85字";
  const combSpec   = depth === "deep" ? "200～300字" : "150～220字";
  const summSpec   = depth === "deep" ? "70～110字"  : "55～90字";
  const stepSpec   = "每段最多80字，只給一個具體行動";
  const remindSpec = depth === "deep" ? "60～100字"  : "50～80字";

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
      "message": "牌面重點：\\n（【嚴格限制】1句白話，25-40字，最多45字。只描述這張牌帶出的核心狀態或感受。【絕對禁止】不可包含牌名、正逆位、關鍵字；不可加「這張牌代表：」「${card.name}（${ori}）」等前綴；不可解釋牌義；不可把「對你的問題代表」或「這張牌提醒你」的內容寫進來）\\n\\n對你的問題代表：\\n（【嚴格限制】2句話，60-90字，最多100字。直接連回使用者問題，說清楚這張牌在「${posLabel}」代表什麼：${card.position === "upright" ? "正向牌說可以怎麼做或往哪個方向走" : "逆位牌說什麼在阻礙或需先停下來"}。不重複牌面重點，不用「這張牌在這個位置提醒你」這種模板句）\\n\\n這張牌提醒你：\\n（【嚴格限制】2句話，45-75字，最多85字。給一個具體提醒或下一步，口吻白話溫柔。三張牌的提醒不能說同樣的話，不重複對你的問題代表）"
    }`;
  }).join(",\n");

  return `請根據以下牌陣資料，以 JSON 格式解讀塔羅牌陣。只回傳純 JSON，不加說明文字。

【重要提示】這是使用者分享 Facebook 後才能解鎖的完整版。
使用者想知道方向，不是來學牌義的。每段必須白話、清楚、有答案。
格式嚴格遵守：牌面重點1句≤60字、對你的問題代表2句≤140字、這張牌提醒你2句≤120字、為什麼會這樣只要2句。

${topicBoundaryRules}
${categoryLockRules}

【抽牌模式】三張牌陣完整解讀
【問題】${question || "（未填寫問題）"}
【問題焦點】${focusLabel}

【牌陣資訊】
${cardDescriptions}

${VAGUE_CONCLUSION_GUARD}
${TAROT_READING_STYLE_RULES}
${topicGuidance}
${shortHint}
${restrictedHint}
${healthDepthHint}
${housingHint}
${startupHint}
${jobWordGuard}
${relocationHint}
${strengthHint}
${narrativeRules}
${answerTypeHint}
${threeCardYesNoHint}
${threeCardInvestmentHint}
${antiSimilarityHint}

【解讀品質規範 — 嚴格遵守】
1. 每張牌的 message（${msgSpec}）必須用三小段格式：
   「牌面重點：」→ 說明這張牌本身的核心牌義（引用牌名）
   「對你的問題代表：」→ 直接回應使用者的問題，說清楚這張牌在這個位置代表什麼狀況或原因
   「這張牌提醒你：」→ 給一個具體可行的提醒，說清楚要做什麼，不要用通用語

2. overallSummary（格式固定為三段）：
   「整體答案：」→ 3～4句，直接回答使用者的問題，說清楚這件事能不能走、該不該繼續、適不適合行動。
     範例（愛情）：「這段感情還有可能，但先不要急著做最終決定。接下來先觀察對方有沒有實際行動，如果對方一直讓你猜，就先把重心收回自己。」
     範例（業績/追單）：「有機會，但照目前節奏繼續達標會偏吃力。現在最重要的是把最有機會成交的名單整理出來，優先追進這幾個案子，不要繼續廣撒網。」
     範例（轉職）：「轉職可以考慮，但這段時間適合準備，不建議衝動裸辭。先把你想要的工作條件整理清楚，再觀察市場反應。」
     範例（財運）：「近期適合守，先把支出整理清楚，確認現金流穩定。可以小幅試探新收入，但大額投資這段時間先暫緩。」
   「為什麼會這樣：」→ 【嚴格限制只要2句】，簡單說明三張牌（${cardNamesForHint}）串起來的原因，不要長篇分析每張牌。
     範例：「第一張牌顯示你曾有過動力或基礎，第二張牌說明目前讓你卡住的是什麼。第三張牌提示真正讓你猶豫的，可能是信心還沒完全回來。」
   「接下來的方向：」→ 2～3句，給一個明確具體的行動建議。
     感情：說靠近/觀察/溝通還是拉距離，對方有沒有行動比感覺更重要。
     業績/成交：說達標機率傾向、哪些機會還能追、具體追單方向（禁止提轉職/履歷）。
     轉職/職涯：說是否適合留下或換工作、現在適合準備還是行動。
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

7. 三張牌整體字數目標：650～950字（精簡為主，不要為了湊字數重複或鋪陳）。每張牌解讀要有明顯差異，不可以三張說一樣的話。

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
  "overallSummary": "整體答案：\\n（3～4句，直接回答使用者問題，說清楚這件事能不能走、該不該繼續、適不適合行動，不用「先整理自己」「方向會清楚」等空泛語）\\n\\n為什麼會這樣：\\n（【只要2句】，簡單說明三張牌${cardNamesForHint}串起來的原因，不長篇分析，不用列舉每張牌的全部牌義）\\n\\n接下來的方向：\\n（2～3句，給具體行動建議：感情→靠近/觀察/溝通/收回重心；工作→先準備履歷/投遞/不要衝動裸辭；財運→守現金流/整理支出；不可說「調整方向」「看清楚內心」等空泛語）",
  "cards": [
${positionSchema}
  ],
  "combinedReading": "",
  "actionSteps": [
    "Day 1～2｜一句話，給一個小任務，最多50字",
    "Day 3～4｜一句話，給一個觀察或整理方向，最多50字",
    "Day 5～7｜一句話，給一個實際行動，最多50字"
  ],
  "gentleReminder": "（${remindSpec}，療癒但要呼應本次牌陣，不能用「先整理自己」「宇宙提醒你」等通用語）",
  "blessing": "（20～40字祝福語，每次不同）",
  "safetyNote": "（依問題類型填入：身體健康問題→「如果症狀持續、惡化，或已經影響生活，建議尋求皮膚科或專業醫療協助。」；股票/投資/市場問題→「以上為塔羅牌面參考，不構成投資建議，實際操作仍請自行評估風險。」；其他問題→空字串）"
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
      // 四區塊去重：一句話／宇宙偷偷話／解讀總結／心靈收束 不得相同或高度相似
      const focus = mergeFocusWithTopic(detectQuestionFocus(question), topic);
      const deduped = dedupeSingleCardFields(parsed, card, focus, question);
      return formatSingleCardReading(deduped);
    } catch {
      return null;
    }
  };

  // 第一次嘗試
  const first = await tryGenerate("");
  if (!first) return null;

  // 財運禁詞防呆：若混入感情語境，用財務重生指令重試；仍違規則回 null 走財運 fallback
  if (topic === "finance" && findFinanceForbiddenWord(first)) {
    console.log("[tarot-reading] finance forbidden word in single-card, regenerating...");
    const retry = await tryGenerate(FINANCE_REGEN_HINT);
    if (retry && !findFinanceForbiddenWord(retry)) return retry;
    return null;
  }

  // 情境關鍵字品質檢查：開店/地點/加盟/展店/外地/居住題，結論需帶專屬關鍵字，否則重生一次。
  // 重生仍缺則回 null → 走場景化 fallback（fallback 結論保證含關鍵字）。
  const kwSpec = getScenarioConclusionKeywords(question);
  if (kwSpec && !scenarioKeywordsPresent(kwSpec, first)) {
    console.log("[tarot-reading] scenario keywords missing in single-card, regenerating...");
    const retry = await tryGenerate(getScenarioKeywordRegenHint(kwSpec));
    if (
      retry &&
      scenarioKeywordsPresent(kwSpec, retry) &&
      !(topic === "finance" && findFinanceForbiddenWord(retry))
    ) {
      return retry;
    }
    return null;
  }

  // 品質檢查：若太通用則重試一次
  if (isGenericResponse(first, [card])) {
    const retry = await tryGenerate(ANTI_SIMILARITY_HINT);
    if (topic === "finance" && retry && findFinanceForbiddenWord(retry)) return null;
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
      const focus = mergeFocusWithTopic(detectQuestionFocus(question), topic);
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

  // 財運禁詞防呆：若混入感情語境，用財務重生指令重試；仍違規則回 null 走財運 fallback
  if (topic === "finance" && findFinanceForbiddenWord(first)) {
    console.log("[tarot-reading] finance forbidden word in three-card, regenerating...");
    const retry = await tryGenerate(FINANCE_REGEN_HINT);
    if (retry && !findFinanceForbiddenWord(retry)) return retry;
    return null;
  }

  // 情境關鍵字品質檢查：開店/地點/加盟/展店/外地/居住題，牌陣總結需帶專屬關鍵字，否則重生一次。
  // 重生仍缺則回 null → 走場景化 fallback（fallback 結論保證含關鍵字）。
  const kwSpec = getScenarioConclusionKeywords(question);
  if (kwSpec && !scenarioKeywordsPresent(kwSpec, first)) {
    console.log("[tarot-reading] scenario keywords missing in three-card, regenerating...");
    const retry = await tryGenerate(getScenarioKeywordRegenHint(kwSpec));
    if (
      retry &&
      scenarioKeywordsPresent(kwSpec, retry) &&
      !(topic === "finance" && findFinanceForbiddenWord(retry))
    ) {
      return retry;
    }
    return null;
  }

  // 放寬品質檢查：只要至少一張牌名出現即可，不強制全部出現
  // （三張牌 AI 可能把某些牌名寫成不同格式）
  const anyCardMentioned = cards.some((c) => first.includes(c.name));
  const tooManyBannedPhrases =
    BANNED_GENERIC_PHRASES.filter((p) => first.includes(p)).length >= 3;

  if (!anyCardMentioned || tooManyBannedPhrases) {
    console.log("[tarot-reading] quality check failed, retrying once...");
    const retry = await tryGenerate(ANTI_SIMILARITY_HINT);
    if (topic === "finance" && retry && findFinanceForbiddenWord(retry)) return null;
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

      // ad 版 token（standard 深度，縮短以提升速度）
      const reading = isSingle
        ? await callSingleCard(client, model, cards[0], topic, question, "standard", 1300)
        : await callThreeCard (client, model, cards,    topic, question, "standard", 1300);

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

    // premium 版 token（deep 深度，縮短以提升速度）
    const reading = isSingle
      ? await callSingleCard(client, model, cards[0], topic, question, "deep", 1600)
      : await callThreeCard (client, model, cards,    topic, question, "deep", 1400);

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
