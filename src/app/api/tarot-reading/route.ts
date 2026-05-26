import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_MODEL = "gpt-5.4-mini";
const validTopics = ["love", "career", "ambiguous", "general"] as const;
const validPositions = ["upright", "reversed"] as const;
const validSpreadPositions = ["past", "present", "future"] as const;
const validReadingModes = ["free", "premium"] as const;
const validZodiacs = ["牡羊座", "金牛座", "雙子座", "巨蟹座", "獅子座", "處女座", "天秤座", "天蠍座", "射手座", "摩羯座", "水瓶座", "雙魚座"] as const;

type TarotReadingTopic = (typeof validTopics)[number];
type TarotReadingPosition = (typeof validPositions)[number];
type TarotSpreadPosition = (typeof validSpreadPositions)[number];
type TarotReadingMode = (typeof validReadingModes)[number];
type ZodiacSign = (typeof validZodiacs)[number];

type TarotReadingCard = {
  name: string;
  position: TarotReadingPosition;
  spreadPosition?: TarotSpreadPosition;
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

function isZodiac(value: unknown): value is ZodiacSign {
  return typeof value === "string" && validZodiacs.includes(value as ZodiacSign);
}

function normalizeCards(cards: unknown): TarotReadingCard[] | null {
  if (!Array.isArray(cards) || cards.length === 0 || cards.length > 3) {
    return null;
  }

  const normalized = cards.map((card) => {
    if (!card || typeof card !== "object") {
      return null;
    }

    const source = card as { name?: unknown; position?: unknown; spreadPosition?: unknown };

    if (typeof source.name !== "string" || !source.name.trim() || !isPosition(source.position)) {
      return null;
    }

    return {
      name: source.name.trim(),
      position: source.position,
      spreadPosition: isSpreadPosition(source.spreadPosition) ? source.spreadPosition : undefined
    };
  });

  if (normalized.some((card) => card === null)) {
    return null;
  }

  return normalized as TarotReadingCard[];
}

function getTopicLabel(topic: TarotReadingTopic) {
  return {
    love: "感情",
    career: "工作",
    ambiguous: "曖昧",
    general: "生活與心情"
  }[topic];
}

function getTopicGuidance(topic: TarotReadingTopic) {
  return {
    love: "請偏向感情關係、情緒需求、關係中的真實問題與是否值得繼續投入。",
    career: "請偏向工作狀態、職涯選擇、機會判斷、卡住原因與接下來可採取的行動。",
    ambiguous: "請偏向曖昧關係、試探與拉扯、對方心態、訊息冷熱、是否該主動，以及如何保護自己的安全感。",
    general: "請偏向生活狀態、心情整理、目前課題與溫柔提醒。"
  }[topic];
}

function getZodiacGuidance(zodiac?: ZodiacSign) {
  if (!zodiac) {
    return "提問者沒有選擇星座，請以溫暖、清楚、不空泛的陪伴語氣回應。";
  }

  if (["巨蟹座", "雙魚座", "天蠍座"].includes(zodiac)) {
    return `${zodiac}：多一點情緒理解、安全感與被接住的語氣，但仍要給出清楚建議。`;
  }

  if (["獅子座", "牡羊座", "射手座"].includes(zodiac)) {
    return `${zodiac}：多一點行動建議、勇氣與鼓勵，提醒提問者把主導權拿回來。`;
  }

  if (["處女座", "摩羯座", "金牛座"].includes(zodiac)) {
    return `${zodiac}：多一點現實分析、步驟、界線與可執行的小行動。`;
  }

  return `${zodiac}：多一點思考整理、關係觀察、溝通脈絡與不急著定論的提醒。`;
}

function getSpreadLabels() {
  return {
    past: "過去：代表最近影響提問者的背景、情緒或原因",
    present: "現在：代表提問者目前的狀態與正在面對的事",
    future: "未來：代表接下來可能的走向與提醒"
  } satisfies Record<TarotSpreadPosition, string>;
}

function buildFreeReading(cards: TarotReadingCard[], topic: TarotReadingTopic, question: string, zodiac?: ZodiacSign) {
  const topicLabel = getTopicLabel(topic);
  const spreadLabels = getSpreadLabels();
  const cardLine = cards
    .map((card) => {
      const orientationLabel = card.position === "upright" ? "正位" : "逆位";
      const spreadLabel = card.spreadPosition ? spreadLabels[card.spreadPosition].split("：")[0] : "此刻";
      return `${spreadLabel}的 ${card.name}（${orientationLabel}）`;
    })
    .join("、");
  const questionLine = question ? `你放進宇宙的問題是：「${question}」` : "你沒有把問題說出口，但牌面仍接住了此刻的心情。";
  const zodiacLine = zodiac ? `${zodiac}的你，這次比較需要把感受和現實一起看，而不是只靠猜測撐著。` : "這次訊息會先從你此刻最在意的地方開始整理。";

  return `宇宙給你的簡短訊息

${questionLine}

目前狀況
這次牌面落在${topicLabel}的主題裡：${cardLine}。${zodiacLine}

一個可能原因
你可能已經感覺到某個地方不太穩，卻還在等更明確的證據。這不是你太敏感，而是心裡有一塊真的想被好好回應。

接下來建議
先做一件能讓你安心的小事：整理目前看得見的事實，再決定要不要往前一步。不要急著逼自己立刻有答案。`;
}

function getPremiumSections(topic: TarotReadingTopic) {
  if (topic === "career") {
    return [
      "你目前的工作狀況",
      "可能卡住的原因",
      "你內心真正累的地方",
      "過去 / 現在 / 未來整合解讀",
      "接下來 7 天的工作走向",
      "建議你先做的 1~3 件小事",
      "如果要轉職 / 換方向，現在適合觀察什麼",
      "一句溫暖但不空泛的提醒"
    ];
  }

  if (topic === "ambiguous") {
    return [
      "曖昧目前的拉扯狀態",
      "對方可能在想什麼",
      "你是不是想太多，或是真的感覺到什麼",
      "過去 / 現在 / 未來整合解讀",
      "接下來 7 天對方可能的互動",
      "你該不該主動",
      "你現在可以做的 3 件小事",
      "一句曖昧感金句"
    ];
  }

  return [
    "這段關係目前的狀態",
    "你在感情裡真正不安的地方",
    "對方可能的態度",
    "過去 / 現在 / 未來整合解讀",
    "接下來 7 天的感情走向",
    "你該主動還是先觀察",
    "關係提醒",
    "你現在可以做的 3 件小事",
    "一句深夜感金句"
  ];
}

function buildPremiumFallback(cards: TarotReadingCard[], topic: TarotReadingTopic, question: string, zodiac?: ZodiacSign) {
  const topicLabel = getTopicLabel(topic);
  const cardNames = cards.map((card) => `${card.name}（${card.position === "upright" ? "正位" : "逆位"}）`).join("、");
  const questionLine = question ? `你問的是：「${question}」` : "你把問題留在心裡，宇宙仍然把焦點放在你此刻最在意的關係。";
  const zodiacLine = zodiac ? `以${zodiac}的節奏來看，你現在需要的是能落地的安心感，而不是更多模糊猜測。` : "這次訊息會把感受和現實一起整理，不只停在牌義。";

  return `宇宙深夜訊息

目前狀況
${questionLine}
這組牌面 ${cardNames} 指向一個需要慢慢看清的${topicLabel}狀態。${zodiacLine}

真正卡住的地方
你累的可能不是單一事件，而是一直在「期待、觀察、失落、再說服自己」之間來回。宇宙想提醒你，真正重要的是看見事實，而不是逼自己變得更懂事。

過去 / 現在 / 未來整合解讀
過去的位置像是在說，最近影響你的背景不是突然發生的，而是累積了一段時間的感受。現在的位置提醒你先回到自己的需求，不要只追著外界反應跑。未來的位置則指出，接下來的走向會變得更清楚，但前提是你願意用行動整理界線。

接下來 7 天走向
未來 7 天適合觀察「事情有沒有變得更穩」，而不是只看一瞬間的情緒。若對方、工作或局勢願意給出更清楚的回應，你會感覺心裡比較安定；如果仍然模糊，就先把步伐放慢。

你現在可以做的 3 件小事
1. 寫下目前看得見的事實，不急著替空白處補故事。
2. 選一件你能掌控的小行動，先讓生活回到穩定。
3. 給自己一個期限觀察變化，不要無止境地等待。

深夜金句
「讓你安心的答案，不會只靠你一個人用力想像。」`;
}

function buildPremiumPrompt(cards: TarotReadingCard[], topic: TarotReadingTopic, question: string, zodiac?: ZodiacSign) {
  const topicLabel = getTopicLabel(topic);
  const topicGuidance = getTopicGuidance(topic);
  const zodiacGuidance = getZodiacGuidance(zodiac);
  const sections = getPremiumSections(topic).join("\n");

  const spreadLabels = getSpreadLabels();
  const cardText = cards
    .map((card, index) => {
      const orientationLabel = card.position === "upright" ? "正位" : "逆位";
      const spreadText = card.spreadPosition ? `｜牌位：${spreadLabels[card.spreadPosition]}` : "";
      return `${index + 1}. ${card.name}（${orientationLabel}）${spreadText}`;
    })
    .join("\n");
  const questionText = question ? `\n提問者寫下的心事：${question}` : "\n提問者沒有寫下問題，請以此刻的心情陪伴為主。";

  return `請為「宇宙偷偷話」網站寫一段塔羅解讀。

主題：${topicLabel}
星座：${zodiac ?? "未選擇"}
抽到的牌：
${cardText}
${questionText}

請使用繁體中文，語氣像深夜裡溫柔的朋友陪伴。偏感情與情緒陪伴，避免恐嚇、絕對化預言、過度玄學，也不要使用醫療、法律、投資保證語氣。
${topicGuidance}
${zodiacGuidance}
三張牌必須整合成一條脈絡：
- 過去：原因 / 背景
- 現在：目前狀態
- 未來：接下來走向
不要只是每張牌各自解釋，也不要只說「相信直覺」。請提供具體、可做、溫暖但不空泛的建議。

請用以下固定段落標題輸出：

宇宙深夜訊息
目前狀況
真正卡住的地方
過去 / 現在 / 未來整合解讀
${sections}`;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "請提供有效的解讀資料。" }, { status: 400 });
  }

  const source = body as { cards?: unknown; topic?: unknown; question?: unknown; readingMode?: unknown; zodiac?: unknown };
  const cards = normalizeCards(source.cards);
  const topic = isTopic(source.topic) ? source.topic : null;
  const question = typeof source.question === "string" ? source.question.trim().slice(0, 600) : "";
  const readingMode = isReadingMode(source.readingMode) ? source.readingMode : "premium";
  const zodiac = isZodiac(source.zodiac) ? source.zodiac : undefined;

  if (!cards) {
    return NextResponse.json({ error: "請提供 1 到 3 張有效牌卡。" }, { status: 400 });
  }

  if (!topic) {
    return NextResponse.json({ error: "請提供有效的解讀主題。" }, { status: 400 });
  }

  if (readingMode === "free") {
    return NextResponse.json({
      readingMode,
      reading: buildFreeReading(cards, topic, question, zodiac)
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      readingMode,
      reading: buildPremiumFallback(cards, topic, question, zodiac),
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
            "你是宇宙偷偷話的塔羅解讀文字夥伴。你的任務是把牌面整理成溫柔、清楚、不恐嚇的繁體中文陪伴訊息。"
        },
        {
          role: "user",
          content: buildPremiumPrompt(cards, topic, question, zodiac)
        }
      ],
      max_output_tokens: 2600
    });

    const reading = response.output_text?.trim();

    if (!reading) {
      return NextResponse.json({ error: "宇宙訊息暫時沒有成形，請稍後再試。" }, { status: 502 });
    }

    return NextResponse.json({
      readingMode,
      reading
    });
  } catch (error) {
    console.error("Tarot reading failed:", error);
    return NextResponse.json({ error: "宇宙訊號有點微弱，請稍後再試一次。" }, { status: 500 });
  }
}
