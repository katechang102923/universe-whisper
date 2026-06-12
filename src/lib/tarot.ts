import { tarotCards, type TarotCard, type TarotTopicKey } from "@/data/tarotCards";

export type TarotOrientation = "upright" | "reversed";
export type TarotTopic = "愛情" | "工作" | "生活";

export type DrawnTarotCard = TarotCard & {
  orientation: TarotOrientation;
  orientationLabel: "正位" | "逆位";
  position?: "過去" | "現在" | "未來";
  cosmicMessage: string;
};

const positions: DrawnTarotCard["position"][] = ["過去", "現在", "未來"];

// ── 隨機來源 ────────────────────────────────────────────────────────────────────
// 優先用密碼學等級亂數（瀏覽器 / Node 皆有 globalThis.crypto），不可用則退回 Math.random。
function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj?.getRandomValues) {
    // 去除模數偏差：丟棄落在不可整除尾段的取樣
    const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
    const buf = new Uint32Array(1);
    let v = 0;
    do {
      cryptoObj.getRandomValues(buf);
      v = buf[0];
    } while (v >= limit);
    return v % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

/** Fisher–Yates 洗牌（取代有偏差且不穩定的 sort(()=>Math.random()-0.5)）*/
function shuffle<T>(input: readonly T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getTopicKey(topic: TarotTopic): TarotTopicKey {
  if (topic === "工作") {
    return "work";
  }

  if (topic === "生活") {
    return "life";
  }

  return "love";
}

function getTopicMessage(card: TarotCard, topic: TarotTopic, orientation: TarotOrientation) {
  return card.meanings[getTopicKey(topic)][orientation];
}

function createCosmicMessage(card: TarotCard, orientation: TarotOrientation, topic: TarotTopic) {
  const baseReading = orientation === "upright" ? card.uprightMeaning : card.reversedMeaning;
  return `${baseReading} ${getTopicMessage(card, topic, orientation)}`;
}

export function drawCards(count = 1, topic: TarotTopic = "愛情") {
  // 無放回抽樣：均勻洗牌後取前 N 張，保證同一次不重複、每次重新抽
  const shuffled = shuffle(tarotCards);

  return shuffled.slice(0, Math.min(Math.max(count, 1), 3)).map((card, index) => {
    const orientation: TarotOrientation = randomInt(2) === 0 ? "upright" : "reversed";

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
