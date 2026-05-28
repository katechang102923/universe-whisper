export type TarotSuit = "major" | "wands" | "cups" | "swords" | "pentacles";
export type TarotCourt = "page" | "knight" | "queen" | "king";
export type TarotTopicKey = "love" | "work" | "life";

export type TarotCardTopicMeaning = {
  upright: string;
  reversed: string;
};

export type TarotCard = {
  id: string;
  slug: string;
  suit: TarotSuit;
  arcana: "大阿爾克那" | "小阿爾克那";
  suitLabel?: "權杖" | "聖杯" | "寶劍" | "錢幣";
  number?: number;
  court?: TarotCourt;
  nameEn: string;
  nameZh: string;
  name: string;
  image: string;
  uprightKeywords: string[];
  reversedKeywords: string[];
  keywords: string[];
  upright: string;
  reversed: string;
  uprightMeaning: string;
  reversedMeaning: string;
  meanings: Record<TarotTopicKey, TarotCardTopicMeaning>;
  love: string;
  career: string;
  money: string;
  advice: string;
};

type CardInput = {
  id: string;
  suit: TarotSuit;
  number?: number;
  court?: TarotCourt;
  nameEn: string;
  nameZh: string;
  image: string;
  uprightKeywords: string[];
  reversedKeywords: string[];
  uprightMeaning: string;
  reversedMeaning: string;
  meanings: Record<TarotTopicKey, TarotCardTopicMeaning>;
};

function getSuitLabel(suit: TarotSuit): TarotCard["suitLabel"] {
  if (suit === "wands") return "權杖";
  if (suit === "cups") return "聖杯";
  if (suit === "swords") return "寶劍";
  if (suit === "pentacles") return "錢幣";
  return undefined;
}

function card(input: CardInput): TarotCard {
  return {
    ...input,
    slug: input.id,
    arcana: input.suit === "major" ? "大阿爾克那" : "小阿爾克那",
    suitLabel: getSuitLabel(input.suit),
    name: input.nameZh,
    keywords: input.uprightKeywords,
    upright: input.uprightMeaning,
    reversed: input.reversedMeaning,
    love: input.meanings.love.upright,
    career: input.meanings.work.upright,
    money:
      input.suit === "pentacles"
        ? input.meanings.work.upright
        : `${input.meanings.work.upright} 財務與資源層面，適合用務實節奏慢慢整理。`,
    advice: input.meanings.life.upright,
  };
}

