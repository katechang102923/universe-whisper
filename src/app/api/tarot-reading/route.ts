import OpenAI from "openai";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { checkAndIncrementLimit, type RateLimitFeature } from "@/lib/rateLimit";

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

function getTopicGuidance(topic: TarotReadingTopic) {
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

  return `✨ 宇宙訊息

${questionLine}

這次牌面落在${topicLabel}的主題裡：${cardLine}。
偷偷說，宇宙不是來催你做決定的 ✨
它只是想陪你把心裡那團線，慢慢放鬆一點。

🌙 情緒狀態

其實呀，你最近可能真的有一點累了吧 ☁️
不是你太敏感，
是心裡那個小小的地方，很想被好好回應。

🕯️ 接下來可以做的事

先不用逼自己馬上有答案。
今天只做一件會讓你安心的小事就好，
慢慢來，宇宙陪你。

☁️ 溫暖收尾

有些答案不用急著現在得到呀。
你已經比自己想像中，
更努力地走到這裡了 🍀`;
}

// ── 廣告解鎖版（中長版，含情緒分析、關係分析、七日走向、深夜訊息）────────

function buildAdFallback(cards: TarotReadingCard[], topic: TarotReadingTopic, question: string) {
  const topicLabel = getTopicLabel(topic);
  const cardNames = cards.map((c) => `${c.name}（${c.position === "upright" ? "正位" : "逆位"}）`).join("、");
  const questionLine = question ? `你問的是：「${question}」` : "你把問題留在心裡，宇宙仍然把焦點放在你此刻最在意的事。";

  const emotionSection: Record<TarotReadingTopic, string> = {
    love: "老實說，你想等的可能不是訊息而已。\n你想等的是一種「我有被放在心上」的感覺吧 ☁️\n沒關係啦，會在乎的人，本來就會聽得比較細。",
    career: "其實你最近真的有點累了吧。\n不是不能撐，是心裡那盞小燈在問：我還想往這裡走嗎？\n先不用立刻回答，聽見它就很好了。",
    ambiguous: "曖昧最磨人的，就是一下靠近、一下安靜。\n你是不是也有一點這種感覺：好像有希望，又不敢太相信？\n宇宙先幫你抱一下，這種拉扯真的會累。",
    general: `你最近不是突然累，是一點一點被生活塞滿了。\n這組牌面 ${cardNames} 像小夜燈，照見你其實撐很久了 💫\n今晚先不要照顧全世界，先照顧你自己。`
  };

  const relationshipSection: Record<TarotReadingTopic, string> = {
    love: `這組牌面 ${cardNames} 偷偷說：你們之間不是完全沒有光。\n只是有些話還沒說開，所以心會忍不住猜來猜去。\n先別急著定生死，先看看自己有沒有被溫柔對待。`,
    career: `這組牌面 ${cardNames} 像在說：你正在蓄力，也正在想轉彎。\n不用今天就衝出去，先把心裡真正想要的方向摸清楚。\n慢慢來，有些路是走著走著才亮起來的。`,
    ambiguous: `這組牌面 ${cardNames} 裡有一點火光，但也有一點霧。\n對方不一定沒感覺，只是現在還沒把靠近做得很清楚。\n你可以等，但也要記得把自己放在第一排 🐾`,
    general: `這組牌面 ${cardNames} 在說：你真的已經很努力了。\n如果努力一直沒有回聲，心會累是很正常的。\n先讓自己喘口氣，不用每一步都走得很漂亮。`
  };

  const sevenDaySection: Record<TarotReadingTopic, string> = {
    love: "接下來 7 天，先看對方有沒有自然靠近。\n不用逼答案，看他有沒有把你放進日常就好。\n第 4、5 天左右，溫度會比較容易被你感覺到。",
    career: "接下來 7 天，先整理，不硬衝。\n把手邊的事做穩，方向就會慢慢浮出來。\n宇宙不是叫你停下，是叫你別急著燃燒自己。",
    ambiguous: "接下來 7 天，留意那些沒理由的小靠近。\n如果他主動丟一句話，那一點火光還在。\n如果沒有，也不是你不好，只是你該把自己慢慢領回來。",
    general: "接下來 7 天，少扛一點點就好。\n挑一件可以放下的小事，讓生活有縫隙可以呼吸。\n你不用一天變好，今天輕一點就很棒了。"
  };

  const midnightSection: Record<TarotReadingTopic, string> = {
    love: "偷偷說，你不用把話說得很漂亮，才值得被愛。\n真正想靠近你的人，會願意聽你慢慢講。\n所以今晚先別懷疑自己，好嗎？",
    career: "那個一直說「再撐一下」的你，真的辛苦了。\n宇宙沒有責怪你，只是想讓你休息一下 ☁️\n明天再努力也可以，今晚先回到自己身邊。",
    ambiguous: "等一個還不確定的人，心很容易變得小小的。\n但你不是只能等，你也可以一點一點選回自己。\n清楚的喜歡，不會讓你永遠猜謎。",
    general: "今晚先把沒說出口的話，輕輕放在枕邊吧。\n你不用全部想通，明天的你會多懂一點點。\n有些路不是白走，它正在悄悄替未來鋪光。"
  };

  return `✨ 宇宙訊息

${questionLine}

🌙 情緒狀態

${emotionSection[topic]}

💞 關係提醒

${relationshipSection[topic]}

🕯️ 七日走向

${sevenDaySection[topic]}

🐾 深夜悄悄話

${midnightSection[topic]}

☁️ 溫暖收尾

宇宙沒有催你立刻變得完美。
它只是想提醒你：累的時候，也可以先坐一下。
今晚先讓心靠岸，明天再往前一點點 🍀`;
}

