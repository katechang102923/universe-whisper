export type DailyFortune = {
  sign: string;
  score: number;
  theme: string;
  message: string;
  affirmation: string;
  luckyColor: string;
};

const signs = ["牡羊", "金牛", "雙子", "巨蟹", "獅子", "處女", "天秤", "天蠍", "射手", "摩羯", "水瓶", "雙魚"];

const themes = ["把心放慢", "溫柔整理", "說出真心", "回到身體", "重新開始", "接住自己"];

const messages = [
  "今天不用急著證明什麼，先把自己的呼吸照顧好。",
  "有些答案會在安靜時浮上來，給自己一點空白。",
  "你值得被好好回應，也值得先聽見自己的聲音。",
  "把一件小事完成，就會替心裡點上一盞燈。",
  "今晚適合放下過度解讀，讓感受慢慢沉澱。",
  "當你不再逼自己完美，宇宙反而有空隙靠近。"
];

const affirmations = [
  "我允許自己慢慢來。",
  "我正在走向更柔軟也更清楚的地方。",
  "我不需要用疲憊換取愛。",
  "我值得穩定、真誠與被珍惜。",
  "我把注意力收回自己身上。"
];

const colors = ["月光白", "薰衣草紫", "午夜藍", "霧粉銀", "微光青"];

function pick<T>(items: T[], seed: number) {
  return items[Math.abs(seed) % items.length];
}

export function getDailyFortune(sign = "月亮") {
  const today = new Date().toISOString().slice(0, 10);
  const seed = [...`${today}-${sign}`].reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return {
    sign: signs.includes(sign) ? sign : "月亮",
    score: 68 + (seed % 29),
    theme: pick(themes, seed),
    message: pick(messages, seed + 3),
    affirmation: pick(affirmations, seed + 7),
    luckyColor: pick(colors, seed + 11)
  } satisfies DailyFortune;
}
