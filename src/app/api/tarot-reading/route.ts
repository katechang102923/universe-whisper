// ─────────────────────────────────────────────────────────────────────────────
// 宇宙偷偷話 — 塔羅解牌 API Route
// 本檔案只調整 AI 解牌邏輯（prompt / fallback）
// 不修改 UI、FB 分享、LINE、付款、抽牌動畫、免費次數、登入流程
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from "openai";
import { NextResponse } from "next/server";
import { checkAndIncrementLimit, type RateLimitFeature } from "@/lib/rateLimit";
import { verifyAdminIdToken } from "@/lib/verifyAdmin";
import {
  TAROT_READING_SECTIONS,
  TAROT_READING_STYLE_RULES,
  TAROT_READING_SYSTEM_PROMPT,
} from "@/lib/tarotReadingPromptConfig";

export const runtime = "nodejs";

const DEFAULT_MODEL = "gpt-5.4-mini";
const validTopics = ["love", "career", "ambiguous", "general"] as const;
const validPositions = ["upright", "reversed"] as const;
const validSpreadPositions = ["past", "present", "future"] as const;
const validReadingModes = ["free", "ad", "premium"] as const;

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

// ── 問題焦點型別 ──────────────────────────────────────────────────────────────

type QuestionFocusPrimary =
  | "finance"
  | "career"
  | "love"
  | "relationship"
  | "health"
  | "general";

type QuestionFocus = {
  primary: QuestionFocusPrimary;
  secondary?: Exclude<QuestionFocusPrimary, "general">;
};

// ── 型別守衛 ──────────────────────────────────────────────────────────────────

function isTopic(value: unknown): value is TarotReadingTopic {
  return typeof value === "string" && validTopics.includes(value as TarotReadingTopic);
}

function isPosition(value: unknown): value is TarotReadingPosition {
  return typeof value === "string" && validPositions.includes(value as TarotReadingPosition);
}

function isSpreadPosition(value: unknown): value is TarotSpreadPosition {
  return typeof value === "string" && validSpreadPositions.includes(value as TarotSpreadPosition);
}

function isReadingMode(value: unknown): value is TarotReadingMode {
  return typeof value === "string" && validReadingModes.includes(value as TarotReadingMode);
}

function getRequestIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwardedFor ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

// ── 牌卡正規化 ────────────────────────────────────────────────────────────────

function normalizeCards(cards: unknown): TarotReadingCard[] | null {
  if (!Array.isArray(cards) || cards.length === 0 || cards.length > 3) return null;

  const normalized = cards.map((card) => {
    if (!card || typeof card !== "object") return null;

    const src = card as {
      name?: unknown; nameEn?: unknown; nameZh?: unknown; suit?: unknown;
      position?: unknown; spreadPosition?: unknown; keywords?: unknown;
      baseMeaning?: unknown; topicMeaning?: unknown; meaning?: unknown;
    };

    if (typeof src.name !== "string" || !src.name.trim() || !isPosition(src.position)) return null;

    return {
      name:          src.name.trim(),
      nameEn:        typeof src.nameEn === "string" ? src.nameEn.trim() : undefined,
      nameZh:        typeof src.nameZh === "string" ? src.nameZh.trim() : undefined,
      suit:          typeof src.suit   === "string" ? src.suit.trim()   : undefined,
      position:      src.position,
      spreadPosition: isSpreadPosition(src.spreadPosition) ? src.spreadPosition : undefined,
      keywords:      Array.isArray(src.keywords)
                       ? src.keywords.filter((k): k is string => typeof k === "string" && k.trim().length > 0)
                       : undefined,
      baseMeaning:   typeof src.baseMeaning  === "string" ? src.baseMeaning.trim()  : undefined,
      topicMeaning:  typeof src.topicMeaning === "string" ? src.topicMeaning.trim() : undefined,
      meaning:       typeof src.meaning      === "string" ? src.meaning.trim()      : undefined,
    };
  });

  if (normalized.some((c) => c === null)) return null;
  return normalized as TarotReadingCard[];
}

// ── 主題標籤 ──────────────────────────────────────────────────────────────────

function getTopicLabel(topic: TarotReadingTopic): string {
  return { love: "愛情", career: "工作", ambiguous: "曖昧", general: "生活" }[topic];
}

// ── 問題焦點偵測 ──────────────────────────────────────────────────────────────
// 回傳 { primary, secondary? }，primary 優先順序：finance > career > love > relationship > health

