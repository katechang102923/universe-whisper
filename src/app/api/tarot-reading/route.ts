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

  return `宇宙給你的簡短訊息

${questionLine}

目前狀況
這次牌面落在${topicLabel}的主題裡：${cardLine}。這次訊息會先從你此刻最在意的地方開始整理。

一個可能原因
你可能已經感覺到某個地方不太穩，卻還在等更明確的證據。這不是你太敏感，而是心裡有一塊真的想被好好回應。

接下來建議
先做一件能讓你安心的小事：整理目前看得見的事實，再決定要不要往前一步。不要急著逼自己立刻有答案。`;
}

// ── 廣告解鎖版（中長版，含情緒分析、關係分析、七日走向、深夜訊息）────────

function buildAdFallback(cards: TarotReadingCard[], topic: TarotReadingTopic, question: string) {
  const topicLabel = getTopicLabel(topic);
  const cardNames = cards.map((c) => `${c.name}（${c.position === "upright" ? "正位" : "逆位"}）`).join("、");
  const questionLine = question ? `你問的是：「${question}」` : "你把問題留在心裡，宇宙仍然把焦點放在你此刻最在意的事。";

  const emotionSection: Record<TarotReadingTopic, string> = {
    love: "你不只是在等一個人的回應，你是在等一種被放在心上的感覺。最近你可能一直在做同一件事：翻回去看你們的對話、試著判斷最近有沒有什麼不對勁。這個循環讓你比較累，但這也代表你確實在乎。牌面看見的是：你現在的情緒需要一個出口，而不是更多的分析。",
    career: "你現在對工作的情緒可能比你自己說出來的更複雜。你告訴自己「還好，再撐一下」，但有一個聲音在更裡面說：我不確定這個方向是不是我真正要的。這個聲音不是負能量，而是你的直覺在問你一個重要的問題。",
    ambiguous: "曖昧最消耗人的不是等待本身，而是那種「我不確定自己有沒有資格不開心」的感覺。你現在可能就在這裡。每次他有回應的時候你告訴自己好像還不錯，每次他沒有主動的時候你又覺得是不是自己想太多了。這種拉扯比直接的情傷還要累。",
    general: "你現在的情緒比你自己想像的更疲憊。不是大事，是那種每天一點一點累積的感覺。你一直在照顧很多事情，但好像沒有人在照顧你。這組牌面 " + cardNames + " 正在提醒你，是時候把注意力轉回自己身上了。"
  };

  const relationshipSection: Record<TarotReadingTopic, string> = {
    love: `這組牌面 ${cardNames} 在${topicLabel}上呈現的是：你們之間有真實的情感基礎，但目前的溝通模式讓彼此的距離感稍微拉開了。對方不一定是故意冷淡，更可能是他有一些自己還沒整理好的事。你的感受是真的，對方的距離也不代表不在乎，但這段關係需要一個更清楚的節點。先把焦點拉回你自己的需求，問問自己：這段關係有沒有在給你你真正需要的東西。`,
    career: `這組牌面 ${cardNames} 在工作上顯示的是：你目前處於一個蓄力與等待的交接點。有一件事情還沒落定，讓你無法完全放鬆。這不代表要立刻行動，但也不適合繼續觀望太久。現在的卡住有一部分是外在環境造成的，另一部分是你還在評估自己真正要的方向。這兩件事需要分開來看。`,
    ambiguous: `這組牌面 ${cardNames} 呈現的曖昧狀態是：雙方都有感覺，但誰都還沒把話說清楚。對方在這段關係裡的參與是真實的，他的顧慮也是真實的。問題不是他喜不喜歡你，而是他目前有沒有能力往前走一步。你可以繼續等，但等待需要有一個你自己設定的期限，而不是無止境地配合對方的節奏。`,
    general: `這組牌面 ${cardNames} 說的是你和目前生活狀態之間的關係。你有一些地方很努力，但那個努力好像沒有得到對等的回應。這不完全是你的問題，這個階段本來就比較像是在過關卡。走過去之後，你會看見一些之前看不見的東西，但現在需要先找到一個讓自己喘得過氣來的方式。`
  };

  const sevenDaySection: Record<TarotReadingTopic, string> = {
    love: "接下來 7 天，感情上比較值得觀察的是「對方的主動程度有沒有變化」，而不是你要不要主動。目前的狀態讓你先保持穩定比較重要，等第 4、5 天再看看方向。如果一切如常，代表現在的節奏還可以繼續；如果對方出現沒有理由的小靠近，那就是一個可以往前的訊號。",
    career: "接下來 7 天是一個比較適合「整理」而不是「推進」的週期。先把手邊的事情做穩，不要在還沒確定方向之前就貿然出手。第 4 到 5 天左右可能會出現一個比較明確的感受——不管是某件事終於落地了，還是某個問題終於有了一個輪廓。讓它自然發生。",
    ambiguous: "接下來 7 天，建議你觀察的是：對方有沒有在沒有理由的情況下主動找你說話。不是正式的約見面，而是那種隨機的、小小的靠近。如果有，這是一個好的訊號。如果沒有，你需要認真考慮自己還願意等多久，而不是一直說「再看看」。",
    general: "接下來 7 天，你需要的不是更多計畫，而是讓自己有一點點喘息的空間。選一件可以放掉的事，不要什麼都扛。大概在第 5 天左右會有一個比較輕一點的感覺，在那之前先讓自己把腳步放慢一點。"
  };

  const midnightSection: Record<TarotReadingTopic, string> = {
    love: "「你不需要把話說得那麼漂亮才值得被愛。此刻的你，已經夠了。」",
    career: "「那個一直說『再撐一下』的你，其實也需要有人問：你還好嗎？」",
    ambiguous: "「等一個還沒確定的人，本質上是你在用他的名字放自己的感情。你值得一個更清楚的答案。」",
    general: "「今晚先把那些沒說出口的話輕輕放下來。明天的你，會比今天多知道一點點。」"
  };

  return `宇宙完整訊息

${questionLine}

情緒分析
${emotionSection[topic]}

關係分析
${relationshipSection[topic]}

七日走向
${sevenDaySection[topic]}

深夜訊息
${midnightSection[topic]}`;
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

請使用繁體中文，語氣像深夜裡溫柔的朋友陪伴。偏感情與情緒陪伴，不恐嚇、不絕對預言、不使用醫療或投資保證語氣。
${topicGuidance}

請把每張牌的牌組、正逆位、關鍵字與牌義真正融入解讀；不要只列牌名。若是三張牌，請把過去、現在、未來串成一條「現在狀態 → 宇宙提醒 → 行動建議」的脈絡。

請用以下固定段落標題輸出，每段約 100-180 字，有具體感、情緒共鳴、不空泛：

宇宙完整訊息
情緒分析
關係分析
七日走向
深夜訊息`;
}

// ── Premium 版（深層文學版，含「對方沒說出口的話」）────────────────────────

function getPremiumSections(topic: TarotReadingTopic): string[] {
  if (topic === "career") {
    return [
      "工作目前真實的處境",
      "你最累的其實不是工作本身",
      "你一直沒對自己說出口的事",
      "過去 / 現在 / 未來整合解讀",
      "接下來 7 天能量完整走向",
      "你最需要聽見的一件事",
      "今晚陪你的話"
    ];
  }

  if (topic === "ambiguous") {
    return [
      "這段曖昧目前的真實狀態",
      "你自己還沒承認的那一部分",
      "對方心裡真正在想什麼（他沒說出口的）",
      "過去 / 現在 / 未來整合解讀",
      "接下來 7 天互動完整走向",
      "你最需要聽見的一件事",
      "今晚陪你的話"
    ];
  }

  return [
    "這段關係目前真實的樣子",
    "你自己還沒面對的那一部分",
    "對方真正沒說出口的話",
    "過去 / 現在 / 未來整合解讀",
    "接下來 7 天完整走向",
    "你最需要聽見的一件事",
    "今晚陪你的話"
  ];
}

function buildPremiumFallback(cards: TarotReadingCard[], topic: TarotReadingTopic, question: string) {
  const topicLabel = getTopicLabel(topic);
  const cardNames = cards.map((card) => `${card.name}（${card.position === "upright" ? "正位" : "逆位"}）`).join("、");
  const questionLine = question ? `你問的是：「${question}」` : "你把問題留在心裡，宇宙仍然把焦點放在你此刻最在意的關係。";

  const realStateSection: Record<TarotReadingTopic, string> = {
    love: `這組牌面 ${cardNames} 呈現的感情狀態，比你以為的更需要被正視。你們之間有一些話還沒說清楚，而那些話正在以「距離感」的形式出現。這不是感情快要結束的訊號，而是這段關係在問你：你們是否還願意往更真實的地方走一步。`,
    career: `這組牌面 ${cardNames} 說的是你目前工作狀態的真實面。你現在的處境比表面看起來更像是一個岔路口——往前是一個你還沒完全確定的方向，往後是你已經開始感到不夠充實的地方。這個卡住，是你的內在在要求一個答案。`,
    ambiguous: `這組牌面 ${cardNames} 顯示的曖昧狀態，比你意識到的更接近一個轉折點。雙方都在等對方開口，但誰都害怕先說清楚之後會失去現在這種若有似無的平衡。這個平衡本身，就是目前最需要被打破的事。`,
    general: `這組牌面 ${cardNames} 說的是你和目前生活之間最真實的對話。你有一些地方做得比你自己承認的要好很多，但你也有一個地方一直在逃避——那個地方就是你接下來需要認真面對的核心。`
  };

  const innerSection: Record<TarotReadingTopic, string> = {
    love: "你還沒完全面對的那一部分是：你一直在試著說服自己「這樣就夠了」，但你真正想要的，其實是一種不用猜測、不用試探、被清楚選擇的感覺。那不是要求太多，那是你知道自己值得的東西。",
    career: "你最累的其實不是工作的量，而是你一直在用努力來填補一個你還沒回答的問題：這是你真正想做的事嗎？這個問題沒有一個立刻的答案，但它值得你停下來，安靜地問一次。",
    ambiguous: "你自己還沒承認的是：你已經有答案了，只是你還沒準備好接受那個答案可能不是你想要的版本。你還在等更多的訊號來說服自己繼續等，但宇宙想提醒你，你已經看到的那些訊號，已經足夠了。",
    general: "你一直沒有對自己說清楚的是：你現在承受的比你應該承受的要多。你習慣了把自己的需求放到最後，但這一次，那個習慣正在消耗你真正需要拿來做別的事情的能量。"
  };

  const unspokenSection: Record<TarotReadingTopic, string> = {
    love: "他真正沒說出口的話，可能是這樣的：他也在等你，只是他比你更擅長把等待包裝成冷靜。在你看不見的地方，他偶爾也翻開你們的對話，只是每次都說服自己還不是時候。他的沉默不一定是不在乎，更多時候是因為他在這件事上比你更害怕被拒絕。",
    career: "你一直沒跟自己說出口的是：你其實早就知道答案了，只是那個答案代表你需要改變，而改變讓你害怕。你怕改了之後還是不對，不如先留在現在熟悉的不舒服裡。但宇宙說：那個改變，比你以為的要小。",
    ambiguous: "他沒有說的，可能是：你比他表現出來的更讓他在意。他只是不確定自己準備好了沒有，所以用若即若離來測試你的耐心，雖然他可能沒有意識到自己在做這件事。那種拉距不是遊戲，是他在用行動問你：如果我一直這樣，你還會在嗎？",
    general: "你沒有說出口的，宇宙聽見了。那個「好累但說不出來哪裡累」的感覺，那個「不知道自己要什麼但就是覺得少了什麼」的空缺——那不是你想太多，那是你的靈魂在告訴你，你需要的下一步是什麼。"
  };

  return `宇宙深夜訊息 Plus

${questionLine}

這段${topicLabel}目前真實的樣子
${realStateSection[topic]}

你自己還沒面對的那一部分
${innerSection[topic]}

${topic === "career" ? "你一直沒對自己說出口的事" : topic === "ambiguous" ? "對方心裡真正在想什麼" : "對方真正沒說出口的話"}
${unspokenSection[topic]}

過去 / 現在 / 未來整合解讀
過去的位置說的是：最近讓你感到不穩的，不是突然發生的一件事，而是一段時間以來慢慢累積的感受。現在的位置提醒你：此刻你需要的是先回到自己的重心，不要讓外界的反應主導你的情緒。未來的位置指出，接下來的走向會比現在清楚，但前提是你願意先停止等待一個完美的時機，然後做出一個哪怕很小的選擇。

接下來 7 天完整走向
第 1 到 3 天，先讓自己從分析模式裡退出來，做一件完全和這件事無關的事，給自己一點空白。第 4 到 5 天是這個週期的能量高點，如果有任何訊號出現，最可能在這個時間點。第 6 到 7 天，回頭看看這一週有什麼變化，然後根據你觀察到的事實，而不是你希望的故事，做一個小小的判斷。

你最需要聽見的一件事
你一直在問宇宙答案，但你需要的不是答案，而是允許自己已經知道的那個答案是真的。

今晚陪你的話
「讓你安心的答案，從來不需要你一個人用力想像出來——它會在你停止逃跑的那一刻，自己走到你面前。」`;
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

請使用繁體中文。語氣像深夜裡最懂你的朋友，同時帶有文學感——不是煽情，而是精準、溫柔、有重量。不恐嚇、不絕對預言、不使用醫療或投資保證語氣。
${topicGuidance}

「對方真正沒說出口的話」（或工作主題的「你一直沒對自己說出口的事」）這個段落是核心亮點，請寫得具體、有畫面感、能讓提問者感覺被深深看見，而不是泛泛的安慰。

請把每張牌的牌組、正逆位、關鍵字與牌義真正融入解讀；不要只列牌名，也不要把小阿爾克那寫得像大阿爾克那。每一張牌都要服務整體故事線。

三張牌必須整合成一條脈絡：
- 過去：原因 / 背景
- 現在：目前狀態
- 未來：接下來走向

請用以下固定段落標題輸出，每段 100-200 字，整體帶有深夜陪伴文學的氣質：

宇宙深夜訊息 Plus
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