const majors: TarotCard[] = [
  card({
    id: "the-fool",
    suit: "major",
    number: 0,
    nameEn: "The Fool",
    nameZh: "愚者",
    image: "/tarot-images/major-fool-cat.webp",
    uprightKeywords: ["開始", "自由", "未知"],
    reversedKeywords: ["魯莽", "逃避", "失焦"],
    uprightMeaning: "新的旅程正在打開。你不需要看清全部地圖，只要先讓心往自由的方向走一步。",
    reversedMeaning: "衝動可能讓你忽略真正的感受。暫停一下，確認自己不是為了逃離而出發。",
    meanings: {
      love: {
        upright: "愛情裡有新的可能，也可能是一段讓你重新認識自己的關係。",
        reversed: "別急著跳進曖昧或承諾，先確認你要的是心動還是逃離孤單。",
      },
      work: {
        upright: "工作適合嘗試新方法，但重要決定前要先看清資源與風險。",
        reversed: "計畫可能太憑感覺，先補上資訊與步驟再往前會更穩。",
      },
      life: {
        upright: "保持好奇，讓生活多一點新鮮空氣，答案會在路上慢慢出現。",
        reversed: "別把不安誤認成命運的催促，慢一點反而能避開繞路。",
      },
    },
  }),
  card({
    id: "the-magician",
    suit: "major",
    number: 1,
    nameEn: "The Magician",
    nameZh: "魔術師",
    image: "/tarot-images/major-magician-cat.webp",
    uprightKeywords: ["創造", "意志", "資源"],
    reversedKeywords: ["分散", "操控", "空想"],
    uprightMeaning: "你手上其實已經有足夠工具。把意念聚焦，宇宙會回應你清楚的行動。",
    reversedMeaning: "能量分散時，事情容易只停在想像。先收回注意力，別急著說服所有人。",
    meanings: {
      love: {
        upright: "你有能力主動表達，也能讓關係出現新的互動方式。",
        reversed: "小心話說得漂亮卻沒有行動，關係需要真誠而不是技巧。",
      },
      work: {
        upright: "適合提案、溝通、展現專長，讓別人看見你的能力。",
        reversed: "資源其實在手邊，只是太分散；先選一件事完成。",
      },
      life: {
        upright: "把想法落地成一個小動作，今天就會開始改變。",
        reversed: "別只在腦中排演人生，宇宙要你先做一個可執行的選擇。",
      },
    },
  }),
  card({
    id: "the-high-priestess",
    suit: "major",
    number: 2,
    nameEn: "The High Priestess",
    nameZh: "女祭司",
    image: "/tarot-images/major-high-priestess-cat.webp",
    uprightKeywords: ["直覺", "秘密", "等待"],
    reversedKeywords: ["壓抑", "混亂", "忽略直覺"],
    uprightMeaning: "答案已經在你心裡，只是需要更安靜的空間浮現。先觀察，不必立刻行動。",
    reversedMeaning: "你可能忽略了內在警訊。別急著合理化不舒服，身體比頭腦更早知道答案。",
    meanings: {
      love: {
        upright: "有些情緒尚未被說清楚，適合慢慢確認彼此真正的心意。",
        reversed: "你可能已感覺到不對勁，請別用想像替對方補上答案。",
      },
      work: {
        upright: "先蒐集資訊，不要過早站隊或公開還沒成熟的計畫。",
        reversed: "職場資訊可能不透明，重要承諾請再多確認一次。",
      },
      life: {
        upright: "今天的指引不是向外追問，而是回到自己的安靜。",
        reversed: "外界聲音太大時，先暫停接收，讓直覺重新變清楚。",
      },
    },
  }),
  card({
    id: "the-empress",
    suit: "major",
    number: 3,
    nameEn: "The Empress",
    nameZh: "皇后",
    image: "/tarot-images/major-empress-cat.webp",
    uprightKeywords: ["滋養", "豐盛", "溫柔"],
    reversedKeywords: ["消耗", "依附", "失衡"],
    uprightMeaning: "豐盛正在靠近。當你願意照顧自己，世界也會用更柔軟的方式照顧你。",
    reversedMeaning: "你可能給了太多，卻忘了補回自己的能量。愛不該只剩消耗。",
    meanings: {
      love: {
        upright: "關係裡需要更多照顧與真實感受，也適合讓愛自然生長。",
        reversed: "你可能把照顧變成討好，先把能量收回自己身上一點。",
      },
      work: {
        upright: "創意、內容、美感與照護相關工作會有不錯的流動。",
        reversed: "成果尚未成熟，不要因為焦急就否定正在孕育的東西。",
      },
      life: {
        upright: "先讓自己舒服，好的選擇會從穩定裡長出來。",
        reversed: "生活需要補給，不要只顧著讓別人舒服。",
      },
    },
  }),
  card({
    id: "the-emperor",
    suit: "major",
    number: 4,
    nameEn: "The Emperor",
    nameZh: "皇帝",
    image: "/tarot-images/major-emperor-cat.webp",
    uprightKeywords: ["秩序", "責任", "界線"],
    reversedKeywords: ["僵硬", "控制", "失序"],
    uprightMeaning: "你需要一個穩定的框架。界線不是冷漠，而是保護重要事物的方式。",
    reversedMeaning: "過度控制會讓心變硬。試著分辨秩序與壓抑之間的差別。",
    meanings: {
      love: {
        upright: "愛情需要承諾與明確態度，曖昧不清會消耗安全感。",
        reversed: "別用冷靜包裝疏離，也別讓關係變成權力拉扯。",
      },
      work: {
        upright: "適合整理流程、制定規則、承擔領導或決策責任。",
        reversed: "工作可能被權威或死規則卡住，先找回彈性。",
      },
      life: {
        upright: "把界線說清楚，你的溫柔才不會被誤用。",
        reversed: "你不必掌控每一件事，鬆手會讓生活恢復呼吸。",
      },
    },
  }),
  card({
    id: "the-hierophant",
    suit: "major",
    number: 5,
    nameEn: "The Hierophant",
    nameZh: "教皇",
    image: "/tarot-images/major-hierophant-cat.webp",
    uprightKeywords: ["信念", "學習", "指引"],
    reversedKeywords: ["叛逆", "框架", "盲從"],
    uprightMeaning: "你正在尋找值得信任的答案。傳統、經驗或前輩提醒會帶來支持。",
    reversedMeaning: "不要只因為別人都這樣做，就忽略你靈魂真正想走的路。",
    meanings: {
      love: {
        upright: "關係需要共同價值觀，彼此對未來的想像值得好好談談。",
        reversed: "別讓外界標準決定你的感情，真正合適要回到彼此感受。",
      },
      work: {
        upright: "適合學習、考證、建立專業信任，或請教有經驗的人。",
        reversed: "舊方法未必適合現在，工作上可以嘗試更自由的做法。",
      },
      life: {
        upright: "尊重經驗，也保留自己的內在答案。",
        reversed: "你可以不照劇本生活，宇宙允許你長出自己的信念。",
      },
    },
  }),
  card({
    id: "the-lovers",
    suit: "major",
    number: 6,
    nameEn: "The Lovers",
    nameZh: "戀人",
    image: "/tarot-images/major-lovers-cat.webp",
    uprightKeywords: ["選擇", "連結", "真心"],
    reversedKeywords: ["失衡", "逃避", "不一致"],
    uprightMeaning: "選擇正在靠近，而真正重要的是你能否誠實面對自己的渴望。",
    reversedMeaning: "心與行動可能不一致。別為了被愛，選擇一個委屈自己的答案。",
    meanings: {
      love: {
        upright: "愛情能量強烈，適合確認關係、靠近彼此或說出真心。",
        reversed: "關係可能有失衡或逃避，先問自己是否仍感到被尊重。",
      },
      work: {
        upright: "合作機會出現，但需要確認雙方目標是否一致。",
        reversed: "工作選擇可能讓你左右為難，別只選看起來討喜的路。",
      },
      life: {
        upright: "選擇讓你更像自己的那條路。",
        reversed: "若心裡有分裂感，先整合自己的需求再做決定。",
      },
    },
  }),
  card({
    id: "the-chariot",
    suit: "major",
    number: 7,
    nameEn: "The Chariot",
    nameZh: "戰車",
    image: "/tarot-images/major-chariot-cat.webp",
    uprightKeywords: ["前進", "掌控", "決心"],
    reversedKeywords: ["失控", "拉扯", "急躁"],
    uprightMeaning: "把方向握回手中。只要你不被雜音拉走，事情會往前推進。",
    reversedMeaning: "太急著衝刺可能讓你失去平衡。先調整方向，再加速也不遲。",
    meanings: {
      love: {
        upright: "需要主動溝通，但也要避免把關係變成輸贏。",
        reversed: "雙方都想掌控方向時，先放下勝負感再談靠近。",
      },
      work: {
        upright: "適合推進專案、面試、競爭與設定短期目標。",
        reversed: "工作方向可能分散，先停下來校準目標。",
      },
      life: {
        upright: "專注在真正想抵達的地方，不必回應所有干擾。",
        reversed: "別用忙碌逃避焦慮，方向比速度更重要。",
      },
    },
  }),
  card({
    id: "strength",
    suit: "major",
    number: 8,
    nameEn: "Strength",
    nameZh: "力量",
    image: "/tarot-images/major-strength-cat.webp",
    uprightKeywords: ["勇氣", "柔軟", "自持"],
    reversedKeywords: ["自疑", "疲憊", "逞強"],
    uprightMeaning: "真正的力量不是壓抑情緒，而是溫柔地陪自己穿過它。",
    reversedMeaning: "你可能對自己太嚴格了。疲憊不是失敗，是身體正在要求被聽見。",
    meanings: {
      love: {
        upright: "用溫柔而堅定的方式表達需求，關係會更靠近真實。",
        reversed: "不要在關係裡逞強，脆弱被看見也可能是一種靠近。",
      },
      work: {
        upright: "適合處理壓力、人際協調，或穩住一件需要耐心的事。",
        reversed: "你可能累到失去自信，先休息再處理難題。",
      },
      life: {
        upright: "今天不要硬撐，溫柔也是一種很深的力量。",
        reversed: "放過自己一點，宇宙不是要你永遠堅強。",
      },
    },
  }),
  card({
    id: "the-hermit",
    suit: "major",
    number: 9,
    nameEn: "The Hermit",
    nameZh: "隱者",
    image: "/tarot-images/major-hermit-cat.webp",
    uprightKeywords: ["獨處", "內省", "智慧"],
    reversedKeywords: ["孤立", "封閉", "退縮"],
    uprightMeaning: "你需要一點獨處，把別人的聲音放遠，才能聽見自己的燈。",
    reversedMeaning: "孤單不等於清醒。若你把自己關太久，記得讓支持你的人靠近。",
    meanings: {
      love: {
        upright: "愛情裡適合暫停追問，把注意力放回自己的需求。",
        reversed: "別用沉默測試對方，想被理解時也要留一道門。",
      },
      work: {
        upright: "適合研究、整理、深度工作，不必急著公開成果。",
        reversed: "工作上別孤軍奮戰太久，適時尋求回饋會更快看清。",
      },
      life: {
        upright: "留一段只屬於自己的時間，答案會在沉澱後出現。",
        reversed: "如果獨處變成逃避，請溫柔地讓一點支持進來。",
      },
    },
  }),
  card({
    id: "wheel-of-fortune",
    suit: "major",
    number: 10,
    nameEn: "Wheel of Fortune",
    nameZh: "命運之輪",
    image: "/tarot-images/major-wheel-of-fortune-cat.webp",
    uprightKeywords: ["轉變", "循環", "機會"],
    reversedKeywords: ["延遲", "重複", "抗拒"],
    uprightMeaning: "局勢正在轉動。你無法控制所有變化，但可以選擇如何接住機會。",
    reversedMeaning: "重複的模式正在提醒你：若不改變回應方式，故事會再次上演。",
    meanings: {
      love: {
        upright: "關係進入轉折，可能重逢、推進，也可能看清循環。",
        reversed: "同樣的拉扯可能又出現，這次請不要忽略自己的感受。",
      },
      work: {
        upright: "變動帶來新機會，保持彈性比堅持原計畫更重要。",
        reversed: "工作延遲不代表失敗，先調整策略而非硬推。",
      },
      life: {
        upright: "不要抗拒變化，先看見它想把你帶往哪裡。",
        reversed: "命運之輪卡住時，往往是在等你換一種選擇。",
      },
    },
  }),
  card({
    id: "justice",
    suit: "major",
    number: 11,
    nameEn: "Justice",
    nameZh: "正義",
    image: "/tarot-images/major-justice-cat.webp",
    uprightKeywords: ["公平", "真相", "決定"],
    reversedKeywords: ["偏差", "逃避", "不平衡"],
    uprightMeaning: "真相會慢慢浮現。清楚、誠實與公平，是今天最重要的保護。",
    reversedMeaning: "你可能在某件事上委屈自己，或逃避該面對的結果。",
    meanings: {
      love: {
        upright: "適合談清楚期待、責任與界線，避免只靠猜測維持關係。",
        reversed: "若關係裡一直不公平，請先承認自己的委屈。",
      },
      work: {
        upright: "合約、規則、分工與責任需要仔細確認。",
        reversed: "職場判斷可能有偏差，重要文件與承諾請重新核對。",
      },
      life: {
        upright: "誠實不是傷人，而是讓事情回到正確的位置。",
        reversed: "別再替不舒服找理由，公平也包含你自己。",
      },
    },
  }),
  card({
    id: "the-hanged-man",
    suit: "major",
    number: 12,
    nameEn: "The Hanged Man",
    nameZh: "吊人",
    image: "/tarot-images/major-hanged-man-cat.webp",
    uprightKeywords: ["暫停", "臣服", "新角度"],
    reversedKeywords: ["停滯", "拖延", "無謂犧牲"],
    uprightMeaning: "暫停不是停滯，而是換一個角度看見新的出口。",
    reversedMeaning: "你可能犧牲太多，卻沒有真正換來想要的結果。",
    meanings: {
      love: {
        upright: "關係需要空間，不必急著要求答案，先看清自己是否過度付出。",
        reversed: "如果等待只是消耗，請停止把自己吊在不確定裡。",
      },
      work: {
        upright: "計畫可能延遲，適合重新評估方向與優先順序。",
        reversed: "工作卡住不一定要硬撐，換方法比繼續耗著有效。",
      },
      life: {
        upright: "先停止用力，新的理解會從放鬆裡出現。",
        reversed: "別把拖延誤認成等待時機，宇宙要你做出小改變。",
      },
    },
  }),
  card({
    id: "death",
    suit: "major",
    number: 13,
    nameEn: "Death",
    nameZh: "死神",
    image: "/tarot-images/major-death-cat.webp",
    uprightKeywords: ["結束", "重生", "放下"],
    reversedKeywords: ["抗拒", "停滯", "舊模式"],
    uprightMeaning: "某個階段正在結束。這不是失去全部，而是讓新生命有位置進來。",
    reversedMeaning: "你知道該放下，卻仍握著舊模式不放。溫柔地承認它已經不適合你。",
    meanings: {
      love: {
        upright: "關係需要轉化，可能是告別舊互動，也可能是重新定義彼此。",
        reversed: "你可能還留在舊傷裡，先承認改變已經開始。",
      },
      work: {
        upright: "適合結束不再有效的做法，開始新的工作節奏。",
        reversed: "工作模式明明不合適，卻還在拖延改變；先放掉一個舊習慣。",
      },
      life: {
        upright: "讓該結束的結束，你才有力氣迎接新的自己。",
        reversed: "放下不是背叛過去，而是讓自己有空間活下去。",
      },
    },
  }),
  card({
    id: "temperance",
    suit: "major",
    number: 14,
    nameEn: "Temperance",
    nameZh: "節制",
    image: "/tarot-images/major-temperance-cat.webp",
    uprightKeywords: ["調和", "療癒", "耐心"],
    reversedKeywords: ["失衡", "過度", "急躁"],
    uprightMeaning: "今天適合把失衡的地方調回來。溫柔不是退讓，而是找回自己的節奏。",
    reversedMeaning: "能量可能被拉扯到兩端。先別急著做極端選擇，慢慢調回中間。",
    meanings: {
      love: {
        upright: "需要溝通與互相調整，別讓情緒一次爆開。",
        reversed: "關係節奏不一致時，先暫停爭對錯，回到感受本身。",
      },
      work: {
        upright: "適合協調資源、修正流程，慢慢讓事情回到穩定。",
        reversed: "工作負荷可能失衡，請重新分配時間與責任。",
      },
      life: {
        upright: "小幅度修正，比一次推翻更能帶你回到平衡。",
        reversed: "你需要的是調整，不是把自己逼到另一個極端。",
      },
    },
  }),
  card({
    id: "the-devil",
    suit: "major",
    number: 15,
    nameEn: "The Devil",
    nameZh: "惡魔",
    image: "/tarot-images/major-devil-cat.webp",
    uprightKeywords: ["慾望", "綑綁", "看見"],
    reversedKeywords: ["釋放", "覺醒", "鬆綁"],
    uprightMeaning: "你正在看見某種執著。它也許迷人，但不一定真正滋養你。",
    reversedMeaning: "你正在鬆開束縛。即使還沒完全自由，也已經開始不再被牽著走。",
    meanings: {
      love: {
        upright: "強烈吸引可能伴隨不安，請分辨心動與依賴。",
        reversed: "你正在從不健康的拉扯裡醒來，別再低估自己的價值。",
      },
      work: {
        upright: "留意過度消耗、權力壓力或短期利益帶來的交換。",
        reversed: "你有機會擺脫不舒服的工作模式，先拿回選擇權。",
      },
      life: {
        upright: "看清讓你失去自由的東西，就是重新選擇的開始。",
        reversed: "束縛鬆開了，接下來要練習不再回到舊習慣。",
      },
    },
  }),
  card({
    id: "the-tower",
    suit: "major",
    number: 16,
    nameEn: "The Tower",
    nameZh: "高塔",
    image: "/tarot-images/major-tower-cat.webp",
    uprightKeywords: ["震動", "醒悟", "重建"],
    reversedKeywords: ["預警", "延後", "抗拒崩塌"],
    uprightMeaning: "突然的變化正在拆掉不穩的結構。震動之後，你會看見真正需要重建的地方。",
    reversedMeaning: "你可能感覺到危機卻還在拖延。主動調整會比被迫崩塌更溫柔。",
    meanings: {
      love: {
        upright: "關係裡隱藏的問題可能浮現，這是痛但清醒的時刻。",
        reversed: "有些話遲早要談，主動面對會比等爆發更溫柔。",
      },
      work: {
        upright: "計畫變動、制度調整或突發事件，需要快速回到核心。",
        reversed: "工作上的不穩已經有徵兆，請先準備備案。",
      },
      life: {
        upright: "不要只害怕崩塌，也看看它替你拆掉了什麼假象。",
        reversed: "如果你已知道哪裡不穩，現在就是溫柔重修的時候。",
      },
    },
  }),
  card({
    id: "the-star",
    suit: "major",
    number: 17,
    nameEn: "The Star",
    nameZh: "星星",
    image: "/tarot-images/major-star-cat.webp",
    uprightKeywords: ["希望", "修復", "信任"],
    reversedKeywords: ["失望", "低潮", "信念不足"],
    uprightMeaning: "你正在慢慢恢復光。把期待放回心上，接下來會有柔和的支持靠近。",
    reversedMeaning: "希望還在，只是你暫時看不見。先不要否定自己正在修復的速度。",
    meanings: {
      love: {
        upright: "關係有療癒空間，適合誠實分享脆弱與期待。",
        reversed: "感情裡仍有希望，但你需要先照顧自己的失落。",
      },
      work: {
        upright: "願景正在成形，適合累積作品、曝光與長期計畫。",
        reversed: "你可能看不到成果，但不要急著否定長期方向。",
      },
      life: {
        upright: "保留一點相信，光會從很小的地方回來。",
        reversed: "先做一件能讓自己恢復信心的小事。",
      },
    },
  }),
  card({
    id: "the-moon",
    suit: "major",
    number: 18,
    nameEn: "The Moon",
    nameZh: "月亮",
    image: "/tarot-images/major-moon-cat.webp",
    uprightKeywords: ["直覺", "夢境", "不安"],
    reversedKeywords: ["迷霧散開", "看清", "釐清恐懼"],
    uprightMeaning: "有些感受還沒有被說清楚。今晚先相信直覺，但不要急著替未知下結論。",
    reversedMeaning: "迷霧正在散開。你會開始分辨想像、恐懼與真正的訊息。",
    meanings: {
      love: {
        upright: "不確定感較強，適合觀察行動而不是只聽承諾。",
        reversed: "你會慢慢看清對方的真實狀態，也看清自己的害怕。",
      },
      work: {
        upright: "資訊可能不完整，重要決策前要再確認細節。",
        reversed: "工作迷霧逐漸散開，適合重新整理資料與方向。",
      },
      life: {
        upright: "不必急著知道答案，先把內在的不安照顧好。",
        reversed: "你正在從混亂裡醒來，請相信逐漸清晰的自己。",
      },
    },
  }),
  card({
    id: "the-sun",
    suit: "major",
    number: 19,
    nameEn: "The Sun",
    nameZh: "太陽",
    image: "/tarot-images/major-sun-cat.webp",
    uprightKeywords: ["明朗", "喜悅", "能量"],
    reversedKeywords: ["延遲喜悅", "壓抑", "低光"],
    uprightMeaning: "清楚與溫暖正在照進來。你可以放心展現自己，也可以接受好消息。",
    reversedMeaning: "快樂可能被壓低了音量。別因為害怕失望，就不允許自己期待。",
    meanings: {
      love: {
        upright: "愛情能量明亮，適合約會、坦白、讓關係更自然。",
        reversed: "關係不是沒有溫度，只是需要少一點防備與壓抑。",
      },
      work: {
        upright: "能見度提升，成果容易被看見，也適合主動爭取機會。",
        reversed: "工作成果可能延遲被看見，但光正在累積。",
      },
      life: {
        upright: "讓自己被看見，這不是炫耀，是回到生命力。",
        reversed: "別把開心延後到一切完美，今天也值得一點亮光。",
      },
    },
  }),
  card({
    id: "judgement",
    suit: "major",
    number: 20,
    nameEn: "Judgement",
    nameZh: "審判",
    image: "/tarot-images/major-judgement-cat.webp",
    uprightKeywords: ["覺醒", "回應", "重生"],
    reversedKeywords: ["自責", "拒聽召喚", "停留過去"],
    uprightMeaning: "你正在被喚醒。過去的經驗不是要困住你，而是提醒你可以重新選擇。",
    reversedMeaning: "你可能還在用舊眼光審判自己。放過過去，才能聽見新的召喚。",
    meanings: {
      love: {
        upright: "舊議題可能回來，這次請用更成熟的方式回應。",
        reversed: "別一直用過去的傷判定現在，先看清眼前的人與自己。",
      },
      work: {
        upright: "適合做重要決定、回顧成果，或重新定位自己的方向。",
        reversed: "你可能不敢承認自己想轉向，請聽見心裡的召喚。",
      },
      life: {
        upright: "你不需要永遠活在舊版本裡。",
        reversed: "停止審判自己，新的生活才有空間進來。",
      },
    },
  }),
  card({
    id: "the-world",
    suit: "major",
    number: 21,
    nameEn: "The World",
    nameZh: "世界",
    image: "/tarot-images/major-world-cat.webp",
    uprightKeywords: ["完成", "整合", "圓滿"],
    reversedKeywords: ["未完成", "停在門口", "整合中"],
    uprightMeaning: "一個循環正在完成。你走到這裡不是偶然，請好好收下自己的成長。",
    reversedMeaning: "差最後一步就能收尾。別在完成前懷疑自己，整理好就能前進。",
    meanings: {
      love: {
        upright: "關係進入更完整的理解，適合談未來或為彼此定位。",
        reversed: "愛情還有未完成的話題，先收束再談下一步。",
      },
      work: {
        upright: "成果收束、專案完成、階段轉換，下一個舞台正在靠近。",
        reversed: "工作差最後整理，請別因疲累放棄收尾。",
      },
      life: {
        upright: "為自己走過的路致謝，然後準備迎接新的循環。",
        reversed: "你已接近完成，只需要把散落的部分整合起來。",
      },
    },
  }),
];

