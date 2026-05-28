import { NextResponse } from "next/server";
import { drawCards, type TarotTopic } from "@/lib/tarot";

const modeToCardCount = {
  single_tarot: 1,
  three_card: 3,
} as const;

type TarotMode = keyof typeof modeToCardCount;

function normalizeTopic(topic: unknown): TarotTopic {
  if (topic === "工作") return "工作";
  if (topic === "生活") return "生活";
  return "愛情";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const mode = (body.mode ?? "single_tarot") as TarotMode;
  const topic = normalizeTopic(body.topic);

  if (!modeToCardCount[mode]) {
    return NextResponse.json({ error: "不支援的抽牌模式。" }, { status: 400 });
  }

  const cards = drawCards(modeToCardCount[mode], topic);

  return NextResponse.json({
    mode,
    topic,
    question: body.question ?? "",
    cards,
    aiRequired: false,
    storage: {
      collection: "tarot_logs",
      ready: true,
    },
  });
}
