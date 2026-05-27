import { tarotCards, type TarotCard } from "@/data/tarotCards";

export type TarotOrientation = "upright" | "reversed";
export type TarotTopic = "愛情" | "工作" | "生活";

export type DrawnTarotCard = TarotCard & {
  orientation: TarotOrientation;
  orientationLabel: "正位" | "逆位";
  position?: "過去" | "現在" | "未來";
  cosmicMessage: string;
};

const positions: DrawnTarotCard["position"][] = ["過去", "現在", "未來"];

function getTopicMessage(card: TarotCard, topic: TarotTopic) {
  if (topic === "工作") {
    return card.career;
  }

  if (topic === "生活") {
    return card.advice;
  }

  return card.love;
}

function createCosmicMessage(card: TarotCard, orientation: TarotOrientation, topic: TarotTopic) {
  const baseReading = orientation === "upright" ? card.uprightMeaning : card.reversedMeaning;
  return `${baseReading} ${getTopicMessage(card, topic)}`;
}

export function drawCards(count = 1, topic: TarotTopic = "愛情") {
  const shuffled = [...tarotCards].sort(() => Math.random() - 0.5);

  return shuffled.slice(0, Math.min(Math.max(count, 1), 3)).map((card, index) => {
    const orientation: TarotOrientation = Math.random() > 0.5 ? "upright" : "reversed";

    return {
      ...card,
      orientation,
      orientationLabel: orientation === "upright" ? "正位" : "逆位",
      position: count === 3 ? positions[index] : undefined,
      cosmicMessage: createCosmicMessage(card, orientation, topic)
    } satisfies DrawnTarotCard;
  });
}

export { tarotCards };
