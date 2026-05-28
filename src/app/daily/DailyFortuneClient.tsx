"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const zodiacSigns = [
  "牡羊座",
  "金牛座",
  "雙子座",
  "巨蟹座",
  "獅子座",
  "處女座",
  "天秤座",
  "天蠍座",
  "射手座",
  "摩羯座",
  "水瓶座",
  "雙魚座",
] as const;

type ZodiacSign = (typeof zodiacSigns)[number];

type FortuneAspect = {
  stars: number;
  text: string;
  reminder: string;
};

type DailyFortune = {
  overall: string;
  luckyColor: string;
  luckyNumber: number;
  love: FortuneAspect;
  work: FortuneAspect;
  life: FortuneAspect;
  mood: FortuneAspect;
  action: string;
};

const zodiacSymbols: Record<ZodiacSign, string> = {
  牡羊座: "♈",
  金牛座: "♉",
  雙子座: "♊",
  巨蟹座: "♋",
  獅子座: "♌",
  處女座: "♍",
  天秤座: "♎",
  天蠍座: "♏",
  射手座: "♐",
  摩羯座: "♑",
  水瓶座: "♒",
  雙魚座: "♓",
};

const zodiacDates: Record<ZodiacSign, string> = {
  牡羊座: "3/21-4/19",
  金牛座: "4/20-5/20",
  雙子座: "5/21-6/21",
  巨蟹座: "6/22-7/22",
  獅子座: "7/23-8/22",
  處女座: "8/23-9/22",
  天秤座: "9/23-10/23",
  天蠍座: "10/24-11/21",
  射手座: "11/22-12/21",
  摩羯座: "12/22-1/19",
  水瓶座: "1/20-2/18",
  雙魚座: "2/19-3/20",
};

const zodiacImages: Record<ZodiacSign, string> = {
  牡羊座: "/images/zodiac/aries-cat.webp",
  金牛座: "/images/zodiac/taurus-cat.webp",
  雙子座: "/images/zodiac/gemini-cat.webp",
  巨蟹座: "/images/zodiac/cancer-cat.webp",
  獅子座: "/images/zodiac/leo-cat.webp",
  處女座: "/images/zodiac/virgo-cat.webp",
  天秤座: "/images/zodiac/libra-cat.webp",
  天蠍座: "/images/zodiac/scorpio-cat.webp",
  射手座: "/images/zodiac/sagittarius-cat.webp",
  摩羯座: "/images/zodiac/capricorn-cat.webp",
  水瓶座: "/images/zodiac/aquarius-cat.webp",
  雙魚座: "/images/zodiac/pisces-cat.webp",
};

const zodiacEnNames: Record<ZodiacSign, string> = {
  牡羊座: "ARIES",
  金牛座: "TAURUS",
  雙子座: "GEMINI",
  巨蟹座: "CANCER",
  獅子座: "LEO",
  處女座: "VIRGO",
  天秤座: "LIBRA",
  天蠍座: "SCORPIO",
  射手座: "SAGITTARIUS",
  摩羯座: "CAPRICORN",
  水瓶座: "AQUARIUS",
  雙魚座: "PISCES",
};