type MinorSeed = {
  key: string;
  number?: number;
  court?: TarotCourt;
  rankZh: string;
  rankEn: string;
  uprightKeywords: string[];
  reversedKeywords: string[];
  uprightMeaning: string;
  reversedMeaning: string;
  loveUpright: string;
  loveReversed: string;
  workUpright: string;
  workReversed: string;
  lifeUpright: string;
  lifeReversed: string;
};

const suitInfo: Record<Exclude<TarotSuit, "major">, { zh: string; en: string; imagePrefix: string }> = {
  wands: { zh: "權杖", en: "Wands", imagePrefix: "wands" },
  cups: { zh: "聖杯", en: "Cups", imagePrefix: "cups" },
  swords: { zh: "寶劍", en: "Swords", imagePrefix: "swords" },
  pentacles: { zh: "錢幣", en: "Pentacles", imagePrefix: "pentacles" },
};

function minorImage(suit: Exclude<TarotSuit, "major">, key: string) {
  const prefix = suitInfo[suit].imagePrefix;
  if (suit === "pentacles" && /^[2-9]$/.test(key)) {
    return `/tarot-images/${prefix}-${key}-cat.webp`;
  }
  if (/^[2-9]$/.test(key)) {
    return `/tarot-images/${prefix}-0${key}-cat.webp`;
  }
  return `/tarot-images/${prefix}-${key}-cat.webp`;
}

function minor(suit: Exclude<TarotSuit, "major">, seed: MinorSeed): TarotCard {
  const info = suitInfo[suit];
  return card({
    id: `${suit}-${seed.key}`,
    suit,
    number: seed.number,
    court: seed.court,
    nameEn: `${seed.rankEn} of ${info.en}`,
    nameZh: `${info.zh}${seed.rankZh}`,
    image: minorImage(suit, seed.key),
    uprightKeywords: seed.uprightKeywords,
    reversedKeywords: seed.reversedKeywords,
    uprightMeaning: seed.uprightMeaning,
    reversedMeaning: seed.reversedMeaning,
    meanings: {
      love: { upright: seed.loveUpright, reversed: seed.loveReversed },
      work: { upright: seed.workUpright, reversed: seed.workReversed },
      life: { upright: seed.lifeUpright, reversed: seed.lifeReversed },
    },
  });
}

