"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  getSunSign,
  ASTRO_PROFILE_TEXTS,
  ALL_ZODIAC_OPTIONS,
  ZODIAC_SYMBOLS,
} from "@/lib/astroProfileTexts";
import type { ZodiacSign } from "@/lib/astroProfileTexts";
import { BIRTH_CITIES } from "@/lib/birthCities";
import type { BirthCity } from "@/lib/birthCities";
import { calcVenusSign, calcRisingSign, calcMoonSign } from "@/lib/astroCalc";

// ── Birth time options (00:00–23:30, every 30 min) ───────────────────────────

const BIRTH_TIME_OPTIONS: string[] = ["不知道出生時間"];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    BIRTH_TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = "form" | "result";

interface CalcResult {
  sunSign: ZodiacSign;
  moonSign: ZodiacSign | null;
  risingSign: ZodiacSign | null;
  venusSign: ZodiacSign | null;
  risingCalcNote: string | null;
}

// ── Main component ────────────────────────────────────────────────────────────

export function AstroProfileClient() {
  const [step, setStep] = useState<Step>("form");
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);

  // Form fields
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("不知道出生時間");
  const [birthCity, setBirthCity] = useState<BirthCity | null>(null);
  const [error, setError] = useState("");

  // Advanced manual override (collapsed by default)
  const [showManual, setShowManual] = useState(false);
  const [manualMoon, setManualMoon] = useState<ZodiacSign | "">("");
  const [manualRising, setManualRising] = useState<ZodiacSign | "">("");
  const [manualVenus, setManualVenus] = useState<ZodiacSign | "">("");

  // Derived
  const sunSign = getSunSign(birthDate);
  const hasTime = birthTime !== "不知道出生時間";
  const hasCity = birthCity !== null;
  const canCalcFull = !!(birthDate && hasTime && hasCity);
  const canCalcMoon = !!(birthDate && hasTime);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!birthDate) { setError("請填寫出生日期"); return; }
    if (!sunSign) { setError("日期格式有誤，請重新輸入"); return; }
    setError("");

    let moonSign: ZodiacSign | null = null;
    let risingSign: ZodiacSign | null = null;
    let venusSign: ZodiacSign | null = null;
    let risingCalcNote: string | null = null;

    if (canCalcMoon) {
      try {
        moonSign = calcMoonSign(birthDate, birthTime);
      } catch {
        // Calculation failed silently — leave null
      }
    }

    if (canCalcFull) {
      try {
        risingSign = calcRisingSign(birthDate, birthTime, birthCity!.latitude, birthCity!.longitude);
        venusSign = calcVenusSign(birthDate, birthTime);
        risingCalcNote = "上升星座依出生時間與城市估算，若出生時間不確定，結果可能有誤差。";
      } catch {
        // Calculation failed silently — leave null
      }
    }

    // Manual overrides take precedence
    if (manualMoon) moonSign = manualMoon;
    if (manualRising) risingSign = manualRising;
    if (manualVenus) venusSign = manualVenus;

    setCalcResult({ sunSign, moonSign, risingSign, venusSign, risingCalcNote });
    setStep("result");
  };

  if (step === "result" && calcResult) {
    return (
      <ResultView
        result={calcResult}
        onReset={() => { setStep("form"); setCalcResult(null); }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-lg py-8 sm:py-12">
      {/* Page header */}
      <div className="mb-8 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-aurora/70">三重能量解析</p>
        <h1 className="mt-3 text-3xl font-semibold text-moon sm:text-4xl">我的三重星座</h1>
        <p className="mt-3 text-sm leading-7 text-moon/60">
          太陽 × 月亮 × 上升<br />
          三層能量交織，看看你的核心個性、內在情感與外在氣質。
        </p>
      </div>

      {/* Form card */}
      <form
        onSubmit={handleSubmit}
        className="rounded-[1.5rem] border border-white/10 bg-midnight/50 p-6 shadow-glow backdrop-blur-sm sm:p-8"
      >
        {/* ── Birth date ── */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-moon/80">
            出生日期
            <span className="ml-1.5 text-xs text-aurora/70">（必填）</span>
          </label>
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            required
            className="w-full rounded-xl border border-white/14 bg-[#0a1028] px-4 py-3 text-moon outline-none transition focus:border-lavender/60 focus:ring-2 focus:ring-lavender/20"
          />
          {birthDate && sunSign && (
            <p className="mt-2 text-xs text-lavender/70">
              {ZODIAC_SYMBOLS[sunSign]}&nbsp;太陽星座：{sunSign}
            </p>
          )}
        </div>

        {/* ── Birth time ── */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-moon/80">
            出生時間
            <span className="ml-1.5 text-xs text-moon/38">（選填，用於計算月亮與上升星座）</span>
          </label>
          <CosmicSelect
            options={BIRTH_TIME_OPTIONS}
            value={birthTime}
            onChange={setBirthTime}
            placeholder="不知道出生時間"
          />
          {!hasTime && (
            <p className="mt-2 text-xs text-moon/40">
              若不提供出生時間，月亮星座、上升星座與金星星座將無法自動計算。
            </p>
          )}
        </div>

        {/* ── Birth city ── */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-moon/80">
            出生城市
            <span className="ml-1.5 text-xs text-moon/38">（選填，用於計算上升星座）</span>
          </label>
          <CosmicSelect
            options={["不知道出生城市", ...BIRTH_CITIES.map((c) => c.name)]}
            value={birthCity?.name ?? "不知道出生城市"}
            onChange={(v) => {
              if (v === "不知道出生城市") { setBirthCity(null); return; }
              const city = BIRTH_CITIES.find((c) => c.name === v) ?? null;
              setBirthCity(city);
            }}
            placeholder="不知道出生城市"
          />
        </div>

        {/* Calc preview */}
        {canCalcFull && (
          <div className="mb-6 rounded-xl border border-aurora/20 bg-aurora/5 px-4 py-3">
            <p className="text-xs text-aurora/80">
              ✦ 資料齊全，將自動計算月亮星座、上升星座與金星星座
            </p>
          </div>
        )}
        {canCalcMoon && !canCalcFull && (
          <div className="mb-6 rounded-xl border border-lavender/20 bg-lavender/5 px-4 py-3">
            <p className="text-xs text-lavender/80">
              ✦ 提供出生時間，將自動計算月亮星座
            </p>
          </div>
        )}

        {/* ── Advanced manual override (collapsed) ── */}
        <div className="mb-8">
          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-moon/40 transition hover:text-moon/60"
          >
            <span className={`transition-transform ${showManual ? "rotate-90" : ""}`}>▶</span>
            我已知道月亮 / 上升 / 金星星座，手動選擇
          </button>
          {showManual && (
            <div className="mt-4 space-y-4 rounded-xl border border-white/8 bg-white/3 p-4">
              <div>
                <label className="mb-2 block text-xs text-moon/60">手動指定月亮星座（覆蓋自動計算）</label>
                <ZodiacSelect
                  value={manualMoon}
                  onChange={setManualMoon}
                  placeholder="不指定"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs text-moon/60">手動指定上升星座（覆蓋自動計算）</label>
                <ZodiacSelect
                  value={manualRising}
                  onChange={setManualRising}
                  placeholder="不指定"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs text-moon/60">手動指定金星星座（覆蓋自動計算）</label>
                <ZodiacSelect
                  value={manualVenus}
                  onChange={setManualVenus}
                  placeholder="不指定"
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-full py-3.5 text-base font-semibold text-midnight transition hover:brightness-105 active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, #d8bd70 0%, #b89adf 60%, #d8bd70 100%)",
          }}
        >
          查看三重星座整體解析 ✦
        </button>

        <div className="mt-5 text-center">
          <Link href="/" className="text-xs text-moon/38 underline underline-offset-4 transition hover:text-moon/60">
            ← 返回首頁
          </Link>
        </div>
      </form>
    </div>
  );
}

// ── Custom dropdown (CosmicSelect) ────────────────────────────────────────────

function CosmicSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const isDefault = value === placeholder || value === options[0];
  const displayValue = value || placeholder;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "flex w-full items-center justify-between rounded-xl border bg-[#0a1028] px-4 py-3 text-sm transition",
          open ? "border-lavender/60 ring-2 ring-lavender/20" : "border-white/14 hover:border-white/28",
          isDefault ? "text-moon/40" : "text-moon",
        ].join(" ")}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{displayValue}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-moon/40 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-60 overflow-y-auto rounded-xl border border-white/14 bg-[#0d1235] py-1 shadow-[0_8px_40px_rgba(0,0,0,0.7)]"
        >
          {options.map((opt) => (
            <li
              key={opt}
              role="option"
              aria-selected={opt === value}
              onClick={() => { onChange(opt); setOpen(false); }}
              className={[
                "cursor-pointer px-4 py-2.5 text-sm transition",
                opt === value
                  ? "bg-lavender/20 text-moon"
                  : "text-moon/80 hover:bg-white/8 hover:text-moon",
              ].join(" ")}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Zodiac select ─────────────────────────────────────────────────────────────

function ZodiacSelect({
  value,
  onChange,
  placeholder,
}: {
  value: ZodiacSign | "";
  onChange: (v: ZodiacSign | "") => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const displayLabel = value ? `${ZODIAC_SYMBOLS[value]} ${value}` : placeholder;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "flex w-full items-center justify-between rounded-xl border bg-[#0a1028] px-4 py-3 text-sm transition",
          open ? "border-lavender/60 ring-2 ring-lavender/20" : "border-white/14 hover:border-white/28",
          !value ? "text-moon/40" : "text-moon",
        ].join(" ")}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{displayLabel}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-moon/40 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-60 overflow-y-auto rounded-xl border border-white/14 bg-[#0d1235] py-1 shadow-[0_8px_40px_rgba(0,0,0,0.7)]"
        >
          <li
            role="option"
            aria-selected={value === ""}
            onClick={() => { onChange(""); setOpen(false); }}
            className={[
              "cursor-pointer px-4 py-2.5 text-sm transition",
              value === "" ? "bg-lavender/20 text-moon" : "text-moon/50 hover:bg-white/8 hover:text-moon",
            ].join(" ")}
          >
            {placeholder}
          </li>
          {ALL_ZODIAC_OPTIONS.map((sign) => (
            <li
              key={sign}
              role="option"
              aria-selected={sign === value}
              onClick={() => { onChange(sign); setOpen(false); }}
              className={[
                "cursor-pointer px-4 py-2.5 text-sm transition",
                sign === value
                  ? "bg-lavender/20 text-moon"
                  : "text-moon/80 hover:bg-white/8 hover:text-moon",
              ].join(" ")}
            >
              {ZODIAC_SYMBOLS[sign]} {sign}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Result View ───────────────────────────────────────────────────────────────

function ResultView({
  result,
  onReset,
}: {
  result: CalcResult;
  onReset: () => void;
}) {
  const { sunSign, moonSign, risingSign, venusSign, risingCalcNote } = result;
  const sunTexts = ASTRO_PROFILE_TEXTS[sunSign];

  return (
    <div className="mx-auto max-w-lg py-8 sm:py-12">
      {/* ── Header ── */}
      <div className="mb-8 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-aurora/70">三重星座整體解析</p>
        <h1 className="mt-3 text-3xl font-semibold text-moon sm:text-4xl">
          {ZODIAC_SYMBOLS[sunSign]} {sunSign}
        </h1>
        <p className="mt-2 text-sm text-moon/50">太陽 × 月亮 × 上升</p>
      </div>

      <div className="space-y-4">

        {/* ── 三重星座主結構概覽 ── */}
        <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-midnight/50 backdrop-blur-sm">
          <div className="h-px bg-gradient-to-r from-[#d8bd70]/50 via-lavender/50 to-aurora/40" />
          <div className="p-5 sm:p-6">
            <p className="mb-4 text-xs uppercase tracking-[0.24em] text-lavender/60">三重星座概覽</p>
            <div className="space-y-2.5">
              <SignRow
                label="太陽星座"
                sublabel="核心個性 · 可類比命宮主軸"
                sign={sunSign}
                accentColor="text-[#d8bd70]"
              />
              <SignRow
                label="月亮星座"
                sublabel="內在情感 · 可類比福德傾向"
                sign={moonSign}
                accentColor="text-lavender"
                emptyNote="尚未提供"
              />
              <SignRow
                label="上升星座"
                sublabel="外在氣質 · 可類比命宮展現"
                sign={risingSign}
                accentColor="text-aurora"
                emptyNote="尚未提供"
              />
            </div>
            {risingCalcNote && (
              <p className="mt-4 text-xs leading-5 text-moon/35">✦ {risingCalcNote}</p>
            )}
          </div>
        </div>

        {/* ── 金星延伸參考（次要區塊） ── */}
        <div className="rounded-2xl border border-white/8 bg-white/3 px-5 py-4">
          <p className="mb-3 text-xs uppercase tracking-[0.2em] text-moon/38">延伸參考</p>
          <SignRow
            label="金星星座"
            sublabel="感情吸引力 · 延伸參考"
            sign={venusSign}
            accentColor="text-[#c9a0dc]/80"
            emptyNote="尚未提供"
            compact
          />
        </div>

        {/* ── 缺少項目提示 ── */}
        {!moonSign && (
          <Notice>尚未提供月亮星座，這次先以太陽星座為主解讀。</Notice>
        )}
        {!risingSign && (
          <Notice>尚未提供上升星座，外在氣質解析將暫時略過。</Notice>
        )}

        {/* ── 1. 三重星座整體解析 ── */}
        <ResultCard label="三重星座整體解析" accent="from-lavender/40 to-nebula/24" icon="✦">
          <p className="leading-7">{sunTexts.overallSummary}</p>
          {(moonSign || risingSign) && (
            <p className="mt-3 text-sm leading-6 text-moon/55">
              {moonSign && risingSign
                ? `月亮在${moonSign}、上升在${risingSign}——三層能量各有深度，在下方可以分別細看。`
                : moonSign
                  ? `月亮在${moonSign}，內在情感的層次在下方可以進一步了解。`
                  : `上升在${risingSign}，外在氣質的展現在下方可以進一步了解。`}
            </p>
          )}
        </ResultCard>

        {/* ── 2. 核心本質｜太陽星座 ── */}
        <ResultCard label="核心本質｜太陽星座" accent="from-[#d8bd70]/50 to-nebula/20" icon="☀">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-base font-semibold text-[#d8bd70]">
              {ZODIAC_SYMBOLS[sunSign]} {sunSign}
            </span>
          </div>
          <p className="mt-2 leading-7">{sunTexts.sunCoreText}</p>
        </ResultCard>

        {/* ── 3. 內在情感｜月亮星座 ── */}
        <ResultCard label="內在情感｜月亮星座" accent="from-lavender/40 to-nebula/24" icon="🌙">
          {moonSign ? (
            <>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-base font-semibold text-lavender">
                  {ZODIAC_SYMBOLS[moonSign]} {moonSign}
                </span>
              </div>
              <p className="mt-2 leading-7">{ASTRO_PROFILE_TEXTS[moonSign].moonInnerText}</p>
            </>
          ) : (
            <p className="leading-7 text-moon/45">
              尚未提供月亮星座，這次先以太陽星座為主解讀。
            </p>
          )}
        </ResultCard>

        {/* ── 4. 外在展現｜上升星座 ── */}
        <ResultCard label="外在展現｜上升星座" accent="from-aurora/36 to-nebula/22" icon="⬆">
          {risingSign ? (
            <>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-base font-semibold text-aurora">
                  {ZODIAC_SYMBOLS[risingSign]} {risingSign}
                </span>
              </div>
              <p className="mt-2 leading-7">{ASTRO_PROFILE_TEXTS[risingSign].risingOuterText}</p>
            </>
          ) : (
            <p className="leading-7 text-moon/45">
              尚未提供上升星座，外在氣質解析將暫時略過。
            </p>
          )}
        </ResultCard>

        {/* ── 5. 感情吸引力｜金星星座（延伸解析） ── */}
        <div className="overflow-hidden rounded-[1.5rem] border border-white/8 bg-midnight/30 shadow-sm backdrop-blur-sm">
          <div className="h-px bg-gradient-to-r from-[#c9a0dc]/30 to-nebula/20" />
          <div className="p-5 sm:p-6">
            <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-moon/40">
              <span>♀</span>
              感情吸引力｜金星星座
              <span className="ml-1 rounded-full border border-white/10 px-2 py-0.5 text-[10px] normal-case tracking-wide text-moon/30">
                延伸解析
              </span>
            </p>
            <div className="text-sm leading-7 text-moon/75">
              {venusSign ? (
                <>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#c9a0dc]/80">
                      {ZODIAC_SYMBOLS[venusSign]} {venusSign}
                    </span>
                  </div>
                  <p className="mt-2">{ASTRO_PROFILE_TEXTS[venusSign].venusLoveText}</p>
                </>
              ) : (
                <p className="text-moon/40">
                  尚未提供金星星座，感情與吸引力解析將暫時略過。
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── 6. 宇宙偷偷話 ── */}
        <ResultCard label="宇宙偷偷話" accent="from-[#d8bd70]/40 to-nebula/20" icon="🌙">
          <p className="leading-7">{sunTexts.whisper}</p>
        </ResultCard>

        {/* ── 7. 給你的提醒 ── */}
        <ResultCard label="給你的提醒" accent="from-aurora/36 to-nebula/22" icon="🌿">
          <p className="leading-7">{sunTexts.advice}</p>
        </ResultCard>

      </div>

      {/* ── Actions ── */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={onReset}
          className="flex-1 rounded-full border border-lavender/40 bg-lavender/10 py-3 text-sm font-semibold text-lavender transition hover:bg-lavender/20 active:scale-[0.98]"
        >
          重新輸入
        </button>
        <Link
          href="/"
          className="flex-1 rounded-full border border-white/14 bg-white/5 py-3 text-center text-sm font-semibold text-moon/70 transition hover:bg-white/10 active:scale-[0.98]"
        >
          ← 返回首頁
        </Link>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SignRow({
  label, sublabel, sign, accentColor, emptyNote, compact,
}: {
  label: string;
  sublabel: string;
  sign: ZodiacSign | null;
  accentColor: string;
  emptyNote?: string;
  compact?: boolean;
}) {
  return (
    <div className={[
      "flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/4",
      compact ? "px-4 py-2.5" : "px-4 py-3",
    ].join(" ")}>
      <div className="min-w-0">
        <p className={`font-medium text-moon/70 ${compact ? "text-xs" : "text-sm"}`}>{label}</p>
        <p className="mt-0.5 text-xs text-moon/35">{sublabel}</p>
      </div>
      <div className="shrink-0 text-right">
        {sign ? (
          <p className={`font-semibold ${accentColor} ${compact ? "text-sm" : "text-base"}`}>
            {ZODIAC_SYMBOLS[sign]} {sign}
          </p>
        ) : (
          <p className={`text-moon/30 ${compact ? "text-xs" : "text-sm"}`}>{emptyNote ?? "—"}</p>
        )}
      </div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/4 px-4 py-3">
      <p className="text-xs leading-6 text-moon/50">✦ {children}</p>
    </div>
  );
}

function ResultCard({
  label, accent, icon, children,
}: {
  label: string;
  accent: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-midnight/50 shadow-glow backdrop-blur-sm">
      <div className={`h-1 bg-gradient-to-r ${accent}`} />
      <div className="p-5 sm:p-6">
        <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-moon/50">
          <span aria-hidden="true">{icon}</span>
          {label}
        </p>
        <div className="text-sm text-moon/85">{children}</div>
      </div>
    </div>
  );
}