function detectQuestionFocus(question: string): QuestionFocus {
  if (!question) return { primary: "general" };

  const q = question; // 保留中文原字，不 toLowerCase

  const kwMap: Record<Exclude<QuestionFocusPrimary, "general">, string[]> = {
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
      "健康", "身體", "生病", "手術", "醫院", "體力", "睡眠", "壓力", "焦慮",
    ],
  };

  const priority: Exclude<QuestionFocusPrimary, "general">[] = [
    "finance", "career", "love", "relationship", "health",
  ];

  let primary: QuestionFocusPrimary = "general";
  let secondary: Exclude<QuestionFocusPrimary, "general"> | undefined;

  for (const focus of priority) {
    const hit = kwMap[focus].some((k) => q.includes(k));
    if (!hit) continue;
    if (primary === "general") {
      primary = focus;
    } else {
      secondary = focus;
      break;
    }
  }

  return secondary ? { primary, secondary } : { primary };
}

// ── 問題焦點顯示標籤 ─────────────────────────────────────────────────────────

function getFocusLabel(focus: QuestionFocus): string {
  const labels: Record<QuestionFocusPrimary, string> = {
    finance:      "財運",
    career:       "工作",
    love:         "感情",
    relationship: "人際關係",
    health:       "健康",
    general:      "生活綜合",
  };
  const pri = labels[focus.primary];
  if (focus.secondary) return `${pri}與${labels[focus.secondary]}`;
  return pri;
}

// ── 靜態 fallback 用一句話結論 ────────────────────────────────────────────────

function getFallbackOneSentenceConclusion(focus: QuestionFocus): string {
  switch (focus.primary) {
    case "finance":
      return "近期財運偏穩健，比起衝刺大機會，更適合先整理支出、讓財務流動順暢。";
    case "career":
      return "工作上有調整的能量，方向比速度重要，先確認自己真正想走的路再行動。";
    case "love":
      return "感情狀態需要多一點耐心，真正的靠近不靠催促，先讓自己穩下來。";
    case "relationship":
      return "人際關係正在轉化，保持適當距離同時也保留溝通的空間。";
    case "health":
      return "身心需要補充能量，這段時間先把休息和壓力管理放在第一位。";
    default:
      return "現在的狀態正在轉變，先整理自己，方向會慢慢清晰。";
  }
}

// ── 主題聚焦指令（注入每個 AI prompt）────────────────────────────────────────

function getTopicGuidance(topic: TarotReadingTopic, focus: QuestionFocus): string {
  switch (focus.primary) {
    case "finance":
      return `【財運強制聚焦 — 70% 篇幅必須圍繞金錢議題】
提問者問的是財運或金錢相關問題。
解讀必須包含：近期收入狀態、支出壓力、存款/理財方向、投資機會或風險、現金流、財務瓶頸。
情緒或療癒描述不得超過 30% 篇幅。
第一段（🌙 宇宙偷偷話）必須直接回答：近期財運走向、有沒有機會、什麼在阻礙財務流動。
嚴格禁止：用「宇宙正在照顧你」「你值得被愛」取代財務分析。`;

    case "career":
      return `【工作強制聚焦 — 70% 篇幅必須圍繞職涯議題】
提問者問的是工作或職涯相關問題。
解讀必須包含：工作發展機會、職場環境現況、離職/轉職/升遷判斷、與主管同事的互動、具體行動建議。
不要大量討論感情或純情緒療癒，情緒部分不超過 30%。
第一段（🌙 宇宙偷偷話）必須直接回答：目前工作狀態如何、有沒有調整機會、建議方向。`;

    case "love":
      return `【感情強制聚焦 — 70% 篇幅必須圍繞關係議題】
提問者問的是感情或愛情相關問題。
解讀必須包含：對方的態度與心理、關係走向、復合機率或曖昧進展、溝通問題、是否值得繼續投入。
避免整篇都在講自我療癒而不回應關係問題。
第一段（🌙 宇宙偷偷話）必須直接回答：目前這段關係的狀態與走向。`;

    case "relationship":
      return `【人際關係聚焦 — 70% 篇幅圍繞人際互動】
提問者問的是人際關係問題。
解讀必須包含：對方的態度、關係中的誤解或衝突來源、溝通方式建議、如何應對或改善。
第一段（🌙 宇宙偷偷話）必須直接回答：這段關係目前最主要的問題點。`;

    case "health":
      return `【身心狀態聚焦 — 70% 篇幅圍繞健康與壓力】
提問者關心健康或身心狀態。
解讀必須包含：身心能量狀態、壓力來源、需要注意的警示訊號、具體的生活調整建議。
不提供醫療診斷，但給予心理與生活層面的具體提醒。
第一段（🌙 宇宙偷偷話）必須直接回答：目前身心狀態的整體走向。`;

    default:
      return {
        love:      "請偏向愛情關係、情緒需求、關係中的真實問題與是否值得繼續投入。",
        career:    "請偏向工作狀態、職涯選擇、機會判斷、卡住原因與接下來可採取的行動。",
        ambiguous: "請偏向曖昧關係、試探與拉扯、對方心態、訊息冷熱、是否該主動，以及如何保護自己的安全感。",
        general:   "請偏向生活狀態、內在整理、目前課題與溫柔提醒。",
      }[topic];
  }
}

// ── 牌卡格式化 ────────────────────────────────────────────────────────────────

