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
import { generateAstroStoryImage } from "@/lib/astroProfileStoryImage";
import {
  arePaidConsentsAccepted,
  EMPTY_PAID_CONSENTS,
  PaymentConsentChecklist,
  type PaidConsentFlags,
} from "@/components/PaymentConsentChecklist";
import { PAID_CONSENT_VERSION } from "@/lib/paidConsents";
import { readJsonResponse } from "@/lib/readJsonResponse";
import { trackTripleZodiac } from "@/lib/trackTripleZodiac";

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
const MIN_BIRTH_YEAR = 1920;
const CURRENT_YEAR = new Date().getFullYear();
const BIRTH_YEARS = Array.from(
  { length: CURRENT_YEAR - MIN_BIRTH_YEAR + 1 },
  (_, i) => String(CURRENT_YEAR - i),
);
const BIRTH_MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1));

function padDatePart(value: string): string {
  return value.padStart(2, "0");
}

function daysInMonth(year: string, month: string): number {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m) return 31;
  return new Date(y, m, 0).getDate();
}

function parseBirthDate(value: string): { year: string; month: string; day: string } {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { year: "", month: "", day: "" };
  return {
    year: match[1],
    month: String(Number(match[2])),
    day: String(Number(match[3])),
  };
}

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

// 完整三重星座解析必須同時具備太陽、月亮、上升與金星星座，缺一即視為不完整，
// 不得進入付款 / 序號兌換 / 完整結果。也用來擋下舊資料（付款返回或序號兌換載入的舊結果）。
function isCompleteResult(r: CalcResult): boolean {
  return !!(r.sunSign && r.moonSign && r.risingSign && r.venusSign);
}

function generateSessionId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── 入口頁文案資料 ───────────────────────────────────────────────────────────────

const SELLING_POINTS: { icon: string; title: string; sub: string; desc: string; color: string }[] = [
  { icon: "☀", title: "太陽星座", sub: "你展現出來的自己", desc: "看你的核心個性、人生主軸與外在生命力。", color: "text-[#d8bd70]" },
  { icon: "🌙", title: "月亮星座", sub: "你真正需要的安全感", desc: "看你的情緒反應、依附模式與內在需求。", color: "text-lavender" },
  { icon: "↑", title: "上升星座", sub: "別人第一眼看到的你", desc: "看你的外在人設、氣質與面對世界的方式。", color: "text-aurora" },
  { icon: "♀", title: "金星星座", sub: "你的感情吸引力", desc: "看你喜歡的關係模式、審美與被吸引的類型。", color: "text-[#c9a0dc]" },
];

const RESULT_HIGHLIGHTS: string[] = [
  "你的外在形象與真實性格差異",
  "你在感情裡容易被什麼吸引",
  "你最需要的安全感來源",
  "你在人際關係裡容易卡住的盲點",
  "太陽、月亮、上升、金星的整合分析",
  "如果有出生時間，會補上更準確的上升與宮位解讀",
];

// 星座層級的「長處 / 盲點」速覽（用於每個星體分頁的兩張小卡）。
// 這是星座共通特質的快速摘要，非個人化深度內容；深度內容仍在解鎖區。
const ZODIAC_TRAITS: Record<ZodiacSign, { strengths: string[]; blindspots: string[] }> = {
  牡羊座: { strengths: ["行動力強", "直接坦率", "有衝勁", "敢開第一槍"], blindspots: ["容易衝動", "缺乏耐心", "話快傷人", "三分鐘熱度"] },
  金牛座: { strengths: ["穩定務實", "有耐心", "重視承諾", "踏實可靠"], blindspots: ["太怕變動", "容易固執", "慢熱被動", "放不下既有的"] },
  雙子座: { strengths: ["反應靈活", "善溝通", "好奇心強", "適應力高"], blindspots: ["容易分心", "想太多", "難專一", "情緒飄忽"] },
  巨蟹座: { strengths: ["體貼細膩", "重感情", "有同理心", "顧家"], blindspots: ["太敏感", "容易內耗", "防衛心重", "情緒化"] },
  獅子座: { strengths: ["自信大方", "有領導力", "慷慨溫暖", "重視榮譽"], blindspots: ["愛面子", "需要被肯定", "容易自我中心", "聽不進建議"] },
  處女座: { strengths: ["細心負責", "邏輯清楚", "務實可靠", "願意付出"], blindspots: ["太追求完美", "容易焦慮", "愛挑剔", "對自己嚴苛"] },
  天秤座: { strengths: ["有品味", "善協調", "重視公平", "好相處"], blindspots: ["難下決定", "怕衝突", "容易討好", "在意他人眼光"] },
  天蠍座: { strengths: ["專注深刻", "洞察力強", "重情義", "有韌性"], blindspots: ["佔有欲強", "難放下", "防備心重", "悶著不說"] },
  射手座: { strengths: ["樂觀開朗", "愛自由", "視野開闊", "誠實直率"], blindspots: ["怕被綁住", "容易半途而廢", "說話太直", "難承諾"] },
  摩羯座: { strengths: ["自律負責", "有目標", "能扛壓力", "腳踏實地"], blindspots: ["太壓抑", "容易過勞", "難示弱", "對情感慢熱"] },
  水瓶座: { strengths: ["獨立創新", "理性客觀", "重視自我", "看得遠"], blindspots: ["情感疏離", "固執己見", "難親近", "想法跳太快"] },
  雙魚座: { strengths: ["浪漫敏感", "富同理心", "有想像力", "溫柔包容"], blindspots: ["容易逃避", "界線模糊", "想太多", "易受情緒淹沒"] },
};