const dailyFortunes: Record<ZodiacSign, Omit<DailyFortune, "mood">> = {
  牡羊座: {
    overall: "今天的你適合把想做的事先往前推一步，但不用急著證明自己。真正重要的是，把力氣用在值得的地方。",
    luckyColor: "晨光金",
    luckyNumber: 7,
    love: {
      stars: 3,
      text: "感情裡有一點想靠近又怕太快的拉扯。你可以主動釋出善意，但不必把全部感受一次攤開。",
      reminder: "先丟出一個輕鬆訊號，觀察對方是否願意接住。",
    },
    work: {
      stars: 4,
      text: "工作上會出現需要你快速判斷的時刻。你的直覺不差，但今天更適合先確認關鍵細節再行動。",
      reminder: "把最重要的一件事排到上午完成。",
    },
    life: {
      stars: 2,
      text: "生活節奏有點緊，身體可能比心更早感覺疲累。別把休息當成偷懶，它是在替明天補光。",
      reminder: "晚上留 20 分鐘給自己，不安排任何任務。",
    },
    action: "今天先完成一件小事，再給自己一句肯定。",
  },
  金牛座: {
    overall: "今天適合整理資源與內在狀態。你不需要立刻改變全部，只要把混亂的地方一點一點放回原位。",
    luckyColor: "月霧綠",
    luckyNumber: 2,
    love: {
      stars: 1,
      text: "愛情裡你今天更需要穩定感。慢熱不是退縮，而是在確認這段靠近是否真的安全，不用急著逼出答案。",
      reminder: "先看對方是否持續靠近，再決定投入多少。",
    },
    work: {
      stars: 4,
      text: "今天很適合處理需要耐心的任務。你會在細節裡找到進度，也能讓別人看見你的可靠。",
      reminder: "把待辦拆小，先清掉最卡的那一格。",
    },
    life: {
      stars: 3,
      text: "生活需要一點質感來安定你。吃好一點、睡穩一點，心裡的焦躁會慢慢降下來。",
      reminder: "為自己準備一個舒服的夜晚儀式。",
    },
    action: "今天不要催促自己，穩穩走完就很好。",
  },
  雙子座: {
    overall: "今天訊息很多，但你的答案不一定在更多選項裡，而是在你願不願意停下來分辨什麼最重要。",
    luckyColor: "星河銀",
    luckyNumber: 5,
    love: {
      stars: 3,
      text: "對話會替你打開新的理解。若心裡有疑問，試著用好奇取代試探，氣氛會柔軟很多。",
      reminder: "問一個簡單問題，不要一次追太深。",
    },
    work: {
      stars: 2,
      text: "工作上容易被臨時消息打斷。保持彈性是優勢，但今天也要替自己的專注留一個邊界。",
      reminder: "先列三件必做，其餘晚點再回應。",
    },
    life: {
      stars: 3,
      text: "你需要一點新鮮感來換氣。短短散步、換一首歌、讀幾頁書，都能讓心重新亮起來。",
      reminder: "今晚讓自己接觸一個新的小靈感。",
    },
    action: "把腦中的雜訊寫下來，只留下今天真正要處理的事。",
  },
  巨蟹座: {
    overall: "今天你的感受很敏銳，也更容易接收到別人的情緒。請記得，理解別人之前，也要先照顧自己。",
    luckyColor: "珍珠白",
    luckyNumber: 6,
    love: {
      stars: 4,
      text: "你渴望被好好回應，而不是只靠猜測撐著。今天適合溫柔表達在意，不適合悶著等對方發現。",
      reminder: "把一句想說的話說短一點、真一點。",
    },
    work: {
      stars: 2,
      text: "工作上可能有人需要你的協助，但你不必把所有責任都接過來。清楚界線會讓效率更好。",
      reminder: "答應前先確認自己的時間與能量。",
    },
    life: {
      stars: 5,
      text: "今天很適合回到熟悉的地方補充安全感。家、熱飲、安靜的角落，會讓你重新找回內在節奏。",
      reminder: "整理一個小空間，也是在整理心。",
    },
    action: "今晚把手機放遠一點，好好聽見自己的聲音。",
  },
  獅子座: {
    overall: "今天你的存在感會被看見。真正讓你發光的不是用力表現，而是坦然做自己該做的事。",
    luckyColor: "暖琥珀",
    luckyNumber: 1,
    love: {
      stars: 3,
      text: "感情中你很想被重視。今天可以大方表達喜歡，但也把舞台留一點給對方靠近。",
      reminder: "接受讚美，也接受對方慢慢來。",
    },
    work: {
      stars: 5,
      text: "適合提出想法、爭取資源或讓成果曝光。你的自信會帶動團隊，但記得把功勞分給一起努力的人。",
      reminder: "主動說出你的方案，不要等別人猜。",
    },
    life: {
      stars: 1,
      text: "生活上容易為了面子撐太久。今天請允許自己有普通的一面，那並不會讓你失去光。",
      reminder: "做一件只讓自己開心的小事。",
    },
    action: "把最有把握的部分拿出來，讓它成為今天的開場。",
  },
  處女座: {
    overall: "今天適合把混亂變得清楚。你不用一次做到完美，只要把下一步整理出來，心就會安定許多。",
    luckyColor: "霧藍灰",
    luckyNumber: 4,
    love: {
      stars: 2,
      text: "你可能會反覆檢查對方的細節，但感情不是考卷。今天試著看整體感受，而不是只盯著瑕疵。",
      reminder: "少分析一點，多感受一次相處後的身心狀態。",
    },
    work: {
      stars: 4,
      text: "你的整理能力會派上用場。適合修正流程、補齊資料，也適合替接下來的計畫打底。",
      reminder: "先處理最容易產生連鎖效應的問題。",
    },
    life: {
      stars: 3,
      text: "生活需要減量。不是每件事都要排滿，留白反而能讓你更快恢復清醒。",
      reminder: "刪掉一個不必要的安排。",
    },
    action: "今天只設定一個清楚目標，完成後就停下來。",
  },
  天秤座: {
    overall: "今天你會更在意關係裡的平衡。別急著討好所有人，真正和諧的關係也容得下你的選擇。",
    luckyColor: "玫瑰霧",
    luckyNumber: 8,
    love: {
      stars: 5,
      text: "感情氣氛有機會變柔軟。你若願意放下過度斟酌，真誠的一句話會比完美回覆更有力量。",
      reminder: "把猶豫縮短，讓對方看見你的心意。",
    },
    work: {
      stars: 2,
      text: "工作上可能需要協調不同期待。你擅長看見雙方立場，但今天也要明確說出自己的底線。",
      reminder: "先寫下你能接受與不能接受的條件。",
    },
    life: {
      stars: 3,
      text: "美感會療癒你。換一個桌面、點一盞燈、穿上喜歡的顏色，都能讓今天更順眼。",
      reminder: "為生活加一個小小的漂亮細節。",
    },
    action: "選一件你真正想做的事，不用先問所有人的意見。",
  },
  天蠍座: {
    overall: "今天你的洞察力很強，但也可能看得太深而讓自己緊繃。答案會來，不必逼自己立刻拆穿一切。",
    luckyColor: "深莓紫",
    luckyNumber: 9,
    love: {
      stars: 3,
      text: "你可能感覺到對方沒有說完的部分。先別用猜測傷害自己，觀察行動比反覆推演更準。",
      reminder: "把安全感交回自己手裡一點。",
    },
    work: {
      stars: 3,
      text: "適合處理隱藏問題或重新評估合作關係。今天你能看出關鍵，但表達時要留一點柔軟。",
      reminder: "先掌握證據，再提出判斷。",
    },
    life: {
      stars: 2,
      text: "情緒需要出口，不適合全部壓著。寫下來、洗個熱水澡、把房間燈調暗，都能讓心慢慢鬆開。",
      reminder: "不要在情緒最滿的時候做決定。",
    },
    action: "今天把一個反覆困擾你的念頭，寫成可以處理的問題。",
  },
  射手座: {
    overall: "今天適合把視野打開。你不一定要立刻出發，但可以替下一段路先留一個可能性。",
    luckyColor: "曙光橘",
    luckyNumber: 3,
    love: {
      stars: 1,
      text: "感情裡需要一點空氣。若你覺得被期待壓住，先誠實說明你的節奏，不要突然消失。",
      reminder: "用輕鬆方式說出你需要的自由。",
    },
    work: {
      stars: 3,
      text: "新的想法會浮現，適合研究方向、開啟提案或看看外部機會。別急著定案，先收集素材。",
      reminder: "今天花 15 分鐘查一個想學的新技能。",
    },
    life: {
      stars: 4,
      text: "生活運帶著流動感。換條路走、安排小旅行或跟有趣的人聊聊，都能讓心恢復明亮。",
      reminder: "給自己一個不照表操課的片刻。",
    },
    action: "把想很久的事列成第一步，而不是只放在腦中旅行。",
  },
  摩羯座: {
    overall: "今天你的責任感很強，但請別把所有事都扛成一座山。你可以很可靠，也可以需要支援。",
    luckyColor: "松石黑",
    luckyNumber: 10,
    love: {
      stars: 2,
      text: "愛情裡別讓工作壓力替你說話。你可以有界線，也可以示弱；不要把冷靜包裝成逃避。",
      reminder: "先分開壓力與感受，再回應對方。",
    },
    work: {
      stars: 4,
      text: "工作上適合處理長期計畫與重要承諾。你的穩定會帶來信任，但別把別人的急迫全變成你的壓力。",
      reminder: "先分清楚哪件事真的今天非做不可。",
    },
    life: {
      stars: 3,
      text: "生活提醒你重新安排體力。休息不是拖延，而是讓你之後走得更久的必要準備。",
      reminder: "今晚把明天要用的東西先簡單備好。",
    },
    action: "今天只扛自己該扛的，其餘交回該負責的人。",
  },
  水瓶座: {
    overall: "今天你的想法很有穿透力，但心也需要被理解。不要只站在遠處觀察，偶爾靠近也不會失去自由。",
    luckyColor: "極光藍",
    luckyNumber: 11,
    love: {
      stars: 3,
      text: "感情裡有新鮮的互動可能。你可以分享一個真實想法，讓對方看見你冷靜背後的溫度。",
      reminder: "不要只回應事情，也回應感受。",
    },
    work: {
      stars: 3,
      text: "適合提出不同觀點或改善既有方式。你的創意有價值，但今天要把概念說得更容易被理解。",
      reminder: "用一個具體例子說明你的想法。",
    },
    life: {
      stars: 1,
      text: "生活有點像訊號太多的夜空。暫時降低資訊量，反而能讓你聽見內心真正想去哪裡。",
      reminder: "睡前 30 分鐘遠離訊息流。",
    },
    action: "把一個抽象念頭寫成可以執行的小實驗。",
  },
  雙魚座: {
    overall: "今天你的感受像潮水一樣細緻。請相信溫柔不是沒有方向，它只是需要比較安靜地帶你前進。",
    luckyColor: "月光紫",
    luckyNumber: 12,
    love: {
      stars: 4,
      text: "感情裡有被理解的機會。你可以多相信自己的感覺，但也要讓對方知道你真正需要的是什麼。",
      reminder: "別只等待對方猜中，給一點清楚提示。",
    },
    work: {
      stars: 2,
      text: "工作上容易被情緒影響判斷。今天適合先完成簡單明確的任務，讓成就感慢慢把你拉回來。",
      reminder: "先做最不需要糾結的那一件。",
    },
    life: {
      stars: 3,
      text: "生活需要一點柔軟的邊界。你可以關心別人，但不用把別人的低潮全部接到自己身上。",
      reminder: "替自己留一段不回覆也可以的時間。",
    },
    action: "今晚讓心慢下來，把想太多的地方交給睡眠。",
  },
};

