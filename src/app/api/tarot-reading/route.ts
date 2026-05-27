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
宇宙先不催你做決定，只想陪你把心裡那團線慢慢放鬆。

🌙 情緒狀態

你可能已經感覺到某個地方不太穩，
卻還在等更明確的證據。
這不是你太敏感，是心裡真的想被好好回應。

🕯️ 接下來可以做的事

先做一件能讓你安心的小事。
把目前看得見的事實整理出來，
再決定要不要往前一步。

☁️ 溫暖收尾

有些答案不會立刻出現，
但你已經比自己想像中，
更努力地走到現在了。`;
}

// ── 廣告解鎖版（中長版，含情緒分析、關係分析、七日走向、深夜訊息）────────

function buildAdFallback(cards: TarotReadingCard[], topic: TarotReadingTopic, question: string) {
  const topicLabel = getTopicLabel(topic);
  const cardNames = cards.map((c) => `${c.name}（${c.position === "upright" ? "正位" : "逆位"}）`).join("、");
  const questionLine = question ? `你問的是：「${question}」` : "你把問題留在心裡，宇宙仍然把焦點放在你此刻最在意的事。";

  const emotionSection: Record<TarotReadingTopic, string> = {
    love: "你不只是在等一個人的回應，你是在等一種被放在心上的感覺。\n最近的心可能有點反覆，忽近忽遠都會被你聽得很清楚。\n牌面想先抱住你：你不是太敏感，你只是很在乎。",
    career: "你對工作的疲憊，可能比你說出口的更深一點。\n不是不能撐，而是你心裡有個聲音在問：這真的是我要走的方向嗎？\n這不是負面，是直覺在敲一盞小燈。",
    ambiguous: "曖昧最累的地方，是你不知道自己能不能不開心。\n他一靠近，你就亮起來；他一安靜，你又開始懷疑自己。\n宇宙看見這份拉扯，也想提醒你：你的感受有資格被重視。",
    general: `你最近的累不是突然來的，而是一點一點堆起來的。\n這組牌面 ${cardNames} 像一盞夜燈，照見你其實已經撐了很久。\n今晚先把注意力轉回自己，不必急著照顧全世界。`
  };

  const relationshipSection: Record<TarotReadingTopic, string> = {
    love: `這組牌面 ${cardNames} 說，你們之間不是沒有感覺。\n只是有些話還卡在喉嚨，讓距離被安靜地拉開。\n先問自己：這段關係，有沒有讓你感到被好好接住？`,
    career: `這組牌面 ${cardNames} 像在說，你正站在蓄力與轉向之間。\n有些事還沒落定，所以你無法真正放鬆。\n現在不一定要衝，但需要把「環境卡住」和「心裡不確定」分開看。`,
    ambiguous: `這組牌面 ${cardNames} 顯示，曖昧裡是有火光的。\n只是這道光還忽明忽暗，對方也未必準備好往前一步。\n你可以等待，但請替自己的等待點一盞期限的小燈。`,
    general: `這組牌面 ${cardNames} 在說，你真的已經很努力了。\n只是努力如果一直沒有被回應，心會慢慢失去力氣。\n現在先找到能讓自己喘息的方式，比逼自己更快前進重要。`
  };

  const sevenDaySection: Record<TarotReadingTopic, string> = {
    love: "接下來 7 天，先觀察對方有沒有自然靠近。\n不是逼答案，而是看他有沒有把你放進日常。\n第 4、5 天左右，關係的溫度會比較容易被你感覺出來。",
    career: "接下來 7 天適合整理，不適合硬衝。\n先把手邊事情做穩，再看哪個方向真的值得投入。\n第 4、5 天可能會有一個輪廓浮出來，讓你心裡比較有底。",
    ambiguous: "接下來 7 天，留意那些沒有理由的小靠近。\n如果他主動開一個話題，那是火光還在。\n如果一切安靜，也請別責怪自己，慢慢把主控權拿回來。",
    general: "接下來 7 天，宇宙希望你少扛一點。\n選一件可以放下的事，讓生活有一個縫隙可以呼吸。\n你不需要一天就變好，先讓今天輕一點。"
  };

  const midnightSection: Record<TarotReadingTopic, string> = {
    love: "你不需要把話說得那麼漂亮，才值得被愛。\n真正靠近你的人，會願意聽見你還沒整理好的心。\n此刻的你，已經夠好了。",
    career: "那個一直說「再撐一下」的你，\n其實也很需要有人問一句：你還好嗎？\n今晚，先把肩膀放低一點。",
    ambiguous: "等一個還沒確定的人，很容易把心等得很小。\n但你不是只能等，你也可以慢慢選回自己。\n清楚的愛，不會永遠讓你猜。",
    general: "今晚先把那些沒說出口的話輕輕放下來。\n明天的你，會比今天多知道一點點。\n有些路不是白走，它正在悄悄改變未來。"
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
它只是想提醒你：累的時候，也可以慢慢走。
今晚先讓心靠岸，明天再往前一點點。`;
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

