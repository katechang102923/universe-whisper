"use client";

import { useEffect, useMemo, useState } from "react";
import { generateDailyFortune, type DailyFortuneData } from "@/lib/dailyFortuneGenerator";

const zodiacSigns = ["牡羊座", "金牛座", "雙子座", "巨蟹座", "獅子座", "處女座", "天秤座", "天蠍座", "射手座", "摩羯座", "水瓶座", "雙魚座"] as const;
type ZodiacSign = (typeof zodiacSigns)[number];

const zodiacGreetings: Record<ZodiacSign, string> = {
  牡羊座: "熱情的你，今天記得把速度和呼吸對齊。",
  金牛座: "穩定的你，今天的改變都會變成更踏實的養分。",
  雙子座: "靈活的你，今天的多角度思考會帶來新的可能。",
  巨蟹座: "敏感的你，你的感受正在告訴你什麼是真正重要的。",
  獅子座: "自信的你，今天不用縮小自己，溫柔就是力量。",
  處女座: "細心的你，今天的完美不是無瑕，而是適得其所。",
  天秤座: "平衡的你，今天的權衡會帶你走向更清晰的地方。",
  天蠍座: "敏銳的你，今天的直覺不會騙你，信任它。",
  射手座: "樂觀的你，今天的冒險可能會帶來意外的收穫。",
  摩羯座: "務實的你，今天也值得享受一點當下的輕鬆。",
  水瓶座: "理性的你，今天適合用更溫柔的方式連結。",
  雙魚座: "夢幻的你，今天的直覺會幫你看清現實的溫柔。"
};

const aspectConfig = [
  { key: "love" as const, title: "愛情", color: "from-pink-300/22 to-lavender/18" },
  { key: "work" as const, title: "工作", color: "from-aurora/20 to-nebula/18" },
  { key: "wealth" as const, title: "財運", color: "from-yellow-100/18 to-aurora/14" },
  { key: "mood" as const, title: "心情", color: "from-lavender/22 to-moon/12" }
];

export function DailyFortuneClient() {
  const [selectedZodiac, setSelectedZodiac] = useState<ZodiacSign>("巨蟹座");
  const [fortune, setFortune] = useState<DailyFortuneData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedZodiac = window.localStorage.getItem("universe-whisper-daily-zodiac");

    if (zodiacSigns.includes(savedZodiac as ZodiacSign)) {
      setSelectedZodiac(savedZodiac as ZodiacSign);
    } else {
      setSelectedZodiac("巨蟹座");
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    setFortune(generateDailyFortune(selectedZodiac));
    setIsLoading(false);
  }, [selectedZodiac]);

  const greeting = useMemo(() => zodiacGreetings[selectedZodiac], [selectedZodiac]);

  function selectZodiac(sign: ZodiacSign) {
    setSelectedZodiac(sign);
    window.localStorage.setItem("universe-whisper-daily-zodiac", sign);
  }

  if (!fortune) return null;

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
        <p className="mt-4 rounded-2xl border border-white/10 bg-white/6 p-4 text-base leading-8 text-moon/78">{greeting}</p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {aspectConfig.map((aspect) => {
          const data = fortune[aspect.key];
          return (
            <article key={aspect.key} className="glass-card overflow-hidden rounded-[1.5rem] p-5">
              <div className={`-mx-5 -mt-5 h-24 bg-gradient-to-br ${aspect.color}`} />
              <div className="-mt-10 flex items-end justify-between gap-3">
                <div className="rounded-2xl border border-white/10 bg-midnight/70 px-4 py-3 backdrop-blur">
                  <p className="text-sm text-lavender">{aspect.title}</p>
                  <h2 className="mt-1 text-2xl font-semibold text-moon">{selectedZodiac}{aspect.title}</h2>
                </div>
                <div className="rounded-full bg-moon px-4 py-2 text-xl font-semibold text-midnight">{data.score}</div>
              </div>
              <div className="mt-5 space-y-4 leading-8 text-moon/78">
                <p>
                  <span className="text-lavender">目前：</span>
                  {data.current}
                </p>
                <p>
                  <span className="text-lavender">提醒：</span>
                  {data.tip}
                </p>
                <p>
                  <span className="text-lavender">行動：</span>
                  {data.action}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