function getSpreadLabels(): Record<TarotSpreadPosition, string> {
  return {
    past:    "過去：代表最近影響提問者的背景、情緒或原因",
    present: "現在：代表提問者目前的狀態與正在面對的事",
    future:  "未來：代表接下來可能的走向與提醒",
  } satisfies Record<TarotSpreadPosition, string>;
}

function formatCardForPrompt(
  card: TarotReadingCard,
  index: number,
  spreadLabels: Record<TarotSpreadPosition, string>
): string {
  const ori         = card.position === "upright" ? "正位" : "逆位";
  const spreadText  = card.spreadPosition ? `｜牌位：${spreadLabels[card.spreadPosition]}` : "";
  const suitText    = card.suit   ? `｜牌組：${card.suit}`       : "";
  const enText      = card.nameEn ? `｜英文：${card.nameEn}`     : "";
  const kwText      = card.keywords?.length ? `｜關鍵字：${card.keywords.join("、")}` : "";
  const baseText    = card.baseMeaning   ? `\n   牌面核心：${card.baseMeaning}`   : "";
  const topicText   = card.topicMeaning  ? `\n   主題牌義：${card.topicMeaning}`  : "";
  const msgText     = card.meaning       ? `\n   已抽牌訊息：${card.meaning}`      : "";

  return `${index + 1}. ${card.name}（${ori}）${spreadText}${suitText}${enText}${kwText}${baseText}${topicText}${msgText}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// 免費版（短版，靜態，約 300-400 字）
// ═════════════════════════════════════════════════════════════════════════════

function buildFreeReading(
  cards: TarotReadingCard[],
  topic: TarotReadingTopic,
  question: string
): string {
  const topicLabel  = getTopicLabel(topic);
  const spreadLabels = getSpreadLabels();
  const focus       = detectQuestionFocus(question);

  const cardLine = cards
    .map((c) => {
      const ori   = c.position === "upright" ? "正位" : "逆位";
      const label = c.spreadPosition ? spreadLabels[c.spreadPosition].split("：")[0] : "此刻";
      return `${label}的 ${c.name}（${ori}）`;
    })
    .join("、");

  const questionLine = question
    ? `你放進宇宙的問題是：「${question}」`
    : "你沒有把問題說出口，但牌面仍接住了此刻的感受。";

  // 第一段：依問題焦點給出不同的直接回應
  const firstParagraph: Record<QuestionFocusPrimary, string> = {
    finance: `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n近期財運不是完全沒有機會，而是能量需要先整理——看清楚收支狀況，才能讓財務開始流動。`,
    career:  `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n工作上的走向，這組牌提示你：方向比速度重要，先把真正想走的路確認清楚，再決定要衝還是等。`,
    love:    `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n感情的走向，這組牌看見的是：雙方之間還有空間，但需要更清楚的溝通，而不是繼續等待。`,
    relationship: `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n人際關係的問題，這組牌提示你：先釐清誤解的來源，溝通會比沉默更有效。`,
    health:  `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n身心狀態需要被照顧，這組牌提醒你：先把休息補回來，再談其他事。`,
    general: `這次牌面落在${topicLabel}的主題裡：${cardLine}。\n宇宙不是來替你宣布答案，而是把一盞小燈放在你心裡，讓你重新聽見自己。`,
  };

  return `🌙 宇宙偷偷話

${questionLine}

${firstParagraph[focus.primary]}

🔮 這張牌正在說什麼

這組牌正在提醒你：牌義裡的正逆位不是好壞判決，而是能量流動的方向。
有些事正在成形，有些事則需要你先看清卡住的位置。

🐈 你現在的狀態

你其實不是沒有答案，只是最近太習慣把自己的聲音放得很小。
先不要急著證明什麼，把心收回來，答案會變得比較清楚。`;
}

// ═════════════════════════════════════════════════════════════════════════════
// Fallback 用靜態文字區塊（按主題分）
// ═════════════════════════════════════════════════════════════════════════════

/** 各 focus 的「🔮 這張牌正在說什麼」靜態文字 */
function getFallbackCardSection(
  focus: QuestionFocus,
  cardNames: string
): string {
  switch (focus.primary) {
    case "finance":
      return `這組牌面 ${cardNames} 在說：近期財運不是完全沒有機會，而是容易被既有壓力和固定支出拖住節奏。\n與其等一個大進帳，不如先整理哪裡有被忽略的小收入，或者哪些支出可以調整。\n財務的流動，往往從「看清楚現況」開始。`;
    case "career":
      return `這組牌面 ${cardNames} 在說：你正在一個需要重新確認方向的時刻。\n不是能力不夠，而是目前的努力方向和你真正想走的路之間，可能有一點落差需要調整。\n先把真正想要的方向摸清楚，行動才會有力道。`;
    case "love":
      return `這組牌面 ${cardNames} 偷偷說：你們之間不是完全沒有光。\n只是有些話還沒說開，心才會忍不住猜來猜去。\n先別急著下定論，先看看彼此有沒有在溫柔對待對方。`;
    case "relationship":
      return `這組牌面 ${cardNames} 在說：這段關係正在一個需要被重新看見的時刻。\n誤解不一定是惡意，但若不去釐清，可能會讓雙方距離越來越遠。\n主動一點，比等待更有機會化解。`;
    case "health":
      return `這組牌面 ${cardNames} 在說：你的身心能量需要被補充。\n不是突然生病，是長期積累的疲勞在這個時間點需要被正視。\n先把休息排進日程，再談其他計畫。`;
    default:
      return `這組牌面 ${cardNames} 在說：你真的已經很努力了。\n如果努力一直沒有回聲，心會累是很正常的。\n先讓自己喘口氣，不用每一步都走得很漂亮。`;
  }
}

/** 各 focus 的「🐈 你現在的狀態」靜態文字 */
function getFallbackStateSection(focus: QuestionFocus, cardNames: string): string {
  switch (focus.primary) {
    case "finance":
      return `你對財務的焦慮，不只是數字的問題。\n是那種「一直很努力但還是覺得不夠穩」的心情，讓你很難冷靜看清現況 ☁️\n先把情緒和帳本分開，你會看見其實有更多可以動的空間。`;
    case "career":
      return `其實你最近真的有點累了吧。\n不是不能撐，是心裡那盞小燈在問：我還想繼續往這裡走嗎？\n先不用立刻回答，聽見這個問題就已經很重要了。`;
    case "love":
      return `老實說，你想等的可能不是一則訊息。\n你想等的是一種「我有被放在心上」的確認感吧 ☁️\n沒關係，會在乎的人，本來就會自然把你放進日常裡。`;
    case "relationship":
      return `你其實已經感覺到了，只是還不確定要不要開口。\n人際關係裡的卡關，很多時候是因為大家都在等對方先走一步。\n宇宙先給你一點勇氣，主動一點不代表你輸了。`;
    case "health":
      return `你的身體比嘴巴誠實，它一直在跟你說：需要休息了。\n再撐下去不是堅強，是在消耗之後會需要更長時間修復的能量。\n今天先放下一件可以等的事，給自己一點喘息空間。`;
    default:
      return `你最近不是突然累，是一點一點被生活塞滿了。\n這組牌面 ${cardNames} 像小夜燈，照見你其實撐很久了 💫\n今晚先不要照顧全世界，先照顧你自己。`;
  }
}

/** 各 focus 的「✨ 接下來可以怎麼做」靜態文字 */
function getFallbackActionSection(focus: QuestionFocus): string {
  switch (focus.primary) {
    case "finance":
      return `先把近期的收支大概整理一下，不用完美，讓自己知道錢去哪裡就好。\n找一個可以增加收入或減少不必要支出的小行動，從那裡開始。\n不要把所有壓力堆在一個大決策上，小步移動，財務會慢慢有感覺。`;
    case "career":
      return `先把「我想要的工作/職涯狀態」用幾個字寫下來，不用漂亮，寫真實的。\n接著對照現在的工作，找到最大的落差在哪裡——那就是現在最需要動的地方。\n不用一次改變全部，先移動一個小地方，方向就會越來越清楚。`;
    case "love":
      return `先把自己最在意的問題具體說清楚（哪怕只是在心裡說給自己聽）。\n接著選一種你可以承受的溝通方式，讓對方知道你的感受。\n不用追求完美答案，先讓關係有流動的空間。`;
    case "relationship":
      return `先確認自己想要的結果是什麼：修復關係、還是保持距離？\n以結果為出發點，決定要不要主動開口釐清誤解。\n溝通不需要一次說完，先邁出第一步比等待更有效。`;
    case "health":
      return `這週先排入一件具體的「照顧自己的事」：好好睡覺、減少一個會耗能的習慣、或者做一件讓心情變輕的小事。\n不要一次改變全部，先從最容易的那個開始。\n身體的修復比你想的更快，只要你願意停下來讓它喘口氣。`;
    default:
      return `先把注意力從「一定要立刻有答案」移開。\n選一件能讓自己更穩的小行動，讓牌面提醒變成日常裡可以踩住的一步。\n不用今天就把全部都改變，先動一個小地方就夠了。`;
  }
}

/** 各 focus 的「🌌 給你的溫柔提醒」靜態文字 */
function getFallbackGentleReminder(focus: QuestionFocus): string {
  switch (focus.primary) {
    case "finance":
      return `財運的門，不一定是大機會才算敲開。\n你每天做的小選擇——多留一點、少花一點——都在悄悄改變錢的流向。\n今晚先不要責怪自己，明天從一個小地方開始就夠了。`;
    case "career":
      return `那個一直說「再撐一下」的你，真的辛苦了。\n工作上的累，有一部分是你把標準設得比別人高。\n宇宙不是叫你放棄，只是想讓你喘口氣後，看清楚下一步真正想走的方向 ☁️`;
    case "love":
      return `偷偷說，你不用把自己說得很漂亮，才值得被喜歡。\n真正想靠近你的人，會願意聽你慢慢講，不會因為你有點擔心就走掉。\n所以今晚先別懷疑自己，好嗎？`;
    case "relationship":
      return `關係裡的誤解，很多時候不是因為壞心，而是大家都習慣不說出口。\n你願意先邁一步，不代表你在乎得比較多，而是你比較清楚自己要什麼。\n這是勇氣，不是軟弱。`;
    case "health":
      return `身體在照顧你，你也要學會照顧它。\n今晚早一點睡、少滑一個小時手機、吃一頓不趕時間的飯——這些小事加起來，就是你給自己最好的療癒。\n宇宙偷偷說：你值得被好好對待，包括被你自己。`;
    default:
      return `今晚先把沒說出口的話，輕輕放在枕邊吧。\n你不用全部想通，明天的你會多懂一點點。\n有些路不是白走，它正在悄悄替未來鋪光。`;
  }
}

/** 各 focus 的「🕯️ 7日能量提示」靜態文字 */
function getFallbackSevenDay(focus: QuestionFocus): string {
  switch (focus.primary) {
    case "finance":
      return `前 2 天，先整理一次近期收支，不求完美，看清楚就好。\n3～5 天，留意有沒有可以跟進的收入機會，或被擱置的財務決定。\n6～7 天，做一個具體的小財務行動：增加一點收入，或減少一個不必要的支出。`;
    case "career":
      return `前 2 天，先把「我想要的工作狀態」寫下來，只要幾個關鍵字。\n3～5 天，留意工作上有沒有什麼小訊號或機會在悄悄出現。\n6～7 天，選一個可以推進的行動：一次對話、一個申請、或一個決定。`;
    case "love":
      return `前 2 天，先看對方有沒有自然靠近，不要主動逼答案。\n3～5 天，留意平靜時對方的態度，比衝動時更能看清楚真實感受。\n6～7 天，如果有話想說，選一個輕鬆的時機說出來，不用完美。`;
    case "relationship":
      return `前 2 天，先讓自己冷靜，不要在情緒高漲時行動。\n3～5 天，找一個適合的時機，輕輕試探溝通的可能性。\n6～7 天，不管結果如何，都記得把自己的感受放在第一位。`;
    case "health":
      return `前 2 天，先把睡眠時間補回來，其他事暫時放一邊。\n3～5 天，減少一個耗能的習慣，增加一個讓你充電的小行為。\n6～7 天，做一件純粹讓心情變好的事，不帶任何目的。`;
    default:
      return `接下來 7 天，少扛一點點就好。\n挑一件可以放下的小事，讓生活有縫隙可以呼吸。\n你不用一天變好，今天輕一點就很棒了。`;
  }
}

/** 各 focus 的「💫 一句專屬祝福」靜態文字 */
function getFallbackBlessing(focus: QuestionFocus): string {
  switch (focus.primary) {
    case "finance":
      return `願你在整理財務的同時，也記得整理一下對自己的溫柔——你比你以為的更有能力，讓事情慢慢變好。`;
    case "career":
      return `願你在還沒找到完美方向之前，也能相信：每一步的摸索，都是在為對的路鋪光。`;
    case "love":
      return `願你在還不確定的夜裡，也能先好好待在自己身邊——那是你給自己最好的禮物。`;
    case "relationship":
      return `願你在面對複雜的關係時，也能記得：你值得被清楚、被溫柔地對待。`;
    case "health":
      return `願你在照顧所有人之前，先記得把自己的能量杯裝滿——你滿了，才能溢出給別人。`;
    default:
      return `願你在還不確定的夜裡，也能慢慢相信自己的光。`;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 廣告解鎖版 Fallback（靜態，中長版）
// ═════════════════════════════════════════════════════════════════════════════

function buildAdFallback(
  cards: TarotReadingCard[],
  topic: TarotReadingTopic,
  question: string
): string {
  const cardNames   = cards.map((c) => `${c.name}（${c.position === "upright" ? "正位" : "逆位"}）`).join("、");
  const questionLine = question
    ? `你問的是：「${question}」`
    : "你把問題留在心裡，宇宙仍然把焦點放在你此刻最在意的事。";
  const focus       = detectQuestionFocus(question);
  const focusLabel  = getFocusLabel(focus);
  const conclusion  = getFallbackOneSentenceConclusion(focus);

  return `🎯 本次問題焦點

${focusLabel}

🔮 一句話結論

${conclusion}

🌙 宇宙偷偷話

${questionLine}

這次出現的 ${cardNames}，像深夜裡被翻開的一封信。
它不急著預言未來，只是溫柔地說出：你正在需要清楚看見自己的時刻。

🔮 這張牌正在說什麼

${getFallbackCardSection(focus, cardNames)}

🐈 你現在的狀態

${getFallbackStateSection(focus, cardNames)}

✨ 接下來可以怎麼做

${getFallbackActionSection(focus)}

🌌 給你的溫柔提醒

${getFallbackGentleReminder(focus)}

🕯️ 7日能量提示

${getFallbackSevenDay(focus)}

💫 一句專屬祝福

${getFallbackBlessing(focus)}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// 廣告解鎖版 AI Prompt
// ═════════════════════════════════════════════════════════════════════════════

function buildAdPrompt(
  cards: TarotReadingCard[],
  topic: TarotReadingTopic,
  question: string
): string {
  const topicLabel    = getTopicLabel(topic);
  const focus         = detectQuestionFocus(question);
  const focusLabel    = getFocusLabel(focus);
  const topicGuidance = getTopicGuidance(topic, focus);
  const spreadLabels  = getSpreadLabels();
  const cardText      = cards.map((c, i) => formatCardForPrompt(c, i, spreadLabels)).join("\n");

  const questionText = question
    ? `\n提問者寫下的問題：「${question}」`
    : "\n提問者沒有寫下問題，請以此刻的感受陪伴為主。";

  const shortQuestionHint =
    question && question.length < 10
      ? `\n【短問題提示】此問題只有 ${question.length} 個字，請先推測核心意圖，在第一段直接給出結論性回答，不要輸出通用療癒內容。`
      : "";

  const secondaryHint = focus.secondary
    ? `\n此問題同時涉及「${getFocusLabel({ primary: focus.secondary })}」，請在解讀中適當帶到。`
    : "";

  return `請為「宇宙偷偷話」網站寫一段塔羅解讀。

主題：${topicLabel}
本次問題焦點：${focusLabel}
抽到的牌：
${cardText}
${questionText}

${TAROT_READING_STYLE_RULES}
${topicGuidance}
${shortQuestionHint}
${secondaryHint}

請把每張牌的牌組、正逆位、關鍵字與真正塔羅牌義融入解讀；不要只列牌名。
若是三張牌，請把過去、現在、未來串成一條「狀態 → 牌義提醒 → 行動方向」的脈絡。

輸出格式要求：
- 必須依序輸出以下固定段落標題，保留 emoji。
- 每段 2 到 4 句，避免大段文字牆。
- 每段之間留空行。
- 不要使用 Markdown 粗體，不要輸出 **。
- 「🎯 本次問題焦點」只輸出焦點標籤（例如：財運），不加其他說明。
- 「🔮 一句話結論」只輸出一句話，直接回答問題結論，不超過 40 字。
- 「🌙 宇宙偷偷話」第一句必須直接回應提問者的問題，再轉入宇宙療癒語氣。

🎯 本次問題焦點
🔮 一句話結論
🌙 宇宙偷偷話
🔮 這張牌正在說什麼
🐈 你現在的狀態
✨ 接下來可以怎麼做
🌌 給你的溫柔提醒
🕯️ 7日能量提示
💫 一句專屬祝福`;
}

// ═════════════════════════════════════════════════════════════════════════════
// Premium 版 Fallback（靜態，深層版）
// ═════════════════════════════════════════════════════════════════════════════

function getPremiumSections(_topic: TarotReadingTopic): string[] {
  return [...TAROT_READING_SECTIONS];
}

function buildPremiumFallback(
  cards: TarotReadingCard[],
  topic: TarotReadingTopic,
  question: string
): string {
  const cardNames   = cards.map((c) => `${c.name}（${c.position === "upright" ? "正位" : "逆位"}）`).join("、");
  const questionLine = question
    ? `你問的是：「${question}」`
    : "你把問題留在心裡，宇宙仍然把焦點放在你此刻最在意的事。";
  const focus       = detectQuestionFocus(question);
  const focusLabel  = getFocusLabel(focus);
  const conclusion  = getFallbackOneSentenceConclusion(focus);

  // 根據 focus 產生不同的「宇宙偷偷話」第一段（直接回答問題）
  const openingByFocus: Record<QuestionFocusPrimary, string> = {
    finance: `這組牌面 ${cardNames} 在說：近期財運不是沒有機會，而是你容易被壓力和既有支出拖住，讓真正的機會從眼前滑過。\n比起等一個大進帳，這組牌更像在說：先整理負擔、看見被忽略的小機會，財務狀態會慢慢穩下來。`,
    career:  `這組牌面 ${cardNames} 像把你帶到一個安靜的岔路口。\n工作上的卡關，這組牌指向的是方向不夠清晰，而不是能力不足——先確認自己真正想走的路，再決定要衝還是等待。`,
    love:    `這組牌面 ${cardNames} 像夜裡寄來的一封小信 ✨\n感情的走向，這組牌看見的是：雙方之間還有光，只是有些沒說清楚的話正在悄悄變成距離。`,
    relationship: `這組牌面 ${cardNames} 在說：這段關係需要被重新看見。\n誤解不一定是惡意，但若不釐清，可能讓彼此越來越遠——主動一點，比等待更有機會化解。`,
    health:  `這組牌面 ${cardNames} 在說：你的身心能量正在亮黃燈。\n不是大問題，但需要被正視——先把休息補回來，再談其他計畫。`,
    general: `這組牌面 ${cardNames} 像替你的生活按下暫停鍵。\n你有些地方已經做得很好了，只是你一直忘了稱讚自己 ✨`,
  };

  // 7日能量提示 premium 版（Day 格式）
  const sevenDayByFocus: Record<QuestionFocusPrimary, string> = {
    finance: `Day 1–2：整理近期收支，找出最大的支出漏洞\nDay 3–4：留意有沒有被忽略的收入機會或可推進的財務決定\nDay 5–7：做一個小的具體行動：增加一筆收入來源，或刪除一項非必要支出`,
    career:  `Day 1–2：把「我想要的工作狀態」用 3 個關鍵字寫下來\nDay 3–4：觀察目前工作中有沒有正在出現的小機會或訊號\nDay 5–7：選一個可以推進的行動：一封信、一次對話、或一個申請`,
    love:    `Day 1–2：先看對方有沒有自然靠近，不要主動逼答案\nDay 3–4：留意日常互動的溫度，比衝動時更能看清楚真實感受\nDay 5–7：如果有話想說，選一個輕鬆的時機開口，不用完美`,
    relationship: `Day 1–2：讓自己先冷靜下來，不要在情緒高漲時行動\nDay 3–4：試探一次輕鬆的溝通機會，看看對方的反應\nDay 5–7：不管結果如何，都記得把自己的感受放在第一位`,
    health:  `Day 1–2：把睡眠時間補回來，其他事可以等\nDay 3–4：減少一個耗能習慣，增加一個充電的小行為\nDay 5–7：做一件純粹讓心情變好的事，不帶任何目的`,
    general: `Day 1–2：先離開反覆想像的房間，把心拉回當下\nDay 3–5：某個小訊號可能會變得更清楚，留意它\nDay 6–7：跟著事實走，不要只跟著害怕走`,
  };

  return `🎯 本次問題焦點

${focusLabel}

🔮 一句話結論

${conclusion}

🌙 宇宙偷偷話

${questionLine}

${openingByFocus[focus.primary]}

🔮 這張牌正在說什麼

${cardNames} 不是在替你下結論，而是在指出此刻能量的方向。
正位與逆位都不是獎懲，它們只是提醒你：哪裡正在流動，哪裡需要被溫柔調整。

🐈 你現在的狀態

${getFallbackStateSection(focus, cardNames)}

✨ 接下來可以怎麼做

${getFallbackActionSection(focus)}

🌌 給你的溫柔提醒

${getFallbackGentleReminder(focus)}

🕯️ 7日能量提示

${sevenDayByFocus[focus.primary]}

💫 一句專屬祝福

${getFallbackBlessing(focus)}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// Premium 版 AI Prompt
// ═════════════════════════════════════════════════════════════════════════════

function buildPremiumPrompt(
  cards: TarotReadingCard[],
  topic: TarotReadingTopic,
  question: string
): string {
  const topicLabel    = getTopicLabel(topic);
  const focus         = detectQuestionFocus(question);
  const focusLabel    = getFocusLabel(focus);
  const topicGuidance = getTopicGuidance(topic, focus);
  const sections      = getPremiumSections(topic).join("\n");
  const spreadLabels  = getSpreadLabels();
  const cardText      = cards.map((c, i) => formatCardForPrompt(c, i, spreadLabels)).join("\n");

  const questionText = question
    ? `\n提問者寫下的問題：「${question}」`
    : "\n提問者沒有寫下問題，請以此刻的感受陪伴為主。";

  const shortQuestionHint =
    question && question.length < 10
      ? `\n【短問題提示】此問題只有 ${question.length} 個字，請先推測核心意圖，在第一段直接給出結論性回答，不要輸出通用療癒內容。`
      : "";

  const secondaryHint = focus.secondary
    ? `\n此問題同時涉及「${getFocusLabel({ primary: focus.secondary })}」，請在解讀中適當帶到。`
    : "";

  return `請為「宇宙偷偷話」網站寫一段深度塔羅解讀。

主題：${topicLabel}
本次問題焦點：${focusLabel}
抽到的牌：
${cardText}
${questionText}

${TAROT_READING_STYLE_RULES}
不要寫成心理諮商、職涯分析或制式報告。
${topicGuidance}
${shortQuestionHint}
${secondaryHint}

【Premium 7日能量提示格式規定】
「🕯️ 7日能量提示」必須使用以下 Day 分段格式，給出具體可執行的行動，不要只說「相信自己」「順其自然」：
Day 1–2：（具體行動）
Day 3–4：（具體行動）
Day 5–7：（具體行動）

「🌌 給你的溫柔提醒」是核心亮點，請寫得具體、有畫面感，讓提問者感覺被深深看見，適合截圖分享。

請把每張牌的牌組、正逆位、關鍵字與牌義真正融入解讀；不要只列牌名，也不要把小阿爾克那寫得像大阿爾克那。

三張牌必須整合成一條脈絡：
- 過去：原因 / 背景
- 現在：目前狀態
- 未來：接下來走向

輸出格式要求：
- 依序輸出以下固定段落標題，保留 emoji。
- 每段 2 到 4 句，避免大段文字牆。
- 每段之間留空行。
- 不要使用 Markdown 粗體，不要輸出 **。
- 「🎯 本次問題焦點」只輸出焦點標籤（例如：財運），不加其他說明。
- 「🔮 一句話結論」只輸出一句話結論，直接回答問題，不超過 40 字。
- 「🌙 宇宙偷偷話」第一句必須直接回應提問者的問題。
- 最後一定要有「💫 一句專屬祝福」，即使牌面沉重，也要保留希望感與陪伴感。

${sections}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// POST Handler（不修改業務邏輯：限流 / admin / 付款）
// ═════════════════════════════════════════════════════════════════════════════

export async function POST(request: Request) {
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

  // Verify admin status via Firebase ID token (never trust frontend claims)
  const idToken = request.headers.get("x-firebase-id-token");
  const isAdmin = await verifyAdminIdToken(idToken);

  if (!cards) {
    return NextResponse.json({ error: "請提供 1 到 3 張有效牌卡。" }, { status: 400 });
  }

  if (!topic) {
    return NextResponse.json({ error: "請提供有效的解讀主題。" }, { status: 400 });
  }

  // ── 免費版（Firestore 限流，AI API 呼叫前檢查）────────────────────────────
  if (readingMode === "free" || readingMode === "premium") {
    const ip: string = getRequestIp(request);
    const feature: RateLimitFeature = cards.length === 1 ? "single_tarot" : "three_card";

    if (!isAdmin && !paidMode) {
      try {
        const limitResult = await checkAndIncrementLimit({
          ip,
          anonymousId,
          lineUserId: null,
          feature,
        });
        if (!limitResult.allowed) {
          return NextResponse.json({ error: limitResult.message }, { status: 429 });
        }
      } catch (err) {
        // Firestore 不可用時 fail-open（不阻擋請求，記錄 log）
        console.error("[rate-limit] checkAndIncrementLimit failed:", err);
      }
    }

    if (readingMode === "free") {
      return NextResponse.json({
        readingMode,
        reading: buildFreeReading(cards, topic, question),
      });
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;

  // ── 廣告解鎖版（中長版，無付費需求）────────────────────────────────────────
  if (readingMode === "ad") {
    if (!apiKey) {
      return NextResponse.json({
        readingMode,
        reading: buildAdFallback(cards, topic, question),
        preview: true,
      });
    }

    const client = new OpenAI({ apiKey });
    const model  = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

    try {
      const response = await client.responses.create({
        model,
        input: [
          { role: "system", content: TAROT_READING_SYSTEM_PROMPT },
          { role: "user",   content: buildAdPrompt(cards, topic, question) },
        ],
        max_output_tokens: 1800,
      });

      const reading = response.output_text?.trim();
      if (!reading) {
        return NextResponse.json({
          readingMode,
          reading: buildAdFallback(cards, topic, question),
          preview: true,
        });
      }

      return NextResponse.json({ readingMode, reading });
    } catch (error) {
      console.error("Ad tarot reading failed:", error);
      return NextResponse.json({
        readingMode,
        reading: buildAdFallback(cards, topic, question),
        preview: true,
      });
    }
  }

  // ── Premium 版（深層文學版）──────────────────────────────────────────────────
  if (!apiKey) {
    return NextResponse.json({
      readingMode,
      reading: buildPremiumFallback(cards, topic, question),
      preview: true,
    });
  }

  const client = new OpenAI({ apiKey });
  const model  = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

  try {
    const response = await client.responses.create({
      model,
      input: [
        { role: "system", content: TAROT_READING_SYSTEM_PROMPT },
        { role: "user",   content: buildPremiumPrompt(cards, topic, question) },
      ],
      max_output_tokens: 2800,
    });

    const reading = response.output_text?.trim();
    if (!reading) {
      return NextResponse.json({ error: "宇宙訊息暫時沒有成形，請稍後再試。" }, { status: 502 });
    }

    return NextResponse.json({ readingMode, reading });
  } catch (error) {
    console.error("Premium tarot reading failed:", error);
    return NextResponse.json({
      readingMode,
      reading: buildPremiumFallback(cards, topic, question),
      preview: true,
      fallbackReason: "premium_generation_failed",
    });
  }
}
