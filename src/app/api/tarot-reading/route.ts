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

type TarotReadingTopic = (typeof validTopics)[number];
type TarotReadingPosition = (typeof validPositions)[number];
type TarotSpreadPosition = (typeof validSpreadPositions)[number];
type TarotReadingMode = (typeof validReadingModes)[number];

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

function normalizeCards(cards: unknown): TarotReadingCard[] | null {
  if (!Array.isArray(cards) || cards.length === 0 || cards.length > 3) {
    return null;
  }

  const normalized = cards.map((card) => {
    if (!card || typeof card !== "object") {
      return null;
    }

    const source = card as {
      name?: unknown;
      nameEn?: unknown;
      nameZh?: unknown;
      suit?: unknown;
      position?: unknown;
      spreadPosition?: unknown;
      keywords?: unknown;
      baseMeaning?: unknown;
      topicMeaning?: unknown;
      meaning?: unknown;
    };

    if (typeof source.name !== "string" || !source.name.trim() || !isPosition(source.position)) {
      return null;
    }

    return {
      name: source.name.trim(),
      nameEn: typeof source.nameEn === "string" ? source.nameEn.trim() : undefined,
      nameZh: typeof source.nameZh === "string" ? source.nameZh.trim() : undefined,
      suit: typeof source.suit === "string" ? source.suit.trim() : undefined,
      position: source.position,
      spreadPosition: isSpreadPosition(source.spreadPosition) ? source.spreadPosition : undefined,
      keywords: Array.isArray(source.keywords)
        ? source.keywords.filter((keyword): keyword is string => typeof keyword === "string" && keyword.trim().length > 0)
        : undefined,
      baseMeaning: typeof source.baseMeaning === "string" ? source.baseMeaning.trim() : undefined,
      topicMeaning: typeof source.topicMeaning === "string" ? source.topicMeaning.trim() : undefined,
      meaning: typeof source.meaning === "string" ? source.meaning.trim() : undefined
    };
  });

  if (normalized.some((card) => card === null)) {
    return null;
  }

  return normalized as TarotReadingCard[];
}

function getTopicLabel(topic: TarotReadingTopic) {
  return {
    love: "愛情",
    career: "工作",
    ambiguous: "曖昧",
    general: "生活"
  }[topic];
}

type QuestionFocus = "finance" | "love" | "career" | "general";

function detectQuestionFocus(question: string): QuestionFocus {
  if (!question) return "general";
  const q = question.toLowerCase();
  const financeKeywords = ["財運", "金錢", "收入", "支出", "投資", "偏財", "獎金", "薪水", "存款", "理財", "財務", "賺錢", "錢", "財", "債", "借", "貸款", "房貸", "股票", "基金"];
  const loveKeywords = ["感情", "愛情", "曖昧", "復合", "對方", "他", "她", "喜歡", "交往", "分手", "戀愛", "表白", "告白"];
  const careerKeywords = ["工作", "職場", "事業", "升遷", "轉職", "創業", "職涯", "老闆", "同事", "面試", "辭職"];
  if (financeKeywords.some((k) => q.includes(k))) return "finance";
  if (loveKeywords.some((k) => q.includes(k))) return "love";
  if (careerKeywords.some((k) => q.includes(k))) return "career";
  return "general";
}

function getTopicGuidance(topic: TarotReadingTopic, questionFocus?: QuestionFocus) {
  if (questionFocus === "finance") {
    return `提問者問的是財運或金錢相關問題。請務必讓解讀至少 70% 圍繞金錢議題：近期財務狀態、收入機會、支出壓力、理財方向、潛在風險或被忽略的機會。
不可以只講情緒、休息、宇宙能量而完全迴避財務面。每段解讀都要扣回金錢主題。
第一段必須用 1～2 句直接回答：最近財運走向如何、有沒有機會、什麼在阻礙財務流動。`;
  }
  return {
    love: "請偏向愛情關係、情緒需求、關係中的真實問題與是否值得繼續投入。",
    career: "請偏向工作狀態、職涯選擇、機會判斷、卡住原因與接下來可採取的行動。",
    ambiguous: "請偏向曖昧關係、試探與拉扯、對方心態、訊息冷熱、是否該主動，以及如何保護自己的安全感。",
    general: "請偏向生活狀態、內在整理、目前課題與溫柔提醒。"
  }[topic];
}