請使用繁體中文。語氣要像深夜電台裡真正的塔羅占卜師：溫柔、神秘、有陪伴感，像在低聲對提問者說話。
不要寫成分析報告，不要太像心理分析、職涯顧問或條列建議。不恐嚇、不絕對預言、不使用醫療或投資保證語氣。
${topicGuidance}

請把每張牌的牌組、正逆位、關鍵字與牌義真正融入解讀；不要只列牌名。若是三張牌，請把過去、現在、未來串成一條「現在狀態 → 宇宙提醒 → 行動建議」的脈絡。

輸出格式要求：
- 請用以下固定段落標題，保留 emoji。
- 每段最多 3 到 4 行，避免大段文字牆。
- 每段之間留空行。
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
    love: `這組牌面 ${cardNames} 像一封夜裡寄來的信。\n它不是要你立刻下結論，而是提醒你：關係裡有些沒說清楚的話，正在變成距離。\n這不是結束的宣判，而是邀請你更誠實地看見自己的心。`,
    career: `這組牌面 ${cardNames} 像把你帶到一個安靜的岔路口。\n往前有新的可能，往後是熟悉卻漸漸不夠滋養的地方。\n你不是迷路，你只是需要重新確認自己想把力氣交給哪裡。`,
    ambiguous: `這組牌面 ${cardNames} 像曖昧裡一盞忽明忽暗的小燈。\n你們都在等誰先靠近，也都怕一說清楚就失去現在的平衡。\n宇宙想問你：這份等待，有沒有也好好照顧到你？`,
    general: `這組牌面 ${cardNames} 像在替你的生活輕輕按下暫停。\n你有些地方已經做得很好，只是一直忘了承認。\n現在要看的，不是你還缺什麼，而是你終於可以放過哪裡。`
  };

  const innerSection: Record<TarotReadingTopic, string> = {
    love: "你真正不安的，可能不是對方回不回應。\n而是你不想再靠猜測，證明自己有沒有被選擇。\n這份渴望不貪心，它只是想被清楚地接住。",
    career: "你最累的，也許不是事情太多。\n而是你一直把努力交出去，卻很少問自己：這還是不是我要的方向？\n今晚先不用回答，先承認這個問題值得被聽見。",
    ambiguous: "你心裡其實已經感覺到一些答案。\n只是那個答案未必是你最想聽見的版本，所以你才一再等待更多訊號。\n宇宙不催你醒來，只陪你慢慢看清。",
    general: "你承受的比自己承認的更多。\n你習慣把需求放到最後，久了心就會變得很安靜。\n但安靜不代表沒事，它只是等你回頭抱抱自己。"
  };

  const unspokenSection: Record<TarotReadingTopic, string> = {
    love: "他沒有說出口的，也許不是不在乎。\n有時候沉默只是他還不懂怎麼靠近，或還沒準備好承擔靠近後的重量。\n但你的心不需要一直替他的沉默找理由。",
    career: "你沒對自己說出口的是：你其實已經感覺到某個方向不再適合。\n改變不用一次完成，也不用立刻推翻一切。\n先移動一小步，風就會從新的地方進來。",
    ambiguous: "對方可能比表面更在意你，只是他還在用忽冷忽熱保護自己。\n這不是要你無限理解他，而是提醒你看見：他現在能給的，和你需要的，是否真的相等。\n你的溫柔不該只用來等待。",
    general: "那些說不清的累，宇宙其實都聽見了。\n你不是想太多，你只是太久沒有被安靜地理解。\n今晚不用逞強，把心交還給自己一點。"
  };

  return `✨ 宇宙訊息

${questionLine}

${realStateSection[topic]}

🌙 情緒狀態

${innerSection[topic]}

💞 ${topic === "career" ? "工作提醒" : topic === "ambiguous" ? "曖昧訊息" : "關係提醒"}

${unspokenSection[topic]}

🕯️ 牌陣流動

過去的位置，像是在說：那些不安不是突然來的，是一段時間慢慢累積的回聲。
現在的位置提醒你，把重心先放回自己，不要讓外界的反應決定你的價值。
未來的位置則亮起一點微光：只要你願意做一個小選擇，故事就會開始鬆動。

🕯️ 七日走向

前 3 天，先讓自己離開反覆想像的房間，做一件能讓身體放鬆的小事。
第 4、5 天，某個訊號可能會變得清楚一點，不一定很大，但你會感覺得到。
第 6、7 天，請根據事實往前，不要只根據害怕或期待。

🐾 深夜悄悄話

你一直在等宇宙給答案，
但宇宙其實也在等你相信：
你心裡那個很小、很安靜的感覺，值得被認真對待。

☁️ 溫暖收尾

讓你安心的答案，
從來不需要你一個人用力想像出來。
它會在你停止責怪自己的那一刻，慢慢走近你。`;
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