/** 入口頁與摘要用的極簡星盤裝飾（純 SVG，無外部素材）*/
function ChartDeco({ className }: { className?: string }) {
  const ticks = Array.from({ length: 12 });
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" aria-hidden="true">
      <circle cx="50" cy="50" r="46" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1" />
      <circle cx="50" cy="50" r="33" stroke="currentColor" strokeOpacity="0.3" strokeWidth="0.8" />
      <circle cx="50" cy="50" r="3" fill="currentColor" fillOpacity="0.7" />
      {ticks.map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const x1 = 50 + Math.cos(a) * 33;
        const y1 = 50 + Math.sin(a) * 33;
        const x2 = 50 + Math.cos(a) * 46;
        const y2 = 50 + Math.sin(a) * 46;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.8" />;
      })}
      {ticks.map((_, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const x = 50 + Math.cos(a) * 40;
        const y = 50 + Math.sin(a) * 40;
        return <circle key={`d${i}`} cx={x} cy={y} r={i % 3 === 0 ? 1.6 : 1} fill="currentColor" fillOpacity={i % 3 === 0 ? 0.8 : 0.45} />;
      })}
    </svg>
  );
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
  // 出生時間：精確到分鐘的 "HH:mm"；空字串代表尚未填寫。
  const [birthTime, setBirthTime] = useState("");
  const [birthCity, setBirthCity] = useState<BirthCity | null>(null);
  const [error, setError] = useState("");
  // 手動星座模式：使用者已知道月亮 / 上升 / 金星星座，改為手動選滿。
  const [showManual, setShowManual] = useState(false);
  const [manualMoon, setManualMoon] = useState<ZodiacSign | "">("");
  const [manualRising, setManualRising] = useState<ZodiacSign | "">("");
  const [manualVenus, setManualVenus] = useState<ZodiacSign | "">("");

  // Hero CTA → 平滑捲動到出生資料表單（不跳頁）
  const formRef = useRef<HTMLFormElement>(null);
  const scrollToForm = useCallback(() => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const sunSign = getSunSign(birthDate);
  const hasTime = /^\d{2}:\d{2}$/.test(birthTime);
  const hasCity = birthCity !== null;
  const hasAllManual = !!(manualMoon && manualRising && manualVenus);
  const canCalcFull = !!(birthDate && hasTime && hasCity);
  // 是否符合送出條件：自動模式需日期+時間+城市；手動模式需日期+三顆星座全選。
  const canSubmit = !!birthDate && (showManual ? hasAllManual : (hasTime && hasCity));

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
        const data = await readJsonResponse<{ ok: boolean; paid?: boolean; status?: string }>(res, { ok: false });
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
    // 出生日期在兩種模式下都必填（太陽星座與基本資料需依生日判斷）。
    if (!birthDate) { setError("請先填寫出生日期。"); return; }
    if (!sunSign) { setError("日期格式有誤，請重新輸入"); return; }

    let moonSign: ZodiacSign | null = null;
    let risingSign: ZodiacSign | null = null;
    let venusSign: ZodiacSign | null = null;
    let risingCalcNote: string | null = null;

    if (showManual) {
      // 條件 B：手動星座模式——月亮 / 上升 / 金星 必須全部選滿，缺一不可。
      if (!manualMoon || !manualRising || !manualVenus) {
        setError("請完整選擇月亮、上升與金星星座，才能產生完整解析。");
        return;
      }
      moonSign = manualMoon;
      risingSign = manualRising;
      venusSign = manualVenus;
    } else {
      // 條件 A：自動計算模式——出生日期、出生時間、出生城市皆必填。
      if (!hasTime || !hasCity) {
        setError("為了產生完整三重星座解析，請填寫出生時間與出生城市，或改用手動選擇月亮／上升／金星星座。");
        return;
      }
      try {
        moonSign = calcMoonSign(birthDate, birthTime);
        risingSign = calcRisingSign(birthDate, birthTime, birthCity!.latitude, birthCity!.longitude);
        venusSign = calcVenusSign(birthDate, birthTime);
        risingCalcNote = "上升星座依出生時間與城市估算，若出生時間不確定，結果可能有誤差。";
      } catch {
        setError("星座計算發生問題，請確認出生日期、時間與城市後再試一次。");
        return;
      }
      // 防呆：計算後若仍缺任一星座，視為資料不足，不允許產生完整解析。
      if (!moonSign || !risingSign || !venusSign) {
        setError("為了產生完整三重星座解析，請填寫出生時間與出生城市，或改用手動選擇月亮／上升／金星星座。");
        return;
      }
    }

    setError("");
    // 儀表化：使用者實際送出表單（行為事件，不含出生資料）。best-effort，不阻擋流程。
    trackTripleZodiac("triple_zodiac_started");

    const result: CalcResult = { sunSign, moonSign, risingSign, venusSign, risingCalcNote };
    setCalcResult(result);
    setUnlockState("locked");
    setSessionId(null);
    setPendingOrder(null);
    setStep("result");
    // 儀表化：免費三重星座概覽成功產出（免費成功）。best-effort。
    trackTripleZodiac("triple_zodiac_free_success", { isPaid: false });
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
        onDirectUnlock={(sid) => {
          setSessionId(sid);
          setUnlockState("unlocked");
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
    <div className="mx-auto max-w-3xl py-8 sm:py-12">
      {/* ===== Hero 第一屏 ===== */}
      <section className="relative mb-12 overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-b from-[#1b1340]/80 via-midnight/60 to-midnight/40 px-6 py-10 text-center shadow-glow backdrop-blur-sm sm:px-10 sm:py-14">
        {/* 柔和星光裝飾（純 CSS / SVG，無外部圖片） */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-70">
          <div className="absolute -top-16 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-lavender/20 blur-3xl" />
          <div className="absolute bottom-0 right-6 h-32 w-32 rounded-full bg-[#d8bd70]/10 blur-3xl" />
        </div>
        <ChartDeco className="relative mx-auto mb-6 h-24 w-24 text-lavender/60 sm:h-28 sm:w-28" />
        <p className="relative text-xs uppercase tracking-[0.3em] text-aurora/70">免費三重星座人格分析</p>
        <h1 className="relative mx-auto mt-3 max-w-xl text-[1.7rem] font-semibold leading-snug text-moon sm:text-4xl">
          免費算出你的<span className="bg-gradient-to-r from-[#d8bd70] via-lavender to-aurora bg-clip-text text-transparent">三重星座人格圖</span>
        </h1>
        <p className="relative mx-auto mt-4 max-w-md text-sm leading-7 text-moon/70 sm:text-base">
          不只看太陽星座，還能看見你的內在情緒、外在人設與感情吸引力。
        </p>
        <p className="relative mx-auto mt-2 max-w-md text-xs leading-6 text-moon/45">
          輸入出生日期、時間與地點，產生你的太陽、月亮、上升與金星星座解析。
        </p>
        <button
          type="button"
          onClick={scrollToForm}
          className="relative mt-7 inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-base font-semibold text-midnight shadow-lg transition hover:brightness-105 active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #d8bd70 0%, #b89adf 60%, #d8bd70 100%)" }}
        >
          開始免費解析 ✨
        </button>
      </section>

      {/* ===== 四張核心賣點卡 ===== */}
      <div className="mb-12 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {SELLING_POINTS.map((p) => (
          <div
            key={p.title}
            className="rounded-2xl border border-white/10 bg-midnight/50 p-4 text-center shadow-glow backdrop-blur-sm sm:p-5"
          >
            <div className={`mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl ${p.color}`}>
              {p.icon}
            </div>
            <p className="text-sm font-semibold text-moon">{p.title}</p>
            <p className="mt-0.5 text-xs text-lavender/70">{p.sub}</p>
            <p className="mt-2 text-xs leading-6 text-moon/55">{p.desc}</p>
          </div>
        ))}
      </div>

      {/* ===== 為什麼不只看太陽星座 ===== */}
      <section className="mb-12 rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-6 sm:p-8">
        <h2 className="text-xl font-semibold text-moon sm:text-2xl">為什麼你不只是太陽星座？</h2>
        <div className="mt-4 space-y-4 text-sm leading-7 text-moon/70">
          <p>很多人只知道自己的太陽星座，但真正影響性格的，還有月亮、上升與金星。</p>
          <p>太陽像是你想成為的樣子，月亮是你私底下真正需要的安全感，上升是別人第一眼看見的你，而金星會透露你在感情裡被什麼吸引、如何表達喜歡。</p>
          <p>三重星座解析會把這些線索放在一起看，讓你更容易理解自己的矛盾、吸引力與人際模式。</p>
        </div>
      </section>

      {/* ===== 算完會看到什麼 ===== */}
      <section className="mb-12">
        <h2 className="mb-4 text-center text-xl font-semibold text-moon sm:text-2xl">這份解析會告訴你什麼？</h2>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {RESULT_HIGHLIGHTS.map((item) => (
            <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-midnight/40 px-4 py-3">
              <span className="mt-0.5 shrink-0 text-[#d8bd70]" aria-hidden="true">✦</span>
              <span className="text-sm leading-6 text-moon/75">{item}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 出生資料表單 ===== */}
      <div className="mx-auto max-w-lg">
        <div className="mb-5 text-center">
          <h2 className="text-2xl font-semibold text-moon">輸入你的出生資料</h2>
          <p className="mt-2 text-sm leading-6 text-moon/60">
            出生時間越準，上升星座與宮位會越準。若不確定，也可以先用大約時間體驗。
          </p>
          <p className="mt-2 text-xs leading-6 text-moon/40">
            出生資料只用於產生本次星座解析，不會公開顯示。
          </p>
        </div>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="rounded-[1.5rem] border border-white/10 bg-midnight/50 p-6 shadow-glow backdrop-blur-sm sm:p-8"
      >
        {/* Birth date */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-moon/80">
            出生日期
            <span className="ml-1.5 text-xs text-aurora/70">（必填）</span>
          </label>
          <BirthDateSelect value={birthDate} onChange={setBirthDate} />
          {birthDate && sunSign && (
            <p className="mt-2 text-xs text-lavender/70">
              {ZODIAC_SYMBOLS[sunSign]}&nbsp;太陽星座：{sunSign}
            </p>
          )}
        </div>

        {/* 完整資料說明：清楚告知產生完整解析所需的條件，避免誤會 */}
        <div className="mb-6 rounded-xl border border-white/8 bg-white/3 px-4 py-3">
          <p className="text-xs leading-6 text-moon/55">
            完整三重星座解析需要出生日期、出生時間與出生城市。若你已知道自己的月亮、上升與金星星座，也可以改用手動選擇。
          </p>
        </div>

        {/* Birth time */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-moon/80">
            出生時間
            <span className="ml-1.5 text-xs text-aurora/70">
              {showManual ? "（手動模式可不填）" : "（必填，需精確到分鐘）"}
            </span>
          </label>
          <input
            type="time"
            step="60"
            value={birthTime}
            placeholder="08:23"
            onChange={(e) => setBirthTime(e.target.value)}
            className="w-full rounded-xl border border-white/14 bg-[#0a1028] px-4 py-2.5 text-sm text-moon outline-none transition focus:border-lavender/60 focus:ring-2 focus:ring-lavender/20"
          />
          {!showManual && !hasTime && (
            <p className="mt-2 text-xs leading-6 text-moon/40">
              請填寫出生時間，月亮、上升與金星星座才能精準計算。
            </p>
          )}
        </div>

        {/* Birth city */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-moon/80">
            出生城市
            <span className="ml-1.5 text-xs text-aurora/70">
              {showManual ? "（手動模式可不填）" : "（必填）"}
            </span>
          </label>
          <CosmicSelect
            options={["請選擇出生城市", ...BIRTH_CITIES.map((c) => c.name)]}
            value={birthCity?.name ?? "請選擇出生城市"}
            onChange={(v) => {
              if (v === "請選擇出生城市") { setBirthCity(null); return; }
              setBirthCity(BIRTH_CITIES.find((c) => c.name === v) ?? null);
            }}
            placeholder="請選擇出生城市"
          />
          {!showManual && !hasCity && (
            <p className="mt-2 text-xs leading-6 text-moon/40">
              請選擇出生城市，上升星座才能準確判定。
            </p>
          )}
        </div>

        {!showManual && canCalcFull && (
          <div className="mb-6 rounded-xl border border-aurora/20 bg-aurora/5 px-4 py-3">
            <p className="text-xs text-aurora/80">
              ✦ 資料齊全，將自動計算月亮星座、上升星座與金星星座
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
            我已知道月亮 / 上升 / 金星星座，改用手動選擇
          </button>
          {showManual && (
            <div className="mt-4 space-y-4 rounded-xl border border-white/8 bg-white/3 p-4">
              <p className="text-xs leading-6 text-moon/50">
                手動模式需完整選擇月亮、上升與金星星座，才能產生完整解析。
              </p>
              <div>
                <label className="mb-2 block text-xs text-moon/60">月亮星座<span className="ml-1 text-aurora/70">（必填）</span></label>
                <ZodiacSelect value={manualMoon} onChange={setManualMoon} placeholder="請選擇月亮星座" />
              </div>
              <div>
                <label className="mb-2 block text-xs text-moon/60">上升星座<span className="ml-1 text-aurora/70">（必填）</span></label>
                <ZodiacSelect value={manualRising} onChange={setManualRising} placeholder="請選擇上升星座" />
              </div>
              <div>
                <label className="mb-2 block text-xs text-moon/60">金星星座<span className="ml-1 text-aurora/70">（必填）</span></label>
                <ZodiacSelect value={manualVenus} onChange={setManualVenus} placeholder="請選擇金星星座" />
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="mb-4 space-y-1 text-center">
          <p className="text-xs text-moon/45">✨ 完整資料才能產生精準的三重星座解析</p>
          <p className="text-xs text-moon/35">✨ 自動模式需出生日期、時間與城市，或手動選滿月亮 / 上升 / 金星</p>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-full py-3.5 text-base font-semibold text-midnight transition hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #d8bd70 0%, #b89adf 60%, #d8bd70 100%)" }}
        >
          產生我的星座解析 ✨
        </button>
        <p className="mt-3 text-center text-xs leading-6 text-moon/35">
          內容僅供娛樂、自我探索與心靈陪伴參考。
        </p>

        <div className="mt-5 text-center">
          <Link href="/" className="text-xs text-moon/38 underline underline-offset-4 transition hover:text-moon/60">
            ← 返回首頁
          </Link>
        </div>
      </form>
      </div>
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
  onDirectUnlock,
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
  onDirectUnlock: (sid: string) => void;
  onPendingOrder: (order: string) => void;
  onStoreResult: (sid: string) => void;
  onAdminTestUnlock: () => void;
  onLineLoginNoticeDismiss: () => void;
  onReset: () => void;
}) {
  const { sunSign } = result;
  const sunTexts = ASTRO_PROFILE_TEXTS[sunSign];
  const isUnlocked = unlockState === "unlocked" || isAdminTestUnlocked;

  // 資料不完整（例如付款返回或序號兌換載入到缺欄位的舊結果）時，不顯示半成品卡片，
  // 也不開放付款 / 解鎖，僅提示使用者重新填寫。
  if (!isCompleteResult(result)) {
    return <IncompleteResultView onReset={onReset} />;
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Header */}
      <div className="mb-8 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-aurora/70">三重星座整體解析</p>
        <h1 className="mt-3 text-3xl font-semibold text-moon sm:text-4xl">
          {ZODIAC_SYMBOLS[sunSign]} {sunSign}
        </h1>
        <p className="mt-2 text-sm text-moon/50">太陽 × 月亮 × 上升 × 金星</p>
      </div>

      {/* 資料來源說明：讓使用者清楚知道分析依據，避免誤會為命定預測 */}
      <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
        <p className="text-xs leading-6 text-moon/50">
          ✦ 本解析依據你提供的太陽、月亮、上升與金星星座，結合現代心理占星的星座象徵、人格傾向與互動模式，從核心個性、情緒需求、外在表現與感情模式進行分析。內容適合做自我了解與娛樂參考，並非絕對命定結果。
        </p>
      </div>

      <div className="space-y-4">

        {/* ── 1. 你的星盤摘要（免費） ── */}
        <StarChartSummary result={result} />

        {/* ── 2. 星體分頁 + 整合分析 ── */}
        <ResultTabs result={result} isUnlocked={isUnlocked} />

        {/* ── 3. 解鎖區（集中放在免費摘要之後，不每段重複） ── */}
        {!isUnlocked && (
          <UnlockGate
            result={result}
            unlockState={unlockState}
            sessionId={sessionId}
            isAdmin={isAdmin}
            onUnlocked={onUnlocked}
            onPendingOrder={onPendingOrder}
            onStoreResult={onStoreResult}
            onAdminTestUnlock={onAdminTestUnlock}
            onDirectUnlock={onDirectUnlock}
          />
        )}

        {/* ── 4. 解鎖後動作（沿用既有流程） ── */}
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

// ── Incomplete data guard ───────────────────────────────────────────────────────

// 當載入到不完整的解析資料（缺月亮 / 上升 / 金星）時顯示，取代半成品結果，
// 同時不提供任何付款或解鎖入口。
function IncompleteResultView({ onReset }: { onReset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-12 sm:px-6">
      <div className="overflow-hidden rounded-[1.5rem] border border-[#d8bd70]/25 bg-midnight/50 backdrop-blur-sm">
        <div className="h-1 bg-gradient-to-r from-[#d8bd70]/50 via-lavender/40 to-aurora/30" />
        <div className="p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.24em] text-[#d8bd70]/70">資料不完整</p>
          <h1 className="mt-3 text-2xl font-semibold text-moon">無法產生完整解析</h1>
          <p className="mt-4 text-sm leading-7 text-moon/70">
            這筆解析資料不完整，請重新填寫出生時間與出生城市，或手動選擇月亮／上升／金星星座後再產生。
          </p>
          <p className="mt-3 text-sm leading-7 text-moon/50">
            請先完成出生資料，才能解鎖完整人格命盤。
          </p>
          <button
            onClick={onReset}
            className="mt-6 w-full rounded-full py-3.5 text-base font-semibold text-midnight transition hover:brightness-105 active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #d8bd70 0%, #b89adf 60%, #d8bd70 100%)" }}
          >
            重新填寫出生資料
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 星盤摘要 ─────────────────────────────────────────────────────────────────────

/** 你的星盤摘要：太陽 / 月亮 / 上升 / 金星（目前無宮位資料 → 不顯示宮位欄，不留空白）*/
function StarChartSummary({ result }: { result: CalcResult }) {
  const { sunSign, moonSign, risingSign, venusSign, risingCalcNote } = result;
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-midnight/50 shadow-glow backdrop-blur-sm">
      <div className="h-1 bg-gradient-to-r from-[#d8bd70]/50 via-lavender/50 to-aurora/40" />
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <ChartDeco className="h-10 w-10 shrink-0 text-lavender/55" />
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-lavender/60">你的星盤摘要</p>
            <p className="text-sm text-moon/50">太陽 · 月亮 · 上升 · 金星</p>
          </div>
        </div>
        <div className="space-y-2.5">
          <SignRow label="太陽星座" sublabel="核心自我・主導性格" sign={sunSign} accentColor="text-[#d8bd70]" />
          <SignRow label="月亮星座" sublabel="情緒內在・安全感來源" sign={moonSign} accentColor="text-lavender" />
          <SignRow label="上升星座" sublabel="外在人設・第一印象" sign={risingSign} accentColor="text-aurora" />
          <SignRow label="金星星座" sublabel="感情吸引力・關係模式" sign={venusSign} accentColor="text-[#c9a0dc]/85" />
        </div>
        {risingCalcNote && (
          <p className="mt-4 text-xs leading-5 text-moon/35">✦ {risingCalcNote}</p>
        )}
      </div>
    </div>
  );
}

// ── 星體分頁（tabs）────────────────────────────────────────────────────────────

type BodyTabKey = "sun" | "moon" | "rising" | "venus" | "integration";

type BodyTabConfig = {
  label: string;
  icon: string;
  role: string;
  sign: ZodiacSign | null;
  accent: string;
  deep: string;
  brief: string;
};

function firstChars(text: string, n: number): string {
  const clean = (text ?? "").trim();
  return clean.length > n ? clean.slice(0, n) : clean;
}

/** 依太陽 / 月亮 / 上升差異，動態產生「內在拉扯」段落（用實際星座與特質，不寫罐頭句）*/
function buildInnerTension(result: CalcResult): string {
  const { sunSign, moonSign, risingSign } = result;
  if (!moonSign || !risingSign) return "";
  const parts: string[] = [];
  if (risingSign !== sunSign) {
    parts.push(`別人先看到的是${risingSign}的你（容易顯得${ZODIAC_TRAITS[risingSign].strengths[0]}），但你真正的核心是${sunSign}（更在意${ZODIAC_TRAITS[sunSign].strengths[0]}），外在人設和內在主軸不完全是同一面。`);
  }
  if (moonSign !== sunSign) {
    parts.push(`你想活成${sunSign}那種${ZODIAC_TRAITS[sunSign].strengths[0]}的樣子，但私底下更需要${moonSign}式的安全感；壓力一大，你會從${sunSign}慢慢退回${moonSign}的反應模式。`);
  }
  if (parts.length === 0) {
    parts.push(`你的太陽、月亮與上升落在相近的方向，對外與對內比較一致，好處是不容易內耗；但同一種傾向被放大時，也要留意「${ZODIAC_TRAITS[sunSign].blindspots[0]}」這個盲點。`);
  }
  return parts.join("");
}

function ResultTabs({ result, isUnlocked }: { result: CalcResult; isUnlocked: boolean }) {
  const [active, setActive] = useState<BodyTabKey>("sun");
  const { sunSign, moonSign, risingSign, venusSign } = result;

  const bodyConfig: Record<Exclude<BodyTabKey, "integration">, BodyTabConfig> = {
    sun:    { label: "太陽", icon: "☀", role: "你展現出來的自己", sign: sunSign, accent: "text-[#d8bd70]", deep: ASTRO_PROFILE_TEXTS[sunSign].sunCoreText, brief: "代表你的核心個性與人生主軸——你想成為什麼樣的人。" },
    moon:   { label: "月亮", icon: "🌙", role: "你真正需要的安全感", sign: moonSign, accent: "text-lavender", deep: moonSign ? ASTRO_PROFILE_TEXTS[moonSign].moonInnerText : "", brief: "代表你的情緒反應與內在需求——你私底下真正在意的。" },
    rising: { label: "上升", icon: "↑", role: "別人第一眼看到的你", sign: risingSign, accent: "text-aurora", deep: risingSign ? ASTRO_PROFILE_TEXTS[risingSign].risingOuterText : "", brief: "代表你的外在人設與氣質——別人對你的第一印象。" },
    venus:  { label: "金星", icon: "♀", role: "你的感情吸引力", sign: venusSign, accent: "text-[#c9a0dc]", deep: venusSign ? ASTRO_PROFILE_TEXTS[venusSign].venusLoveText : "", brief: "代表你喜歡的關係模式與被吸引的類型。" },
  };

  const tabs: { key: BodyTabKey; label: string; icon: string }[] = [
    { key: "sun", label: "太陽", icon: "☀" },
    { key: "moon", label: "月亮", icon: "🌙" },
    { key: "rising", label: "上升", icon: "↑" },
    { key: "venus", label: "金星", icon: "♀" },
    { key: "integration", label: "整合分析", icon: "✦" },
  ];

  return (
    <div>
      {/* sticky tab bar（手機橫向滑動；以背景遮罩避免遮住內容）*/}
      <div className="sticky top-2 z-20 mb-3 rounded-full border border-white/10 bg-midnight/80 p-1.5 shadow-lg backdrop-blur-md">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              aria-pressed={active === t.key}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition ${
                active === t.key ? "bg-lavender/25 text-lavender" : "text-moon/55 hover:text-moon/85"
              }`}
            >
              <span aria-hidden="true">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-midnight/50 p-5 shadow-glow backdrop-blur-sm sm:p-6">
        {active === "integration" ? (
          <IntegrationTab result={result} isUnlocked={isUnlocked} />
        ) : (
          <BodyTab cfg={bodyConfig[active]} isUnlocked={isUnlocked} />
        )}
      </div>
    </div>
  );
}

function BodyTab({ cfg, isUnlocked }: { cfg: BodyTabConfig; isUnlocked: boolean }) {
  const { label, icon, role, sign, accent, deep, brief } = cfg;
  if (!sign) {
    return <p className="text-sm leading-7 text-moon/50">這個星體尚無資料，請回到上一步補齊出生資料。</p>;
  }
  const traits = ZODIAC_TRAITS[sign];
  const tagline = ASTRO_PROFILE_TEXTS[sign].shortSummary;
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-moon/40">
        <span aria-hidden="true">{icon}</span>{label}星座 · {role}
      </div>
      <h3 className={`text-lg font-semibold ${accent}`}>{icon} {label}在{sign}的你</h3>

      {/* 區塊 1：核心定位（免費） */}
      <p className="mt-2 text-sm leading-7 text-moon/80">
        <span className="font-semibold text-moon">{tagline}</span>——{brief}
      </p>

      {/* 區塊 2：兩張小卡（免費） */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-aurora/20 bg-aurora/[0.06] p-4">
          <p className="mb-2.5 text-xs font-semibold tracking-wide text-aurora/85">讓人稱羨的長處</p>
          <div className="flex flex-wrap gap-1.5">
            {traits.strengths.map((s) => (
              <span key={s} className="rounded-full border border-aurora/25 bg-aurora/10 px-2.5 py-1 text-xs text-moon/80">{s}</span>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-lavender/20 bg-lavender/[0.06] p-4">
          <p className="mb-2.5 text-xs font-semibold tracking-wide text-lavender/85">藏在長處裡的盲點</p>
          <div className="flex flex-wrap gap-1.5">
            {traits.blindspots.map((s) => (
              <span key={s} className="rounded-full border border-lavender/25 bg-lavender/10 px-2.5 py-1 text-xs text-moon/80">{s}</span>
            ))}
          </div>
        </div>
      </div>

      {/* 區塊 3：星體解讀（免費顯示提示，完整版顯示深度內容） */}
      <div className="mt-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d8bd70]/70">星體解讀</p>
        {isUnlocked ? (
          <p className="whitespace-pre-line text-sm leading-8 text-moon/85">{deep}</p>
        ) : (
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <p className="text-sm leading-7 text-moon/45">
              {label}的完整深度解讀（性格傾向、日常與感情中的具體表現）已收錄在解鎖內容，於下方解鎖後展開。
            </p>
          </div>
        )}
      </div>
      {/* 區塊 4：落入宮位解讀 — 目前無宮位資料，依規格整段隱藏 */}
    </div>
  );
}

function IntegrationBlock({ title, icon, text }: { title: string; icon: string; text: string }) {
  if (!text) return null;
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:p-5">
      <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-moon/55">
        <span aria-hidden="true">{icon}</span>{title}
      </p>
      <p className="whitespace-pre-line text-sm leading-8 text-moon/82">{text}</p>
    </div>
  );
}

function IntegrationTab({ result, isUnlocked }: { result: CalcResult; isUnlocked: boolean }) {
  const t = ASTRO_PROFILE_TEXTS[result.sunSign];
  const tension = buildInnerTension(result);

  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-moon/40">
        <span aria-hidden="true">✦</span>整合分析 · 三重星座如何交織
      </div>
      <h3 className="text-lg font-semibold text-moon">把太陽、月亮、上升與金星放在一起看</h3>

      {!isUnlocked ? (
        <>
          <p className="mt-3 text-sm leading-7 text-moon/75">{firstChars(t.overallSummary, 90)}…</p>
          <p className="mt-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm leading-7 text-moon/45">
            完整整合分析會說明你的核心人格組合、感情與吸引力模式、內在拉扯，以及職涯天賦與行動建議——於下方解鎖後展開。
          </p>
        </>
      ) : (
        <div className="mt-4 space-y-4">
          <IntegrationBlock title="你的核心人格組合" icon="✦" text={t.overallSummary} />
          <IntegrationBlock title="你的感情與吸引力模式" icon="❤️" text={t.loveRelationshipText} />
          <IntegrationBlock title="你的內在拉扯" icon="🌗" text={tension} />
          <IntegrationBlock title="職涯天賦與財富傾向" icon="💰" text={t.careerWealthText} />
          <IntegrationBlock title="近期能量提醒" icon="🌙" text={t.yearlyFortuneText} />
          <IntegrationBlock title="靈魂課題與人生方向" icon="✨" text={t.soulLessonText} />
          <div className="rounded-2xl border border-lavender/25 bg-gradient-to-br from-lavender/10 to-midnight/50 p-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-lavender/70">給你的宇宙提醒</p>
            <p className="whitespace-pre-line text-sm leading-8 text-moon/85">{t.whisper}</p>
            <p className="mt-3 whitespace-pre-line border-t border-white/8 pt-3 text-sm leading-7 text-moon/70">{t.advice}</p>
          </div>
        </div>
      )}
    </div>
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
  onDirectUnlock,
}: {
  result: CalcResult;
  unlockState: UnlockState;
  sessionId: string | null;
  isAdmin: boolean;
  onUnlocked: (sid: string) => void;
  onPendingOrder: (order: string) => void;
  onStoreResult: (sid: string) => void;
  onAdminTestUnlock: () => void;
  onDirectUnlock: (sid: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [adminTestMsg, setAdminTestMsg] = useState("");
  const [email, setEmail] = useState("");
  const [paymentConsents, setPaymentConsents] = useState<PaidConsentFlags>(EMPTY_PAID_CONSENTS);
  const ecpayFormRef = useRef<HTMLFormElement>(null);
  // 補發序號
  const [reissueCode, setReissueCode] = useState("");
  const [reissueLoading, setReissueLoading] = useState(false);
  const [reissueError, setReissueError] = useState("");
  const [showReissue, setShowReissue] = useState(false);
  const [ecpayData, setEcpayData] = useState<{ actionUrl: string; params: Record<string, string> } | null>(null);

  // Auto-submit ECPay form when params arrive
  useEffect(() => {
    if (ecpayData && ecpayFormRef.current) {
      ecpayFormRef.current.submit();
    }
  }, [ecpayData]);

  const handleUnlock = async () => {
    if (!arePaidConsentsAccepted(paymentConsents)) {
      setUnlockError("請先確認年齡、付款授權與數位內容提供規則後，再前往付款。");
      return;
    }

    setLoading(true);
    setUnlockError("");
    const sid = sessionId ?? generateSessionId();
    onStoreResult(sid);

    try {
      const res = await fetch("/api/astro-profile/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          buyerEmail: email.trim() || undefined,
          consents: {
            ...paymentConsents,
            consentVersion: PAID_CONSENT_VERSION,
            consentAcceptedAt: new Date().toISOString(),
            userAgent: navigator.userAgent,
            pagePath: window.location.pathname,
            tarotMode: "zodiac",
            amount: 149,
            currency: "TWD",
          },
        }),
      });
      const data = await readJsonResponse<{ ok: boolean; actionUrl?: string; params?: Record<string, string>; merchantTradeNo?: string; error?: string }>(res, { ok: false });

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

  const handleReissueUnlock = async () => {
    const code = reissueCode.trim().toUpperCase();
    if (!code) { setReissueError("請輸入補發序號。"); return; }
    if (!/^AP-[A-Z0-9]{8}$/.test(code)) {
      setReissueError("序號格式有誤，應為 AP- 開頭共 11 碼。");
      return;
    }
    setReissueLoading(true);
    setReissueError("");
    const sid = `reissue-${code}`;
    onStoreResult(sid);
    try {
      const res = await fetch("/api/astro-profile/reissue-code/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, sessionId: sid }),
      });
      const data = await readJsonResponse<{ ok: boolean; error?: string }>(res, { ok: false });
      if (!data.ok) {
        const msgMap: Record<string, string> = {
          CODE_NOT_FOUND:   "序號不存在，請確認是否輸入正確。",
          CODE_ALREADY_USED: "此序號已使用過，無法重複兌換。",
          CODE_EXPIRED:     "序號已過期，請聯繫客服重新補發。",
          INVALID_CODE_FORMAT: "序號格式有誤，應為 AP- 開頭共 11 碼。",
        };
        setReissueError(msgMap[data.error ?? ""] ?? "序號無效，請稍後再試。");
        setReissueLoading(false);
        return;
      }
      onDirectUnlock(sid);
    } catch {
      setReissueError("網路錯誤，請稍後再試。");
      setReissueLoading(false);
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
              {isChecking ? "正在整理完整訊息，請稍候..." : ASTRO_PROFILE_TEXTS[result.sunSign].overallSummary}
            </p>
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-midnight/20 to-midnight/80">
          <div className="text-center">
            <p className="text-sm font-semibold text-moon/70">
              {isChecking ? "正在整理完整訊息，請稍候..." : "解鎖後可查看完整解析"}
            </p>
          </div>
        </div>
      </div>

      {/* Unlock CTA card */}
      <div className="overflow-hidden rounded-[1.5rem] border border-[#d8bd70]/30 bg-midnight/60 backdrop-blur-sm">
        <div className="h-1 bg-gradient-to-r from-[#d8bd70]/60 via-lavender/50 to-aurora/40" />
        <div className="p-5 sm:p-6">
          <p className="mb-1 text-xs uppercase tracking-[0.24em] text-[#d8bd70]/70">解鎖你的專屬人格命盤</p>
          <p className="mt-3 text-sm leading-7 text-moon/62">
            不是一般星座運勢，而是依照你的太陽、月亮、上升星座，生成專屬人格、感情、人際與人生傾向解析。
          </p>
          <p className="mt-2 text-2xl font-bold text-moon">NT$149</p>
          <p className="mt-4 text-sm font-semibold text-moon/74">解鎖後可查看：</p>
          <div className="mt-4 space-y-2">
            {[
              "太陽星座人格核心",
              "月亮星座情感模式",
              "上升星座外在人設",
              "三種能量如何互相影響",
              "愛情中的真實需求",
              "最容易吸引的人",
              "工作與金錢模式",
              "人際關係盲點",
              "專屬宇宙提醒",
              "下載限動分享圖",
              "傳送到 LINE 官方帳號",
              "寄送 Email 保存",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-moon/70">
                <span className="shrink-0 text-[#d8bd70]">✓</span>
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

          <PaymentConsentChecklist
            value={paymentConsents}
            onChange={setPaymentConsents}
            disabled={loading}
          />
          {!arePaidConsentsAccepted(paymentConsents) && (
            <p className="mt-2 text-[11px] leading-5 text-moon/40">
              請先確認年齡、付款授權與數位內容提供規則後，再前往付款。
            </p>
          )}

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
              disabled={loading || !arePaidConsentsAccepted(paymentConsents)}
              className="mt-5 w-full rounded-full py-3.5 text-base font-semibold text-midnight transition hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #d8bd70 0%, #b89adf 60%, #d8bd70 100%)" }}
            >
              {loading ? "處理中…" : "解鎖你的專屬人格命盤 NT$149"}
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

      {/* 補發序號兌換 */}
      {!isChecking && (
        <div className="overflow-hidden rounded-[1.5rem] border border-white/8 bg-midnight/30 backdrop-blur-sm">
          <div className="p-5 sm:p-6">
            <button
              type="button"
              onClick={() => { setShowReissue((v) => !v); setReissueError(""); }}
              className="flex w-full items-center justify-between text-sm text-moon/45 transition hover:text-moon/65"
            >
              <span>已有補發序號？點此兌換</span>
              <span className={`text-xs transition-transform ${showReissue ? "rotate-180" : ""}`}>▼</span>
            </button>
            {showReissue && (
              <div className="mt-4 space-y-3">
                <input
                  type="text"
                  value={reissueCode}
                  onChange={(e) => setReissueCode(e.target.value.toUpperCase())}
                  placeholder="AP-XXXXXXXX"
                  maxLength={11}
                  className="w-full rounded-xl border border-white/14 bg-[#0a1028] px-4 py-2.5 font-mono text-sm text-moon outline-none transition focus:border-lavender/60 focus:ring-2 focus:ring-lavender/20 placeholder:text-moon/25"
                />
                {reissueError && (
                  <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-300">
                    {reissueError}
                  </p>
                )}
                <button
                  onClick={() => void handleReissueUnlock()}
                  disabled={reissueLoading}
                  className="w-full rounded-full border border-[#d8bd70]/40 bg-[#d8bd70]/10 py-3 text-sm font-semibold text-[#d8bd70] transition hover:bg-[#d8bd70]/20 active:scale-[0.98] disabled:opacity-60"
                >
                  {reissueLoading ? "驗證中…" : "兌換序號解鎖"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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
  // LINE claim-code flow
  const [lineLoading, setLineLoading] = useState(false);
  const [lineClaimCode, setLineClaimCode] = useState("");
  const [lineClaimError, setLineClaimError] = useState("");
  const [lineClaimCopied, setLineClaimCopied] = useState(false);
  const [showEmailPanel, setShowEmailPanel] = useState(false);
  const [emailAddr, setEmailAddr] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");

  const siteUrl = typeof window !== "undefined" ? window.location.origin : "";

  const handleDownloadImage = async () => {
    setDlLoading(true);
    setDlError("");
    try {
      const blob = await generateAstroStoryImage({
        sunSign,
        moonSign:       moonSign       ?? null,
        risingSign:     risingSign     ?? null,
        venusSign:      venusSign      ?? null,
        shortSummary:   sunTexts.shortSummary   ?? null,
        overallSummary: sunTexts.overallSummary ?? null,
        sunCoreText:    sunTexts.sunCoreText    ?? null,
        moonEmotionText: moonSign ? ASTRO_PROFILE_TEXTS[moonSign].moonInnerText : null,
        risingOuterText: risingSign ? ASTRO_PROFILE_TEXTS[risingSign].risingOuterText : null,
        venusLoveText:  venusSign ? ASTRO_PROFILE_TEXTS[venusSign].venusLoveText : null,
        whisper:        sunTexts.whisper        ?? null,
        advice:         sunTexts.advice         ?? null,
        careerWealthText:    sunTexts.careerWealthText    ?? null,
        loveRelationshipText: sunTexts.loveRelationshipText ?? null,
        yearlyFortuneText:   sunTexts.yearlyFortuneText   ?? null,
        soulLessonText:      sunTexts.soulLessonText      ?? null,
        siteUrl: typeof window !== "undefined" ? window.location.hostname : "universe-whisper.vercel.app",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `三重星座_${sunSign}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      // 儀表化：限動圖下載成功。best-effort，不影響下載流程。
      trackTripleZodiac("triple_zodiac_story_downloaded", { isPaid: true });
    } catch (err) {
      setDlError(err instanceof Error ? err.message : "下載失敗，請稍後再試。");
    } finally {
      setDlLoading(false);
    }
  };

  const LINE_OA_ID = process.env.NEXT_PUBLIC_LINE_OA_ID ?? "453gfmok";
  // LINE App deep link — 手機/桌機已安裝 LINE 時直接喚起 App（不跳 QR Code 頁）
  const LINE_DEEP_LINK = `line://ti/p/@${LINE_OA_ID}`;
  // Web fallback — 未安裝 LINE 或無法喚起 App 時的加好友頁
  const LINE_OA_URL = `https://line.me/R/ti/p/%40${LINE_OA_ID}`;

  // 主要按鈕：優先用 line:// deep link 直接開 LINE App，避免桌機瀏覽器跳 QR Code 頁
  const handleOpenLineApp = () => {
    if (typeof window !== "undefined") {
      window.location.href = LINE_DEEP_LINK;
    }
  };

  const handleGenerateLineClaim = async () => {
    if (lineLoading) return;
    setLineLoading(true);
    setLineClaimError("");
    setLineClaimCode("");
    setLineClaimCopied(false);
    try {
      const res = await fetch("/api/astro-profile/line-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sunSign,
          moonSign: moonSign ?? null,
          risingSign: risingSign ?? null,
          venusSign: venusSign ?? null,
          overallSummary: sunTexts.overallSummary,
          sunCoreText: sunTexts.sunCoreText,
          moonInnerText: moonSign ? ASTRO_PROFILE_TEXTS[moonSign].moonInnerText : null,
          risingOuterText: risingSign ? ASTRO_PROFILE_TEXTS[risingSign].risingOuterText : null,
          venusLoveText: venusSign ? ASTRO_PROFILE_TEXTS[venusSign].venusLoveText : null,
          whisper: sunTexts.whisper,
          advice: sunTexts.advice,
          shortSummary: sunTexts.shortSummary,
          careerWealthText: sunTexts.careerWealthText,
          loveRelationshipText: sunTexts.loveRelationshipText,
          yearlyFortuneText: sunTexts.yearlyFortuneText,
          soulLessonText: sunTexts.soulLessonText,
        }),
      });
      const data = await readJsonResponse<{ ok: boolean; claimCode?: string; error?: string }>(res, { ok: false });
      if (!res.ok || !data.ok || !data.claimCode) {
        throw new Error(data.error ?? "無法產生查詢碼，請稍後再試。");
      }
      setLineClaimCode(data.claimCode);
      // 儀表化：成功產生 LINE 查詢碼（傳送到 LINE）。best-effort。
      trackTripleZodiac("triple_zodiac_line_sent", { isPaid: true });
    } catch (err) {
      setLineClaimError(err instanceof Error ? err.message : "無法產生查詢碼，請稍後再試。");
    } finally {
      setLineLoading(false);
    }
  };

  const handleCopyLineClaim = async () => {
    if (!lineClaimCode) return;
    try {
      await navigator.clipboard.writeText(lineClaimCode);
      setLineClaimCopied(true);
      setTimeout(() => setLineClaimCopied(false), 2500);
    } catch {
      // fallback: select text
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
          careerWealthText: sunTexts.careerWealthText,
          loveRelationshipText: sunTexts.loveRelationshipText,
          yearlyFortuneText: sunTexts.yearlyFortuneText,
          soulLessonText: sunTexts.soulLessonText,
          siteUrl,
        }),
      });
      const data = await readJsonResponse<{ ok: boolean; error?: string }>(res, { ok: false });
      if (data.ok) {
        setEmailMsg("✦ Email 已寄出，請查收。");
        setShowEmailPanel(false);
        setEmailAddr("");
        // 儀表化：Email 寄送成功。best-effort，不影響寄送流程。
        trackTripleZodiac("triple_zodiac_email_sent", { isPaid: true });
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

          {/* Send to LINE – claim-code flow */}
          {!lineClaimCode ? (
            <>
              <button
                onClick={() => void handleGenerateLineClaim()}
                disabled={lineLoading}
                className="flex items-center justify-center gap-2 rounded-full border border-[#06C755]/40 bg-[#06C755]/10 py-3 text-sm font-semibold text-[#06C755] transition hover:bg-[#06C755]/20 active:scale-[0.98] disabled:opacity-60"
              >
                {lineLoading ? "產生查詢碼中…" : "傳送到 LINE 官方帳號"}
              </button>
              {lineClaimError && (
                <p className="text-xs text-red-300">{lineClaimError}</p>
              )}
            </>
          ) : (
            <div className="space-y-3 rounded-xl border border-[#06C755]/20 bg-[#06C755]/5 p-4">
              <p className="text-xs text-moon/55">
                你的三重星座查詢碼：
              </p>
              <p className="text-center font-mono text-lg font-bold tracking-widest text-[#06C755]">
                {lineClaimCode}
              </p>
              <p className="text-xs leading-5 text-moon/50">
                請到 LINE 官方帳號輸入這組代碼，即可取得你的三重星座完整解析。代碼 1 小時內有效。
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => void handleCopyLineClaim()}
                  className="flex-1 rounded-full border border-[#06C755]/40 bg-[#06C755]/15 py-2.5 text-sm font-semibold text-[#06C755] transition hover:bg-[#06C755]/25 active:scale-[0.98]"
                >
                  {lineClaimCopied ? "已複製！" : "複製代碼"}
                </button>
                <button
                  type="button"
                  onClick={handleOpenLineApp}
                  className="flex-1 rounded-full border border-[#06C755]/40 bg-[#06C755]/10 py-2.5 text-center text-sm font-semibold text-[#06C755] transition hover:bg-[#06C755]/20 active:scale-[0.98]"
                >
                  開啟 LINE 官方帳號
                </button>
              </div>
              <p className="text-xs text-moon/38">
                若無法開啟 LINE，請
                <a
                  href={LINE_OA_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 underline underline-offset-2 hover:text-moon/60"
                >
                  點此前往 @{LINE_OA_ID}
                </a>
              </p>
              <button
                onClick={() => { setLineClaimCode(""); setLineClaimError(""); setLineClaimCopied(false); }}
                className="w-full text-xs text-moon/30 underline underline-offset-2 hover:text-moon/50"
              >
                重新產生代碼
              </button>
            </div>
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

// ── Custom dropdown (CosmicSelect) ────────────────────────────────────────────

function BirthDateSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const parsed = useMemo(() => parseBirthDate(value), [value]);
  const [year, setYear] = useState(parsed.year);
  const [month, setMonth] = useState(parsed.month);
  const [day, setDay] = useState(parsed.day);

  useEffect(() => {
    // 延後到 microtask 同步年月日，避免在 effect body 內同步 setState（行為不變）
    queueMicrotask(() => {
      setYear(parsed.year);
      setMonth(parsed.month);
      setDay(parsed.day);
    });
  }, [parsed.year, parsed.month, parsed.day]);

  const dayOptions = useMemo(() => {
    const count = daysInMonth(year, month);
    return Array.from({ length: count }, (_, i) => String(i + 1));
  }, [year, month]);

  const updateDate = useCallback((nextYear: string, nextMonth: string, nextDay: string) => {
    const maxDay = daysInMonth(nextYear, nextMonth);
    const adjustedDay = nextDay && Number(nextDay) > maxDay ? String(maxDay) : nextDay;

    setYear(nextYear);
    setMonth(nextMonth);
    setDay(adjustedDay);

    if (nextYear && nextMonth && adjustedDay) {
      onChange(`${nextYear}-${padDatePart(nextMonth)}-${padDatePart(adjustedDay)}`);
      return;
    }

    onChange("");
  }, [onChange]);

  return (
    <div className="flex flex-wrap gap-2">
      <BirthDatePartSelect
        ariaLabel="Birth year"
        value={year}
        onChange={(nextYear) => updateDate(nextYear, month, day)}
        placeholder="年"
        options={BIRTH_YEARS}
        className="min-w-[7.5rem] flex-[1.15]"
      />
      <BirthDatePartSelect
        ariaLabel="Birth month"
        value={month}
        onChange={(nextMonth) => updateDate(year, nextMonth, day)}
        placeholder="月"
        options={BIRTH_MONTHS}
        className="min-w-[5.5rem] flex-1"
      />
      <BirthDatePartSelect
        ariaLabel="Birth day"
        value={day}
        onChange={(nextDay) => updateDate(year, month, nextDay)}
        placeholder="日"
        options={dayOptions}
        className="min-w-[5.5rem] flex-1"
      />
    </div>
  );
}

function BirthDatePartSelect({
  value,
  onChange,
  placeholder,
  options,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={[
        "min-h-[3rem] rounded-xl border border-white/14 bg-[#0a1028] px-3 py-3 text-sm text-moon outline-none transition",
        "focus:border-lavender/60 focus:ring-2 focus:ring-lavender/20",
        value ? "text-moon" : "text-moon/40",
        className ?? "",
      ].join(" ")}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

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