function getSpreadLabels() {
  return {
    past: "過去：代表最近影響提問者的背景、情緒或原因",
    present: "現在：代表提問者目前的狀態與正在面對的事",
    future: "未來：代表接下來可能的走向與提醒"
  } satisfies Record<TarotSpreadPosition, string>;
}

function formatCardForPrompt(card: TarotReadingCard, index: number, spreadLabels: Record<TarotSpreadPosition, string>) {
  const orientationLabel = card.position === "upright" ? "正位" : "逆位";
  const spreadText = card.spreadPosition ? `｜牌位：${spreadLabels[card.spreadPosition]}` : "";
  const suitText = card.suit ? `｜牌組：${card.suit}` : "";
  const englishText = card.nameEn ? `｜英文：${card.nameEn}` : "";
  const keywordsText = card.keywords?.length ? `｜關鍵字：${card.keywords.join("、")}` : "";
  const baseMeaningText = card.baseMeaning ? `\n   牌面核心：${card.baseMeaning}` : "";
  const topicMeaningText = card.topicMeaning ? `\n   主題牌義：${card.topicMeaning}` : "";
  const messageText = card.meaning ? `\n   已抽牌訊息：${card.meaning}` : "";

  return `${index + 1}. ${card.name}（${orientationLabel}）${spreadText}${suitText}${englishText}${keywordsText}${baseMeaningText}${topicMeaningText}${messageText}`;
}

// ── 免費版（短版，300-600 字）────────────────────────────────────────────

function buildFreeReading(cards: TarotReadingCard[], topic: TarotReadingTopic, question: string) {
  const topicLabel = getTopicLabel(topic);
  const spreadLabels = getSpreadLabels();
  const cardLine = cards
    .map((card) => {
      const orientationLabel = card.position === "upright" ? "正位" : "逆位";
      const spreadLabel = card.spreadPosition ? spreadLabels[card.spreadPosition].split("：")[0] : "此刻";
      return `${spreadLabel}的 ${card.name}（${orientationLabel}）`;
    })
    .join("、");
  const questionLine = question ? `你放進宇宙的問題是：「${question}」` : "你沒有把問題說出口，但牌面仍接住了此刻的感受。";

  return `🌙 宇宙偷偷話

${questionLine}

這次牌面落在${topicLabel}的主題裡：${cardLine}。
宇宙不是來替你宣布答案，而是把一盞小燈放在你心裡，讓你重新聽見自己。

🔮 這張牌正在說什麼

這組牌正在提醒你：牌義裡的正逆位不是好壞判決，而是能量流動的方向。
有些事正在成形，有些事則需要你先看清卡住的位置。

🐈 你現在的狀態

你其實不是沒有答案，只是最近太習慣把自己的聲音放得很小。
先不要急著證明什麼，把心收回來，答案會變得比較清楚。`;
}

// ── 廣告解鎖版（中長版，含情緒分析、關係分析、七日走向、深夜訊息）────────