請使用繁體中文。語氣像深夜電台裡真正的塔羅占卜師：溫柔、神秘、有陪伴感，像在低聲陪提問者整理心事。
可以有文學感，但不要煽情；要精準、溫柔、有重量。不恐嚇、不絕對預言、不使用醫療或投資保證語氣。
${topicGuidance}

「🐾 深夜悄悄話」是核心亮點，請寫得具體、有畫面感、能讓提問者感覺被深深看見，適合截圖分享，而不是泛泛的安慰。

請把每張牌的牌組、正逆位、關鍵字與牌義真正融入解讀；不要只列牌名，也不要把小阿爾克那寫得像大阿爾克那。每一張牌都要服務整體故事線。

三張牌必須整合成一條脈絡：
- 過去：原因 / 背景
- 現在：目前狀態
- 未來：接下來走向

輸出格式要求：
- 請用以下固定段落標題，保留 emoji。
- 每段最多 3 到 4 行，避免大段文字牆。
- 每段之間留空行。
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
  };
  const cards = normalizeCards(source.cards);
  const topic = isTopic(source.topic) ? source.topic : null;
  const question = typeof source.question === "string" ? source.question.trim().slice(0, 600) : "";
  const readingMode = isReadingMode(source.readingMode) ? source.readingMode : "premium";
  const anonymousId =
    typeof source.anonymousId === "string" ? source.anonymousId.slice(0, 128) : null;

  if (!cards) {
    return NextResponse.json({ error: "請提供 1 到 3 張有效牌卡。" }, { status: 400 });
  }

  if (!topic) {
    return NextResponse.json({ error: "請提供有效的解讀主題。" }, { status: 400 });
  }

  // ── 免費版（Firestore 限流，AI API 呼叫前檢查）────────────────────────────
  if (readingMode === "free") {
    const cookieStore = await cookies();
    const lineUserId = cookieStore.get("line_user_id")?.value ?? null;
    const ip = getRequestIp(request);
    const feature: RateLimitFeature = cards.length === 1 ? "single_tarot" : "three_card";

    try {
      const limitResult = await checkAndIncrementLimit({
        ip,
        anonymousId,
        lineUserId,
        feature,
      });
      if (!limitResult.allowed) {
        return NextResponse.json({ error: limitResult.message }, { status: 429 });
      }
    } catch (err) {
      // Firestore 不可用時 fail-open（不阻擋請求，記錄 log）
      console.error("[rate-limit] checkAndIncrementLimit failed:", err);
    }

    return NextResponse.json({
      readingMode,
      reading: buildFreeReading(cards, topic, question),
    });
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
    return NextResponse.json({ error: "宇宙訊號有點微弱，請稍後再試一次。" }, { status: 500 });
  }
}
