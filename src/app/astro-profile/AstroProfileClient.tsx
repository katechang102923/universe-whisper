"use client";

import { useState, useRef, useEffect, useCallback, useMemo, startTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  getSunSign,
  ASTRO_PROFILE_TEXTS,
  ALL_ZODIAC_OPTIONS,
  ZODIAC_SYMBOLS,
} from "@/lib/astroProfileTexts";
import type { ZodiacSign, AstroProfileText } from "@/lib/astroProfileTexts";
import { BIRTH_CITIES } from "@/lib/birthCities";
import type { BirthCity } from "@/lib/birthCities";
import { calcVenusSign, calcRisingSign, calcMoonSign } from "@/lib/astroCalc";
import { useAuth } from "@/contexts/AuthContext";

// ── Birth time options ─────────────────────────────────────────────────────────

const BIRTH_TIME_OPTIONS: string[] = ["不知道出生時間"];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    BIRTH_TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

type Step = "form" | "result";
type UnlockState = "locked" | "checking" | "unlocked";

interface CalcResult {
  sunSign: ZodiacSign;
  moonSign: ZodiacSign | null;
  risingSign: ZodiacSign | null;
  venusSign: ZodiacSign | null;
  risingCalcNote: string | null;
}

const LS_PREFIX = "astroProfile_";
const LS_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function saveResultToStorage(sessionId: string, result: CalcResult) {
  try {
    localStorage.setItem(
      `${LS_PREFIX}${sessionId}`,
      JSON.stringify({ result, storedAt: Date.now() }),
    );
  } catch { /* storage not available */ }
}

function loadResultFromStorage(sessionId: string): CalcResult | null {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${sessionId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { result: CalcResult; storedAt: number };
    if (Date.now() - parsed.storedAt > LS_EXPIRY_MS) {
      localStorage.removeItem(`${LS_PREFIX}${sessionId}`);
      return null;
    }
    return parsed.result;
  } catch {
    return null;
  }
}