const moodFortunes: Record<ZodiacSign, FortuneAspect> = {
  牡羊座: {
    stars: 3,
    text: "今天內在像剛點亮的火，想快點把事情推開。先別急著衝出去，給自己三次深呼吸，情緒會更有方向。",
    reminder: "有力量，也要讓心跟上腳步。",
  },
  金牛座: {
    stars: 2,
    text: "今天你的內在需要安定與確定感。與其反覆檢查外界反應，不如先照顧身體，讓自己回到穩穩的節奏。",
    reminder: "慢下來，不代表停在原地。",
  },
  雙子座: {
    stars: 2,
    text: "今天腦中訊息跑得很快，情緒也容易被不同想法牽著走。把念頭寫下來，會比一直在心裡轉更清楚。",
    reminder: "先整理腦袋，再決定感受。",
  },
  巨蟹座: {
    stars: 4,
    text: "今天你比較容易吸收別人的情緒。請記得你可以溫柔，但不用把每個人的低潮都放進自己心裡。",
    reminder: "把界線放柔，但不要拿掉。",
  },
  獅子座: {
    stars: 2,
    text: "今天你可能想保持明亮，卻也有一點不想被看見的疲累。允許自己普通一點，光不會因此消失。",
    reminder: "不用一直表現很好，也值得被愛。",
  },
  處女座: {
    stars: 3,
    text: "今天你容易在細節裡打轉，覺得哪裡還不夠好。先把標準放低一點，你會發現自己已經做得不少。",
    reminder: "整理可以，但不要苛責自己。",
  },
  天秤座: {
    stars: 3,
    text: "今天你的內在在找平衡，可能一邊想配合，一邊又覺得委屈。先聽見自己的偏好，再去談和諧。",
    reminder: "真正的平衡也包含你的感受。",
  },
  天蠍座: {
    stars: 1,
    text: "今天內在感受很深，容易把一個訊號想得很遠。先別急著下結論，讓情緒沉一沉，真相會更清楚。",
    reminder: "深刻很好，但別用猜測傷自己。",
  },
  射手座: {
    stars: 5,
    text: "今天你需要一點空氣感。若覺得煩悶，換個環境或走一小段路，會比逼自己想通更有效。",
    reminder: "讓身體移動，心也會鬆開。",
  },
  摩羯座: {
    stars: 3,
    text: "今天你可能習慣把累收起來，像沒事一樣繼續做。請分清楚堅強與硬撐，今晚可以少扛一點。",
    reminder: "休息不是失控，是重新站穩。",
  },
  水瓶座: {
    stars: 2,
    text: "今天你的情緒可能隔著一層理性才被看見。別急著分析所有原因，先承認自己其實也需要被理解。",
    reminder: "想清楚之前，也可以先感受。",
  },
  雙魚座: {
    stars: 4,
    text: "今天內在像潮水，容易被一句話或一段回憶牽動。把感受放慢，不用急著替所有情緒命名。",
    reminder: "溫柔接住自己，比解釋更重要。",
  },
};

