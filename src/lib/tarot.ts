import { tarotCards, type TarotCard, type TarotTopicKey } from "@/data/tarotCards";

export type TarotOrientation = "upright" | "reversed";
export type TarotTopic = "愛情" | "工作" | "生活" | "財運";

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

/**
 * 財運專用牌義：依牌組（suit）切換語境，保留正逆位差異。
 * 不沿用 love/work/life，避免財運被講成工作/資源管理。
 *  - pentacles：金錢、資產、現金流、實際資源
 *  - wands：行動、衝動、開源、副業、投資動能
 *  - cups：情緒消費、財務安全感、金錢焦慮
 *  - swords：判斷、風險、資訊、合約、決策
 *  - major：大方向、週期、風險階段、轉折
 * 一般財運語境（收入／支出／現金流／存款／財務壓力），不混入「進場／加碼／停損／量能」等股市操作術語。
 */
function getFinanceTopicMessage(card: TarotCard, orientation: TarotOrientation): string {
  const up = orientation === "upright";
  switch (card.suit) {
    case "pentacles":
      return up
        ? "在財運上，這張錢幣牌指向實際的金錢與資產：收入、存款或現金流正處在能穩健累積的位置，把資源放在看得見、握得住的地方會更安心。"
        : "在財運上，這張錢幣牌逆位提醒你資產或現金流有鬆動：可能是存款被某筆固定支出吃掉，先盤點實際數字，把漏掉的地方補起來。";
    case "wands":
      return up
        ? "在財運上，這張權杖牌帶著行動與開源的能量：適合主動為收入做點什麼，副業或新的賺錢動能正在被點燃，願意行動就會帶來進帳。"
        : "在財運上，這張權杖牌逆位提醒你衝動容易讓錢留不住：開源的熱度還在，但少了規劃，先把想衝的念頭緩一緩，確認真的划算再投入。";
    case "cups":
      return up
        ? "在財運上，這張聖杯牌談的是金錢帶來的安全感：當下的收支讓你心裡踏實，也提醒你別把花費和情緒綁在一起，先分清楚需要與想要。"
        : "在財運上，這張聖杯牌逆位指向情緒性消費或金錢焦慮：花錢可能是在補一個情緒缺口，先看清那份不安從哪裡來，財務壓力會跟著鬆開。";
    case "swords":
      return up
        ? "在財運上，這張寶劍牌偏向判斷與資訊：適合用理性重新檢視合約、帳單或一筆財務決策，把數字和條件看清楚，比憑感覺決定更穩。"
        : "在財運上，這張寶劍牌逆位提醒你資訊或判斷可能有盲點：合約細節、隱藏費用或一個沒算清楚的決定正在增加風險，先確認再簽、再付。";
    case "major":
      return up
        ? "在財運上，這張大牌指向較大的方向與週期：你正處在財務轉折或重新配置資源的階段，看的是長線的趨勢，而不是一兩筆進出。"
        : "在財運上，這張大牌逆位提醒你正卡在一個財務週期的低點：大方向還沒明朗，先別急著做重大財務決定，等局勢清楚再走下一步。";
    default:
      return up
        ? "在財運上，這張牌提醒你先把收入與支出的全貌看清楚，資源放對位置，財務空間才會慢慢打開。"
        : "在財運上，這張牌逆位提醒你財務還有些地方沒理清，先守住現金流，把卡住的支出找出來再做決定。";
  }
}

function getTopicMessage(card: TarotCard, topic: TarotTopic, orientation: TarotOrientation) {
  if (topic === "財運") {
    return getFinanceTopicMessage(card, orientation);
  }
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