function buildAdPrompt(cards: TarotReadingCard[], topic: TarotReadingTopic, question: string) {
  const topicLabel = getTopicLabel(topic);
  const topicGuidance = getTopicGuidance(topic);
  const spreadLabels = getSpreadLabels();
  const cardText = cards
    .map((card, index) => formatCardForPrompt(card, index, spreadLabels))
    .join("\n");
  const questionText = question ? `\n提問者寫下的心事：${question}` : "\n提問者沒有寫下問題，請以此刻的感受陪伴為主。";

  return `請為「宇宙偷偷話」網站寫一段塔羅解讀。

主題：${topicLabel}
抽到的牌：
${cardText}
${questionText}

請使用繁體中文。語氣要像「深夜會安慰人的朋友」加上一點塔羅占卜師的神秘感：溫柔、可愛、有陪伴感，像宇宙偷偷跟提問者說話。
可以自然加入 ✨ 🌙 ☁️ 🐾 💫 🍀 🕯️，但不要過度浮誇。
可以使用「其實呀」「偷偷說」「老實說」「你是不是也有一點這種感覺？」「沒關係啦」「慢慢來就好」這類聊天感句子，但不要太幼稚。
不要寫成分析報告，不要太像心理諮商、職涯顧問或制式建議。不恐嚇、不絕對預言、不使用醫療或投資保證語氣。
${topicGuidance}

請把每張牌的牌組、正逆位、關鍵字與牌義真正融入解讀；不要只列牌名。若是三張牌，請把過去、現在、未來串成一條「現在狀態 → 宇宙提醒 → 行動建議」的脈絡。

輸出格式要求：
- 請用以下固定段落標題，保留 emoji。
- 每段最多 2 到 3 行，避免大段文字牆。
- 每段之間留空行。
- 不要使用 Markdown 粗體，不要輸出 **。只有真的非常重要的一句話才可以用一句短句加強，但仍不要用 **。
- 「🐾 深夜悄悄話」要最有情緒共鳴，適合截圖分享。
- 最後一定要有「☁️ 溫暖收尾」，即使牌面沉重，也要保留希望感與陪伴感。

✨ 宇宙訊息
🌙 情緒狀態
💞 關係提醒
🕯️ 七日走向
🐾 深夜悄悄話
☁️ 溫暖收尾`;
}

// ── Premium 版（深層文學版，含「對方沒說出口的話」）────────────────────────

function getPremiumSections(topic: TarotReadingTopic): string[] {
  if (topic === "career") {
    return [
      "✨ 宇宙訊息",
      "🌙 情緒狀態",
      "💼 工作提醒",
      "🕯️ 牌陣流動",
      "🕯️ 七日走向",
      "🐾 深夜悄悄話",
      "☁️ 溫暖收尾"
    ];
  }

  if (topic === "ambiguous") {
    return [
      "✨ 宇宙訊息",
      "🌙 情緒狀態",
      "💞 曖昧訊息",
      "🕯️ 牌陣流動",
      "🕯️ 七日走向",
      "🐾 深夜悄悄話",
      "☁️ 溫暖收尾"
    ];
  }

  return [
    "✨ 宇宙訊息",
    "🌙 情緒狀態",
    "💞 關係提醒",
    "🕯️ 牌陣流動",
    "🕯️ 七日走向",
    "🐾 深夜悄悄話",
    "☁️ 溫暖收尾"
  ];
}