function buildAdFallback(cards: TarotReadingCard[], topic: TarotReadingTopic, question: string) {
  const topicLabel = getTopicLabel(topic);
  const cardNames = cards.map((c) => `${c.name}（${c.position === "upright" ? "正位" : "逆位"}）`).join("、");
  const questionLine = question ? `你問的是：「${question}」` : "你把問題留在心裡，宇宙仍然把焦點放在你此刻最在意的事。";
  const questionFocus = detectQuestionFocus(question);

  const financeRelationshipSection = `這組牌面 ${cardNames} 在說：近期財運不是完全沒有機會，而是容易被壓力和既有支出拖住節奏。\n與其等一個大進帳，不如先看看哪裡有被忽略的小收入，或者哪些支出可以慢慢調整。\n財務的流動，往往從「看清楚現況」開始。`;

  const financeEmotionSection = `你最近對錢的事，可能有點焦慮又有點麻木。\n不是你不努力，是心裡一直在撐，沒有空間好好整理財務狀態。\n先把頭抬起來，現況其實比你想的有更多可以動的地方 💫`;

  const financeSevenDaySection = "前 2 天，先整理一次近期的收支，不用完美，看清楚就好。\n3～5 天，留意有沒有可以跟進的小機會或被擱置的收入來源。\n6～7 天，做一個小決定：增加一點收入，或減少一個不必要的支出。";

  const financeMidnightSection = "偷偷說，財運不是只有大機會才算數。\n你每天做的小選擇，也在慢慢改變錢的流向。\n今晚先不要責怪自己，明天從一個小地方開始就夠了。";

  const emotionSection: Record<TarotReadingTopic, string> = {
    love: "老實說，你想等的可能不是訊息而已。\n你想等的是一種「我有被放在心上」的感覺吧 ☁️\n沒關係啦，會在乎的人，本來就會聽得比較細。",
    career: "其實你最近真的有點累了吧。\n不是不能撐，是心裡那盞小燈在問：我還想往這裡走嗎？\n先不用立刻回答，聽見它就很好了。",
    ambiguous: "曖昧最磨人的，就是一下靠近、一下安靜。\n你是不是也有一點這種感覺：好像有希望，又不敢太相信？\n宇宙先幫你抱一下，這種拉扯真的會累。",
    general: questionFocus === "finance" ? financeEmotionSection : `你最近不是突然累，是一點一點被生活塞滿了。\n這組牌面 ${cardNames} 像小夜燈，照見你其實撐很久了 💫\n今晚先不要照顧全世界，先照顧你自己。`
  };

  const relationshipSection: Record<TarotReadingTopic, string> = {
    love: `這組牌面 ${cardNames} 偷偷說：你們之間不是完全沒有光。\n只是有些話還沒說開，所以心會忍不住猜來猜去。\n先別急著定生死，先看看自己有沒有被溫柔對待。`,
    career: `這組牌面 ${cardNames} 像在說：你正在蓄力，也正在想轉彎。\n不用今天就衝出去，先把心裡真正想要的方向摸清楚。\n慢慢來，有些路是走著走著才亮起來的。`,
    ambiguous: `這組牌面 ${cardNames} 裡有一點火光，但也有一點霧。\n對方不一定沒感覺，只是現在還沒把靠近做得很清楚。\n你可以等，但也要記得把自己放在第一排 🐾`,
    general: questionFocus === "finance" ? financeRelationshipSection : `這組牌面 ${cardNames} 在說：你真的已經很努力了。\n如果努力一直沒有回聲，心會累是很正常的。\n先讓自己喘口氣，不用每一步都走得很漂亮。`
  };

  const sevenDaySection: Record<TarotReadingTopic, string> = {
    love: "接下來 7 天，先看對方有沒有自然靠近。\n不用逼答案，看他有沒有把你放進日常就好。\n第 4、5 天左右，溫度會比較容易被你感覺到。",
    career: "接下來 7 天，先整理，不硬衝。\n把手邊的事做穩，方向就會慢慢浮出來。\n宇宙不是叫你停下，是叫你別急著燃燒自己。",
    ambiguous: "接下來 7 天，留意那些沒理由的小靠近。\n如果他主動丟一句話，那一點火光還在。\n如果沒有，也不是你不好，只是你該把自己慢慢領回來。",
    general: questionFocus === "finance" ? financeSevenDaySection : "接下來 7 天，少扛一點點就好。\n挑一件可以放下的小事，讓生活有縫隙可以呼吸。\n你不用一天變好，今天輕一點就很棒了。"
  };

  const midnightSection: Record<TarotReadingTopic, string> = {
    love: "偷偷說，你不用把話說得很漂亮，才值得被愛。\n真正想靠近你的人，會願意聽你慢慢講。\n所以今晚先別懷疑自己，好嗎？",
    career: "那個一直說「再撐一下」的你，真的辛苦了。\n宇宙沒有責怪你，只是想讓你休息一下 ☁️\n明天再努力也可以，今晚先回到自己身邊。",
    ambiguous: "等一個還不確定的人，心很容易變得小小的。\n但你不是只能等，你也可以一點一點選回自己。\n清楚的喜歡，不會讓你永遠猜謎。",
    general: questionFocus === "finance" ? financeMidnightSection : "今晚先把沒說出口的話，輕輕放在枕邊吧。\n你不用全部想通，明天的你會多懂一點點。\n有些路不是白走，它正在悄悄替未來鋪光。"
  };

  return `🌙 宇宙偷偷話

${questionLine}

這次出現的 ${cardNames}，像深夜裡被翻開的一封信。
它不急著預言未來，只是溫柔地指出：你正在靠近一個需要重新選擇自己的時刻。

🔮 這張牌正在說什麼

${relationshipSection[topic]}

🐈 你現在的狀態

${emotionSection[topic]}

✨ 接下來可以怎麼做

先把注意力從「一定要立刻有答案」移開。
做一個能讓自己更穩的小行動，讓牌面提醒變成日常裡可以踩住的一步。

🌌 給你的溫柔提醒

${midnightSection[topic]}

🕯️ 7日能量提示

${sevenDaySection[topic]}

💫 一句專屬祝福

願你在還不確定的夜裡，也能慢慢相信自己的光。`;
}

