// Seeded random number generator for consistent daily generation
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function pick<T>(items: T[], seed: number): T {
  return items[Math.floor(seededRandom(seed) * items.length)];
}

function range(min: number, max: number, seed: number): number {
  return Math.floor(min + seededRandom(seed) * (max - min + 1));
}

export interface FortuneAspect {
  score: number;
  current: string;
  tip: string;
  action: string;
}

export interface DailyFortuneData {
  [key: string]: FortuneAspect;
  love: FortuneAspect;
  work: FortuneAspect;
  wealth: FortuneAspect;
  mood: FortuneAspect;
}

// 星座個性定義
type ZodiacPersonality = {
  name: string;
  traits: string[];
  toneModifier: (text: string) => string;
};

const zodiacPersonalities: Record<string, ZodiacPersonality> = {
  牡羊座: {
    name: "牡羊座",
    traits: ["熱情", "勇敢", "急進", "衝動"],
    toneModifier: (text) => text.replace(/不需要/g, "可以").replace(/慢慢/g, "一步步")
  },
  金牛座: {
    name: "金牛座",
    traits: ["穩定", "實際", "執著", "保守"],
    toneModifier: (text) => text.replace(/快速/g, "穩穩地").replace(/改變/g, "調整")
  },
  雙子座: {
    name: "雙子座",
    traits: ["靈活", "好奇", "多變", "善表達"],
    toneModifier: (text) => text.replace(/深入/g, "多角度").replace(/單一/g, "多元")
  },
  巨蟹座: {
    name: "巨蟹座",
    traits: ["敏感", "感性", "顧家", "情緒化"],
    toneModifier: (text) => text.replace(/理性/g, "感受").replace(/表達/g, "傾訴")
  },
  獅子座: {
    name: "獅子座",
    traits: ["自信", "大方", "領導", "驕傲"],
    toneModifier: (text) => text.replace(/放下/g, "展現").replace(/謙虛/g, "大膽")
  },
  處女座: {
    name: "處女座",
    traits: ["細心", "完美", "分析", "挑剔"],
    toneModifier: (text) => text.replace(/模糊/g, "清楚地").replace(/感覺/g, "觀察")
  },
  天秤座: {
    name: "天秤座",
    traits: ["平衡", "優雅", "猶豫", "和諧"],
    toneModifier: (text) => text.replace(/選擇/g, "權衡").replace(/快速/g, "深思")
  },
  天蠍座: {
    name: "天蠍座",
    traits: ["敏銳", "神祕", "執著", "深度"],
    toneModifier: (text) => text.replace(/表面/g, "深層").replace(/輕鬆/g, "探究")
  },
  射手座: {
    name: "射手座",
    traits: ["樂觀", "自由", "冒險", "理想"],
    toneModifier: (text) => text.replace(/限制/g, "探索").replace(/停留/g, "前進")
  },
  摩羯座: {
    name: "摩羯座",
    traits: ["務實", "持久", "嚴肅", "負責"],
    toneModifier: (text) => text.replace(/放鬆/g, "穩健").replace(/感覺/g, "計畫")
  },
  水瓶座: {
    name: "水瓶座",
    traits: ["理性", "創新", "獨立", "遠距"],
    toneModifier: (text) => text.replace(/感性/g, "理性").replace(/傳統/g, "新穎")
  },
  雙魚座: {
    name: "雙魚座",
    traits: ["夢幻", "同情", "逃避", "藝術"],
    toneModifier: (text) => text.replace(/現實/g, "夢想").replace(/理性/g, "直覺")
  }
};

// 愛情面向 - 根據種子產生變化
function generateLove(zodiacSign: string, daySeeds: { s1: number; s2: number; s3: number }): FortuneAspect {
  const personality = zodiacPersonalities[zodiacSign];

  const loveCurrents = [
    "你今天對關係細節特別敏感，這不是過度反應，而是你在照顧這份連結。",
    "關係裡的沉默今天有了新的意義，不是冷淡，而是彼此在重新調頻。",
    "你心裡有話想說，但還在衡量說出來的時機，信任會幫助你。",
    "愛的方式不只一種，今天你會看見對方用你沒注意過的方式靠近。",
    "今天的你對陪伴特別渴望，這是在提醒你也要好好陪伴自己。"
  ];

  const loveTips = [
    "真正的親密來自願意被看見，而不是不斷偽裝。",
    "先傾聽對方，答案往往在理解後才會浮現。",
    "放下猜測，用溫柔的問候取代無聲的期待。",
    "你值得被主動選擇，但也值得先選擇自己。",
    "關係需要呼吸，讓彼此有完整自己的空間。"
  ];

  const loveActions = [
    "傳一則溫柔的訊息，不要期待立即回應。",
    "準備一個對方會喜歡的小驚喜，哪怕再微小。",
    "主動約一個無壓力的見面，享受當下的陪伴。",
    "寫下對對方的感謝，即使不說出口，感受也會改變。",
    "給予對方三個真誠的讚美，看看能帶來什麼變化。"
  ];

  return {
    score: range(72, 92, daySeeds.s1),
    current: pick(loveCurrents, daySeeds.s1 + 100),
    tip: pick(loveTips, daySeeds.s2 + 100),
    action: pick(loveActions, daySeeds.s3 + 100)
  };
}