const aspectConfig = [
  { key: "love" as const, label: "愛情", gradient: "from-pink-300/20 to-lavender/16" },
  { key: "work" as const, label: "工作", gradient: "from-aurora/18 to-nebula/16" },
  { key: "life" as const, label: "生活", gradient: "from-moon/18 to-lavender/14" },
  { key: "mood" as const, label: "心情", gradient: "from-lavender/22 to-[#d8bd70]/12" },
];

function Stars({ count }: { count: number }) {
  const safeCount = Math.min(5, Math.max(1, Math.round(count)));

  return (
    <span className="whitespace-nowrap tracking-widest" aria-label={`${safeCount} 顆星`}>
      <span className="text-amber-300">{"★".repeat(safeCount)}</span>
      <span className="text-moon/25">{"☆".repeat(5 - safeCount)}</span>
    </span>
  );
}

function isFortuneAspect(value: unknown): value is FortuneAspect {
  if (!value || typeof value !== "object") return false;
  const aspect = value as Record<string, unknown>;

  return (
    typeof aspect.stars === "number" &&
    typeof aspect.text === "string" &&
    typeof aspect.reminder === "string"
  );
}

function isDailyFortune(value: unknown): value is DailyFortune {
  if (!value || typeof value !== "object") return false;
  const fortune = value as Record<string, unknown>;

  return (
    typeof fortune.overall === "string" &&
    typeof fortune.luckyColor === "string" &&
    typeof fortune.luckyNumber === "number" &&
    typeof fortune.action === "string" &&
    isFortuneAspect(fortune.love) &&
    isFortuneAspect(fortune.work) &&
    isFortuneAspect(fortune.life) &&
    isFortuneAspect(fortune.mood)
  );
}

// ──────────────────────────────────────────────────────
// Canvas helpers for zodiac story image (1080 × 1920)
// ──────────────────────────────────────────────────────

function zLoadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`圖片載入失敗：${src}`));
    img.src = src;
  });
}

function zRR(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function zWrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const lines: string[] = [];
  let cur = "";
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > maxWidth && cur) { lines.push(cur); cur = ch; }
    else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