function buildAdPrompt(cards: TarotReadingCard[], topic: TarotReadingTopic, question: string) {
  const topicLabel = getTopicLabel(topic);
  const questionFocus = detectQuestionFocus(question);
  const topicGuidance = getTopicGuidance(topic, questionFocus);
  const spreadLabels = getSpreadLabels();
  const cardText = cards
    .map((card, index) => formatCardForPrompt(card, index, spreadLabels))
    .join("\n");
  const questionText = question ? `\n提問者寫下的問題：「${question}」` : "\n提問者沒有寫下問題，請以此刻的感受陪伴為主。";
  const questionFocusInstruction = question
    ? `\n解讀必須先直接回答這個問題，再用療癒語氣包裝。「🌙 宇宙偷偷話」第一段要有 1～2 句明確呼應問題的話。`
    : "";

  return `請為「宇宙偷偷話」網站寫一段塔羅解讀。

主題：${topicLabel}
抽到的牌：
${cardText}
${questionText}

${TAROT_READING_STYLE_RULES}
${topicGuidance}
${questionFocusInstruction}

請把每張牌的牌組、正逆位、關鍵字與真正塔羅牌義融入解讀；不要只列牌名。若是三張牌，請把過去、現在、未來串成一條「狀態 → 牌義提醒 → 行動方向」的脈絡。

輸出格式要求：
- 必須用以下固定段落標題，保留 emoji。
- 每段 2 到 4 句，避免大段文字牆。
- 每段之間留空行。
- 不要使用 Markdown 粗體，不要輸出 **。
- 免費版前三段會被顯示，請讓前三段本身就完整、好讀、有牌義。

🌙 宇宙偷偷話
🔮 這張牌正在說什麼
🐈 你現在的狀態
✨ 接下來可以怎麼做
🌌 給你的溫柔提醒
🕯️ 7日能量提示
💫 一句專屬祝福`;
}

// ── Premium 版（深層文學版，含「對方沒說出口的話」）────────────────────────

function getPremiumSections(topic: TarotReadingTopic): string[] {
  return [...TAROT_READING_SECTIONS];
}