function generateSessionId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AstroProfileClient() {
  const searchParams = useSearchParams();
  const { isAdmin } = useAuth();
  const [step, setStep] = useState<Step>("form");
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [unlockState, setUnlockState] = useState<UnlockState>("locked");
  const [isAdminTestUnlocked, setIsAdminTestUnlocked] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingOrder, setPendingOrder] = useState<string | null>(null);
  // LINE 登入回傳提示（loginRequired → LINE OAuth → 返回後提示再按一次）
  const lineLoginNoticeRaw = useMemo<"success" | "failed" | null>(() => {
    const val = searchParams.get("lineLogin");
    if (val === "success") return "success";
    if (val === "failed") return "failed";
    return null;
  }, [searchParams]);
  const [lineLoginNoticeDismissed, setLineLoginNoticeDismissed] = useState(false);
  const lineLoginNotice = lineLoginNoticeDismissed ? null : lineLoginNoticeRaw;

  // Form fields
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("不知道出生時間");
  const [birthCity, setBirthCity] = useState<BirthCity | null>(null);
  const [error, setError] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [manualMoon, setManualMoon] = useState<ZodiacSign | "">("");
  const [manualRising, setManualRising] = useState<ZodiacSign | "">("");
  const [manualVenus, setManualVenus] = useState<ZodiacSign | "">("");

  const sunSign = getSunSign(birthDate);
  const hasTime = birthTime !== "不知道出生時間";
  const hasCity = birthCity !== null;
  const canCalcFull = !!(birthDate && hasTime && hasCity);
  const canCalcMoon = !!(birthDate && hasTime);

  // On mount: check URL params for returning from payment
  useEffect(() => {
    const urlSession = searchParams.get("session");
    const urlOrder = searchParams.get("order");
    if (!urlSession || !urlOrder) return;

    const stored = loadResultFromStorage(urlSession);
    if (!stored) return; // result expired or not found — user must re-enter

    // Batch state updates in startTransition to avoid synchronous setState in effect
    startTransition(() => {
      setSessionId(urlSession);
      setPendingOrder(urlOrder);
      setCalcResult(stored);
      setStep("result");
      setUnlockState("checking");
    });
  }, [searchParams]);

  // Poll order status when checking
  const pollOrderStatus = useCallback(async (order: string) => {
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const res = await fetch(`/api/astro-profile/order-status?merchantTradeNo=${encodeURIComponent(order)}`);
        const data = await res.json() as { ok: boolean; paid?: boolean; status?: string };
        if (data.paid) {
          setUnlockState("unlocked");
          return;
        }
        if (data.status === "failed") {
          setUnlockState("locked");
          return;
        }
      } catch { /* network error, retry */ }
      await new Promise((r) => setTimeout(r, attempt < 4 ? 2000 : 4000));
    }
    // After 12 attempts (~40s total) give up silently — leave as locked
    setUnlockState("locked");
  }, []);

  useEffect(() => {
    if (unlockState !== "checking" || !pendingOrder) return;
    const order = pendingOrder;
    // Schedule polling outside the synchronous effect body
    const timer = setTimeout(() => { void pollOrderStatus(order); }, 0);
    return () => clearTimeout(timer);
  }, [unlockState, pendingOrder, pollOrderStatus]);

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
      try { moonSign = calcMoonSign(birthDate, birthTime); } catch { /* leave null */ }
    }
    if (canCalcFull) {
      try {
        risingSign = calcRisingSign(birthDate, birthTime, birthCity!.latitude, birthCity!.longitude);
        venusSign = calcVenusSign(birthDate, birthTime);
        risingCalcNote = "上升星座依出生時間與城市估算，若出生時間不確定，結果可能有誤差。";
      } catch { /* leave null */ }
    }

    if (manualMoon) moonSign = manualMoon;
    if (manualRising) risingSign = manualRising;
    if (manualVenus) venusSign = manualVenus;

    const result: CalcResult = { sunSign, moonSign, risingSign, venusSign, risingCalcNote };
    setCalcResult(result);
    setUnlockState("locked");
    setSessionId(null);
    setPendingOrder(null);
    setStep("result");
  };

  if (step === "result" && calcResult) {
    return (
      <ResultView
        result={calcResult}
        unlockState={unlockState}
        isAdminTestUnlocked={isAdminTestUnlocked}
        isAdmin={isAdmin}
        sessionId={sessionId}
        lineLoginNotice={lineLoginNotice}
        onUnlocked={(sid) => {
          setSessionId(sid);
          setUnlockState("checking");
        }}
        onPendingOrder={(order) => setPendingOrder(order)}
        onStoreResult={(sid) => saveResultToStorage(sid, calcResult)}
        onAdminTestUnlock={() => setIsAdminTestUnlocked(true)}
        onLineLoginNoticeDismiss={() => setLineLoginNoticeDismissed(true)}
        onReset={() => {
          setStep("form");
          setCalcResult(null);
          setUnlockState("locked");
          setIsAdminTestUnlocked(false);
          setSessionId(null);
          setPendingOrder(null);
        }}
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

      <form
        onSubmit={handleSubmit}
        className="rounded-[1.5rem] border border-white/10 bg-midnight/50 p-6 shadow-glow backdrop-blur-sm sm:p-8"
      >
        {/* Birth date */}
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

        {/* Birth time */}
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

        {/* Birth city */}
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
              setBirthCity(BIRTH_CITIES.find((c) => c.name === v) ?? null);
            }}
            placeholder="不知道出生城市"
          />
        </div>

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

        {/* Manual override */}
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
                <ZodiacSelect value={manualMoon} onChange={setManualMoon} placeholder="不指定" />
              </div>
              <div>
                <label className="mb-2 block text-xs text-moon/60">手動指定上升星座（覆蓋自動計算）</label>
                <ZodiacSelect value={manualRising} onChange={setManualRising} placeholder="不指定" />
              </div>
              <div>
                <label className="mb-2 block text-xs text-moon/60">手動指定金星星座（覆蓋自動計算）</label>
                <ZodiacSelect value={manualVenus} onChange={setManualVenus} placeholder="不指定" />
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
          style={{ background: "linear-gradient(135deg, #d8bd70 0%, #b89adf 60%, #d8bd70 100%)" }}
        >
          查看三重星座概覽 ✦
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