async function generateZodiacStoryImage(
  sign: ZodiacSign,
  fortune: DailyFortune,
  siteUrlRaw: string,
): Promise<Blob> {
  const W = 1080, H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("無法建立 Canvas 環境，請重新整理頁面。");

  const ff = "'PingFang TC','Microsoft JhengHei','Noto Sans TC',sans-serif";
  const siteUrl = siteUrlRaw.replace(/^https?:\/\//, "");

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#05071d"); bg.addColorStop(0.55, "#0d0b2a"); bg.addColorStop(1, "#1a0e2e");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  try { const bi = await zLoadImg("/reference/story-bg.png"); ctx.drawImage(bi, 0, 0, W, H); } catch { /* use gradient */ }

  // Decorative stars
  for (const [x, y, sz, a] of [[110, 90, 26, 0.55], [W-130, 125, 20, 0.38], [88, H-228, 22, 0.45], [W-108, H-260, 18, 0.38]] as [number, number, number, number][]) {
    ctx.font = `${sz}px serif`; ctx.fillStyle = `rgba(247,217,135,${a})`; ctx.textAlign = "left";
    ctx.fillText("✦", x, y + sz);
  }

  // ── Header ──
  ctx.textAlign = "center";
  ctx.font = `600 28px ${ff}`; ctx.fillStyle = "rgba(247,217,135,0.88)";
  ctx.fillText("UNIVERSE WHISPER", W / 2, 120);

  ctx.font = `700 90px ${ff}`; ctx.fillStyle = "#f7d987";
  ctx.shadowBlur = 18; ctx.shadowColor = "rgba(247,217,135,0.36)";
  ctx.fillText("宇宙偷偷話", W / 2, 210); ctx.shadowBlur = 0;

  ctx.font = `400 28px ${ff}`; ctx.fillStyle = "rgba(255,247,230,0.72)";
  ctx.fillText("今日星座運勢", W / 2, 265);

  // ── Zodiac image ──
  const IW = 302, IH = 437, icx = W / 2, icy = 540;
  ctx.save();
  ctx.shadowBlur = 56; ctx.shadowColor = "rgba(247,217,135,0.36)";
  ctx.fillStyle = "rgba(247,217,135,0.16)";
  zRR(ctx, icx - IW / 2 - 18, icy - IH / 2 - 18, IW + 36, IH + 36, 40); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(icx, icy);
  zRR(ctx, -IW / 2, -IH / 2, IW, IH, 26); ctx.clip();
  ctx.fillStyle = "#130b32"; ctx.fillRect(-IW / 2, -IH / 2, IW, IH);
  try {
    const zi = await zLoadImg(zodiacImages[sign]);
    ctx.drawImage(zi, -IW / 2, -IH / 2, IW, IH);
  } catch {
    ctx.font = "72px serif"; ctx.textAlign = "center"; ctx.fillStyle = "#f7d987";
    ctx.fillText(zodiacSymbols[sign], 0, 28);
  }
  ctx.restore();

  ctx.save(); ctx.translate(icx, icy);
  zRR(ctx, -IW / 2, -IH / 2, IW, IH, 26);
  ctx.strokeStyle = "rgba(247,217,135,0.80)"; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.restore();

  // ── Date ──
  let cy = icy + IH / 2 + 36;
  ctx.textAlign = "center";
  ctx.font = `400 26px ${ff}`; ctx.fillStyle = "rgba(247,217,135,0.80)";
  ctx.fillText(new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "long", day: "numeric" }).format(new Date()), W / 2, cy);
  cy += 46;

  // ── Overall box ──
  const BX = 80, BW = 920, BPXY = 34, BPXX = 52;
  const otext = fortune.overall.replace(/\*\*/g, "").trim();
  ctx.font = `400 29px ${ff}`;
  const oLines = zWrap(ctx, otext, BW - BPXX * 2).slice(0, 3);
  const LH29 = 29 * 1.72;
  const BH = BPXY * 2 + 44 + 16 + oLines.length * LH29;

  ctx.save();
  zRR(ctx, BX, cy, BW, BH, 46); ctx.clip();
  const bg2 = ctx.createLinearGradient(BX, cy, BX + BW * 0.5, cy + BH);
  bg2.addColorStop(0, "rgba(255,247,230,0.94)"); bg2.addColorStop(0.5, "rgba(248,232,216,0.90)"); bg2.addColorStop(1, "rgba(246,219,226,0.86)");
  ctx.fillStyle = bg2; ctx.fillRect(BX, cy, BW, BH);
  ctx.restore();

  ctx.save(); ctx.shadowBlur = 50; ctx.shadowColor = "rgba(5,7,24,0.28)";
  zRR(ctx, BX, cy, BW, BH, 46); ctx.strokeStyle = "rgba(202,168,95,0.52)"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();

  const btext = "今日整體運勢";
  ctx.font = `700 22px ${ff}`;
  const bfw = ctx.measureText(btext).width + 44;
  const bbx = (W - bfw) / 2, bby = cy + BPXY;
  ctx.save(); zRR(ctx, bbx, bby, bfw, 44, 22); ctx.fillStyle = "#caa85f"; ctx.fill(); ctx.restore();
  ctx.textAlign = "center"; ctx.font = `700 22px ${ff}`; ctx.fillStyle = "white"; ctx.fillText(btext, W / 2, bby + 29);
  const sly = bby + 22;
  ctx.strokeStyle = "rgba(189,148,75,0.55)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(BX + BPXX, sly); ctx.lineTo(bbx - 12, sly); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bbx + bfw + 12, sly); ctx.lineTo(BX + BW - BPXX, sly); ctx.stroke();

  ctx.font = `400 29px ${ff}`; ctx.fillStyle = "#241937"; ctx.textAlign = "center";
  const otY = bby + 44 + 20;
  oLines.forEach((l, i) => ctx.fillText(l, W / 2, otY + i * LH29));
  cy += BH + 20;

  // ── Aspect boxes (2 × 2) ──
  const AW = 490, AH = 155, AGAPX = 20, AGAPY = 14, APX = 26, APY = 18;
  const AX0 = (W - AW * 2 - AGAPX) / 2;
  const aspects: { label: string; stars: number; text: string }[] = [
    { label: "愛情運", stars: fortune.love.stars, text: fortune.love.reminder },
    { label: "工作運", stars: fortune.work.stars, text: fortune.work.reminder },
    { label: "財運",   stars: fortune.life.stars, text: fortune.life.reminder },
    { label: "宇宙小提醒", stars: 0, text: fortune.action },
  ];
  const aColors = ["rgba(252,182,200,0.28)", "rgba(100,200,230,0.22)", "rgba(200,230,150,0.22)", "rgba(200,180,255,0.22)"];

  for (let i = 0; i < 4; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const ax = AX0 + col * (AW + AGAPX);
    const ay = cy + row * (AH + AGAPY);
    const asp = aspects[i];

    ctx.save(); zRR(ctx, ax, ay, AW, AH, 28);
    ctx.fillStyle = "rgba(13,11,42,0.78)"; ctx.fill();
    ctx.strokeStyle = "rgba(247,217,135,0.20)"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();

    ctx.save(); zRR(ctx, ax, ay, AW, AH, 28); ctx.clip();
    const tg = ctx.createLinearGradient(ax, ay, ax, ay + 55);
    tg.addColorStop(0, aColors[i]); tg.addColorStop(1, "transparent");
    ctx.fillStyle = tg; ctx.fillRect(ax, ay, AW, AH); ctx.restore();

    ctx.font = `700 23px ${ff}`; ctx.fillStyle = "#f7d987"; ctx.textAlign = "left";
    ctx.fillText(asp.label, ax + APX, ay + APY + 23);

    if (asp.stars > 0) {
      ctx.font = "18px serif";
      for (let s = 0; s < 5; s++) {
        ctx.fillStyle = s < asp.stars ? "#f5c518" : "rgba(255,255,255,0.18)";
        ctx.fillText(s < asp.stars ? "★" : "☆", ax + AW - APX - (5 - s) * 20, ay + APY + 23);
      }
    }

    const dly = ay + APY + 35;
    ctx.strokeStyle = "rgba(247,217,135,0.18)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ax + APX, dly); ctx.lineTo(ax + AW - APX, dly); ctx.stroke();

    const tlines = zWrap(ctx, asp.text.replace(/\*\*/g, "").trim(), AW - APX * 2).slice(0, 3);
    ctx.font = `400 21px ${ff}`; ctx.fillStyle = "rgba(255,247,230,0.80)"; ctx.textAlign = "left";
    tlines.forEach((l, li) => ctx.fillText(l, ax + APX, dly + 24 + li * (21 * 1.58)));
  }
  cy += 2 * AH + AGAPY + 22;

  // ── Lucky info ──
  const LCW = 185, LCH = 76;
  const lcX = W / 2 - LCW - 14;
  ctx.save(); zRR(ctx, lcX, cy, LCW, LCH, 18);
  ctx.fillStyle = "rgba(247,217,135,0.12)"; ctx.fill(); ctx.strokeStyle = "rgba(247,217,135,0.30)"; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
  ctx.textAlign = "center";
  ctx.font = `400 18px ${ff}`; ctx.fillStyle = "rgba(255,247,230,0.52)"; ctx.fillText("幸運色", lcX + LCW / 2, cy + 24);
  ctx.font = `700 24px ${ff}`; ctx.fillStyle = "#d8bd70"; ctx.fillText(fortune.luckyColor, lcX + LCW / 2, cy + 57);

  const lnX = W / 2 + 14;
  ctx.save(); zRR(ctx, lnX, cy, LCW, LCH, 18);
  ctx.fillStyle = "rgba(200,180,255,0.10)"; ctx.fill(); ctx.strokeStyle = "rgba(200,180,255,0.28)"; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
  ctx.font = `400 18px ${ff}`; ctx.fillStyle = "rgba(255,247,230,0.52)"; ctx.fillText("幸運數字", lnX + LCW / 2, cy + 24);
  ctx.font = `700 36px ${ff}`; ctx.fillStyle = "rgba(255,247,230,0.88)"; ctx.fillText(String(fortune.luckyNumber), lnX + LCW / 2, cy + 62);
  cy += LCH + 30;

  // ── QR code + LINE invite ──
  const QS = 130, QX = W - QS - 72, QY = cy;

  let qrImg: HTMLImageElement | null = null;
  try {
    const { default: QRCode } = await import("qrcode");
    const qrUrl = await QRCode.toDataURL("https://lin.ee/ObZxFcx", {
      width: 160, margin: 2, color: { dark: "#2a1a3e", light: "#fff8f0" },
    });
    qrImg = await zLoadImg(qrUrl);
  } catch { /* skip QR on failure */ }

  if (qrImg) {
    ctx.save(); ctx.shadowBlur = 20; ctx.shadowColor = "rgba(247,217,135,0.24)";
    zRR(ctx, QX - 8, QY - 8, QS + 16, QS + 16, 14);
    ctx.fillStyle = "#fff8f0"; ctx.fill(); ctx.restore();
    ctx.drawImage(qrImg, QX, QY, QS, QS);
  }

  ctx.textAlign = "left";
  ctx.font = `700 24px ${ff}`; ctx.fillStyle = "rgba(255,247,230,0.86)";
  ctx.fillText("掃描加入 LINE", 72, QY + 38);
  ctx.font = `400 20px ${ff}`; ctx.fillStyle = "rgba(255,247,230,0.60)";
  ctx.fillText("接收每日宇宙訊息", 72, QY + 72);

  // ── Footer ──
  ctx.textAlign = "center";
  ctx.font = `400 22px ${ff}`; ctx.fillStyle = "rgba(255,247,230,0.58)";
  ctx.fillText(`✦  ${siteUrl}  ✦`, W / 2, H - 68);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Canvas 轉換失敗，請重新整理後再試。")),
      "image/png",
    );
  });
}