const wands: TarotCard[] = [
  minor("wands", { key: "ace", number: 1, rankZh: "一", rankEn: "Ace", uprightKeywords: ["火花", "行動", "新機會"], reversedKeywords: ["熄火", "遲疑", "衝動"], uprightMeaning: "新的火光被點燃，宇宙把一個可以開始的方向交到你手上。", reversedMeaning: "火還在，只是需要先避開急躁與自我懷疑，別把起點燒成壓力。", loveUpright: "愛情有新鮮吸引或主動靠近的訊號，適合讓熱度自然升起。", loveReversed: "心動可能來得快也散得快，先看清對方是否真的願意行動。", workUpright: "新專案、新邀約或新點子適合啟動，先做出第一步。", workReversed: "工作熱情不足或方向太急，先整理動機再出手。", lifeUpright: "生活需要一點冒險精神，做一件能點亮自己的事。", lifeReversed: "不要把焦慮當成熱情，慢慢點火也可以。"}),
  minor("wands", { key: "2", number: 2, rankZh: "二", rankEn: "Two", uprightKeywords: ["計畫", "遠景", "選擇"], reversedKeywords: ["猶豫", "視野窄", "不敢走"], uprightMeaning: "你站在門口，看見更遠的可能。現在不是急著衝，而是選定方向。", reversedMeaning: "你可能把自己困在熟悉的地方，害怕一旦選擇就失去安全感。", loveUpright: "關係需要談未來與方向，兩個人是否看向同一片星空很重要。", loveReversed: "你可能不確定要不要繼續投入，先別用拖延代替答案。", workUpright: "適合規劃、評估合作與長期路線，先把版圖看大。", workReversed: "工作方向未定，別因怕錯就停在原地。", lifeUpright: "生活正在邀請你擴大視野，為自己留一個新選項。", lifeReversed: "不做選擇也是選擇，請誠實面對真正的害怕。"}),
  minor("wands", { key: "3", number: 3, rankZh: "三", rankEn: "Three", uprightKeywords: ["等待成果", "拓展", "遠方"], reversedKeywords: ["延遲", "失望", "視野受限"], uprightMeaning: "你已經送出訊號，現在要給成果一點抵達的時間。", reversedMeaning: "等待變得焦躁時，請確認是不是期待與現實沒有對齊。", loveUpright: "關係正在展開，適合給彼此空間，也看見未來可能。", loveReversed: "對方回應不如預期，先不要把所有期待壓在一個訊息上。", workUpright: "合作、出差、遠距或市場拓展有機會，成果正在路上。", workReversed: "計畫可能延後，請檢查溝通與資源配置。", lifeUpright: "你做過的努力會慢慢回聲，先保持開放。", lifeReversed: "不要只盯著沒來的答案，也看看眼前可調整的地方。"}),
  minor("wands", { key: "4", number: 4, rankZh: "四", rankEn: "Four", uprightKeywords: ["慶祝", "穩定", "歸屬"], reversedKeywords: ["不安定", "延遲慶祝", "根基鬆動"], uprightMeaning: "一段小小的安定正在形成，值得讓自己停下來慶祝。", reversedMeaning: "你可能還無法安心收下成果，因為心裡仍擔心地基不穩。", loveUpright: "愛情適合見面、確認關係或建立更有歸屬感的互動。", loveReversed: "關係裡安全感不足，先修補基礎而不是急著定義。", workUpright: "團隊成果、活動、階段完成有好消息，適合公開慶祝。", workReversed: "合作基礎需要重新確認，別讓表面和諧掩蓋問題。", lifeUpright: "回到讓你安心的人事物，生活會重新有支撐。", lifeReversed: "如果你在熱鬧中仍孤單，請先照顧真正的需求。"}),
  minor("wands", { key: "5", number: 5, rankZh: "五", rankEn: "Five", uprightKeywords: ["競爭", "摩擦", "碰撞"], reversedKeywords: ["內耗", "避戰", "混亂收束"], uprightMeaning: "不同聲音正在碰撞，這不一定是壞事，它會逼出真正的立場。", reversedMeaning: "你可能厭倦衝突，也可能把火氣往心裡藏。請找回清楚表達。", loveUpright: "關係裡有小摩擦，未必傷感情，但需要學會不把爭執變成輸贏。", loveReversed: "表面沒吵不代表沒事，壓下的不滿仍需要被聽見。", workUpright: "競爭、討論與多方意見增加，適合把規則說清楚。", workReversed: "職場內耗消耗效率，先把共同目標拉回來。", lifeUpright: "生活裡的混亂提醒你調整優先順序。", lifeReversed: "別為了和平一直退讓，溫柔也可以有立場。"}),
  minor("wands", { key: "6", number: 6, rankZh: "六", rankEn: "Six", uprightKeywords: ["勝利", "被看見", "肯定"], reversedKeywords: ["自負", "失落", "認可不足"], uprightMeaning: "你走過一段努力，現在可以讓自己被看見，收下應得的肯定。", reversedMeaning: "你可能太在意外界掌聲，忘了真正的勝利是回到自己的中心。", loveUpright: "愛情有被重視、被公開或關係推進的機會。", loveReversed: "若只想證明自己被愛，容易忽略關係本身是否舒服。", workUpright: "成果、面試、曝光、競賽有好表現，適合主動呈現。", workReversed: "掌聲延遲不代表失敗，別讓比較偷走信心。", lifeUpright: "今天請承認自己做得不錯，不必假裝沒關係。", lifeReversed: "把焦點從他人眼光收回來，你已經很努力了。"}),
  minor("wands", { key: "7", number: 7, rankZh: "七", rankEn: "Seven", uprightKeywords: ["防守", "立場", "堅持"], reversedKeywords: ["疲憊", "退讓", "防衛過度"], uprightMeaning: "你需要守住重要位置。不是每個質疑都值得回應，但界線要清楚。", reversedMeaning: "長期防守讓你疲憊，請分辨哪些戰役真的屬於你。", loveUpright: "關係需要表明立場，別讓模糊消耗你的安全感。", loveReversed: "你可能防衛太強，讓真心也難以靠近。", workUpright: "面對競爭或挑戰時，守住專業與底線會讓你站穩。", workReversed: "工作壓力過大，請先分辨該堅持與該放下的部分。", lifeUpright: "你可以保護自己，也可以不解釋給所有人聽。", lifeReversed: "若一直處於備戰狀態，生活會失去柔軟。"}),
  minor("wands", { key: "8", number: 8, rankZh: "八", rankEn: "Eight", uprightKeywords: ["快速", "訊息", "推進"], reversedKeywords: ["延誤", "急躁", "訊息混亂"], uprightMeaning: "能量正在加速，訊息、邀約或進展可能比你想像得更快抵達。", reversedMeaning: "速度失去節奏時，容易讓事情變亂。先確認再回應。", loveUpright: "訊息互動變多，關係可能快速升溫或迎來明確回應。", loveReversed: "回覆延遲或溝通誤會讓你不安，先別急著腦補。", workUpright: "專案推進、溝通往來、短期任務會很快流動。", workReversed: "工作資訊太多，請先整理優先順序避免出錯。", lifeUpright: "變化正在靠近，保持彈性會讓你更順。", lifeReversed: "慢一點不是錯，宇宙要你避免被速度牽著跑。"}),
  minor("wands", { key: "9", number: 9, rankZh: "九", rankEn: "Nine", uprightKeywords: ["警覺", "韌性", "最後防線"], reversedKeywords: ["疲憊", "不信任", "過度戒備"], uprightMeaning: "你快走到終點了，即使有點累，也請相信自己已累積足夠經驗。", reversedMeaning: "過去的傷讓你一直戒備，但不是所有現在都會重演。", loveUpright: "愛情裡你可能小心翼翼，慢慢來可以，但別完全關上門。", loveReversed: "你把自己保護得太緊，對方很難真正靠近。", workUpright: "專案進入最後關卡，保持耐心與備案會讓你撐過去。", workReversed: "工作疲勞累積，請別再用硬撐證明能力。", lifeUpright: "你的韌性正在保護你，但也要讓自己休息。", lifeReversed: "不是每個聲音都在攻擊你，放鬆一點會比較好走。"}),
  minor("wands", { key: "10", number: 10, rankZh: "十", rankEn: "Ten", uprightKeywords: ["負擔", "責任", "完成前壓力"], reversedKeywords: ["卸重", "過勞", "分擔"], uprightMeaning: "你扛了很多，這代表你有能力，但不代表所有事都必須由你一個人背。", reversedMeaning: "重量已經超過身心能承受的範圍，請把不屬於你的責任放下。", loveUpright: "關係裡可能承擔太多照顧與期待，請讓對方也一起負責。", loveReversed: "你正在學著不再獨自撐起整段關係。", workUpright: "工作責任重、任務多，快完成前最需要分工與節奏。", workReversed: "過勞訊號明顯，請重新分配工作而不是再硬扛。", lifeUpright: "生活需要減重，先放下一件其實不該你扛的事。", lifeReversed: "卸下不是失敗，是讓自己有力氣繼續走。"}),
  minor("wands", { key: "page", court: "page", rankZh: "侍者", rankEn: "Page", uprightKeywords: ["探索", "熱情", "新訊息"], reversedKeywords: ["三分鐘熱度", "不成熟", "分心"], uprightMeaning: "一隻小小的火貓帶來新訊息，提醒你用好奇心打開新的路。", reversedMeaning: "熱情可能還不穩定，先別急著承諾超過自己能做到的事。", loveUpright: "愛情有輕快訊息、好奇靠近或新的互動可能。", loveReversed: "對方可能忽冷忽熱，先看行動是否成熟。", workUpright: "適合學習新技能、嘗試新任務，讓熱情成為入口。", workReversed: "工作想法很多但落地不足，先選一項練習。", lifeUpright: "生活需要一點玩心，讓自己重新對世界有興趣。", lifeReversed: "別讓分心偷走熱情，給自己一個簡單目標。"}),
  minor("wands", { key: "knight", court: "knight", rankZh: "騎士", rankEn: "Knight", uprightKeywords: ["衝刺", "冒險", "熱烈"], reversedKeywords: ["急躁", "不穩", "魯莽"], uprightMeaning: "火的騎士帶來衝刺能量，適合突破，但要記得方向比速度重要。", reversedMeaning: "太急會讓熱情變成失控，先停下來看清自己要去哪裡。", loveUpright: "愛情熱度上升，可能有主動追求或快速靠近。", loveReversed: "激情可能不穩，別被一時熱烈帶著走。", workUpright: "適合推進、提案、出差與開拓新場域。", workReversed: "工作衝太快容易漏細節，請先確認計畫。", lifeUpright: "勇敢出發會帶來新風景。", lifeReversed: "冒險之前，先確認不是在逃避原地的問題。"}),
  minor("wands", { key: "queen", court: "queen", rankZh: "皇后", rankEn: "Queen", uprightKeywords: ["自信", "魅力", "溫暖"], reversedKeywords: ["嫉妒", "耗竭", "不安"], uprightMeaning: "權杖皇后提醒你，把光放出來，不必縮小自己的熱情與魅力。", reversedMeaning: "當自信被消耗時，請先回到自己，而不是急著得到外界肯定。", loveUpright: "愛情裡你很有吸引力，適合自然展現真實的自己。", loveReversed: "不安可能讓你想掌控關係，先照顧自我價值感。", workUpright: "適合領導、創作、曝光與帶動團隊士氣。", workReversed: "工作能量耗損，請不要用過度表現掩蓋疲憊。", lifeUpright: "讓生活有熱度，做讓你感到閃亮的事。", lifeReversed: "別因比較而熄掉自己的光。"}),
  minor("wands", { key: "king", court: "king", rankZh: "國王", rankEn: "King", uprightKeywords: ["願景", "領導", "行動力"], reversedKeywords: ["霸道", "急功", "失控野心"], uprightMeaning: "權杖國王帶來成熟的火，提醒你用願景帶領，而不是用焦急推人。", reversedMeaning: "野心若失去溫度，會讓人離你越來越遠。請重新找回初心。", loveUpright: "愛情需要成熟主動與明確態度，真誠會比掌控更有力量。", loveReversed: "小心把主導變成壓迫，關係需要平等的火光。", workUpright: "適合決策、領導、創業與推動大型計畫。", workReversed: "工作上別只追速度與權威，團隊也需要被聽見。", lifeUpright: "你可以成為自己生命的火炬，清楚地帶自己往前。", lifeReversed: "別讓急著成功的心，燒掉你真正珍惜的東西。"}),
];

