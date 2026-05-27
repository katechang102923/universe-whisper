"use client";

import { useEffect, useMemo, useState } from "react";
import { generateDailyFortune, type DailyFortuneData } from "@/lib/dailyFortuneGenerator";

// ── 型別與常數 ────────────────────────────────────────────────────────────

const zodiacSigns = [
  "牡羊座", "金牛座", "雙子座", "巨蟹座", "獅子座", "處女座",
  "天秤座", "天蠍座", "射手座", "摩羯座", "水瓶座", "雙魚座"
] as const;
type ZodiacSign = (typeof zodiacSigns)[number];

const zodiacSymbols: Record<ZodiacSign, string> = {
  牡羊座: "♈", 金牛座: "♉", 雙子座: "♊", 巨蟹座: "♋",
  獅子座: "♌", 處女座: "♍", 天秤座: "♎", 天蠍座: "♏",
  射手座: "♐", 摩羯座: "♑", 水瓶座: "♒", 雙魚座: "♓"
};

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
  { key: "love" as const, label: "愛情運", gradient: "from-pink-300/20 to-lavender/16" },
  { key: "work" as const, label: "工作運", gradient: "from-aurora/18 to-nebula/16" },
  { key: "wealth" as const, label: "財運",  gradient: "from-yellow-200/16 to-aurora/12" },
  { key: "mood" as const,  label: "心情",   gradient: "from-lavender/20 to-moon/10" }
];

// ── 星星元件 ──────────────────────────────────────────────────────────────

function Stars({ count }: { count: number }) {
  const n = Math.min(5, Math.max(1, Math.round(count)));
  return (
    <span className="tracking-widest" aria-label={`${n} 顆星`}>
      <span className="text-amber-300">{"★".repeat(n)}</span>
      <span className="text-moon/25">{"☆".repeat(5 - n)}</span>
    </span>
  );
}

// ── 主要元件 ──────────────────────────────────────────────────────────────

export function DailyFortuneClient() {
  const [selectedZodiac, setSelectedZodiac] = useState<ZodiacSign>("巨蟹座");
  const [fortune, setFortune] = useState<DailyFortuneData | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("universe-whisper-daily-zodiac");
    if (saved && zodiacSigns.includes(saved as ZodiacSign)) {
      setSelectedZodiac(saved as ZodiacSign);
    }
  }, []);

  useEffect(() => {
    setFortune(generateDailyFortune(selectedZodiac));
  }, [selectedZodiac]);

  const greeting = useMemo(() => zodiacGreetings[selectedZodiac], [selectedZodiac]);

  function selectZodiac(sign: ZodiacSign) {
    setSelectedZodiac(sign);
    window.localStorage.setItem("universe-whisper-daily-zodiac", sign);
  }

  if (!fortune) return null;

  return (
    <>
      {/* ── 星座選擇器 ──────────────────────────────────────────────── */}
      <div className="mt-8 rounded-[1.75rem] border border-lavender/18 bg-midnight/38 p-4 shadow-glow sm:p-6">
        <h2 className="text-xl font-semibold text-moon sm:text-2xl">選擇你的星座</h2>
        <p className="mt-1 text-sm leading-7 text-moon/60">今日宇宙提醒，依你的星座量身整理。</p>

        <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {zodiacSigns.map((sign) => (
            <button
              key={sign}
              type="button"
              onClick={() => selectZodiac(sign)}
              className={`flex flex-col items-center gap-0.5 rounded-2xl border py-3 text-center transition ${
                selectedZodiac === sign
                  ? "border-moon bg-moon text-midnight"
                  : "border-white/12 bg-white/6 text-moon/72 hover:bg-white/12"
              }`}
            >
              <span className="text-lg leading-none">{zodiacSymbols[sign]}</span>
              <span className="mt-1 text-xs leading-none">{sign.replace("座", "")}</span>
            </button>
          ))}
        </div>

        {/* 星座個性語 */}
        <p className="mt-4 rounded-2xl border border-white/10 bg-white/6 p-4 text-sm leading-7 text-moon/80 sm:text-base">
          <span className="mr-2 text-base">{zodiacSymbols[selectedZodiac]}</span>
          {greeting}
        </p>
      </div>

      {/* ── 整體運 + 幸運資訊 ──────────────────────────────────────── */}
      <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-lavender/20 bg-midnight/50 shadow-glow">
        <div className="h-1 bg-gradient-to-r from-nebula/60 via-lavender/80 to-aurora/60" />
        <div className="p-5 sm:p-7">
          {/* 頂部：整體運 + 幸運資訊 */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-lavender/70">今日宇宙提醒</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-sm text-moon/60">整體運</span>
                <Stars count={fortune.overall.stars} />
              </div>
            </div>
            <div className="flex gap-4 sm:gap-6">
              <div className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-center">
                <p className="text-xs text-moon/50">幸運色</p>
                <p className="mt-0.5 text-sm font-medium text-lavender">{fortune.luckyColor}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-center">
                <p className="text-xs text-moon/50">幸運數字</p>
                <p className="mt-0.5 text-lg font-semibold text-moon">{fortune.luckyNumber}</p>
              </div>
            </div>
          </div>

          {/* 整體運文字 */}
          <div className="mt-4 space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-moon/78 sm:text-base">
            <p>{fortune.overall.current}</p>
            <p className="border-t border-white/8 pt-2 text-lavender/80">{fortune.overall.tip}</p>
          </div>

          {/* 今日提醒 */}
          <div className="mt-4 rounded-2xl border border-lavender/18 bg-lavender/8 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-lavender/70">今日小行動</p>
            <p className="mt-2 text-sm leading-7 text-moon/82 sm:text-base">{fortune.overall.action}</p>
          </div>
        </div>
      </div>

      {/* ── 四項運勢卡 ──────────────────────────────────────────────── */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {aspectConfig.map((aspect) => {
          const data = fortune[aspect.key];
          return (
            <article key={aspect.key} className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-midnight/50 shadow-glow">
              {/* 頂部漸層色條 */}
              <div className={`h-1 bg-gradient-to-r ${aspect.gradient}`} />

              <div className="p-5">
                {/* 標題 + 星星 */}
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-moon">{aspect.label}</h2>
                  <Stars count={data.stars} />
                </div>

                {/* 內容 */}
                <div className="mt-4 space-y-3 text-sm leading-7 text-moon/74 sm:text-base">
                  <p>{data.current}</p>
                  <p className="border-t border-white/8 pt-2" style={{ color: "rgba(203,184,255,0.80)" }}>
                    {data.tip}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
