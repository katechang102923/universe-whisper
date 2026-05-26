import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_MODEL = "gpt-5.4-mini";
const validTopics = ["love", "career", "ambiguous", "general"] as const;
const validPositions = ["upright", "reversed"] as const;
const validSpreadPositions = ["past", "present", "future"] as const;
const validReadingModes = ["free", "premium"] as const;

type TarotReadingTopic = (typeof validTopics)[number];
type TarotReadingPosition = (typeof validPositions)[number];
type TarotSpreadPosition = (typeof validSpreadPositions)[number];
type TarotReadingMode = (typeof validReadingModes)[number];

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

function getSpreadLabels() {
  return {
    past: "過去：代表最近影響提問者的背景、情緒或原因",
    present: "現在：代表提問者目前的狀態與正在面對的事",
    future: "未來：代表接下來可能的走向與提醒"
  } satisfies Record<TarotSpreadPosition, string>;
}

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
  const questionLine = question ? `你放進宇宙的問題是：「${question}」` : "你沒有把問題說出口，但牌面仍接住了此刻的心情。";

  return `宇宙給你的簡短訊息

${questionLine}

這次牌面落在${topicLabel}的能量裡：${cardLine}。

它提醒你先把心慢下來，不必急著替所有沉默找答案。接下來可以先觀察對方的行動，也照顧自己真正想被理解的地方。`;
}

function buildPremiumFallback(cards: TarotReadingCard[], topic: TarotReadingTopic, question: string) {
  const topicLabel = getTopicLabel(topic);
  const cardNames = cards.map((card) => `${card.name}（${card.position === "upright" ? "正位" : "逆位"}）`).join("、");
  const questionLine = question ? `你問的是：「${question}」` : "你把問題留在心裡，宇宙仍然把焦點放在你此刻最在意的關係。";
  const ambiguousLine =
    topic === "ambiguous"
      ? "這次訊息特別落在曖昧裡的試探、忽冷忽熱與主動界線：你可以觀察對方是否願意穩定靠近，而不是只在氣氛剛好的時候丟出一點甜。"
      : "";

  return `宇宙深夜訊息

更長更細的整體解讀
${questionLine}
這組牌面 ${cardNames} 指向一個溫柔但需要誠實面對的狀態：你很在意答案，但真正困住你的，可能不是對方一句話，而是你一直在猜測裡消耗自己。${topicLabel}的主題裡，牌面提醒你把注意力放回「對方是否用行動讓你安心」。
${ambiguousLine}

感情專向分析
你現在需要的不是用力證明自己值得被愛，而是看見這段關係有沒有讓你變得更穩定。若互動忽冷忽熱，先不要急著把所有責任攬到自己身上。

曖昧分析
曖昧裡最迷人的地方是想像，最累人的地方也是想像。這次牌面像在提醒你：可以心動，但不要只靠一句晚安或一次靠近就交出全部安全感。

對方內心可能狀態
對方可能有好感，也可能享受你們之間的靠近，但心裡還沒有完全整理好自己的位置。請先看他是否願意穩定回應，而不是只在氣氛好的時候出現。

接下來 7 天走向
未來 7 天適合放慢節奏，觀察訊息頻率、主動程度與實際邀約。如果對方願意往前一步，你會感覺到關係變得更清楚；如果仍然模糊，也是在提醒你不要把自己留在等待裡太久。

關係提醒
別用焦慮替對方補完答案。真正值得靠近的人，會讓你的心變得安靜，而不是讓你反覆懷疑自己。

你該不該主動
可以輕輕主動一次，但不要連續追問。給出一個自然的訊號後，把空間留給對方回應。你不是在求一個答案，而是在看這段關係是否願意一起往前。

一句適合截圖分享的深夜金句
「真正靠近你的人，不會讓你一直猜自己是不是被放在心上。」`;
}

function buildPremiumPrompt(cards: TarotReadingCard[], topic: TarotReadingTopic, question: string) {
  const topicLabel = getTopicLabel(topic);
  const topicGuidance = getTopicGuidance(topic);

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
抽到的牌：
${cardText}
${questionText}

請使用繁體中文，語氣像深夜裡溫柔的朋友陪伴。偏感情與情緒陪伴，避免恐嚇、絕對化預言、過度玄學，也不要使用醫療、法律、投資保證語氣。
${topicGuidance}
如果牌卡有牌位，請在「每張牌解析」中明確結合牌位解讀，不要只單純解釋牌義。

請用以下固定段落標題輸出：

宇宙深夜訊息
更長更細的整體解讀
每張牌解析
感情專向分析
曖昧分析
對方內心可能狀態
接下來 7 天走向
關係提醒
你該不該主動
一句適合截圖分享的深夜金句`;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "請提供有效的解讀資料。" }, { status: 400 });
  }

  const source = body as { cards?: unknown; topic?: unknown; question?: unknown; readingMode?: unknown };
  const cards = normalizeCards(source.cards);
  const topic = isTopic(source.topic) ? source.topic : null;
  const question = typeof source.question === "string" ? source.question.trim().slice(0, 600) : "";
  const readingMode = isReadingMode(source.readingMode) ? source.readingMode : "premium";

  if (!cards) {
    return NextResponse.json({ error: "請提供 1 到 3 張有效牌卡。" }, { status: 400 });
  }

  if (!topic) {
    return NextResponse.json({ error: "請提供有效的解讀主題。" }, { status: 400 });
  }

  if (readingMode === "free") {
    return NextResponse.json({
      readingMode,
      reading: buildFreeReading(cards, topic, question)
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;

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
            "你是宇宙偷偷話的塔羅解讀文字夥伴。你的任務是把牌面整理成溫柔、清楚、不恐嚇的繁體中文陪伴訊息。"
        },
        {
          role: "user",
          content: buildPremiumPrompt(cards, topic, question)
        }
      ],
      max_output_tokens: 2200
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