const cups: TarotCard[] = [
  minor("cups", { key: "ace", number: 1, rankZh: "一", rankEn: "Ace", uprightKeywords: ["情感", "開放", "療癒"], reversedKeywords: ["封閉", "情緒堵塞", "空杯"], uprightMeaning: "新的情感泉水正在湧出，請允許自己被溫柔觸碰。", reversedMeaning: "杯子需要先被清空，壓住的情緒才有流動的空間。", loveUpright: "愛情有新的心動、和解或真誠靠近的可能。", loveReversed: "你可能不敢打開心，先照顧舊傷再迎接新感情。", workUpright: "工作上適合創意、關懷、合作與讓熱情回流。", workReversed: "你對工作失去感覺，請先找回真正讓你有共鳴的部分。", lifeUpright: "讓自己被美好滋養，感受會帶你回到心。", lifeReversed: "別把眼淚吞回去，情緒需要出口。"}),
  minor("cups", { key: "2", number: 2, rankZh: "二", rankEn: "Two", uprightKeywords: ["互相", "連結", "和解"], reversedKeywords: ["失衡", "疏離", "不對等"], uprightMeaning: "兩只杯子彼此映照，真誠的交換能讓關係變得柔軟。", reversedMeaning: "連結裡若只剩一方倒水，杯子終究會失衡。", loveUpright: "愛情適合互相靠近、告白、和解或確認彼此心意。", loveReversed: "關係可能不對等，別只靠你一個人維持溫度。", workUpright: "合作、夥伴與客戶關係順利，適合建立信任。", workReversed: "合作中可能有期待落差，請把條件說清楚。", lifeUpright: "今天適合與一個懂你的人好好說話。", lifeReversed: "若你覺得孤單，先把需求說出口。"}),
  minor("cups", { key: "3", number: 3, rankZh: "三", rankEn: "Three", uprightKeywords: ["慶祝", "友情", "支持"], reversedKeywords: ["八卦", "疏離", "過度社交"], uprightMeaning: "情感的圓圈正在展開，朋友、社群或祝福會帶來支持。", reversedMeaning: "熱鬧若沒有真心，只會讓人更累。請選擇真正滋養你的連結。", loveUpright: "愛情可透過朋友、聚會或輕鬆互動升溫。", loveReversed: "小心第三方意見或八卦干擾你們的真實感受。", workUpright: "團隊氣氛佳，適合慶功、合作與共同完成。", workReversed: "職場社交消耗你，請避開無意義的人際拉扯。", lifeUpright: "讓自己被朋友接住，快樂可以一起分享。", lifeReversed: "少一點應酬，多一點真正舒服的陪伴。"}),
  minor("cups", { key: "4", number: 4, rankZh: "四", rankEn: "Four", uprightKeywords: ["倦怠", "觀望", "不滿足"], reversedKeywords: ["重新打開", "覺察", "新興趣"], uprightMeaning: "你可能對眼前的杯子提不起興趣，不是沒有祝福，而是心需要重新醒來。", reversedMeaning: "內在開始鬆動，你會慢慢看見曾經忽略的機會。", loveUpright: "愛情裡有冷淡或疲乏，先確認是不滿足還是只是累了。", loveReversed: "你願意重新打開心，關係有機會恢復互動。", workUpright: "工作缺乏動力，可能需要新挑戰或重新定義意義。", workReversed: "你開始注意到新的工作機會或調整方向。", lifeUpright: "生活不是沒有禮物，只是你的心暫時看不見。", lifeReversed: "試著接受一個小邀請，世界會重新有顏色。"}),
  minor("cups", { key: "5", number: 5, rankZh: "五", rankEn: "Five", uprightKeywords: ["失落", "遺憾", "哀傷"], reversedKeywords: ["釋懷", "回頭看見", "復原"], uprightMeaning: "你正在看著倒下的杯子，但身後仍有尚未失去的溫柔。", reversedMeaning: "悲傷開始鬆開，你會慢慢回頭看見還在的支持。", loveUpright: "愛情裡有失落、後悔或情緒低谷，請先允許自己難過。", loveReversed: "你正在從舊傷復原，也可能願意重新理解一段關係。", workUpright: "工作有挫折或錯失感，但還有可修補的資源。", workReversed: "你開始從失敗中學到方法，重新整理就能前進。", lifeUpright: "別急著快樂，先陪自己把遺憾哭完。", lifeReversed: "你沒有失去全部，光正從身後慢慢回來。"}),
  minor("cups", { key: "6", number: 6, rankZh: "六", rankEn: "Six", uprightKeywords: ["回憶", "童心", "舊人"], reversedKeywords: ["停在過去", "長大", "放下舊夢"], uprightMeaning: "舊時光帶來柔軟提醒，某段回憶可能讓你重新理解自己。", reversedMeaning: "懷念很美，但你不能永遠住在過去的房間裡。", loveUpright: "舊情、熟悉感或純真的互動出現，適合溫柔回望。", loveReversed: "別把前任或舊模式美化，現在的你需要新的答案。", workUpright: "過去經驗、老同事或熟悉技能會帶來幫助。", workReversed: "工作上別只依賴舊方法，該長大的部分正在召喚你。", lifeUpright: "找回童心，做一件讓從前的自己會微笑的事。", lifeReversed: "回憶可以被珍藏，但不用繼續綁住你。"}),
  minor("cups", { key: "7", number: 7, rankZh: "七", rankEn: "Seven", uprightKeywords: ["選項", "幻想", "誘惑"], reversedKeywords: ["清醒", "選定", "去除幻象"], uprightMeaning: "許多杯子在雲裡閃光，請分辨夢想、誘惑與真正能滋養你的選擇。", reversedMeaning: "迷霧開始散開，你會知道哪些只是想像，哪些值得伸手。", loveUpright: "愛情選項多或想像很多，請看行動而非只看氛圍。", loveReversed: "你開始看清對方或自己的真實需求，不再沉迷幻想。", workUpright: "工作機會多但容易分心，先確認最有價值的方向。", workReversed: "適合做決定，把不切實際的選項收掉。", lifeUpright: "不要被每一個閃亮可能帶走，問問心真正要什麼。", lifeReversed: "清醒不是失去浪漫，而是讓夢有機會落地。"}),
  minor("cups", { key: "8", number: 8, rankZh: "八", rankEn: "Eight", uprightKeywords: ["離開", "尋找", "放下"], reversedKeywords: ["留戀", "害怕離開", "停滯"], uprightMeaning: "有些杯子已經不再盛水，你正在尋找更深的滿足。", reversedMeaning: "你知道該走，卻仍被熟悉與不甘留住。", loveUpright: "愛情中可能需要離開消耗，或暫時抽身找回自己。", loveReversed: "你捨不得放下，但留下是否真的讓你幸福，需要誠實面對。", workUpright: "工作方向可能轉變，適合追尋更有意義的路。", workReversed: "你對轉職或改變仍猶豫，先釐清害怕的是什麼。", lifeUpright: "離開不是否定過去，是承認靈魂想去更遠的地方。", lifeReversed: "別讓不甘心變成牢籠，你可以慢慢走。"}),
  minor("cups", { key: "9", number: 9, rankZh: "九", rankEn: "Nine", uprightKeywords: ["滿足", "願望", "享受"], reversedKeywords: ["空虛", "過度", "表面滿足"], uprightMeaning: "願望杯在你面前排開，請允許自己享受努力後的甜。", reversedMeaning: "表面擁有不一定等於心被填滿，請誠實看見真正的渴望。", loveUpright: "愛情裡有滿足、被寵愛或心願靠近的能量。", loveReversed: "別把被喜歡當成唯一證明，關係也要看內在是否安穩。", workUpright: "成果令人滿意，適合收下獎勵或肯定。", workReversed: "工作成就感不足，可能是目標不再貼近你的心。", lifeUpright: "今天值得享受一點好東西，不必總是克制。", lifeReversed: "問問自己：我想要的是真的幸福，還是短暫填補？"}),
  minor("cups", { key: "10", number: 10, rankZh: "十", rankEn: "Ten", uprightKeywords: ["幸福", "家庭", "情感圓滿"], reversedKeywords: ["失和", "理想落差", "表面和諧"], uprightMeaning: "情感的彩虹正在出現，真正的幸福來自被接納的歸屬感。", reversedMeaning: "看似完整的畫面裡可能有未說出口的落差，請回到真實。", loveUpright: "關係有穩定、成家、和好或情感圓滿的可能。", loveReversed: "別為了看起來幸福而忽略真實的不舒服。", workUpright: "團隊氛圍佳，適合共同完成與建立長期信任。", workReversed: "職場表面和諧下可能有情緒未解，請溝通清楚。", lifeUpright: "回到真正讓你安心的地方，幸福會變得很具體。", lifeReversed: "理想生活需要調整，不必為了完美畫面委屈自己。"}),
  minor("cups", { key: "page", court: "page", rankZh: "侍者", rankEn: "Page", uprightKeywords: ["訊息", "柔軟", "想像"], reversedKeywords: ["情緒幼嫩", "逃避", "敏感"], uprightMeaning: "聖杯侍者帶來溫柔訊息，也提醒你保留想像力與真心。", reversedMeaning: "情緒可能太嫩，容易被一句話牽動。先安撫自己再回應。", loveUpright: "可能有告白、曖昧訊息或柔軟靠近。", loveReversed: "對方或你可能不夠成熟，別把幻想當承諾。", workUpright: "適合創作、靈感、服務與用真心打動人。", workReversed: "工作情緒化會影響判斷，先把感受放穩。", lifeUpright: "今天適合寫下夢、畫畫、聽歌，讓心有出口。", lifeReversed: "敏感不是錯，但要學會不被每個波紋帶走。"}),
  minor("cups", { key: "knight", court: "knight", rankZh: "騎士", rankEn: "Knight", uprightKeywords: ["浪漫", "邀約", "追尋"], reversedKeywords: ["空承諾", "情緒化", "理想化"], uprightMeaning: "聖杯騎士帶著邀約而來，溫柔、浪漫，也需要真實落地。", reversedMeaning: "甜美承諾若沒有行動支撐，容易變成一場自我陶醉。", loveUpright: "愛情有浪漫邀約、追求或情感表達。", loveReversed: "小心只被氣氛打動，請看對方是否穩定。", workUpright: "適合提案、藝術、品牌、服務與帶有情感連結的工作。", workReversed: "工作想法很美但不夠實際，請補上計畫。", lifeUpright: "跟著心走，但也要讓腳踩在地上。", lifeReversed: "別讓浪漫想像替現實做決定。"}),
  minor("cups", { key: "queen", court: "queen", rankZh: "皇后", rankEn: "Queen", uprightKeywords: ["共感", "直覺", "照顧"], reversedKeywords: ["情緒淹沒", "依賴", "界線薄"], uprightMeaning: "聖杯皇后像夜海一樣溫柔，提醒你相信直覺，也別忘了保護自己。", reversedMeaning: "你可能感受太多，甚至把別人的情緒誤以為自己的責任。", loveUpright: "愛情裡有深度理解與照顧，適合溫柔表達需求。", loveReversed: "別用過度包容換取愛，界線也是溫柔的一部分。", workUpright: "適合諮詢、創作、療癒、照護與需要同理心的角色。", workReversed: "工作中情緒吸收太多，請建立界線。", lifeUpright: "聽見自己的感受，它會帶你回家。", lifeReversed: "先把杯子還給別人，你不用承接所有海浪。"}),
  minor("cups", { key: "king", court: "king", rankZh: "國王", rankEn: "King", uprightKeywords: ["成熟情感", "包容", "穩定"], reversedKeywords: ["壓抑", "情緒操控", "冷處理"], uprightMeaning: "聖杯國王懂得讓情緒流動而不失控，這是成熟的溫柔。", reversedMeaning: "若情緒被壓在平靜外表下，它可能用冷漠或控制的方式流出來。", loveUpright: "愛情需要成熟包容與穩定回應，適合深談心事。", loveReversed: "小心冷處理或情緒操控，真正成熟的人不會讓你一直猜。", workUpright: "適合管理人際、安撫團隊、處理敏感溝通。", workReversed: "職場情緒被壓抑，可能影響決策與信任。", lifeUpright: "讓感受有位置，也讓自己有穩定的岸。", lifeReversed: "不要用看似冷靜的方式逃避真正的感受。"}),
];

