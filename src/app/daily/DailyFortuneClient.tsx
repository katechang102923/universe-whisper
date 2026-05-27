"use client";

import Image from "next/image";
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

const zodiacDates: Record<ZodiacSign, string> = {
  牡羊座: "3/21–4/19",
  金牛座: "4/20–5/20",
  雙子座: "5/21–6/21",
  巨蟹座: "6/22–7/22",
  獅子座: "7/23–8/22",
  處女座: "8/23–9/22",
  天秤座: "9/23–10/23",
  天蠍座: "10/24–11/21",
  射手座: "11/22–12/21",
  摩羯座: "12/22–1/19",
  水瓶座: "1/20–2/18",
  雙魚座: "2/19–3/20",
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
  // AI 版運勢（API 回傳後覆蓋 fallback）
  const [apiFortune, setApiFortune] = useState<DailyFortuneData | null>(null);

  // 初始化：從 localStorage 讀取星座偏好
  useEffect(() => {
    const saved = window.localStorage.getItem("universe-whisper-daily-zodiac");
    if (saved && zodiacSigns.includes(saved as ZodiacSign)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedZodiac(saved as ZodiacSign);
    }
  }, []);

  // 每次切換星座，向 API 取得快取/AI 運勢
  useEffect(() => {
    let active = true;

    fetch(`/api/daily-fortune?zodiac=${encodeURIComponent(selectedZodiac)}`)
      .then((r) => {
        if (!r.ok) throw new Error("非 2xx");
        return r.json() as Promise<DailyFortuneData>;
      })
      .then((data) => {
        if (active) setApiFortune(data);
      })
      .catch(() => {
        // API 失敗時保留 seeded fallback，不報錯
      });

    return () => {
      active = false;
    };
  }, [selectedZodiac]);

  // Seeded fallback：即時顯示，不需等待 API
  const fallbackFortune = useMemo(
    () => generateDailyFortune(selectedZodiac),
    [selectedZodiac]
  );

  // API 有回來就用 AI 版，否則用 seeded
  const fortune = apiFortune ?? fallbackFortune;
  const greeting = zodiacGreetings[selectedZodiac];

  function selectZodiac(sign: ZodiacSign) {
    setSelectedZodiac(sign);
    setApiFortune(null); // 切換時清除前一個星座的 API 資料（在 handler 中，非 effect）
    window.localStorage.setItem("universe-whisper-daily-zodiac", sign);
  }

  return (
    <>
      {/* ── 星座卡片選擇器 ──────────────────────────────────────────── */}
      <div className="mt-8 rounded-[1.75rem] border border-lavender/18 bg-midnight/38 p-4 shadow-glow sm:p-6">
        <h2 className="text-xl font-semibold text-moon sm:text-2xl">選擇你的星座</h2>
        <p className="mt-1 text-sm leading-7 text-moon/60">今日宇宙提醒，依你的星座量身整理。</p>

        {/* 12 張星座卡片 */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {zodiacSigns.map((sign) => {
            const isSelected = selectedZodiac === sign;
            return (
              <button
                key={sign}
                type="button"
                onClick={() => selectZodiac(sign)}
                className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 hover:-translate-y-1 hover:scale-[1.04] ${
                  isSelected
                    ? "border-[#d8bd70]/80 shadow-[0_0_22px_rgba(216,189,112,0.42),0_4px_18px_rgba(0,0,0,0.36)]"
                    : "border-white/12 bg-midnight/50 hover:border-[#d8bd70]/45 hover:shadow-[0_0_12px_rgba(216,189,112,0.22)]"
                }`}
              >
                {/* 卡牌圖片（直式，保持完整不裁切） */}
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-t-xl bg-midnight/70">
                  <Image
                    src={zodiacImages[sign]}
                    alt={`${sign}星座貓`}
                    fill
                    sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 15vw"
                    className="object-contain transition-transform duration-300 group-hover:scale-[1.03]"
                    loading={isSelected ? "eager" : "lazy"}
                  />
                  {/* 選中時的金色微光遮罩 */}
                  {isSelected && (
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#d8bd70]/18 to-transparent" />
                  )}
                </div>

                {/* 卡牌標籤 */}
                <div
                  className={`px-1.5 py-2 text-center transition-colors ${
                    isSelected
                      ? "bg-[#d8bd70]/20"
                      : "bg-midnight/70 group-hover:bg-white/6"
                  }`}
                >
                  <p className={`text-[11px] font-semibold leading-tight ${isSelected ? "text-[#d8bd70]" : "text-moon/80"}`}>
                    {zodiacSymbols[sign]} {sign}
                  </p>
                  <p className="mt-0.5 text-[9px] text-moon/44">{zodiacDates[sign]}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* 星座個性語 */}
        <p className="mt-4 rounded-2xl border border-white/10 bg-white/6 p-4 text-sm leading-7 text-moon/80 sm:text-base">
          <span className="mr-2 text-base">{zodiacSymbols[selectedZodiac]}</span>
          {greeting}
        </p>
      </div>

      {/* ── 整體運 + 守護貓 + 幸運資訊 ────────────────────────────── */}
      <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-lavender/20 bg-midnight/50 shadow-glow">
        <div className="h-1 bg-gradient-to-r from-nebula/60 via-lavender/80 to-aurora/60" />
        <div className="p-5 sm:p-7">
          {/* 頂部：整體運 + 守護貓圖 + 幸運資訊 */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-lavender/70">今日宇宙提醒</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-sm text-moon/60">整體運</span>
                <Stars count={fortune.overall.stars} />
              </div>
            </div>

            <div className="flex items-start gap-3 sm:gap-4">
              {/* 今日守護星座貓 */}
              <div className="flex flex-col items-center gap-1">
                <div className="relative h-[72px] w-[48px] overflow-hidden rounded-xl border border-[#d8bd70]/35 bg-midnight/60 shadow-[0_0_14px_rgba(216,189,112,0.28)]">
                  <Image
                    src={zodiacImages[selectedZodiac]}
                    alt={`今日守護貓・${selectedZodiac}`}
                    fill
                    sizes="48px"
                    className="object-contain"
                  />
                </div>
                <p className="text-[9px] text-moon/44">今日守護</p>
              </div>

              {/* 幸運資訊 */}
              <div className="flex gap-3 sm:gap-4">
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