export function DailyFortuneClient() {
  const [selectedZodiac, setSelectedZodiac] = useState<ZodiacSign | null>(null);
  const [remoteFortunes, setRemoteFortunes] = useState<Partial<Record<ZodiacSign, DailyFortune>>>({});
  const [loadingZodiac, setLoadingZodiac] = useState<ZodiacSign | null>(null);
  const [dailyNote, setDailyNote] = useState("");
  const [storyDownloadStatus, setStoryDownloadStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [storyError, setStoryError] = useState("");

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "universe-whisper.vercel.app");

  useEffect(() => {
    const saved = window.localStorage.getItem("universe-whisper-daily-zodiac");
    if (saved && zodiacSigns.includes(saved as ZodiacSign)) {
      setSelectedZodiac(saved as ZodiacSign);
    }
  }, []);

  useEffect(() => {
    if (!selectedZodiac) return; // no zodiac selected yet
    const controller = new AbortController();

    setLoadingZodiac(selectedZodiac);
    setDailyNote("");

    fetch(`/api/daily-fortune?zodiac=${encodeURIComponent(selectedZodiac)}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("daily fortune request failed");
        return response.json() as Promise<unknown>;
      })
      .then((data) => {
        if (!isDailyFortune(data)) throw new Error("daily fortune payload invalid");
        setRemoteFortunes((current) => ({ ...current, [selectedZodiac]: data }));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDailyNote("今晚訊號有點慢，先給你一則溫柔提醒。");
      })
      .finally(() => {
        setLoadingZodiac((current) => (current === selectedZodiac ? null : current));
      });

    return () => { controller.abort(); };
  }, [selectedZodiac]);

  function selectZodiac(sign: ZodiacSign) {
    setSelectedZodiac(sign);
    window.localStorage.setItem("universe-whisper-daily-zodiac", sign);
    setStoryDownloadStatus("idle");
    setStoryError("");
  }

  // fortune is always defined; dummy fallback used when selectedZodiac is null (never rendered)
  const _ref = selectedZodiac ?? "巨蟹座";
  const fortune: DailyFortune =
    (selectedZodiac ? remoteFortunes[selectedZodiac] : undefined) ??
    { ...dailyFortunes[_ref], mood: moodFortunes[_ref] };
  const isLoading = selectedZodiac !== null && loadingZodiac === selectedZodiac;

  async function downloadZodiacImage() {
    if (storyDownloadStatus === "working" || !selectedZodiac) return;
    setStoryError("");
    try {
      setStoryDownloadStatus("working");
      const blob = await generateZodiacStoryImage(selectedZodiac, fortune, siteUrl);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "universe-whisper-zodiac-story.png";
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      setStoryDownloadStatus("done");
      window.setTimeout(() => setStoryDownloadStatus("idle"), 3500);
    } catch (err) {
      console.error("[zodiac-story] Canvas failed", err);
      setStoryError(err instanceof Error ? err.message : String(err));
      setStoryDownloadStatus("error");
    }
  }

  return (
    <>
      <section className="mt-8 rounded-[1.75rem] border border-lavender/18 bg-midnight/38 p-4 shadow-glow sm:p-6">
        <h2 className="text-xl font-semibold text-moon sm:text-2xl">選擇你的星座</h2>
        <p className="mt-1 text-sm leading-7 text-moon/60">讓今天的訊息更靠近你一點。</p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {zodiacSigns.map((sign) => {
            const isSelected = selectedZodiac === sign;

            return (
              <button
                key={sign}
                type="button"
                onClick={() => selectZodiac(sign)}
                className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 hover:-translate-y-1 hover:scale-[1.03] ${
                  isSelected
                    ? "border-[#d8bd70]/80 bg-[#d8bd70]/12 shadow-[0_0_22px_rgba(216,189,112,0.36)]"
                    : "border-white/12 bg-midnight/50 hover:border-[#d8bd70]/45 hover:bg-white/6"
                }`}
              >
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-t-xl bg-midnight/70">
                  <Image
                    src={zodiacImages[sign]}
                    alt={`${sign}星座卡`}
                    fill
                    sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 15vw"
                    className="object-contain transition-transform duration-300 group-hover:scale-[1.03]"
                    loading={isSelected ? "eager" : "lazy"}
                  />
                  {isSelected && (
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#d8bd70]/20 to-transparent" />
                  )}
                </div>

                <div className={`px-2 py-2 text-center ${isSelected ? "bg-[#d8bd70]/18" : "bg-midnight/72"}`}>
                  <p className={`text-xs font-semibold leading-tight ${isSelected ? "text-[#d8bd70]" : "text-moon/82"}`}>
                    {zodiacSymbols[sign]} {sign}
                  </p>
                  <p className="mt-0.5 text-[10px] text-moon/44">{zodiacDates[sign]}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {!selectedZodiac ? (
        <div className="mt-8 rounded-[1.75rem] border border-white/8 bg-midnight/28 px-6 py-12 text-center">
          <p className="text-lg text-moon/55">點選上方星座，查看今日宇宙訊息 ✦</p>
        </div>
      ) : (
        <>
          <section className="relative mt-6 overflow-hidden rounded-[1.75rem] border border-lavender/20 bg-midnight/52 shadow-glow">
            <div className="pointer-events-none absolute inset-y-4 right-[-10%] z-0 w-[78%] max-w-[520px] opacity-[0.11] blur-[1.5px] sm:right-0 sm:w-[46%]">
              <Image
                src={zodiacImages[selectedZodiac]}
                alt=""
                fill
                sizes="(max-width: 640px) 80vw, 520px"
                className="object-contain object-center sm:object-right"
                aria-hidden="true"
              />
            </div>
            <div className="relative z-10 h-1 bg-gradient-to-r from-nebula/60 via-lavender/80 to-aurora/60" />
            <div className="relative z-10 p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-lavender/70">整體</p>
                  <h2 className="mt-2 text-2xl font-semibold text-moon">{selectedZodiac}今日訊息</h2>
                  {isLoading && <p className="mt-2 text-sm text-[#d8bd70]/78">正在取回今天的星光訊息…</p>}
                  {dailyNote && !isLoading && <p className="mt-2 text-sm text-lavender/76">{dailyNote}</p>}
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-moon/78 sm:text-base">{fortune.overall}</p>
                </div>
                <div className="flex gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/7 px-3 py-2 text-center backdrop-blur">
                    <p className="text-xs text-moon/50">幸運色</p>
                    <p className="mt-0.5 text-sm font-medium text-lavender">{fortune.luckyColor}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/7 px-3 py-2 text-center backdrop-blur">
                    <p className="text-xs text-moon/50">幸運數字</p>
                    <p className="mt-0.5 text-lg font-semibold text-moon">{fortune.luckyNumber}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {aspectConfig.map((aspect) => {
              const data = fortune[aspect.key];
              return (
                <article
                  key={aspect.key}
                  className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-midnight/50 shadow-glow transition duration-300 hover:-translate-y-1 hover:border-[#d8bd70]/35"
                >
                  <div className="pointer-events-none absolute inset-y-3 right-[-18px] w-36 opacity-[0.09] blur-[1.25px] sm:w-44">
                    <Image src={zodiacImages[selectedZodiac]} alt="" fill sizes="180px" className="object-contain" aria-hidden="true" />
                  </div>
                  <div className={`relative z-10 h-1 bg-gradient-to-r ${aspect.gradient}`} />
                  <div className="relative z-10 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold text-moon">{aspect.label}</h3>
                      <Stars count={data.stars} />
                    </div>
                    <div className="mt-4 space-y-3 text-sm leading-7 text-moon/76 sm:text-base">
                      <p>{data.text}</p>
                      <p className="border-t border-white/8 pt-3 text-lavender/82">{data.reminder}</p>
                    </div>
                  </div>
                </article>
              );
            })}

            <article className="relative overflow-hidden rounded-[1.5rem] border border-[#d8bd70]/20 bg-[#d8bd70]/8 shadow-glow transition duration-300 hover:-translate-y-1 hover:border-[#d8bd70]/42">
              <div className="pointer-events-none absolute inset-y-3 right-[-18px] w-36 opacity-[0.09] blur-[1.25px] sm:w-44">
                <Image src={zodiacImages[selectedZodiac]} alt="" fill sizes="180px" className="object-contain" aria-hidden="true" />
              </div>
              <div className="relative z-10 h-1 bg-gradient-to-r from-[#d8bd70]/50 via-moon/40 to-lavender/28" />
              <div className="relative z-10 p-5">
                <h3 className="text-lg font-semibold text-moon">今日小行動</h3>
                <p className="mt-4 text-sm leading-7 text-moon/84 sm:text-base">{fortune.action}</p>
              </div>
            </article>
          </section>

          {/* ── Download story image ── */}
          <div className="mt-6 rounded-[1.75rem] border border-[#d8bd70]/22 bg-midnight/52 p-5 shadow-glow sm:p-6">
            <p className="text-xs uppercase tracking-[0.28em] text-[#d8bd70]/70">限動圖片</p>
            <h3 className="mt-2 text-lg font-semibold text-moon">下載 IG 限動圖片</h3>
            <p className="mt-1 text-sm text-moon/55">產出 1080×1920 星座運勢海報，直接發到 IG 限時動態。</p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={downloadZodiacImage}
                disabled={storyDownloadStatus === "working"}
                className="w-full rounded-full border border-[#d8bd70]/35 bg-[#d8bd70] px-5 py-3 text-sm font-semibold text-midnight shadow-[0_0_24px_rgba(216,189,112,0.22)] transition hover:bg-moon active:scale-95 disabled:cursor-wait disabled:opacity-70 sm:w-auto"
              >
                {storyDownloadStatus === "working" ? "正在產生圖片..." : "⬇ 下載限動圖片"}
              </button>
              {storyDownloadStatus === "done" && (
                <p className="text-sm text-moon/72">圖片已下載，可以發到 IG 限動囉 ✨</p>
              )}
              {storyDownloadStatus === "error" && (
                <p className="text-sm text-[#ffb4b4]">{storyError || "圖片產生失敗，請稍後再試。"}</p>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