function buildPremiumFallback(cards: TarotReadingCard[], topic: TarotReadingTopic, question: string) {
  const topicLabel = getTopicLabel(topic);
  const cardNames = cards.map((card) => `${card.name}（${card.position === "upright" ? "正位" : "逆位"}）`).join("、");
  const questionLine = question ? `你問的是：「${question}」` : "你把問題留在心裡，宇宙仍然把焦點放在你此刻最在意的關係。";
  const questionFocus = detectQuestionFocus(question);

  const realStateSection: Record<TarotReadingTopic, string> = {
    love: `這組牌面 ${cardNames} 像夜裡寄來的一封小信 ✨\n它不是要你立刻下結論，只是提醒你：有些沒說清楚的話，正在悄悄變成距離。`,
    career: `這組牌面 ${cardNames} 像把你帶到一個安靜的岔路口。\n你不是迷路，只是需要重新確認：自己的力氣，還想交給哪裡。`,
    ambiguous: `這組牌面 ${cardNames} 像曖昧裡一盞忽明忽暗的小燈。\n偷偷說，你們不是完全沒有光，只是現在還沒有人把話說亮。`,
    general: questionFocus === "finance"
      ? `這組牌面 ${cardNames} 在說：近期財運不是沒有機會，而是你容易被壓力和既有支出拖住，讓真正的機會從眼前滑過。\n比起等一個大進帳，這組牌更像在說：先整理負擔、看見被忽略的小機會，財務狀態會慢慢穩下來。`
      : `這組牌面 ${cardNames} 像替你的生活按下暫停鍵。\n你有些地方已經做得很好了，只是你一直忘了稱讚自己。`
  };

  const innerSection: Record<TarotReadingTopic, string> = {
    love: "其實呀，你真正不安的，可能不是一則訊息。\n是你不想再用猜測，證明自己有沒有被選擇。",
    career: "老實說，你最累的也許不是事情太多。\n而是你一直很努力，卻很少問自己：我還喜歡這個方向嗎？",
    ambiguous: "你心裡其實有感覺，只是還不敢完全相信。\n沒關係啦，宇宙不催你醒來，只陪你慢慢看清。",
    general: questionFocus === "finance"
      ? "你對財務的焦慮，不只是數字的問題。\n是那種「努力了但還是覺得不夠穩」的心情，讓你很難冷靜看清現況 ☁️\n先把情緒和帳本分開，你會看見其實有更多可以動的空間。"
      : "你承受的比自己承認的更多。\n安靜不代表沒事，有時候只是心在等你回頭抱抱它 ☁️"
  };

  const unspokenSection: Record<TarotReadingTopic, string> = {
    love: "他沒有說出口的，也許不是完全不在乎。\n但你的心也不用一直替沉默找理由，真的不用。",
    career: "你沒說出口的是：某個方向可能已經不太合身了。\n不用一次改變人生，先移動一小步，風就會進來。",
    ambiguous: "對方可能比表面更在意你，只是靠近得不夠穩。\n可你的溫柔不該只拿來等待，也要留一點給自己 🐾",
    general: questionFocus === "finance"
      ? "財運的門，不一定是大機會才算敲開。\n從今天起留意小收入、小節省，你會發現錢的流向其實比你以為的更聽話。"
      : "那些說不清的累，宇宙其實都有聽見。\n今晚不用逞強，把心交還給自己一點點就好。"
  };

  return `🌙 宇宙偷偷話

${questionLine}

${realStateSection[topic]}

🔮 這張牌正在說什麼

${cardNames} 不是在替你下結論，而是在指出此刻能量的方向。
正位與逆位都不是獎懲，它們只是提醒你：哪裡正在流動，哪裡需要被溫柔調整。

🐈 你現在的狀態

${innerSection[topic]}

✨ 接下來可以怎麼做

${questionFocus === "finance" ? "先把近期的收支大概整理一下，不用很精準，讓自己知道錢去哪裡就好。\n找一個可以增加收入或減少不必要支出的小行動，從那裡開始。\n別把所有壓力堆在一個大決策上，小步移動，財務會慢慢有感覺。" : "先不要逼自己立刻變得很勇敢。\n請選一件能讓心回到身體裡的小事，把注意力從反覆猜測慢慢帶回來。"}

🌌 給你的溫柔提醒

${unspokenSection[topic]}

🕯️ 7日能量提示

${questionFocus === "finance" ? "前 2 天，先整理一次近期的收支狀況，看清楚比擔心有用。\n3～5 天，留意有沒有可以跟進的收入機會，或被擱置的小事可以推進。\n6～7 天，做一個具體的小財務決定，不管大小，行動會帶來流動。" : "前 3 天，先離開反覆想像的房間。\n第 4、5 天，某個小訊號可能會變清楚。\n第 6、7 天，跟著事實走，不要只跟著害怕走。"}

💫 一句專屬祝福

${questionFocus === "finance" ? "願你在整理財務的同時，也記得整理一下對自己的溫柔——你比你以為的更有能力讓事情慢慢變好。" : "願你在還沒有完全確定之前，也能溫柔地站在自己這一邊。"}`;
}