const swords: TarotCard[] = [
  minor("swords", { key: "ace", number: 1, rankZh: "一", rankEn: "Ace", uprightKeywords: ["真相", "決斷", "清晰"], reversedKeywords: ["混亂", "尖銳", "誤判"], uprightMeaning: "寶劍一劃開迷霧，真相可能直接，但它會讓你重新清醒。", reversedMeaning: "想法還不夠清楚時，話語容易變成傷人的劍。", loveUpright: "愛情需要說清楚，不再靠猜測維持平衡。", loveReversed: "溝通可能誤傷彼此，先確認本意再開口。", workUpright: "適合決策、簽約、切入問題核心與建立策略。", workReversed: "資訊不清或判斷偏差，請先釐清再決定。", lifeUpright: "今天要誠實面對一個你早已知道的答案。", lifeReversed: "別讓腦中雜音變成真相，慢慢整理。"}),
  minor("swords", { key: "2", number: 2, rankZh: "二", rankEn: "Two", uprightKeywords: ["僵局", "選擇", "閉眼"], reversedKeywords: ["揭開", "拖延", "情緒破口"], uprightMeaning: "你站在兩把劍之間，心知道要選，只是還不願看見。", reversedMeaning: "僵局開始鬆動，但拖太久的選擇仍需要面對。", loveUpright: "關係裡有不想談的問題，沉默只會延長距離。", loveReversed: "你可能終於願意看清關係的真實狀態。", workUpright: "工作決策卡住，請列出資訊而不是只靠焦慮判斷。", workReversed: "拖延的決定逐漸逼近，先處理最關鍵的條件。", lifeUpright: "閉眼能暫時安靜，但不能永遠避開答案。", lifeReversed: "當你願意看見，路就會開始分開。"}),
  minor("swords", { key: "3", number: 3, rankZh: "三", rankEn: "Three", uprightKeywords: ["心痛", "真相", "割裂"], reversedKeywords: ["療傷", "釋放", "復原"], uprightMeaning: "有些真相會刺痛心，但痛也讓你停止欺騙自己。", reversedMeaning: "傷口正在慢慢癒合，請給自己時間把劍拔出來。", loveUpright: "愛情裡可能有失望、分離或刺痛的對話，請先照顧自己。", loveReversed: "你正在從情傷中復原，也可能準備好原諒或放下。", workUpright: "工作可能有挫敗、批評或合作破裂，請把情緒與事實分開。", workReversed: "你開始從失敗中恢復，能更清楚地修正方向。", lifeUpright: "承認痛，是療癒的第一步。", lifeReversed: "不要急著說沒事，溫柔復原也需要時間。"}),
  minor("swords", { key: "4", number: 4, rankZh: "四", rankEn: "Four", uprightKeywords: ["休息", "停戰", "恢復"], reversedKeywords: ["焦躁", "復工", "休息不足"], uprightMeaning: "寶劍放下時，心才能聽見自己的呼吸。現在需要休息，不是再分析。", reversedMeaning: "你可能休息不夠就急著回戰場，身心仍需要修復。", loveUpright: "關係暫時需要冷靜，不是冷淡，而是讓情緒降溫。", loveReversed: "沉默太久會變成距離，休息後仍要回來溝通。", workUpright: "適合暫停、整理、休假或重新規劃。", workReversed: "工作壓力未真正恢復，請避免過早承接太多。", lifeUpright: "今天最重要的行動，是讓自己安靜下來。", lifeReversed: "若一直睡不安穩，請減少刺激與過度思考。"}),
  minor("swords", { key: "5", number: 5, rankZh: "五", rankEn: "Five", uprightKeywords: ["衝突", "勝負", "傷害"], reversedKeywords: ["和解", "放下戰場", "餘波"], uprightMeaning: "贏了爭執不一定贏回關係。請看見話語留下的痕跡。", reversedMeaning: "你正在離開不值得的戰場，但餘波仍需要溫柔收拾。", loveUpright: "愛情裡若只想證明誰對，心會越來越遠。", loveReversed: "有機會放下爭執，但需要真誠承認彼此的傷。", workUpright: "職場競爭或口舌增加，避免為了贏而失去合作。", workReversed: "衝突正在降溫，適合修復關係或退出內耗。", lifeUpright: "不是每場戰都值得打，保護心比證明更重要。", lifeReversed: "把劍放下，你不必繼續活在防衛裡。"}),
  minor("swords", { key: "6", number: 6, rankZh: "六", rankEn: "Six", uprightKeywords: ["過渡", "離開", "前往平靜"], reversedKeywords: ["卡住", "舊痛", "不願前進"], uprightMeaning: "你正在離開混亂的水域，即使還帶著傷，也已經往平靜靠近。", reversedMeaning: "你想前進，卻還被舊痛拉住。請慢慢整理行李。", loveUpright: "愛情可能進入冷靜期、遠距或離開消耗的模式。", loveReversed: "你仍困在舊關係或舊對話裡，先讓自己上岸。", workUpright: "工作適合轉換環境、調整流程或搬離混亂團隊。", workReversed: "改變卡住，可能是因為還沒真正下定決心。", lifeUpright: "過渡期不舒服，但你正在往更安穩的地方去。", lifeReversed: "不要責怪自己走得慢，先願意離開就很好。"}),
  minor("swords", { key: "7", number: 7, rankZh: "七", rankEn: "Seven", uprightKeywords: ["策略", "隱瞞", "迂迴"], reversedKeywords: ["坦白", "被揭露", "良心"], uprightMeaning: "有些事需要策略，但請確認你的迂迴不是在背叛自己的真心。", reversedMeaning: "被藏起來的事情可能浮出水面，誠實會比繼續遮掩更省力。", loveUpright: "關係裡可能有保留、試探或沒有說全的話。", loveReversed: "真相逐漸被看見，適合坦白而不是繼續猜。", workUpright: "工作上需要策略與保密，但別踩過誠信界線。", workReversed: "漏洞可能被發現，現在補救比硬撐更好。", lifeUpright: "你可以聰明行事，但別讓自己活得心虛。", lifeReversed: "把話說清楚，心會輕很多。"}),
  minor("swords", { key: "8", number: 8, rankZh: "八", rankEn: "Eight", uprightKeywords: ["受困", "限制", "自我綁住"], reversedKeywords: ["解套", "看見出口", "鬆綁"], uprightMeaning: "你以為自己被困住，但有些繩結是恐懼替你打上的。", reversedMeaning: "你開始看見出口，限制沒有想像中牢不可破。", loveUpright: "愛情裡你可能不敢說、不敢走，也不敢承認需求。", loveReversed: "你正在從關係焦慮裡鬆綁，能更清楚選擇自己。", workUpright: "工作限制多，但先分辨哪些是真的，哪些是自我設限。", workReversed: "困局開始有解法，適合尋求協助或換角度。", lifeUpright: "你不是沒有路，只是暫時被恐懼蒙住眼睛。", lifeReversed: "一旦鬆開一個想法，整個世界會變寬。"}),
  minor("swords", { key: "9", number: 9, rankZh: "九", rankEn: "Nine", uprightKeywords: ["焦慮", "失眠", "懊悔"], reversedKeywords: ["釋放", "求助", "走出黑夜"], uprightMeaning: "夜裡的念頭放大了恐懼，但它們不一定都是事實。", reversedMeaning: "你正在走出焦慮的房間，請讓支持與光進來。", loveUpright: "愛情讓你反覆想很多，先不要把最壞劇本當真相。", loveReversed: "焦慮有機會被安撫，適合溝通或尋求支持。", workUpright: "工作壓力可能影響睡眠，請把問題寫下來而不是整夜反芻。", workReversed: "你開始找到紓壓方法，事情沒有腦中那麼絕望。", lifeUpright: "今晚請對自己溫柔，焦慮不是你的全部。", lifeReversed: "把一盞小燈打開，你不需要獨自待在黑裡。"}),
  minor("swords", { key: "10", number: 10, rankZh: "十", rankEn: "Ten", uprightKeywords: ["結束", "谷底", "痛醒"], reversedKeywords: ["復原", "黎明", "重來"], uprightMeaning: "一段痛苦循環正在抵達盡頭。看似倒下，其實是舊故事終於停止。", reversedMeaning: "黎明已經靠近，你正在從谷底慢慢恢復。", loveUpright: "愛情可能走到痛點或結束舊模式，請先照顧自己的尊嚴。", loveReversed: "你開始從傷痛中站起來，不必急著回到從前。", workUpright: "工作壓力或失敗感到頂，這也是重新開始的訊號。", workReversed: "最糟的階段正在過去，適合重新安排計畫。", lifeUpright: "不是你不夠好，是某段故事已經走到盡頭。", lifeReversed: "你會再站起來，而且比以前更清醒。"}),
  minor("swords", { key: "page", court: "page", rankZh: "侍者", rankEn: "Page", uprightKeywords: ["觀察", "訊息", "學習"], reversedKeywords: ["多疑", "流言", "冒失發言"], uprightMeaning: "寶劍侍者帶來敏銳觀察，提醒你先學會聽，再決定怎麼說。", reversedMeaning: "過度猜測或太快發言，可能讓小事變成刺。", loveUpright: "愛情裡有觀察、試探或訊息往來，請保持真誠。", loveReversed: "別用偷看、猜測或冷言冷語保護自己。", workUpright: "適合學習、研究、蒐集資料與提出新問題。", workReversed: "工作溝通容易誤會，請確認資訊來源。", lifeUpright: "保持好奇，但別讓敏銳變成焦慮。", lifeReversed: "少一點腦補，多一點直接確認。"}),
  minor("swords", { key: "knight", court: "knight", rankZh: "騎士", rankEn: "Knight", uprightKeywords: ["衝鋒", "快速決策", "直接"], reversedKeywords: ["魯莽", "攻擊", "急躁"], uprightMeaning: "寶劍騎士帶來迅速突破，適合切入核心，但要留意語氣。", reversedMeaning: "太快的判斷會像風暴，讓真相與情緒一起被吹亂。", loveUpright: "關係需要直接溝通，但請別把坦白變成攻擊。", loveReversed: "急著逼答案可能傷到彼此，先讓情緒降溫。", workUpright: "適合談判、解決問題、快速行動與突破阻礙。", workReversed: "工作上急衝容易出錯，請補上確認流程。", lifeUpright: "勇敢說出真相，但也要讓溫柔同行。", lifeReversed: "慢一秒，很多話就不會變成傷口。"}),
  minor("swords", { key: "queen", court: "queen", rankZh: "皇后", rankEn: "Queen", uprightKeywords: ["清醒", "界線", "洞察"], reversedKeywords: ["冷漠", "尖銳", "孤立"], uprightMeaning: "寶劍皇后看得很清楚，她提醒你誠實、獨立，也別失去溫度。", reversedMeaning: "當清醒變得太尖銳，可能會把真正關心你的人推遠。", loveUpright: "愛情需要清楚界線與成熟對話，不再模糊委屈。", loveReversed: "別用冷漠測試愛，真正想說的可能是受傷。", workUpright: "適合分析、決策、審核、談判與提出精準意見。", workReversed: "工作上可能太挑剔或防衛，請保留合作空間。", lifeUpright: "清楚不是冷酷，是讓自己不再迷路。", lifeReversed: "刀放下來一點，你仍然可以被保護。"}),
  minor("swords", { key: "king", court: "king", rankZh: "國王", rankEn: "King", uprightKeywords: ["理性", "權威", "判斷"], reversedKeywords: ["苛刻", "操控", "濫用語言"], uprightMeaning: "寶劍國王帶來冷靜判斷，請用智慧做決定，而不是用理性壓過心。", reversedMeaning: "當語言變成控制，真相就失去溫度。請重新對齊公正。", loveUpright: "愛情需要成熟溝通與清楚承諾，別害怕談現實。", loveReversed: "小心被冷言或權威感壓住，關係不是法庭。", workUpright: "適合策略、管理、法務、決策與高層溝通。", workReversed: "職場權力或話語壓迫需要留意，請保護自己的立場。", lifeUpright: "用清醒帶路，但不要把心關在門外。", lifeReversed: "真正的智慧，是知道何時放軟。"}),
];