// ── Result View ────────────────────────────────────────────────────────────────

function ResultView({
  result,
  unlockState,
  isAdminTestUnlocked,
  isAdmin,
  sessionId,
  lineLoginNotice,
  onUnlocked,
  onPendingOrder,
  onStoreResult,
  onAdminTestUnlock,
  onLineLoginNoticeDismiss,
  onReset,
}: {
  result: CalcResult;
  unlockState: UnlockState;
  isAdminTestUnlocked: boolean;
  isAdmin: boolean;
  sessionId: string | null;
  lineLoginNotice: "success" | "failed" | null;
  onUnlocked: (sid: string) => void;
  onPendingOrder: (order: string) => void;
  onStoreResult: (sid: string) => void;
  onAdminTestUnlock: () => void;
  onLineLoginNoticeDismiss: () => void;
  onReset: () => void;
}) {
  const { sunSign, moonSign, risingSign, venusSign, risingCalcNote } = result;
  const sunTexts = ASTRO_PROFILE_TEXTS[sunSign];
  const isUnlocked = unlockState === "unlocked" || isAdminTestUnlocked;

  return (
    <div className="mx-auto max-w-lg py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-aurora/70">三重星座整體解析</p>
        <h1 className="mt-3 text-3xl font-semibold text-moon sm:text-4xl">
          {ZODIAC_SYMBOLS[sunSign]} {sunSign}
        </h1>
        <p className="mt-2 text-sm text-moon/50">太陽 × 月亮 × 上升</p>
      </div>

      <div className="space-y-4">

        {/* ── 三重星座主結構概覽（免費） ── */}
        <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-midnight/50 backdrop-blur-sm">
          <div className="h-px bg-gradient-to-r from-[#d8bd70]/50 via-lavender/50 to-aurora/40" />
          <div className="p-5 sm:p-6">
            <p className="mb-4 text-xs uppercase tracking-[0.24em] text-lavender/60">三重星座概覽</p>
            <div className="space-y-2.5">
              <SignRow label="太陽星座" sublabel="核心自我・靈魂的本質與主導性格" sign={sunSign} accentColor="text-[#d8bd70]" />
              <SignRow label="月亮星座" sublabel="情感內在・潛意識的日常安全感來源" sign={moonSign} accentColor="text-lavender" emptyNote="尚未提供" />
              <SignRow label="上升星座" sublabel="外在面具・你給世界的第一印象與處事風格" sign={risingSign} accentColor="text-aurora" emptyNote="尚未提供" />
            </div>
            {risingCalcNote && (
              <p className="mt-4 text-xs leading-5 text-moon/35">✦ {risingCalcNote}</p>
            )}
          </div>
        </div>

        {/* ── 金星延伸（免費） ── */}
        <div className="rounded-2xl border border-white/8 bg-white/3 px-5 py-4">
          <p className="mb-3 text-xs uppercase tracking-[0.2em] text-moon/38">延伸參考</p>
          <SignRow label="金星星座" sublabel="感情吸引力 · 延伸參考" sign={venusSign} accentColor="text-[#c9a0dc]/80" emptyNote="尚未提供" compact />
        </div>

        {/* ── 缺少項目提示 ── */}
        {!moonSign && <Notice>尚未提供月亮星座，完整解析以太陽星座為主。</Notice>}
        {!risingSign && <Notice>尚未提供上升星座，外在氣質解析解鎖後將顯示。</Notice>}

        {/* ── 短摘要（免費預覽） ── */}
        <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-midnight/50 shadow-glow backdrop-blur-sm">
          <div className="h-1 bg-gradient-to-r from-lavender/40 to-nebula/24" />
          <div className="p-5 sm:p-6">
            <p className="mb-3 text-xs uppercase tracking-[0.24em] text-moon/50">✦ 宇宙說</p>
            <p className="text-sm leading-7 text-moon/85">{sunTexts.shortSummary}</p>
          </div>
        </div>

        {/* ── Unlock gate or paid content ── */}
        {!isUnlocked ? (
          <UnlockGate
            result={result}
            unlockState={unlockState}
            sessionId={sessionId}
            isAdmin={isAdmin}
            onUnlocked={onUnlocked}
            onPendingOrder={onPendingOrder}
            onStoreResult={onStoreResult}
            onAdminTestUnlock={onAdminTestUnlock}
          />
        ) : (
          <PaidContent result={result} sunTexts={sunTexts} />
        )}

        {/* ── Post-unlock action buttons ── */}
        {isUnlocked && (
          <PostUnlockActions
            result={result}
            sunTexts={sunTexts}
            lineLoginNotice={lineLoginNotice}
            onLineLoginNoticeDismiss={onLineLoginNoticeDismiss}
          />
        )}

      </div>

      {/* Bottom actions */}
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

// ── Paid content sections ──────────────────────────────────────────────────────

function PaidContent({
  result,
  sunTexts,
}: {
  result: CalcResult;
  sunTexts: AstroProfileText;
}) {
  const { sunSign, moonSign, risingSign, venusSign } = result;

  return (
    <>
      {/* 1. 三重星座整體解析 */}
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

      {/* 2. 核心本質｜太陽星座 */}
      <ResultCard label="核心本質｜太陽星座" accent="from-[#d8bd70]/50 to-nebula/20" icon="☀">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-base font-semibold text-[#d8bd70]">
            {ZODIAC_SYMBOLS[sunSign]} {sunSign}
          </span>
        </div>
        <p className="mt-2 leading-7">{sunTexts.sunCoreText}</p>
      </ResultCard>

      {/* 3. 內在情感｜月亮星座 */}
      <ResultCard label="內在情感｜月亮星座" accent="from-lavender/40 to-nebula/24" icon="🌙">
        {moonSign ? (
          <>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-base font-semibold text-lavender">{ZODIAC_SYMBOLS[moonSign]} {moonSign}</span>
            </div>
            <p className="mt-2 leading-7">{ASTRO_PROFILE_TEXTS[moonSign].moonInnerText}</p>
          </>
        ) : (
          <p className="leading-7 text-moon/45">尚未提供月亮星座，這次先以太陽星座為主解讀。</p>
        )}
      </ResultCard>

      {/* 4. 外在展現｜上升星座 */}
      <ResultCard label="外在展現｜上升星座" accent="from-aurora/36 to-nebula/22" icon="⬆">
        {risingSign ? (
          <>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-base font-semibold text-aurora">{ZODIAC_SYMBOLS[risingSign]} {risingSign}</span>
            </div>
            <p className="mt-2 leading-7">{ASTRO_PROFILE_TEXTS[risingSign].risingOuterText}</p>
          </>
        ) : (
          <p className="leading-7 text-moon/45">尚未提供上升星座，外在氣質解析將暫時略過。</p>
        )}
      </ResultCard>

      {/* 5. 感情吸引力｜金星星座 */}
      <div className="overflow-hidden rounded-[1.5rem] border border-white/8 bg-midnight/30 shadow-sm backdrop-blur-sm">
        <div className="h-px bg-gradient-to-r from-[#c9a0dc]/30 to-nebula/20" />
        <div className="p-5 sm:p-6">
          <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-moon/40">
            <span>♀</span>
            感情吸引力｜金星星座
            <span className="ml-1 rounded-full border border-white/10 px-2 py-0.5 text-[10px] normal-case tracking-wide text-moon/30">延伸解析</span>
          </p>
          <div className="text-sm leading-7 text-moon/75">
            {venusSign ? (
              <>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#c9a0dc]/80">{ZODIAC_SYMBOLS[venusSign]} {venusSign}</span>
                </div>
                <p className="mt-2">{ASTRO_PROFILE_TEXTS[venusSign].venusLoveText}</p>
              </>
            ) : (
              <p className="text-moon/40">尚未提供金星星座，感情與吸引力解析將暫時略過。</p>
            )}
          </div>
        </div>
      </div>

      {/* 6. 宇宙偷偷話 */}
      <ResultCard label="宇宙偷偷話" accent="from-[#d8bd70]/40 to-nebula/20" icon="🌙">
        <p className="leading-7">{sunTexts.whisper}</p>
      </ResultCard>

      {/* 7. 給你的提醒 */}
      <ResultCard label="給你的提醒" accent="from-aurora/36 to-nebula/22" icon="🌿">
        <p className="leading-7">{sunTexts.advice}</p>
      </ResultCard>
    </>
  );
}

// ── Unlock Gate ────────────────────────────────────────────────────────────────

function UnlockGate({
  result,
  unlockState,
  sessionId,
  isAdmin,
  onUnlocked,
  onPendingOrder,
  onStoreResult,
  onAdminTestUnlock,
}: {
  result: CalcResult;
  unlockState: UnlockState;
  sessionId: string | null;
  isAdmin: boolean;
  onUnlocked: (sid: string) => void;
  onPendingOrder: (order: string) => void;
  onStoreResult: (sid: string) => void;
  onAdminTestUnlock: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [adminTestMsg, setAdminTestMsg] = useState("");
  const [email, setEmail] = useState("");
  const ecpayFormRef = useRef<HTMLFormElement>(null);
  const [ecpayData, setEcpayData] = useState<{ actionUrl: string; params: Record<string, string> } | null>(null);

  // Auto-submit ECPay form when params arrive
  useEffect(() => {
    if (ecpayData && ecpayFormRef.current) {
      ecpayFormRef.current.submit();
    }
  }, [ecpayData]);

  const handleUnlock = async () => {
    setLoading(true);
    setUnlockError("");
    const sid = sessionId ?? generateSessionId();
    onStoreResult(sid);

    try {
      const res = await fetch("/api/astro-profile/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, buyerEmail: email.trim() || undefined }),
      });
      const data = await res.json() as { ok: boolean; actionUrl?: string; params?: Record<string, string>; merchantTradeNo?: string; error?: string };

      if (!data.ok || !data.actionUrl || !data.params) {
        setUnlockError(data.error === "PAYMENT_NOT_CONFIGURED"
          ? "付款系統尚未設定，請聯繫客服。"
          : "建立訂單失敗，請稍後再試。");
        setLoading(false);
        return;
      }

      onUnlocked(sid);
      if (data.merchantTradeNo) onPendingOrder(data.merchantTradeNo);
      setEcpayData({ actionUrl: data.actionUrl, params: data.params });
    } catch {
      setUnlockError("網路錯誤，請稍後再試。");
      setLoading(false);
    }
  };

  const isChecking = unlockState === "checking";

  return (
    <div className="space-y-4">
      {/* Blurred preview of paid sections */}
      <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10">
        <div className="pointer-events-none select-none blur-sm" aria-hidden="true">
          <div className="bg-midnight/50 p-5 sm:p-6">
            <p className="mb-3 text-xs uppercase tracking-[0.24em] text-moon/50">✦ 三重星座整體解析</p>
            <p className="text-sm leading-7 text-moon/60 line-clamp-2">
              {ASTRO_PROFILE_TEXTS[result.sunSign].overallSummary}
            </p>
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-midnight/20 to-midnight/80">
          <div className="text-center">
            <p className="text-sm font-semibold text-moon/70">解鎖後可查看完整解析</p>
          </div>
        </div>
      </div>

      {/* Unlock CTA card */}
      <div className="overflow-hidden rounded-[1.5rem] border border-[#d8bd70]/30 bg-midnight/60 backdrop-blur-sm">
        <div className="h-1 bg-gradient-to-r from-[#d8bd70]/60 via-lavender/50 to-aurora/40" />
        <div className="p-5 sm:p-6">
          <p className="mb-1 text-xs uppercase tracking-[0.24em] text-[#d8bd70]/70">解鎖完整解析</p>
          <p className="mt-2 text-2xl font-bold text-moon">NT$149</p>
          <div className="mt-4 space-y-2">
            {[
              "完整三重星座解析（整體 + 逐層）",
              "宇宙偷偷話 & 給你的提醒",
              "下載限動分享圖",
              "傳送到 LINE 官方帳號",
              "寄送 EMAIL 保存",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-moon/70">
                <span className="shrink-0 text-[#d8bd70]">✦</span>
                {item}
              </div>
            ))}
          </div>

          {/* Optional email for receipt */}
          <div className="mt-5">
            <label className="mb-2 block text-xs text-moon/50">
              Email（選填，付款後可寄送解析）
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full rounded-xl border border-white/14 bg-[#0a1028] px-4 py-2.5 text-sm text-moon outline-none transition focus:border-lavender/60 focus:ring-2 focus:ring-lavender/20"
            />
          </div>

          {unlockError && (
            <p className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-300">
              {unlockError}
            </p>
          )}

          {isChecking ? (
            <div className="mt-5 flex items-center justify-center gap-2 py-3 text-sm text-moon/60">
              <span className="animate-pulse">✦</span>
              確認付款中，請稍候…
              <span className="animate-pulse">✦</span>
            </div>
          ) : (
            <button
              onClick={handleUnlock}
              disabled={loading}
              className="mt-5 w-full rounded-full py-3.5 text-base font-semibold text-midnight transition hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #d8bd70 0%, #b89adf 60%, #d8bd70 100%)" }}
            >
              {loading ? "處理中…" : "解鎖完整解析 NT$149"}
            </button>
          )}

          {isAdmin && !isChecking && (
            <div className="mt-4 border-t border-white/10 pt-4">
              <p className="mb-2 text-[10px] uppercase tracking-widest text-moon/30">管理員專用</p>
              <button
                onClick={() => {
                  setAdminTestMsg("已啟用管理員測試解鎖，現在可以測試完整解析、限動圖、LINE 與 EMAIL。");
                  onAdminTestUnlock();
                }}
                className="w-full rounded-full border border-white/20 bg-white/5 py-2.5 text-sm font-medium text-moon/50 transition hover:bg-white/10 hover:text-moon/70 active:scale-[0.98]"
              >
                管理員測試解鎖
              </button>
              {adminTestMsg && (
                <p className="mt-2 text-xs text-moon/50">{adminTestMsg}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Hidden ECPay form */}
      {ecpayData && (
        <form
          ref={ecpayFormRef}
          method="POST"
          action={ecpayData.actionUrl}
          style={{ display: "none" }}
          aria-hidden="true"
        >
          {Object.entries(ecpayData.params).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        </form>
      )}
    </div>
  );
}

// ── Post-unlock Action Buttons ─────────────────────────────────────────────────

function PostUnlockActions({
  result,
  sunTexts,
  lineLoginNotice,
  onLineLoginNoticeDismiss,
}: {
  result: CalcResult;
  sunTexts: AstroProfileText;
  lineLoginNotice: "success" | "failed" | null;
  onLineLoginNoticeDismiss: () => void;
}) {
  const { sunSign, moonSign, risingSign, venusSign } = result;
  const [dlLoading, setDlLoading] = useState(false);
  const [dlError, setDlError] = useState("");
  const [lineLoading, setLineLoading] = useState(false);
  const [lineMsg, setLineMsg] = useState("");
  const [showEmailPanel, setShowEmailPanel] = useState(false);
  const [emailAddr, setEmailAddr] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");

  const siteUrl = typeof window !== "undefined" ? window.location.origin : "";

  const handleDownloadImage = async () => {
    setDlLoading(true);
    setDlError("");
    try {
      const res = await fetch("/api/astro-profile/share-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sunSign,
          moonSign: moonSign ?? null,
          risingSign: risingSign ?? null,
          venusSign: venusSign ?? null,
          shortSummary: sunTexts.shortSummary,
          siteUrl,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        setDlError(`圖片產生失敗，請稍後再試。${errText ? `（${errText.slice(0, 60)}）` : ""}`);
        return;
      }
      // 確認回傳的是 PNG；若非 PNG 則顯示錯誤而非下載損毀檔案
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("image/png")) {
        const errText = await res.text().catch(() => "");
        setDlError(`圖片格式錯誤（${contentType || "未知"}），請稍後再試。${errText ? ` ${errText.slice(0, 60)}` : ""}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `三重星座_${sunSign}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      setDlError("下載失敗，請稍後再試。");
    } finally {
      setDlLoading(false);
    }
  };

  const handleSendLine = async () => {
    setLineLoading(true);
    setLineMsg("");
    try {
      const res = await fetch("/api/astro-profile/send-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sunSign,
          moonSign: moonSign ?? null,
          risingSign: risingSign ?? null,
          venusSign: venusSign ?? null,
          overallSummary: sunTexts.overallSummary,
          sunCoreText: sunTexts.sunCoreText,
          moonInnerText: moonSign ? ASTRO_PROFILE_TEXTS[moonSign].moonInnerText : undefined,
          risingOuterText: risingSign ? ASTRO_PROFILE_TEXTS[risingSign].risingOuterText : undefined,
          venusLoveText: venusSign ? ASTRO_PROFILE_TEXTS[venusSign].venusLoveText : undefined,
          whisper: sunTexts.whisper,
          siteUrl,
        }),
      });
      const data = await res.json() as { ok: boolean; loginRequired?: boolean; loginUrl?: string };

      if (data.loginRequired && data.loginUrl) {
        window.location.href = data.loginUrl;
        return;
      }
      setLineMsg(data.ok ? "✦ 已傳送到你的 LINE" : "傳送失敗，請稍後再試。");
    } catch {
      setLineMsg("網路錯誤，請稍後再試。");
    } finally {
      setLineLoading(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailAddr.trim()) { setEmailMsg("請輸入 Email。"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddr)) { setEmailMsg("Email 格式有誤。"); return; }

    setEmailLoading(true);
    setEmailMsg("");
    try {
      const res = await fetch("/api/astro-profile/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailAddr.trim(),
          sunSign,
          moonSign: moonSign ?? null,
          risingSign: risingSign ?? null,
          venusSign: venusSign ?? null,
          overallSummary: sunTexts.overallSummary,
          sunCoreText: sunTexts.sunCoreText,
          moonInnerText: moonSign ? ASTRO_PROFILE_TEXTS[moonSign].moonInnerText : undefined,
          risingOuterText: risingSign ? ASTRO_PROFILE_TEXTS[risingSign].risingOuterText : undefined,
          venusLoveText: venusSign ? ASTRO_PROFILE_TEXTS[venusSign].venusLoveText : undefined,
          whisper: sunTexts.whisper,
          advice: sunTexts.advice,
          siteUrl,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setEmailMsg("✦ Email 已寄出，請查收。");
        setShowEmailPanel(false);
        setEmailAddr("");
      } else {
        setEmailMsg(data.error === "EMAIL_NOT_CONFIGURED" ? "Email 系統尚未設定，請聯繫客服。" : "寄送失敗，請稍後再試。");
      }
    } catch {
      setEmailMsg("網路錯誤，請稍後再試。");
    } finally {
      setEmailLoading(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-[#d8bd70]/20 bg-midnight/40 backdrop-blur-sm">
      <div className="h-px bg-gradient-to-r from-[#d8bd70]/40 via-lavender/30 to-aurora/30" />
      <div className="p-5 sm:p-6">
        <p className="mb-4 text-xs uppercase tracking-[0.24em] text-[#d8bd70]/60">保存與分享</p>

        <div className="flex flex-col gap-3">
          {/* Download image */}
          <button
            onClick={handleDownloadImage}
            disabled={dlLoading}
            className="flex items-center justify-center gap-2 rounded-full border border-[#d8bd70]/40 bg-[#d8bd70]/10 py-3 text-sm font-semibold text-[#d8bd70] transition hover:bg-[#d8bd70]/20 active:scale-[0.98] disabled:opacity-60"
          >
            {dlLoading ? "產生中…" : "↓ 下載限動圖"}
          </button>
          {dlError && <p className="text-xs text-red-300">{dlError}</p>}

          {/* LINE login return notice */}
          {lineLoginNotice && (
            <div className={`flex items-start justify-between gap-2 rounded-xl px-4 py-3 text-xs ${lineLoginNotice === "success" ? "border border-[#06C755]/30 bg-[#06C755]/10 text-[#06C755]" : "border border-red-400/30 bg-red-400/10 text-red-300"}`}>
              <span>
                {lineLoginNotice === "success"
                  ? "✦ 已成功連結 LINE，請再按一次「傳送到 LINE 官方帳號」"
                  : "LINE 登入失敗，請再試一次"}
              </span>
              <button
                onClick={onLineLoginNoticeDismiss}
                className="shrink-0 opacity-60 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          )}

          {/* Send to LINE */}
          <button
            onClick={handleSendLine}
            disabled={lineLoading}
            className="flex items-center justify-center gap-2 rounded-full border border-[#06C755]/40 bg-[#06C755]/10 py-3 text-sm font-semibold text-[#06C755] transition hover:bg-[#06C755]/20 active:scale-[0.98] disabled:opacity-60"
          >
            {lineLoading ? "傳送中…" : "傳送到 LINE 官方帳號"}
          </button>
          {lineMsg && (
            <p className={`text-xs ${lineMsg.startsWith("✦") ? "text-[#06C755]" : "text-red-300"}`}>
              {lineMsg}
            </p>
          )}

          {/* Send email */}
          {!showEmailPanel ? (
            <button
              onClick={() => setShowEmailPanel(true)}
              className="flex items-center justify-center gap-2 rounded-full border border-lavender/40 bg-lavender/10 py-3 text-sm font-semibold text-lavender transition hover:bg-lavender/20 active:scale-[0.98]"
            >
              寄送到 EMAIL
            </button>
          ) : (
            <div className="space-y-3 rounded-xl border border-lavender/20 bg-lavender/5 p-4">
              <input
                type="email"
                value={emailAddr}
                onChange={(e) => setEmailAddr(e.target.value)}
                placeholder="your@email.com"
                className="w-full rounded-xl border border-white/14 bg-[#0a1028] px-4 py-2.5 text-sm text-moon outline-none transition focus:border-lavender/60 focus:ring-2 focus:ring-lavender/20"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSendEmail}
                  disabled={emailLoading}
                  className="flex-1 rounded-full border border-lavender/40 bg-lavender/20 py-2.5 text-sm font-semibold text-lavender transition hover:bg-lavender/30 disabled:opacity-60"
                >
                  {emailLoading ? "寄送中…" : "寄送 EMAIL"}
                </button>
                <button
                  onClick={() => { setShowEmailPanel(false); setEmailMsg(""); }}
                  className="rounded-full border border-white/14 bg-white/5 px-4 py-2.5 text-sm text-moon/50 transition hover:bg-white/10"
                >
                  取消
                </button>
              </div>
              {emailMsg && (
                <p className={`text-xs ${emailMsg.startsWith("✦") ? "text-lavender" : "text-red-300"}`}>
                  {emailMsg}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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

// ── Custom dropdown (CosmicSelect) ────────────────────────────────────────────

function CosmicSelect({
  options, value, onChange, placeholder,
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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const isDefault = value === placeholder || value === options[0];

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
        <span>{value || placeholder}</span>
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
                opt === value ? "bg-lavender/20 text-moon" : "text-moon/80 hover:bg-white/8 hover:text-moon",
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

// ── Zodiac select ──────────────────────────────────────────────────────────────

function ZodiacSelect({
  value, onChange, placeholder,
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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
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
                sign === value ? "bg-lavender/20 text-moon" : "text-moon/80 hover:bg-white/8 hover:text-moon",
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
