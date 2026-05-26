"use client";

import { useEffect, useMemo, useState } from "react";

const zodiacSigns = ["牡羊座", "金牛座", "雙子座", "巨蟹座", "獅子座", "處女座", "天秤座", "天蠍座", "射手座", "摩羯座", "水瓶座", "雙魚座"] as const;
type ZodiacSign = (typeof zodiacSigns)[number];

const zodiacTone: Record<ZodiacSign, string> = {
  牡羊座: "把步伐放穩，不需要一次把所有事都衝完。",
  金牛座: "把安全感放回日常的小安排裡，你會比較踏實。",
  雙子座: "先整理想法，再開口，今天會少一點誤會。",
  巨蟹座: "你的感受很重要，但也記得讓自己先被照顧。",
  獅子座: "你可以溫柔，也可以很有力量，今天不必縮小自己。",
  處女座: "把事情拆小一點，今天會比你想像中更好前進。",
  天秤座: "不急著討好所有人，先確認自己真正想要什麼。",
  天蠍座: "敏銳是禮物，但別讓猜測替你做決定。",
  射手座: "給自己一點空氣感，答案會在行動中慢慢清楚。",
  摩羯座: "你已經很努力了，今天適合把壓力放回可控範圍。",
  水瓶座: "你的觀察很準，今天適合用更柔軟的方式表達。",
  雙魚座: "把心安放好，再去靠近世界，今天不需要硬撐。"
};

const fortunes = [
  {
    title: "愛情",
    score: 88,
    status: "你今天對關係裡的細節比較敏感，可能會特別在意一句話、一次已讀或對方的語氣。",
    reminder: "先不要急著把沉默解讀成答案，真正穩定的關係會讓你感覺被放在心上。",
    action: "小行動：如果想靠近，可以用一句輕鬆的問候開場，然後觀察對方是否願意延續對話。",
    color: "from-pink-300/22 to-lavender/18"
  },
  {
    title: "工作",
    score: 76,
    status: "今天的工作容易被零碎事項切開，真正累的可能不是事情很多，而是一直被打斷。",
    reminder: "先把最重要的一件事放到前面完成，不需要用完美證明自己值得被肯定。",
    action: "小行動：列出三件必做事項，只先處理第一件，讓節奏重新回到你手上。",
    color: "from-aurora/20 to-nebula/18"
  },
  {
    title: "財運",
    score: 72,
    status: "今天適合看清楚小額支出，尤其是那些讓你短暫安心、卻沒有真正被需要的花費。",
    reminder: "錢不是只能被省下來，也可以被安排成讓你更穩的安全感。",
    action: "小行動：整理一筆近期訂閱或固定支出，保留真正支持生活品質的部分。",
    color: "from-yellow-100/18 to-aurora/14"
  },
  {
    title: "心情",
    score: 91,
    status: "你的心今天需要一點安靜，不是逃避，而是把太滿的感覺慢慢放回原位。",
    reminder: "情緒不是麻煩，它是在提醒你：有些地方已經撐太久，需要被溫柔看見。",
    action: "小行動：給自己十分鐘不滑手機的空白，喝水、深呼吸，讓身體先安定下來。",
    color: "from-lavender/22 to-moon/12"
  }
];

export function DailyFortuneClient() {
  const [selectedZodiac, setSelectedZodiac] = useState<ZodiacSign>("巨蟹座");

  useEffect(() => {
    const savedZodiac = window.localStorage.getItem("universe-whisper-daily-zodiac");

    if (zodiacSigns.includes(savedZodiac as ZodiacSign)) {
      setSelectedZodiac(savedZodiac as ZodiacSign);
    }
  }, []);

  const tone = useMemo(() => zodiacTone[selectedZodiac], [selectedZodiac]);

  function selectZodiac(sign: ZodiacSign) {
    setSelectedZodiac(sign);
    window.localStorage.setItem("universe-whisper-daily-zodiac", sign);
  }

  return (
    <>
      <div className="mt-8 rounded-[1.75rem] border border-lavender/18 bg-midnight/38 p-4 shadow-glow sm:p-6">
        <h2 className="text-2xl font-semibold text-moon">選擇你的星座</h2>
        <p className="mt-2 text-base leading-7 text-moon/68">讓今天的訊息更靠近你一點。</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {zodiacSigns.map((sign) => (
            <button
              key={sign}
              type="button"
              onClick={() => selectZodiac(sign)}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                selectedZodiac === sign ? "border-moon bg-moon text-midnight" : "border-white/12 bg-white/8 text-moon/76 hover:bg-white/12"
              }`}
            >
              {sign}
            </button>
          ))}
        </div>
        <p className="mt-4 rounded-2xl border border-white/10 bg-white/6 p-4 text-base leading-8 text-moon/78">{tone}</p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {fortunes.map((fortune) => (
          <article key={fortune.title} className="glass-card overflow-hidden rounded-[1.5rem] p-5">
            <div className={`-mx-5 -mt-5 h-24 bg-gradient-to-br ${fortune.color}`} />
            <div className="-mt-10 flex items-end justify-between gap-3">
              <div className="rounded-2xl border border-white/10 bg-midnight/70 px-4 py-3 backdrop-blur">
                <p className="text-sm text-lavender">{fortune.title}</p>
                <h2 className="mt-1 text-2xl font-semibold text-moon">{selectedZodiac}今日指引</h2>
              </div>
              <div className="rounded-full bg-moon px-4 py-2 text-xl font-semibold text-midnight">{fortune.score}</div>
            </div>
            <div className="mt-5 space-y-4 leading-8 text-moon/78">
              <p>
                <span className="text-lavender">目前狀態：</span>
                {fortune.status}
              </p>
              <p>
                <span className="text-lavender">今日提醒：</span>
                {fortune.reminder}
              </p>
              <p>
                <span className="text-lavender">小行動建議：</span>
                {fortune.action}
              </p>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