function buildPremiumFallback(cards: TarotReadingCard[], topic: TarotReadingTopic, question: string) {
  const topicLabel = getTopicLabel(topic);
  const cardNames = cards.map((card) => `${card.name}（${card.position === "upright" ? "正位" : "逆位"}）`).join("、");
  const questionLine = question ? `你問的是：「${question}」` : "你把問題留在心裡，宇宙仍然把焦點放在你此刻最在意的關係。";

  const realStateSection: Record<TarotReadingTopic, string> = {
    love: `這組牌面 ${cardNames} 像夜裡寄來的一封小信 ✨\n它不是要你立刻下結論，只是提醒你：有些沒說清楚的話，正在悄悄變成距離。`,
    career: `這組牌面 ${cardNames} 像把你帶到一個安靜的岔路口。\n你不是迷路，只是需要重新確認：自己的力氣，還想交給哪裡。`,
    ambiguous: `這組牌面 ${cardNames} 像曖昧裡一盞忽明忽暗的小燈。\n偷偷說，你們不是完全沒有光，只是現在還沒有人把話說亮。`,
    general: `這組牌面 ${cardNames} 像替你的生活按下暫停鍵。\n你有些地方已經做得很好了，只是你一直忘了稱讚自己。`
  };

  const innerSection: Record<TarotReadingTopic, string> = {
    love: "其實呀，你真正不安的，可能不是一則訊息。\n是你不想再用猜測，證明自己有沒有被選擇。",
    career: "老實說，你最累的也許不是事情太多。\n而是你一直很努力，卻很少問自己：我還喜歡這個方向嗎？",
    ambiguous: "你心裡其實有感覺，只是還不敢完全相信。\n沒關係啦，宇宙不催你醒來，只陪你慢慢看清。",
    general: "你承受的比自己承認的更多。\n安靜不代表沒事，有時候只是心在等你回頭抱抱它 ☁️"
  };

  const unspokenSection: Record<TarotReadingTopic, string> = {
    love: "他沒有說出口的，也許不是完全不在乎。\n但你的心也不用一直替沉默找理由，真的不用。",
    career: "你沒說出口的是：某個方向可能已經不太合身了。\n不用一次改變人生，先移動一小步，風就會進來。",
    ambiguous: "對方可能比表面更在意你，只是靠近得不夠穩。\n可你的溫柔不該只拿來等待，也要留一點給自己 🐾",
    general: "那些說不清的累，宇宙其實都有聽見。\n今晚不用逞強，把心交還給自己一點點就好。"
  };

  return `✨ 宇宙訊息

${questionLine}

${realStateSection[topic]}

🌙 情緒狀態

${innerSection[topic]}

💞 ${topic === "career" ? "工作提醒" : topic === "ambiguous" ? "曖昧訊息" : "關係提醒"}

${unspokenSection[topic]}

🕯️ 牌陣流動

過去像一陣小回聲：那些不安不是突然來的。
現在提醒你，把重心先放回自己。
未來亮著一點微光，只要你做一個小選擇，故事就會開始鬆動。

🕯️ 七日走向

前 3 天，先離開反覆想像的房間。
第 4、5 天，某個小訊號可能會變清楚。
第 6、7 天，跟著事實走，不要只跟著害怕走。

🐾 深夜悄悄話

偷偷說，宇宙不是要你今天就勇敢到滿分。
它只是想讓你知道：
你心裡那個小小的感覺，真的值得被好好對待。

☁️ 溫暖收尾

如果今天真的有點累，
那就先休息一下也沒關係。
你會慢慢變好的，宇宙有看見你 🍀`;
}

