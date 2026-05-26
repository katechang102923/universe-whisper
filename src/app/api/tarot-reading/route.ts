import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_MODEL = "gpt-5.4-mini";
const validTopics = ["love", "career", "general"] as const;
const validPositions = ["upright", "reversed"] as const;

type TarotReadingTopic = (typeof validTopics)[number];
type TarotReadingPosition = (typeof validPositions)[number];

type TarotReadingCard = {
  name: string;
  position: TarotReadingPosition;
};

function isTopic(value: unknown): value is TarotReadingTopic {
  return typeof value === "string" && validTopics.includes(value as TarotReadingTopic);
}

function isPosition(value: unknown): value is TarotReadingPosition {
  return typeof value === "string" && validPositions.includes(value as TarotReadingPosition);
}

function normalizeCards(cards: unknown): TarotReadingCard[] | null {
  if (!Array.isArray(cards) || cards.length === 0 || cards.length > 3) {
    return null;
  }

  const normalized = cards.map((card) => {
    if (!card || typeof card !== "object") {
      return null;
    }

    const source = card as { name?: unknown; position?: unknown };

    if (typeof source.name !== "string" || !source.name.trim() || !isPosition(source.position)) {
      return null;
    }

    return {
      name: source.name.trim(),
      position: source.position
    };
  });

  if (normalized.some((card) => card === null)) {
    return null;
  }

  return normalized as TarotReadingCard[];
}

function buildPrompt(cards: TarotReadingCard[], topic: TarotReadingTopic, question: string) {
  const topicLabel = {
    love: "感情",
    career: "工作",
    general: "生活與心情"
  }[topic];

  const cardText = cards.map((card, index) => `${index + 1}. ${card.name}（${card.position === "upright" ? "正位" : "逆位"}）`).join("\n");
  const questionText = question ? `\n提問者寫下的心事：${question}` : "\n提問者沒有寫下問題，請以此刻的心情陪伴為主。";

  return `請為「宇宙偷偷話」網站產生一段塔羅解讀。

主題：${topicLabel}
抽到的牌：
${cardText}
${questionText}

請使用繁體中文，語氣像深夜裡溫柔的朋友陪伴。避免恐嚇、絕對化預言、過度玄學，也不要使用醫療、法律、投資保證語氣。

請用以下固定段落標題輸出：

今日核心訊息
整體解讀
每張牌解析
建議
適合截圖分享的一句話`;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "尚未設定 OPENAI_API_KEY，請先在 .env.local 或 Vercel Environment Variables 新增後再試。" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "請提供有效的解讀資料。" }, { status: 400 });
  }

  const source = body as { cards?: unknown; topic?: unknown; question?: unknown };
  const cards = normalizeCards(source.cards);
  const topic = isTopic(source.topic) ? source.topic : null;
  const question = typeof source.question === "string" ? source.question.trim().slice(0, 600) : "";

  if (!cards) {
    return NextResponse.json({ error: "請提供 1 到 3 張有效牌卡。" }, { status: 400 });
  }

  if (!topic) {
    return NextResponse.json({ error: "請提供有效的解讀主題。" }, { status: 400 });
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
          content: buildPrompt(cards, topic, question)
        }
      ],
      max_output_tokens: 1200
    });

    const reading = response.output_text?.trim();

    if (!reading) {
      return NextResponse.json({ error: "宇宙訊息暫時沒有成形，請稍後再試。" }, { status: 502 });
    }

    return NextResponse.json({
      reading,
      model
    });
  } catch (error) {
    console.error("Tarot reading failed:", error);
    return NextResponse.json({ error: "宇宙訊號暫時不穩，請稍後再試。" }, { status: 500 });
  }
}
