export type TarotCard = {
  id: string;
  name: string;
  image: string;
  uprightMeaning: string;
  reversedMeaning: string;
  keywords: string[];
  love: string;
  career: string;
  advice: string;
};

export const tarotCards: TarotCard[] = [
  {
    id: "the-fool",
    name: "愚者",
    image: "/tarot-images/The Fool.png",
    uprightMeaning: "新的旅程正在打開。你不需要看清全部地圖，只要先讓心往自由的方向走一步。",
    reversedMeaning: "衝動可能讓你忽略真正的感受。暫停一下，確認自己不是為了逃離而出發。",
    keywords: ["開始", "自由", "未知"],
    love: "感情裡有新的可能，也可能是一段讓你重新認識自己的關係。",
    career: "適合嘗試新方法，但重要決定前要先看清資源與風險。",
    advice: "保持好奇，但別把不安誤認成命運的催促。"
  },
  {
    id: "the-magician",
    name: "魔術師",
    image: "/tarot-images/The Magician.png",
    uprightMeaning: "你手上其實已經有足夠工具。把意念聚焦，宇宙會回應你清楚的行動。",
    reversedMeaning: "能量分散時，事情容易只停在想像。先收回注意力，別急著說服所有人。",
    keywords: ["創造", "意志", "資源"],
    love: "你有能力主動表達，也能讓關係出現新的互動方式。",
    career: "適合提案、溝通、展現專長，讓別人看見你的能力。",
    advice: "把想法落地成一個小動作，今天就會開始改變。"
  },
  {
    id: "the-high-priestess",
    name: "女祭司",
    image: "/tarot-images/The High Priestess.png",
    uprightMeaning: "答案已經在你心裡，只是需要更安靜的空間浮現。先觀察，不必立刻行動。",
    reversedMeaning: "你可能忽略了內在警訊。別急著合理化不舒服，身體比頭腦更早知道答案。",
    keywords: ["直覺", "秘密", "等待"],
    love: "有些情緒尚未被說清楚，適合慢慢確認彼此真正的心意。",
    career: "先蒐集資訊，不要過早站隊或公開還沒成熟的計畫。",
    advice: "今天的指引不是向外追問，而是回到自己的安靜。"
  },
  {
    id: "the-empress",
    name: "皇后",
    image: "/tarot-images/The Empress.png",
    uprightMeaning: "豐盛正在靠近。當你願意照顧自己，世界也會用更柔軟的方式照顧你。",
    reversedMeaning: "你可能給了太多，卻忘了補回自己的能量。愛不該只剩消耗。",
    keywords: ["滋養", "豐盛", "溫柔"],
    love: "關係裡需要更多照顧與真實感受，也適合讓愛自然生長。",
    career: "創意、內容、美感與照護相關工作會有不錯的流動。",
    advice: "先讓自己舒服，好的選擇會從穩定裡長出來。"
  },
  {
    id: "the-emperor",
    name: "皇帝",
    image: "/tarot-images/The Emperor.png",
    uprightMeaning: "你需要一個穩定的框架。界線不是冷漠，而是保護重要事物的方式。",
    reversedMeaning: "過度控制會讓心變硬。試著分辨秩序與壓抑之間的差別。",
    keywords: ["秩序", "責任", "界線"],
    love: "感情需要承諾與明確態度，曖昧不清會消耗安全感。",
    career: "適合整理流程、制定規則、承擔領導或決策責任。",
    advice: "把界線說清楚，你的溫柔才不會被誤用。"
  },
  {
    id: "the-hierophant",
    name: "教皇",
    image: "/tarot-images/The Hierophant.png",
    uprightMeaning: "你正在尋找值得信任的答案。傳統、經驗或前輩提醒會帶來支持。",
    reversedMeaning: "不要只因為別人都這樣做，就忽略你靈魂真正想走的路。",
    keywords: ["信念", "學習", "指引"],
    love: "關係需要共同價值觀，彼此對未來的想像值得好好談談。",
    career: "適合學習、考證、建立專業信任，或請教有經驗的人。",
    advice: "尊重經驗，也保留自己的內在答案。"
  },
  {
    id: "the-lovers",
    name: "戀人",
    image: "/tarot-images/The Lovers.png",
    uprightMeaning: "選擇正在靠近，而真正重要的是你能否誠實面對自己的渴望。",
    reversedMeaning: "心與行動可能不一致。別為了被愛，選擇一個委屈自己的答案。",
    keywords: ["選擇", "連結", "真心"],
    love: "感情能量強烈，適合確認關係、靠近彼此或說出真心。",
    career: "合作機會出現，但需要確認雙方目標是否一致。",
    advice: "選擇讓你更像自己的那條路。"
  },
  {
    id: "the-chariot",
    name: "戰車",
    image: "/tarot-images/The Chariot.png",
    uprightMeaning: "把方向握回手中。只要你不被雜音拉走，事情會往前推進。",
    reversedMeaning: "太急著衝刺可能讓你失去平衡。先調整方向，再加速也不遲。",
    keywords: ["前進", "掌控", "決心"],
    love: "需要主動溝通，但也要避免把關係變成輸贏。",
    career: "適合推進專案、面試、競爭與設定短期目標。",
    advice: "專注在真正想抵達的地方，不必回應所有干擾。"
  },
  {
    id: "strength",
    name: "力量",
    image: "/tarot-images/Strength.png",
    uprightMeaning: "真正的力量不是壓抑情緒，而是溫柔地陪自己穿過它。",
    reversedMeaning: "你可能對自己太嚴格了。疲憊不是失敗，是身體正在要求被聽見。",
    keywords: ["勇氣", "柔軟", "自持"],
    love: "用溫柔而堅定的方式表達需求，關係會更靠近真實。",
    career: "適合處理壓力、人際協調，或穩住一件需要耐心的事。",
    advice: "今天不要硬撐，溫柔也是一種很深的力量。"
  },
  {
    id: "the-hermit",
    name: "隱者",
    image: "/tarot-images/The Hermit.png",
    uprightMeaning: "你需要一點獨處，把別人的聲音放遠，才能聽見自己的燈。",
    reversedMeaning: "孤單不等於清醒。若你把自己關太久，記得讓支持你的人靠近。",
    keywords: ["獨處", "內省", "智慧"],
    love: "感情裡適合暫停追問，把注意力放回自己的需求。",
    career: "適合研究、整理、深度工作，不必急著公開成果。",
    advice: "留一段只屬於自己的時間，答案會在沉澱後出現。"
  },
  {
    id: "wheel-of-fortune",
    name: "命運之輪",
    image: "/tarot-images/Wheel of Fortune.png",
    uprightMeaning: "局勢正在轉動。你無法控制所有變化，但可以選擇如何接住機會。",
    reversedMeaning: "重複的模式正在提醒你：若不改變回應方式，故事會再次上演。",
    keywords: ["轉變", "循環", "機會"],
    love: "關係進入轉折，可能重逢、推進，也可能看清循環。",
    career: "變動帶來新機會，保持彈性比堅持原計畫更重要。",
    advice: "不要抗拒變化，先看見它想把你帶往哪裡。"
  },
  {
    id: "justice",
    name: "正義",
    image: "/tarot-images/Justice.png",
    uprightMeaning: "真相會慢慢浮現。清楚、誠實與公平，是今天最重要的保護。",
    reversedMeaning: "你可能在某件事上委屈自己，或逃避該面對的結果。",
    keywords: ["公平", "真相", "決定"],
    love: "適合談清楚期待、責任與界線，避免只靠猜測維持關係。",
    career: "合約、規則、分工與責任需要仔細確認。",
    advice: "誠實不是傷人，而是讓事情回到正確的位置。"
  },
  {
    id: "the-hanged-man",
    name: "吊人",
    image: "/tarot-images/The Hanged Man.png",
    uprightMeaning: "暫停不是停滯，而是換一個角度看見新的出口。",
    reversedMeaning: "你可能犧牲太多，卻沒有真正換來想要的結果。",
    keywords: ["暫停", "臣服", "新角度"],
    love: "關係需要空間，不必急著要求答案，先看清自己是否過度付出。",
    career: "計畫可能延遲，適合重新評估方向與優先順序。",
    advice: "先停止用力，新的理解會從放鬆裡出現。"
  },
  {
    id: "death",
    name: "死神",
    image: "/tarot-images/Death.png",
    uprightMeaning: "某個階段正在結束。這不是失去全部，而是讓新生命有位置進來。",
    reversedMeaning: "你知道該放下，卻仍握著舊模式不放。溫柔地承認它已經不適合你。",
    keywords: ["結束", "重生", "放下"],
    love: "關係需要轉化，可能是告別舊互動，也可能是重新定義彼此。",
    career: "適合結束不再有效的做法，開始新的工作節奏。",
    advice: "讓該結束的結束，你才有力氣迎接新的自己。"
  },
  {
    id: "temperance",
    name: "節制",
    image: "/tarot-images/Temperance.png",
    uprightMeaning: "今天適合把失衡的地方調回來。溫柔不是退讓，而是找回自己的節奏。",
    reversedMeaning: "能量可能被拉扯到兩端。先別急著做極端選擇，慢慢調回中間。",
    keywords: ["調和", "療癒", "耐心"],
    love: "需要溝通與互相調整，別讓情緒一次爆開。",
    career: "適合協調資源、修正流程，慢慢讓事情回到穩定。",
    advice: "小幅度修正，比一次推翻更能帶你回到平衡。"
  },
  {
    id: "the-devil",
    name: "惡魔",
    image: "/tarot-images/The Devil.png",
    uprightMeaning: "你正在看見某種執著。它也許迷人，但不一定真正滋養你。",
    reversedMeaning: "你正在鬆開束縛。即使還沒完全自由，也已經開始不再被牽著走。",
    keywords: ["慾望", "綑綁", "看見"],
    love: "強烈吸引可能伴隨不安，請分辨心動與依賴。",
    career: "留意過度消耗、權力壓力或短期利益帶來的交換。",
    advice: "看清讓你失去自由的東西，就是重新選擇的開始。"
  },
  {
    id: "the-tower",
    name: "高塔",
    image: "/tarot-images/The Tower.png",
    uprightMeaning: "突然的變化正在拆掉不穩的結構。震動之後，你會看見真正需要重建的地方。",
    reversedMeaning: "你可能感覺到危機卻還在拖延。主動調整會比被迫崩塌更溫柔。",
    keywords: ["震動", "醒悟", "重建"],
    love: "關係裡隱藏的問題可能浮現，這是痛但清醒的時刻。",
    career: "計畫變動、制度調整或突發事件，需要快速回到核心。",
    advice: "不要只害怕崩塌，也看看它替你拆掉了什麼假象。"
  },
  {
    id: "the-star",
    name: "星星",
    image: "/tarot-images/The Star.png",
    uprightMeaning: "你正在慢慢恢復光。把期待放回心上，接下來會有柔和的支持靠近。",
    reversedMeaning: "希望還在，只是你暫時看不見。先不要否定自己正在修復的速度。",
    keywords: ["希望", "修復", "信任"],
    love: "關係有療癒空間，適合誠實分享脆弱與期待。",
    career: "願景正在成形，適合累積作品、曝光與長期計畫。",
    advice: "保留一點相信，光會從很小的地方回來。"
  },
  {
    id: "the-moon",
    name: "月亮",
    image: "/tarot-images/The Moon.png",
    uprightMeaning: "有些感受還沒有被說清楚。今晚先相信直覺，但不要急著替未知下結論。",
    reversedMeaning: "迷霧正在散開。你會開始分辨想像、恐懼與真正的訊息。",
    keywords: ["直覺", "夢境", "不安"],
    love: "曖昧與不確定感較強，適合觀察行動而不是只聽承諾。",
    career: "資訊可能不完整，重要決策前要再確認細節。",
    advice: "不必急著知道答案，先把內在的不安照顧好。"
  },
  {
    id: "the-sun",
    name: "太陽",
    image: "/tarot-images/The Sun.png",
    uprightMeaning: "清楚與溫暖正在照進來。你可以放心展現自己，也可以接受好消息。",
    reversedMeaning: "快樂可能被壓低了音量。別因為害怕失望，就不允許自己期待。",
    keywords: ["明朗", "喜悅", "能量"],
    love: "感情能量明亮，適合約會、坦白、讓關係更自然。",
    career: "能見度提升，成果容易被看見，也適合主動爭取機會。",
    advice: "讓自己被看見，這不是炫耀，是回到生命力。"
  },
  {
    id: "judgement",
    name: "審判",
    image: "/tarot-images/Judgement.png",
    uprightMeaning: "你正在被喚醒。過去的經驗不是要困住你，而是提醒你可以重新選擇。",
    reversedMeaning: "你可能還在用舊眼光審判自己。放過過去，才能聽見新的召喚。",
    keywords: ["覺醒", "回應", "重生"],
    love: "舊議題可能回來，這次請用更成熟的方式回應。",
    career: "適合做重要決定、回顧成果，或重新定位自己的方向。",
    advice: "你不需要永遠活在舊版本裡。"
  },
  {
    id: "the-world",
    name: "世界",
    image: "/tarot-images/The World.png",
    uprightMeaning: "一個循環正在完成。你走到這裡不是偶然，請好好收下自己的成長。",
    reversedMeaning: "差最後一步就能收尾。別在完成前懷疑自己，整理好就能前進。",
    keywords: ["完成", "整合", "圓滿"],
    love: "關係進入更完整的理解，適合談未來或為彼此定位。",
    career: "成果收束、專案完成、階段轉換，下一個舞台正在靠近。",
    advice: "為自己走過的路致謝，然後準備迎接新的循環。"
  }
];