function buildPremiumPrompt(cards: TarotReadingCard[], topic: TarotReadingTopic, question: string) {
  const topicLabel = getTopicLabel(topic);
  const topicGuidance = getTopicGuidance(topic);
  const sections = getPremiumSections(topic).join("\n");

  const spreadLabels = getSpreadLabels();
  const cardText = cards
    .map((card, index) => formatCardForPrompt(card, index, spreadLabels))
    .join("\n");
  const questionText = question ? `\n提問者寫下的心事：${question}` : "\n提問者沒有寫下問題，請以此刻的感受陪伴為主。";

  return `請為「宇宙偷偷話」網站寫一段深度塔羅解讀。

主題：${topicLabel}
抽到的牌：
${cardText}
${questionText}

請使用繁體中文。語氣像「深夜會安慰人的朋友」加上一點塔羅占卜師的神秘感：溫柔、可愛、有陪伴感，像宇宙偷偷跟提問者說話。
可以自然加入 ✨ 🌙 ☁️ 🐾 💫 🍀 🕯️，但不要過度浮誇。
可以使用「其實呀」「偷偷說」「老實說」「你是不是也有一點這種感覺？」「沒關係啦」「慢慢來就好」這類聊天感句子，但不要太幼稚。
不要寫成長篇文章、心理諮商、職涯分析或制式報告。不恐嚇、不絕對預言、不使用醫療或投資保證語氣。
${topicGuidance}

「🐾 深夜悄悄話」是核心亮點，請寫得具體、有畫面感、能讓提問者感覺被深深看見，適合截圖分享，而不是泛泛的安慰。

請把每張牌的牌組、正逆位、關鍵字與牌義真正融入解讀；不要只列牌名，也不要把小阿爾克那寫得像大阿爾克那。每一張牌都要服務整體故事線。

三張牌必須整合成一條脈絡：
- 過去：原因 / 背景
- 現在：目前狀態
- 未來：接下來走向

輸出格式要求：
- 請用以下固定段落標題，保留 emoji。
- 每段最多 2 到 3 行，避免大段文字牆。
- 每段之間留空行。
- 不要使用 Markdown 粗體，不要輸出 **。只有真的非常重要的一句話才可以用一句短句加強，但仍不要用 **。
- 不要寫成分析報告，不要太像心理分析或職涯顧問。
- 最後一定要有「☁️ 溫暖收尾」，即使牌面沉重，也要保留希望感、陪伴感、可以慢慢變好的感覺。

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
    adminEmail?: unknown;
  };
  const cards = normalizeCards(source.cards);
  const topic = isTopic(source.topic) ? source.topic : null;
  const question = typeof source.question === "string" ? source.question.trim().slice(0, 600) : "";
  const readingMode = isReadingMode(source.readingMode) ? source.readingMode : "premium";
  const anonymousId =
    typeof source.anonymousId === "string" ? source.anonymousId.slice(0, 128) : null;
  const adminEmail = typeof source.adminEmail === "string" ? source.adminEmail.slice(0, 200) : null;

  if (!cards) {
    return NextResponse.json({ error: "請提供 1 到 3 張有效牌卡。" }, { status: 400 });
  }

  if (!topic) {
    return NextResponse.json({ error: "請提供有效的解讀主題。" }, { status: 400 });
  }

  // ── 免費版（Firestore 限流，AI API 呼叫前檢查）────────────────────────────
  if (readingMode === "free" || readingMode === "premium") {
    const cookieStore = await cookies();
    const lineUserId = cookieStore.get("line_user_id")?.value ?? null;
    const ip = getRequestIp(request);
    const feature: RateLimitFeature = cards.length === 1 ? "single_tarot" : "three_card";

    try {
      const limitResult = await checkAndIncrementLimit({
        ip,
        anonymousId,
        lineUserId,
        adminEmail,
        feature,
      });
      if (!limitResult.allowed) {
        return NextResponse.json({ error: limitResult.message }, { status: 429 });
      }
    } catch (err) {
      // Firestore 不可用時 fail-open（不阻擋請求，記錄 log）
      console.error("[rate-limit] checkAndIncrementLimit failed:", err);
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
            content: "你是宇宙偷偷話的塔羅解讀文字夥伴。你的任務是把牌面整理成溫柔、清楚、不恐嚇的繁體中文陪伴訊息。"
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
          content:
            "你是宇宙偷偷話的塔羅解讀文字夥伴。你的任務是把牌面整理成溫柔、精準、帶有深夜文學感的繁體中文陪伴訊息。語氣不煽情，但要有重量。"
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