const pentacles: TarotCard[] = [
  minor("pentacles", { key: "ace", number: 1, rankZh: "一", rankEn: "Ace", uprightKeywords: ["機會", "資源", "種子"], reversedKeywords: ["錯失", "不穩", "延遲"], uprightMeaning: "一顆星幣種子落到你手心，這是可以慢慢長成現實的祝福。", reversedMeaning: "機會還在，但需要更穩的土壤與更清楚的承諾。", loveUpright: "愛情有穩定發展的種子，適合用實際行動建立安全感。", loveReversed: "關係缺乏落地承諾，別只聽甜言蜜語。", workUpright: "新工作、收入、資源或實際機會出現，值得好好耕耘。", workReversed: "工作機會可能延遲或條件不穩，請確認細節。", lifeUpright: "從一個小習慣開始，生活會慢慢變紮實。", lifeReversed: "別急著收成，先把基礎照顧好。"}),
  minor("pentacles", { key: "2", number: 2, rankZh: "二", rankEn: "Two", uprightKeywords: ["平衡", "調度", "彈性"], reversedKeywords: ["失衡", "超載", "混亂"], uprightMeaning: "你正在同時接住兩件事，彈性是禮物，但也需要節奏。", reversedMeaning: "太多事情在手上晃動，請先放下一個不急的重量。", loveUpright: "關係需要在生活、工作與陪伴之間取得平衡。", loveReversed: "你可能忙到忽略感情，或讓關係成為壓力的一部分。", workUpright: "適合多工、排程、資源調度與現金流管理。", workReversed: "工作任務過載，請重新排序，不要什麼都接。", lifeUpright: "保持彈性，生活的波浪會比較好過。", lifeReversed: "失衡不是你的錯，但你需要重新分配能量。"}),
  minor("pentacles", { key: "3", number: 3, rankZh: "三", rankEn: "Three", uprightKeywords: ["合作", "技藝", "建造"], reversedKeywords: ["品質不齊", "合作不順", "缺乏計畫"], uprightMeaning: "真正穩固的成果，需要技術、耐心與願意合作的人。", reversedMeaning: "若每個人都照自己的方式做，作品很難長成完整形狀。", loveUpright: "愛情需要一起建造生活，不只是感覺，也包括實際配合。", loveReversed: "雙方投入不一致，請談清楚怎麼一起努力。", workUpright: "團隊合作、專業累積與作品打磨會有進展。", workReversed: "合作流程不順，請重整分工與品質標準。", lifeUpright: "找對夥伴或方法，你的生活會慢慢被建起來。", lifeReversed: "別獨自硬做，適合尋求協助或重新學習。"}),
  minor("pentacles", { key: "4", number: 4, rankZh: "四", rankEn: "Four", uprightKeywords: ["守成", "安全感", "保留"], reversedKeywords: ["抓太緊", "吝惜", "鬆手"], uprightMeaning: "你正在保護得來不易的安全感，但請留意手握太緊會讓心也緊。", reversedMeaning: "該鬆手的地方正在提醒你，安全感不能只靠控制維持。", loveUpright: "關係重視穩定，但可能表達保守，需要慢慢建立信任。", loveReversed: "太怕失去會讓愛變窒息，請給彼此一點空間。", workUpright: "適合守住資源、穩定財務、保護成果。", workReversed: "工作上過度保守可能錯過成長，該投入時別太縮。", lifeUpright: "為自己留安全感很好，但別把生活鎖太緊。", lifeReversed: "鬆開一點，你不會因此失去全部。"}),
  minor("pentacles", { key: "5", number: 5, rankZh: "五", rankEn: "Five", uprightKeywords: ["匱乏", "低潮", "求助"], reversedKeywords: ["援助", "復原", "走出寒冬"], uprightMeaning: "寒夜裡你不是孤單一人，只是需要願意抬頭看見那盞燈。", reversedMeaning: "援助正在靠近，你也開始願意走出匱乏感。", loveUpright: "愛情裡可能有被冷落或不被支持的感覺，請不要獨自硬撐。", loveReversed: "關係有修補低潮的可能，前提是願意承認需求。", workUpright: "工作或金錢壓力明顯，請尋求資源與實際協助。", workReversed: "困境開始緩和，適合重新建立收入或工作節奏。", lifeUpright: "匱乏感不代表你真的一無所有，先向可信任的人求助。", lifeReversed: "你正在離開寒冬，請收下可用的支持。"}),
  minor("pentacles", { key: "6", number: 6, rankZh: "六", rankEn: "Six", uprightKeywords: ["給予", "互助", "公平交換"], reversedKeywords: ["不平等", "依賴", "施與受失衡"], uprightMeaning: "資源正在流動。真正的給予不是高低，而是讓彼此都被尊重。", reversedMeaning: "若給予變成控制，或接受變成依賴，關係就需要重新平衡。", loveUpright: "愛情裡需要互相照顧，給與收都要自然。", loveReversed: "關係可能一方付出過多，請看見不平等的地方。", workUpright: "合作、薪資、資源分配或貴人支持有好流動。", workReversed: "工作利益或分工不平衡，請談清楚交換條件。", lifeUpright: "今天適合接受幫忙，也適合把溫柔傳出去。", lifeReversed: "別用過度付出換安全感，你也值得被照顧。"}),
  minor("pentacles", { key: "7", number: 7, rankZh: "七", rankEn: "Seven", uprightKeywords: ["等待", "評估", "耕耘"], reversedKeywords: ["沒耐心", "投入失衡", "重新評估"], uprightMeaning: "你種下的東西正在長，只是還沒到收成時間。請耐心評估，而不是急著否定。", reversedMeaning: "若長期投入沒有回應，宇宙要你重新檢查土壤。", loveUpright: "關係需要時間培養，先看長期行動而不是一時熱度。", loveReversed: "等待太久卻沒有進展，請評估是否值得繼續投入。", workUpright: "工作成果在累積，適合檢視投資報酬與長期計畫。", workReversed: "方向可能投入錯誤，請調整策略而不是盲目加碼。", lifeUpright: "耐心是今天的魔法，慢慢來也會抵達。", lifeReversed: "不是所有等待都叫堅持，有些需要換土。"}),
  minor("pentacles", { key: "8", number: 8, rankZh: "八", rankEn: "Eight", uprightKeywords: ["練習", "專注", "精進"], reversedKeywords: ["倦怠", "粗心", "停滯"], uprightMeaning: "每一次重複都在磨亮你的技藝。宇宙正在透過日常訓練你。", reversedMeaning: "若練習變成麻木，請找回這件事最初的意義。", loveUpright: "愛情需要用日常小事經營，不是只靠一時浪漫。", loveReversed: "關係可能陷入例行公事，請重新注入真心。", workUpright: "適合學習、練功、累積作品與提升專業。", workReversed: "工作倦怠或品質下滑，請休息後再精修。", lifeUpright: "選一件重要的小事持續做，它會改變你。", lifeReversed: "別把自己當機器，熟練也需要熱情。"}),
  minor("pentacles", { key: "9", number: 9, rankZh: "九", rankEn: "Nine", uprightKeywords: ["獨立", "富足", "自我價值"], reversedKeywords: ["依賴", "不安", "表面富足"], uprightMeaning: "你正在建立自己的花園。富足不只是擁有，也是不再急著證明。", reversedMeaning: "外表看似穩定，內在卻可能仍害怕不夠。請回到真正的價值感。", loveUpright: "愛情中先有完整的自己，關係才會更自由。", loveReversed: "別為了被愛放棄自我價值，依賴會讓心變小。", workUpright: "專業成果、收入、自主性提升，適合享受累積。", workReversed: "工作安全感不足，可能太依賴外界肯定。", lifeUpright: "今天請收下自己的努力，你值得過得更好。", lifeReversed: "真正的富足不是比較，而是回到自己的節奏。"}),
  minor("pentacles", { key: "10", number: 10, rankZh: "十", rankEn: "Ten", uprightKeywords: ["傳承", "穩定", "長期成果"], reversedKeywords: ["家族壓力", "不穩", "價值衝突"], uprightMeaning: "長期累積正在形成根基，這張牌談的是能被保存下來的安定。", reversedMeaning: "外在穩定若壓過內在自由，幸福就會變成責任。", loveUpright: "愛情適合談長期、家庭、承諾與共同生活。", loveReversed: "家人、現實或價值觀壓力可能影響關係。", workUpright: "事業穩定、資產累積、長期職涯與制度支持佳。", workReversed: "工作體系看似穩固但可能不符合你的價值。", lifeUpright: "建立讓未來的自己也受益的生活結構。", lifeReversed: "別為了維持體面，犧牲真正想過的日子。"}),
  minor("pentacles", { key: "page", court: "page", rankZh: "侍者", rankEn: "Page", uprightKeywords: ["學習", "新技能", "實作"], reversedKeywords: ["拖延", "不專心", "空想"], uprightMeaning: "星幣侍者把一顆小小的現實種子交給你，請用學習讓它發芽。", reversedMeaning: "想法需要落地，否則再美的計畫也只是放在掌心的種子。", loveUpright: "愛情適合慢慢認識，用實際關心建立信任。", loveReversed: "關係進展慢或不夠成熟，請看對方是否願意學著負責。", workUpright: "適合進修、實習、開始副業或學習可變現技能。", workReversed: "工作計畫停在想像，請把目標拆成可做的步驟。", lifeUpright: "今天適合從一個小習慣開始培養穩定。", lifeReversed: "別怕起步慢，怕的是一直不開始。"}),
  minor("pentacles", { key: "knight", court: "knight", rankZh: "騎士", rankEn: "Knight", uprightKeywords: ["踏實", "責任", "持續"], reversedKeywords: ["停滯", "固執", "過度保守"], uprightMeaning: "星幣騎士走得不快，但每一步都算數。穩定會帶你抵達。", reversedMeaning: "穩定若變成僵化，就會讓生命失去流動。請檢查哪裡卡住了。", loveUpright: "愛情慢慢來但可靠，實際行動比甜言蜜語更重要。", loveReversed: "關係可能太慢或缺乏浪漫，請確認不是逃避前進。", workUpright: "適合執行、維持品質、長期專案與責任型任務。", workReversed: "工作停滯或太保守，需要一點新方法。", lifeUpright: "照表走也有力量，今天穩穩完成就很好。", lifeReversed: "別把安全感變成不敢改變的理由。"}),
  minor("pentacles", { key: "queen", court: "queen", rankZh: "皇后", rankEn: "Queen", uprightKeywords: ["滋養", "務實照顧", "安全感"], reversedKeywords: ["過度付出", "匱乏焦慮", "忽略自己"], uprightMeaning: "星幣皇后提醒你，真正的照顧會同時讓身體、心與生活安穩。", reversedMeaning: "你可能照顧了所有人，卻忘了自己也需要被好好對待。", loveUpright: "愛情裡有實際照顧與穩定支持，適合建立生活感。", loveReversed: "別用過度付出換愛，先把能量留一點給自己。", workUpright: "適合管理資源、照顧團隊、穩定財務與實作成果。", workReversed: "工作與照顧責任可能過重，請重新分配。", lifeUpright: "好好吃飯、睡覺、整理空間，都是神聖的療癒。", lifeReversed: "安全感不是把自己耗乾，而是懂得補回來。"}),
  minor("pentacles", { key: "king", court: "king", rankZh: "國王", rankEn: "King", uprightKeywords: ["成就", "穩固", "資源掌握"], reversedKeywords: ["貪著", "僵化", "物質壓力"], uprightMeaning: "星幣國王代表成熟的穩定，提醒你用資源保護生活，而不是被資源綁住。", reversedMeaning: "當安全感只剩控制與數字，心會忘記什麼是真正富足。", loveUpright: "愛情需要穩定承諾與實際照顧，適合談未來生活。", loveReversed: "小心把關係變成條件交換，愛不該只有現實考量。", workUpright: "事業、管理、財務與長期資源掌握有利。", workReversed: "工作上可能過度保守或被物質壓力綁住。", lifeUpright: "建立穩固生活，同時記得享受它。", lifeReversed: "別讓追求安定，變成失去柔軟的理由。"}),
];

export const tarotCards: TarotCard[] = [
  ...majors,
  ...wands,
  ...cups,
  ...swords,
  ...pentacles,
];