// 工作面向
function generateWork(zodiacSign: string, daySeeds: { s1: number; s2: number; s3: number }): FortuneAspect {
  const workCurrents = [
    "今天工作容易被瑣事打斷，真正累的其實是頻繁的轉換注意力。",
    "你有能力解決眼前的事，但先確認這件事是否真的值得你的力氣。",
    "今天可能有意外的機會出現，它會以小細節的形式靠近。",
    "一個挑戰今天會變得清晰，面對它比繞過它更省力。",
    "你的進度比昨天快，即使感受不到，也已經在往前了。"
  ];

  const workTips = [
    "優先處理最有影響力的一件事，其他的會自然就位。",
    "偶爾停下來深呼吸，才能重新看見工作的全貌。",
    "完成小于完美重要，先交出來再調整。",
    "你的直覺在工作上也很可信，相信它。",
    "幫助別人也是在肯定自己的價值。"
  ];

  const workActions = [
    "列出三個必做的事，只先完成第一個。",
    "和同事分享一個想法，看看會有什麼發展。",
    "暫停一個習慣性的反應，觀察有什麼改變。",
    "記錄今天完成的一件事，晚上回顧時會有意外的滿足。",
    "適時說不，為更重要的事保留能量。"
  ];

  return {
    score: range(68, 88, daySeeds.s1),
    current: pick(workCurrents, daySeeds.s1 + 200),
    tip: pick(workTips, daySeeds.s2 + 200),
    action: pick(workActions, daySeeds.s3 + 200)
  };
}

// 財運面向
function generateWealth(zodiacSign: string, daySeeds: { s1: number; s2: number; s3: number }): FortuneAspect {
  const wealthCurrents = [
    "今天適合檢視小額支出，那些讓你短暫安心卻沒被真正需要的消費。",
    "一筆意外的進帳可能會出現，但不要改變既定計畫。",
    "金錢在今天提醒你關於安全感和自由的平衡。",
    "你對收支的感受比以往更敏銳，信任這個訊號。",
    "今天適合為未來做點小準備，不需要一次到位。"
  ];

  const wealthTips = [
    "存錢是為了讓生活更安穩，不是為了無限延遲快樂。",
    "每一筆支出都在述說你的價值觀，選擇它們。",
    "財富不只是數字，也包括你對生活的掌控感。",
    "現在的投資會在某個時刻回報你，只要方向對。",
    "給予也是一種财富的流動，不用害怕。"
  ];

  const wealthActions = [
    "整理一筆固定支出，保留真正支持生活品質的部分。",
    "捐獻一個小額度，感受金錢的循環。",
    "記下今天節省的一筆錢，看看積累會帶來什麼。",
    "重新評估一個訂閱或會員，確認它還符合你的需求。",
    "用一筆錢犒賞自己，允許自己值得被好好對待。"
  ];

  return {
    score: range(65, 85, daySeeds.s1),
    current: pick(wealthCurrents, daySeeds.s1 + 300),
    tip: pick(wealthTips, daySeeds.s2 + 300),
    action: pick(wealthActions, daySeeds.s3 + 300)
  };
}

// 心情面向
function generateMood(zodiacSign: string, daySeeds: { s1: number; s2: number; s3: number }): FortuneAspect {
  const moodCurrents = [
    "你的心今天需要一點安靜，不是逃避，而是把太滿的感覺慢慢放回原位。",
    "有些情緒在冒出來，它們不是麻煩，而是在提醒你某些地方需要照顧。",
    "今天可能有個時刻會特別觸動你，讓它自然流過。",
    "你比想像中更平靜，那些擾亂都在表面，深處其實很穩。",
    "疲憊不是失敗的信號，它是身體在說需要暫停一下。"
  ];

  const moodTips = [
    "情緒是信息，不是故障，好好聽它說。",
    "允許自己今天不用很好，只需要真實。",
    "一個小的安定感就能改變整個下午。",
    "你的敏感是優勢，不是弱點。",
    "和自己相處，比想著怎麼被理解更重要。"
  ];

  const moodActions = [
    "給自己十分鐘不滑手機的空白，讓身體先安定下來。",
    "做一件讓身體感到安心的事，比如泡澡或走路。",
    "寫下今天的感受，不用整理成邏輯，只是傾倒。",
    "聽一首能撫慰你的音樂，陪自己度過難受的時刻。",
    "找一個信任的人傾訴，或者就靜靜地陪著自己。"
  ];

  return {
    score: range(75, 95, daySeeds.s1),
    current: pick(moodCurrents, daySeeds.s1 + 400),
    tip: pick(moodTips, daySeeds.s2 + 400),
    action: pick(moodActions, daySeeds.s3 + 400)
  };
}

export function generateDailyFortune(zodiacSign: string, date?: Date): DailyFortuneData {
  const today = date || new Date();
  const dateStr = today.toISOString().slice(0, 10);

  // 基於日期和星座生成穩定的種子
  const baseSeed = [...`${dateStr}-${zodiacSign}`].reduce((sum, char) => sum + char.charCodeAt(0), 0);

  // 為不同面向生成不同的種子
  const daySeeds = {
    s1: baseSeed + 1,
    s2: baseSeed + 2,
    s3: baseSeed + 3
  };

  return {
    love: generateLove(zodiacSign, daySeeds),
    work: generateWork(zodiacSign, daySeeds),
    wealth: generateWealth(zodiacSign, daySeeds),
    mood: generateMood(zodiacSign, daySeeds)
  };
}

export { zodiacPersonalities };