function buildPremiumPrompt(cards: TarotReadingCard[], topic: TarotReadingTopic, question: string) {
  const topicLabel = getTopicLabel(topic);
  const questionFocus = detectQuestionFocus(question);
  const topicGuidance = getTopicGuidance(topic, questionFocus);
  const sections = getPremiumSections(topic).join("\n");

  const spreadLabels = getSpreadLabels();
  const cardText = cards
    .map((card, index) => formatCardForPrompt(card, index, spreadLabels))
    .join("\n");
  const questionText = question ? `\n提問者寫下的問題：「${question}」` : "\n提問者沒有寫下問題，請以此刻的感受陪伴為主。";
  const questionFocusInstruction = question
    ? `\n解讀必須先直接回答這個問題，再用療癒語氣包裝。「🌙 宇宙偷偷話」第一段要有 1～2 句明確呼應問題核心的話，不可以只說宇宙能量或情緒狀態。`
    : "";

  return `請為「宇宙偷偷話」網站寫一段深度塔羅解讀。

主題：${topicLabel}
抽到的牌：
${cardText}
${questionText}

${TAROT_READING_STYLE_RULES}
不要寫成心理諮商、職涯分析或制式報告。
${topicGuidance}
${questionFocusInstruction}

「🌌 給你的溫柔提醒」是核心亮點，請寫得具體、有畫面感、能讓提問者感覺被深深看見，適合截圖分享，而不是泛泛的安慰。

請把每張牌的牌組、正逆位、關鍵字與牌義真正融入解讀；不要只列牌名，也不要把小阿爾克那寫得像大阿爾克那。每一張牌都要服務整體故事線。

三張牌必須整合成一條脈絡：
- 過去：原因 / 背景
- 現在：目前狀態
- 未來：接下來走向

輸出格式要求：
- 請用以下固定段落標題，保留 emoji。
- 每段 2 到 4 句，避免大段文字牆。
- 每段之間留空行。
- 不要使用 Markdown 粗體，不要輸出 **。
- 最後一定要有「💫 一句專屬祝福」，即使牌面沉重，也要保留希望感、陪伴感、可以慢慢變好的感覺。

${sections}`;
}

// ── POST Handler ─────────────────────────────────────────────────────────────

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
  const cards = normalizeCards(source.cards);
  const topic = isTopic(source.topic) ? source.topic : null;
  const question = typeof source.question === "string" ? source.question.trim().slice(0, 600) : "";
  const readingMode = isReadingMode(source.readingMode) ? source.readingMode : "premium";
  const anonymousId =
    typeof source.anonymousId === "string" ? source.anonymousId.slice(0, 128) : null;
  const paidMode = source.paidMode === true;

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
    const ip = getRequestIp(request);
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

  // 廣告解鎖版（中長版，無付費需求）
  if (readingMode === "ad") {
    if (!apiKey) {
      return NextResponse.json({
        readingMode,
        reading: buildAdFallback(cards, topic, question),
        preview: true
      });
    }

    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

    try {
      const response = await client.responses.create({
        model,
        input: [
          {
            role: "system",
            content: TAROT_READING_SYSTEM_PROMPT
          },
          {
            role: "user",
            content: buildAdPrompt(cards, topic, question)
          }
        ],
        max_output_tokens: 1800
      });

      const reading = response.output_text?.trim();

      if (!reading) {
        return NextResponse.json({
          readingMode,
          reading: buildAdFallback(cards, topic, question),
          preview: true
        });
      }

      return NextResponse.json({ readingMode, reading });
    } catch (error) {
      console.error("Ad tarot reading failed:", error);
      return NextResponse.json({
        readingMode,
        reading: buildAdFallback(cards, topic, question),
        preview: true
      });
    }
  }

  // Premium 版（深層文學版）
  if (!apiKey) {
    return NextResponse.json({
      readingMode,
      reading: buildPremiumFallback(cards, topic, question),
      preview: true
    });
  }

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

  try {
    const response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content: TAROT_READING_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: buildPremiumPrompt(cards, topic, question)
        }
      ],
      max_output_tokens: 2800
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
