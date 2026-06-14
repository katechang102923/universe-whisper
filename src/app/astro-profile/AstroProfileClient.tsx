"use client";

import { useState, useRef, useEffect, useCallback, useMemo, startTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  getSunSign,
  ASTRO_PROFILE_TEXTS,
  ALL_ZODIAC_OPTIONS,
  ZODIAC_SYMBOLS,
  MERCURY_SIGN_TEXTS,
  MARS_SIGN_TEXTS,
  JUPITER_SIGN_TEXTS,
  SATURN_SIGN_TEXTS,
  URANUS_SIGN_TEXTS,
  NEPTUNE_SIGN_TEXTS,
  PLUTO_SIGN_TEXTS,
} from "@/lib/astroProfileTexts";
import type { ZodiacSign, AstroProfileText } from "@/lib/astroProfileTexts";
import { BIRTH_CITIES } from "@/lib/birthCities";
import type { BirthCity } from "@/lib/birthCities";
import { calcVenusSign, calcRisingSign, calcMoonSign, calcFullChart } from "@/lib/astroCalc";
import type { PlanetPosition } from "@/lib/astroCalc";
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
  /** 完整星盤資料（僅自動模式、有出生時間與城市時才有）；舊資料可能沒有此欄 */
  planets?: PlanetPosition[];
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
// 出生時間下拉選項：小時 00～23、分鐘 00～59（皆已補零，組合即為 HH:mm）。
const BIRTH_HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const BIRTH_MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function padDatePart(value: string): string {
  return value.padStart(2, "0");
}

// 把 "HH:mm" 拆成小時 / 分鐘；格式不符（含空字串）時回空字串，避免出現 undefined / NaN。
function parseBirthTime(value: string): { hour: string; minute: string } {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return { hour: "", minute: "" };
  return { hour: match[1], minute: match[2] };
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
    let planets: PlanetPosition[] | undefined;

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
        // 完整星盤資料（付費版顯示）：十大行星 + 上升的星座 / 度數 / Whole Sign 宮位
        planets = calcFullChart(birthDate, birthTime, birthCity!.latitude, birthCity!.longitude);
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

    const result: CalcResult = { sunSign, moonSign, risingSign, venusSign, risingCalcNote, ...(planets ? { planets } : {}) };
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
          <BirthTimeSelect value={birthTime} onChange={setBirthTime} />
          {!showManual && !hasTime && (
            <p className="mt-2 text-xs leading-6 text-moon/40">
              請選擇完整出生時間（小時與分鐘），上升與宮位才會準確。
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
        <p className="text-xs uppercase tracking-[0.3em] text-aurora/70">
          {isUnlocked ? "完整星盤深度解析" : "免費三重星座解析"}
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-moon sm:text-4xl">
          {ZODIAC_SYMBOLS[sunSign]} {sunSign}
        </h1>
        <p className="mt-2 text-sm text-moon/50">
          {isUnlocked ? "完整星盤 · 十大行星與上升" : "太陽 × 月亮 × 上升"}
        </p>
      </div>

      {/* 資料來源說明：讓使用者清楚知道分析依據，避免誤會為命定預測 */}
      <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
        <p className="text-xs leading-6 text-moon/50">
          {isUnlocked
            ? "✦ 完整星盤深度解析依據你的十大行星與上升星座，結合現代心理占星的星座象徵、人格傾向與互動模式，從核心個性、情緒需求、外在表現與感情模式進行分析。內容適合做自我了解與娛樂參考，並非絕對命定結果。"
            : "✦ 免費三重星座解析依據你的太陽、月亮與上升星座（金星為延伸參考），從核心個性、情緒需求與外在第一印象進行分析。內容適合做自我了解與娛樂參考，並非絕對命定結果。"}
        </p>
      </div>

      <div className="space-y-4">

        {isUnlocked ? (
          <>
            {/* 已解鎖付費版順序：解鎖提示 → 星盤摘要 → 主打整合 → 精華卡 → 核心四星體
                → 付費限定行星 → 人生面向延伸 → 收合式完整星盤表 → 保存功能 */}
            <PaidUnlockBanner />
            <StarChartSummary result={result} variant="full" />
            <FullChartIntegrationHero result={result} planets={result.planets} />
            <PaidEssenceCards result={result} planets={result.planets} />
            <ResultTabs result={result} isUnlocked />
            {result.planets && result.planets.length > 0 && (
              <PaidPlanetSections result={result} planets={result.planets} />
            )}
            <LifeAreasSection result={result} />
            {result.planets && result.planets.length > 0 && (
              <CollapsibleChartTable planets={result.planets} />
            )}
            <PostUnlockActions
              result={result}
              sunTexts={sunTexts}
              lineLoginNotice={lineLoginNotice}
              onLineLoginNoticeDismiss={onLineLoginNoticeDismiss}
            />
          </>
        ) : (
          <>
            {/* ── 免費版：三重星座概覽 → 免費三重星座解析 → 金星延伸 → 預覽 → 解鎖區 ── */}
            <StarChartSummary result={result} variant="triple" />
            {/* 免費三重星座解析：標題 → 一句話總結 → 三星體短解讀 → 三重星座輪廓 → 免費提醒 */}
            <FreeResultSections result={result} />

            {/* 延伸參考：金星星座（非三重星座本體，僅短提示 + 完整版引導）*/}
            {result.venusSign && <VenusExtensionCard venusSign={result.venusSign} />}

            {/* 完整版預覽（只露一句預告）*/}
            <UnlockPreviewCards />

            {/* 付費解鎖區：放在所有免費內容之後 */}
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
          </>
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
            請先完成出生資料，才能產生免費三重星座解析與升級完整星盤解析。
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

/**
 * 星盤摘要。
 * - variant="triple"（免費版）：只顯示太陽 / 月亮 / 上升「三重星座概覽」，金星不在此本體中。
 * - variant="full"（已解鎖）：顯示含金星的完整星盤摘要。
 * 目前無宮位資料 → 不顯示宮位欄，不留空白。
 */
function StarChartSummary({ result, variant }: { result: CalcResult; variant: "triple" | "full" }) {
  const { sunSign, moonSign, risingSign, venusSign, risingCalcNote } = result;
  const isFull = variant === "full";
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-midnight/50 shadow-glow backdrop-blur-sm">
      <div className="h-1 bg-gradient-to-r from-[#d8bd70]/50 via-lavender/50 to-aurora/40" />
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <ChartDeco className="h-10 w-10 shrink-0 text-lavender/55" />
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-lavender/60">
              {isFull ? "你的星盤摘要" : "你的三重星座概覽"}
            </p>
            <p className="text-sm text-moon/50">{isFull ? "太陽 · 月亮 · 上升 · 金星" : "太陽 · 月亮 · 上升"}</p>
          </div>
        </div>
        <div className="space-y-2.5">
          <SignRow label="太陽星座" sublabel="核心自我・主導性格" sign={sunSign} accentColor="text-[#d8bd70]" />
          <SignRow label="月亮星座" sublabel="情緒內在・安全感來源" sign={moonSign} accentColor="text-lavender" />
          <SignRow label="上升星座" sublabel="外在人設・第一印象" sign={risingSign} accentColor="text-aurora" />
          {isFull && (
            <SignRow label="金星星座" sublabel="感情吸引力・關係模式" sign={venusSign} accentColor="text-[#c9a0dc]/85" />
          )}
        </div>
        {risingCalcNote && (
          <p className="mt-4 text-xs leading-5 text-moon/35">✦ {risingCalcNote}</p>
        )}
      </div>
    </div>
  );
}

// ── 星體分頁（tabs）────────────────────────────────────────────────────────────

type BodyTabKey = "sun" | "moon" | "rising" | "venus";

type BodyTabConfig = {
  label: string;
  icon: string;
  role: string;
  sign: ZodiacSign | null;
  accent: string;
  deep: string;
  brief: string;
  /** 付費限定小標（如金星的「你在戀愛中最容易吸引到誰」）*/
  paidSubtitle?: string;
  /** 落宮領域標籤（如「第五宮・戀愛創造與自我表現」）*/
  houseLabel?: string | null;
  /** 解讀後補充的短句（宮位揉入、金星吸引等），各自獨立成段 */
  notes?: string[];
};

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
  const { sunSign, moonSign, risingSign, venusSign, planets } = result;

  const houseLabelFor = (key: string) => houseDomainLabel(planetHouseOf(planets, key));
  const houseNoteFor = (key: string) => buildHouseFlavor(key, planetHouseOf(planets, key));

  const bodyConfig: Record<BodyTabKey, BodyTabConfig> = {
    sun:    { label: "太陽", icon: "☀", role: "你展現出來的自己", sign: sunSign, accent: "text-[#d8bd70]", deep: ASTRO_PROFILE_TEXTS[sunSign].sunCoreText, brief: "代表你的核心個性與人生主軸——你想成為什麼樣的人。", houseLabel: houseLabelFor("sun"), notes: [houseNoteFor("sun")] },
    moon:   { label: "月亮", icon: "🌙", role: "你真正需要的安全感", sign: moonSign, accent: "text-lavender", deep: moonSign ? ASTRO_PROFILE_TEXTS[moonSign].moonInnerText : "", brief: "代表你的情緒反應與內在需求——你私底下真正在意的。", houseLabel: houseLabelFor("moon"), notes: [houseNoteFor("moon")] },
    rising: { label: "上升", icon: "↑", role: "別人第一眼看到的你", sign: risingSign, accent: "text-aurora", deep: risingSign ? ASTRO_PROFILE_TEXTS[risingSign].risingOuterText : "", brief: "代表你的外在人設與氣質——別人對你的第一印象。", houseLabel: houseLabelFor("rising"), notes: [houseNoteFor("rising")] },
    venus:  { label: "金星", icon: "♀", role: "你的感情吸引力", sign: venusSign, accent: "text-[#c9a0dc]", deep: venusSign ? ASTRO_PROFILE_TEXTS[venusSign].venusLoveText : "", brief: "代表你喜歡的關係模式與被吸引的類型。", paidSubtitle: isUnlocked ? "你在戀愛中最容易吸引到誰" : undefined, houseLabel: houseLabelFor("venus"), notes: [venusSign ? buildVenusAttraction(venusSign) : "", houseNoteFor("venus")] },
  };

  const tabs: { key: BodyTabKey; label: string; icon: string }[] = [
    { key: "sun", label: "太陽", icon: "☀" },
    { key: "moon", label: "月亮", icon: "🌙" },
    { key: "rising", label: "上升", icon: "↑" },
    { key: "venus", label: "金星", icon: "♀" },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center gap-3 px-1">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#d8bd70]/30" />
        <p className="text-xs uppercase tracking-[0.24em] text-[#d8bd70]/70">核心四星體深度解析</p>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#d8bd70]/30" />
      </div>

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
        <BodyTab cfg={bodyConfig[active]} isUnlocked={isUnlocked} />
      </div>
    </div>
  );
}

function BodyTab({ cfg, isUnlocked }: { cfg: BodyTabConfig; isUnlocked: boolean }) {
  const { label, icon, role, sign, accent, deep, brief, paidSubtitle, houseLabel, notes } = cfg;
  if (!sign) {
    return <p className="text-sm leading-7 text-moon/50">這個星體尚無資料，請回到上一步補齊出生資料。</p>;
  }
  const traits = ZODIAC_TRAITS[sign];
  const tagline = ASTRO_PROFILE_TEXTS[sign].shortSummary;
  const deepParagraphs = splitToParagraphs(deep);
  const extraNotes = (notes ?? []).filter(Boolean);
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-moon/40">
        <span aria-hidden="true">{icon}</span>{label}星座 · {role}
      </div>
      <h3 className={`text-lg font-semibold ${accent}`}>{icon} {label}在{sign}的你</h3>
      {isUnlocked && (houseLabel || paidSubtitle) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {houseLabel && <span className="text-xs text-moon/55">落入{houseLabel}</span>}
          {paidSubtitle && (
            <span className="rounded-full bg-[#d8bd70]/15 px-2.5 py-0.5 text-[11px] font-medium text-[#d8bd70]/90">
              {paidSubtitle}
            </span>
          )}
        </div>
      )}

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

      {/* 區塊 3：星體解讀（免費顯示提示，完整版顯示深度內容＋宮位補充，拆短段好讀） */}
      <div className="mt-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d8bd70]/70">星體解讀</p>
        {isUnlocked ? (
          <div className="space-y-3">
            {deepParagraphs.map((p, i) => (
              <p key={i} className="text-sm leading-8 text-moon/85">{p}</p>
            ))}
            {extraNotes.map((n, i) => (
              <p key={`note-${i}`} className="rounded-xl border border-[#d8bd70]/15 bg-[#d8bd70]/[0.05] px-4 py-3 text-sm leading-7 text-moon/75">
                {n}
              </p>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <p className="text-sm leading-7 text-moon/45">
              {label}的完整深度解讀（性格傾向、日常與感情中的具體表現）已收錄在解鎖內容，於下方解鎖後展開。
            </p>
          </div>
        )}
      </div>
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

// ── 完整星盤資料表（付費版）─────────────────────────────────────────────────────

const PLANET_GLYPH: Record<string, string> = {
  sun: "☀", moon: "🌙", mercury: "☿", venus: "♀", mars: "♂",
  jupiter: "♃", saturn: "♄", uranus: "♅", neptune: "♆", pluto: "♇", rising: "↑",
};

// 表格儲存格防呆：空值 / undefined / null / NaN → 「—」
function chartCell(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v || /undefined|null|NaN/i.test(v)) return "—";
  return v;
}

/**
 * 十大行星 + 上升的星座度數與 Whole Sign 宮位。
 * embedded=true 時只輸出表格本體（給收合區用，不重複卡片外框與標題）。
 */
function FullChartTable({ planets, embedded = false }: { planets: PlanetPosition[]; embedded?: boolean }) {
  if (!planets || planets.length === 0) return null;

  const tableBody = (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[18rem] text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-moon/45">
              <th className="py-2 pr-3 font-medium">星體</th>
              <th className="py-2 pr-3 font-medium">星座・度數</th>
              <th className="py-2 font-medium">落入宮位</th>
            </tr>
          </thead>
          <tbody>
            {planets.map((p) => (
              <tr key={p.key} className="border-b border-white/6 last:border-b-0">
                <td className="whitespace-nowrap py-2.5 pr-3 font-medium text-moon">
                  <span aria-hidden="true">{PLANET_GLYPH[p.key] ?? "✦"}</span> {chartCell(p.label)}
                </td>
                <td className="whitespace-nowrap py-2.5 pr-3 text-moon/80">{chartCell(p.degreeText)}</td>
                <td className="whitespace-nowrap py-2.5 text-moon/70">{chartCell(p.houseText)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-5 text-moon/35">✦ 宮位以 Whole Sign 制計算（上升星座為第一宮）；本資料供自我探索與娛樂參考。</p>
    </>
  );

  if (embedded) {
    return <div className="border-t border-white/8 pt-4">{tableBody}</div>;
  }

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-[#d8bd70]/25 bg-midnight/50 shadow-glow backdrop-blur-sm">
      <div className="h-1 bg-gradient-to-r from-[#d8bd70]/55 via-lavender/45 to-aurora/40" />
      <div className="p-5 sm:p-6">
        <p className="mb-1 text-xs uppercase tracking-[0.24em] text-[#d8bd70]/70">完整星盤資料表</p>
        <p className="mb-4 text-sm text-moon/50">十大行星與上升的星座、度數與宮位（Whole Sign 宮位制）</p>
        {tableBody}
      </div>
    </div>
  );
}

// ── 完整星盤深度區塊（NT$149 已解鎖才顯示）──────────────────────────────────────
// 水星 / 火星 / 木星 / 土星 逐顆深度解讀 + 外行星世代特質 + 完整星盤整合分析。
// 僅在自動模式（有 planets 完整星盤資料）時可取得各行星星座，故與完整星盤表同條件顯示。

/** 從完整星盤資料取出某顆行星的星座（無則回 null）*/
function planetSignOf(planets: PlanetPosition[], key: string): ZodiacSign | null {
  return planets.find((p) => p.key === key)?.sign ?? null;
}

/** 從完整星盤資料取出某顆行星的落宮文字（如「第五宮」；無則回 null）*/
function planetHouseOf(planets: PlanetPosition[] | undefined, key: string): string | null {
  if (!planets) return null;
  const h = planets.find((p) => p.key === key)?.houseText;
  return h && h.trim() ? h : null;
}

// 12 宮的白話「短標」：用於標題下方「落入第X宮・___」的小標，求簡潔。
const HOUSE_DOMAIN: Record<string, string> = {
  第一宮: "自我形象與外在氣質",
  第二宮: "金錢價值與安全感",
  第三宮: "溝通學習與日常互動",
  第四宮: "家庭根基與內在安全",
  第五宮: "戀愛創造與自我表現",
  第六宮: "工作日常與身心狀態",
  第七宮: "伴侶合作與重要他人",
  第八宮: "深層連結與情緒轉化",
  第九宮: "信念視野與人生方向",
  第十宮: "職涯方向與社會角色",
  第十一宮: "朋友社群與共同理想",
  第十二宮: "潛意識休息與內在療癒",
};

// 12 宮的白話「長述」：用於卡片底部小框，寫成可放進句子的自然短語。
// 刻意與上面的短標用不同說法，避免同一張卡片把同一句宮位描述重複兩次。
const HOUSE_DOMAIN_PLAIN: Record<string, string> = {
  第一宮: "你的外在氣質，以及別人第一眼看到的你",
  第二宮: "金錢上的安全感，還有讓你覺得踏實的生活基礎",
  第三宮: "溝通學習、日常互動，還有身邊近距離的人際往來",
  第四宮: "家庭根基，以及你真正想安放自己的地方",
  第五宮: "戀愛、創作、興趣，還有被看見的喜悅",
  第六宮: "工作日常、生活習慣，還有身心狀態",
  第七宮: "伴侶、合作，還有一對一的重要關係",
  第八宮: "深層的信任、親密，還有情緒的轉化",
  第九宮: "學習、旅行、信念，還有人生的方向感",
  第十宮: "工作方向、你想被看見的方式，以及你在社會中想扮演的角色",
  第十一宮: "朋友、社群，還有你和大家一起想完成的理想",
  第十二宮: "休息、獨處、療癒，還有那些看不見的內在壓力",
};

/** 把「第五宮」變成「第五宮・戀愛創造與自我表現」；無對應時回 null（不顯示假資料） */
function houseDomainLabel(houseText: string | null | undefined): string | null {
  if (!houseText) return null;
  const domain = HOUSE_DOMAIN[houseText];
  return domain ? `${houseText}・${domain}` : null;
}

/**
 * 依行星與落宮，產生 1 句把宮位領域揉進解析的補充句（無對應宮位則回空字串）。
 * 不同星體用不同語氣（思考 / 行動 / 成長 / 課題…），且用白話長述 HOUSE_DOMAIN_PLAIN，
 * 不再沿用標題的短標，避免同一張卡片重複同一句宮位描述。
 */
function buildHouseFlavor(key: string, houseText: string | null | undefined): string {
  if (!houseText) return "";
  const domain = HOUSE_DOMAIN_PLAIN[houseText];
  if (!domain) return "";
  const map: Record<string, string> = {
    sun: `你的主導性與自我價值，最容易展現在${domain}。`,
    moon: `你的情緒反應與安全感，最容易在${domain}這些面向被觸動。`,
    rising: `別人常從${domain}，認識你面對世界的方式。`,
    mercury: `你的思考與表達，容易在${domain}相關的情境裡被打開。`,
    venus: `你的吸引力與安全感，容易落在${domain}相關的人事物裡。`,
    mars: `你的行動力，最容易在${domain}這些事情上被啟動。`,
    jupiter: `你的成長機會，常從${domain}慢慢展開。`,
    saturn: `你需要練習耐心、慢慢建立界線的地方，常落在${domain}。`,
  };
  return map[key] ?? "";
}

/** 把一段長文自然拆成 2～3 個短段（手機好讀，不切在奇怪位置）；無內容回空陣列 */
function splitToParagraphs(text: string | null | undefined, parts = 2): string[] {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  if (!s) return [];
  const sentences = s.match(/[^。！？]+[。！？]?/g)?.map((x) => x.trim()).filter(Boolean) ?? [s];
  if (sentences.length <= 1) return [s];
  const per = Math.ceil(sentences.length / parts);
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += per) {
    const chunk = sentences.slice(i, i + per).join("").trim();
    if (chunk) out.push(chunk);
  }
  return out;
}

/** 金星：戀愛中容易吸引到誰（短句，付費版金星小標用） */
function buildVenusAttraction(venusSign: ZodiacSign): string {
  const k = ZODIAC_TRAITS[venusSign].strengths;
  return `在關係裡，你容易被${k.slice(0, 2).join("、")}的人吸引，也容易和對方走進需要被穩定回應、彼此真心在乎的互動裡。`;
}

/**
 * 主打整合分析（拆成短段，手機好讀）：把太陽 / 月亮 / 上升 / 金星 / 水星 / 火星 串成一個人，
 * 若有宮位資料，自然帶到「你在哪些人生領域最容易表現出這種模式」。
 */
function buildIntegrationHeroParagraphs(
  result: CalcResult,
  mercury: ZodiacSign | null,
  mars: ZodiacSign | null,
  sunHouse: string | null,
  moonHouse: string | null,
): string[] {
  const { sunSign, moonSign, risingSign, venusSign } = result;
  const paras: string[] = [];

  // 第一段：太陽 + 月亮 + 上升（核心人格、情緒需求、外在人設）
  let p1 = `你的核心是太陽${sunSign}，骨子裡想活出${planetTrait("sun", sunSign)}的自己。`;
  if (moonSign) {
    p1 += `情緒底層則是月亮${moonSign}，真正讓你安定的，是${planetTrait("moon", moonSign)}；壓力一大，你會從外在的樣子，悄悄退回這個狀態。`;
  }
  if (risingSign) {
    p1 += `而別人第一眼接收到的，是上升${risingSign}那種${planetTrait("rising", risingSign)}的氣場——那是你面對世界的方式，未必等於你私下真正的需要。`;
  }
  paras.push(p1);

  // 第二段：金星 + 水星 + 火星（感情模式、溝通方式、行動反應）
  if (venusSign || mercury || mars) {
    let p2 = "";
    if (venusSign) p2 += `在感情裡，金星${venusSign}讓你容易被${planetTrait("venus", venusSign)}的人吸引，也用自己的步調靠近一個人。`;
    if (mercury) p2 += `思考和說話時，水星${mercury}讓你習慣${planetTrait("mercury", mercury)}。`;
    if (mars) {
      // 防呆：即使水星與火星同星座，職能描述本就不同；仍保留保險，避免兩星輸出同一句。
      let marsTrait = planetTrait("mars", mars);
      if (mercury && planetTrait("mercury", mercury) === marsTrait) {
        marsTrait = `${marsTrait}（這是行動面，和上面的思考方式不同）`;
      }
      p2 += `真正要行動、面對衝突或壓力時，火星${mars}則讓你${marsTrait}。`;
    }
    paras.push(p2);
  }

  // 第三段：宮位（依實際 houseDomain 數量調整單／複數語氣）
  const domains: string[] = [];
  const sunDomain = sunHouse ? HOUSE_DOMAIN[sunHouse] : undefined;
  const moonDomain = moonHouse ? HOUSE_DOMAIN[moonHouse] : undefined;
  if (sunDomain) domains.push(sunDomain);
  if (moonDomain && moonHouse !== sunHouse) domains.push(moonDomain);
  if (domains.length === 1) {
    paras.push(`這種模式最容易在「${domains[0]}」這個領域裡被你看見。`);
  } else if (domains.length >= 2) {
    paras.push(`這些模式會分別在${domains.map((d) => `「${d}」`).join("、")}等領域中被你看見。`);
  }

  // 第四段：溫柔收束（不命定、不鐵口直斷）
  paras.push("這些面向不是互相矛盾的缺點，而是不同的你在同時運作。看懂它們各自想要什麼，你就能少一點內耗，把自己過得更完整一點。");

  return paras;
}

interface EssenceCard { icon: string; title: string; body: string; }

/** 付費版專屬「生活化精華卡」（3～4 張，50～90 字，具體不玄；免費版不會出現） */
function buildEssenceCards(result: CalcResult, planets: PlanetPosition[] | undefined): EssenceCard[] {
  const { sunSign, moonSign, venusSign } = result;
  const mars    = planets ? planetSignOf(planets, "mars")    : null;
  const jupiter = planets ? planetSignOf(planets, "jupiter") : null;
  const saturn  = planets ? planetSignOf(planets, "saturn")  : null;
  const k0 = (s: ZodiacSign) => ZODIAC_TRAITS[s].strengths[0];
  const k1 = (s: ZodiacSign) => ZODIAC_TRAITS[s].strengths[1] ?? ZODIAC_TRAITS[s].strengths[0];
  const cards: EssenceCard[] = [];

  const moonNeed = moonSign ? `${k0(moonSign)}、被穩定回應` : "被穩定回應";
  const venusPull = venusSign ? `${k0(venusSign)}、${k1(venusSign)}` : "真誠、願意靠近";
  cards.push({
    icon: "💞",
    title: "你的關係核心需求",
    body: `在關係裡，你真正需要的不是熱鬧，而是${moonNeed}。你容易被${venusPull}的人吸引，但能讓你留下來的，是對方願意穩定靠近、讓你不用一直猜。當你覺得被穩穩接住，才敢把真正的自己交出來。`,
  });

  const marsWay = mars ? `用「${ZODIAC_TRAITS[mars].blindspots[0]}」的方式應對` : "先把情緒悶在心裡";
  const moonState = moonSign ? `月亮${moonSign}的你` : "心裡的你";
  cards.push({
    icon: "🌊",
    title: "你的壓力反應模式",
    body: `壓力一來，你不一定會正面迎戰，反而容易${marsWay}。表面上你還撐著沒事，但${moonState}其實已經在縮。先承認自己累了、給自己一點獨處的空檔，會比硬撐更快讓你回到狀態。`,
  });

  const jupLine = jupiter ? `木星${jupiter}提醒你，往「${k0(jupiter)}」的方向靠近時最容易遇到機會。` : "";
  cards.push({
    icon: "🚀",
    title: "你最適合發力的方向",
    body: `你最容易發光的，是能讓你${k0(sunSign)}、又有空間自主發揮的場合。${jupLine}與其勉強自己變成別人，不如把本來就擅長的，放到對的舞台上慢慢放大。`,
  });

  const satLine = saturn ? `土星${saturn}要你練習的，` : "你需要練習的，";
  cards.push({
    icon: "🌿",
    title: "你需要練習的溫柔邊界",
    body: `你習慣把責任往身上攬，也容易為了關係先委屈自己。${satLine}是在「照顧別人」和「照顧自己」之間畫一條線。把「我也有需要」說出口，不是自私，而是讓關係能走得更長久。`,
  });

  return cards;
}

/**
 * 外行星「世代底色」（約 120～180 字，分 2～3 段）：用白話把天王星 / 海王星 / 冥王星
 * 寫成你這個世代共同的背景感，不寫命定、不用抽象靈性術語，明確標示為背景參考。
 */
function buildOuterPlanetText(
  uranus: ZodiacSign | null,
  neptune: ZodiacSign | null,
  pluto: ZodiacSign | null,
): string {
  const parts: string[] = [
    "天王星、海王星與冥王星移動較慢，比起個人性格，它們更像是你這個世代共同面對的課題與氛圍。",
  ];
  if (uranus) parts.push(`天王星讓你這個世代${URANUS_SIGN_TEXTS[uranus]}。`);
  if (neptune) parts.push(`海王星讓你們${NEPTUNE_SIGN_TEXTS[neptune]}。`);
  if (pluto) parts.push(`冥王星則${PLUTO_SIGN_TEXTS[pluto]}。`);
  parts.push("這不是用來定義你個人的全部，而是補充你所處時代的背景感，當作背景參考就好，不是個人命運的判決。");
  return parts.join("");
}

// ── 星體職能化描述（同一星座在不同星體上用不同說法，避免整合分析重複用詞）──────────
// 每顆星依「職能」改寫，語句已對齊各自的句型插槽：
//   sun    →「想活出 ___ 的自己」     moon →「真正讓你安定的是 ___」
//   rising →「那種 ___ 的氣場/形象」   venus→「被 ___ 的人/特質吸引」
//   mercury→「讓你習慣 ___」（思考、理解、表達）
//   mars   →「則讓你 ___」（行動、衝突、壓力反應）

type PlanetFn = "sun" | "moon" | "rising" | "venus" | "mercury" | "mars";

const PLANET_TRAITS: Record<PlanetFn, Record<ZodiacSign, string>> = {
  sun: {
    牡羊座: "果敢直接、敢開第一槍", 金牛座: "踏實穩定、把生活過得安穩", 雙子座: "靈活多元、什麼都想嘗試",
    巨蟹座: "溫暖顧家、有人情味", 獅子座: "自信發光、被看見", 處女座: "細心務實、把事情做到位",
    天秤座: "優雅得體、追求和諧與公平", 天蠍座: "深刻專注、有掌控力", 射手座: "自由開闊、不斷探索",
    摩羯座: "自律有目標、腳踏實地往上走", 水瓶座: "獨立創新、做自己", 雙魚座: "溫柔有想像力、富同理心",
  },
  moon: {
    牡羊座: "被尊重、能直接做自己", 金牛座: "熟悉的節奏與踏實的安全感", 雙子座: "新鮮的刺激與能說話的對象",
    巨蟹座: "被在乎、有歸屬的安全感", 獅子座: "被肯定、被放在心上", 處女座: "把事情打理好後的安心感",
    天秤座: "和諧、不被逼著起衝突的關係", 天蠍座: "深度的信任與不被背叛的確定感", 射手座: "自由的空間與不被綁住的感覺",
    摩羯座: "被需要、能被依靠的踏實感", 水瓶座: "不被干涉、保有自我的空間", 雙魚座: "被理解、被溫柔接住的感覺",
  },
  rising: {
    牡羊座: "俐落有衝勁", 金牛座: "穩重好相處", 雙子座: "機靈健談", 巨蟹座: "親切溫和",
    獅子座: "大方有存在感", 處女座: "細緻有條理", 天秤座: "優雅有禮", 天蠍座: "神秘有距離感",
    射手座: "開朗自在", 摩羯座: "沉穩可靠", 水瓶座: "獨特又帶點疏離", 雙魚座: "柔和有夢幻感",
  },
  venus: {
    牡羊座: "直接、熱烈、不拖泥帶水", 金牛座: "穩定、可靠、願意實際照顧你", 雙子座: "聰明、有趣、聊得來",
    巨蟹座: "有歸屬感、願意照顧也讓你照顧", 獅子座: "大方、欣賞你也讓你欣賞", 處女座: "可靠、有生活感、能把日子過好",
    天秤座: "優雅、有美感、懂得互相尊重", 天蠍座: "深刻、忠誠、有強烈情感連結", 射手座: "自由、開朗、能一起成長",
    摩羯座: "成熟、穩定、能一起承擔現實", 水瓶座: "保有空間、像朋友也像夥伴", 雙魚座: "溫柔、能理解你、讓你被接住",
  },
  mercury: {
    牡羊座: "想得快、說得直，反應比別人快半拍", 金牛座: "想得慢但扎實，要看到實際證據才下判斷",
    雙子座: "反應靈活，擅長連結資訊、快速切換角度", 巨蟹座: "先感受對方語氣與情緒，再決定怎麼說",
    獅子座: "表達帶舞台感，希望想法被聽見、被看見", 處女座: "先拆解細節、找出問題，再條理分明地說",
    天秤座: "說話前先衡量雙方立場，講究平衡與分寸", 天蠍座: "觀察入微、不輕易說破，卻看得見深層動機",
    射手座: "想大方向、談理念，喜歡開闊的觀點", 摩羯座: "說話謹慎，重視結構、結果與可行性",
    水瓶座: "想法跳脫常規，能從不同角度拆解問題", 雙魚座: "先用直覺、畫面與情緒共鳴理解，再慢慢說出意思",
  },
  mars: {
    牡羊座: "想到就衝，壓力一來傾向正面迎戰", 金牛座: "行動保守但耐力強，決定了就穩穩推進",
    雙子座: "同時開很多線，靠好奇心和變化啟動", 巨蟹座: "壓力來時先防衛，保護自己也保護在乎的人",
    獅子座: "帶著自尊與表現欲行動，越被肯定越有力", 處女座: "做事謹慎，壓力下容易想把細節修到完美",
    天秤座: "不愛硬碰硬，傾向先協調、找折衷再出手", 天蠍座: "行動有忍耐力，悶著累積、關鍵時刻才爆發",
    射手座: "靠熱情行動，討厭被限制，需要目標感", 摩羯座: "行動有計畫、能扛壓，靠長期累積取勝",
    水瓶座: "不照常規出手，越有自主空間越有動力", 雙魚座: "不喜歡正面硬碰硬，先退一步、跟著感覺與氛圍行動",
  },
};

/** 取某星體在某星座的職能化描述（保證水星 / 火星等不同星體用不同說法） */
function planetTrait(planet: PlanetFn, sign: ZodiacSign): string {
  return PLANET_TRAITS[planet][sign];
}

/** 完整星盤整合分析（Email 用單段字串）：把太陽 / 月亮 / 上升 / 金星 / 水星 / 火星 串成一個人，
 *  每顆星依職能改寫，不重複用詞。 */
function buildFullChartIntegration(
  result: CalcResult,
  mercury: ZodiacSign | null,
  mars: ZodiacSign | null,
): string {
  const { sunSign, moonSign, risingSign, venusSign } = result;
  const parts: string[] = [];
  parts.push(`把整張星盤放在一起看，你的核心是太陽${sunSign}，渴望活出${planetTrait("sun", sunSign)}的自己；`);
  if (moonSign) {
    parts.push(`但情緒底層是月亮${moonSign}，真正讓你安定的是${planetTrait("moon", moonSign)}，壓力一大時，你會從${sunSign}的姿態慢慢退回${moonSign}的反應。`);
  }
  if (risingSign) {
    parts.push(`別人第一眼看到的，是上升${risingSign}那種${planetTrait("rising", risingSign)}的形象，這未必等於你內在真正的需要。`);
  }
  if (venusSign) {
    parts.push(`在關係裡，金星${venusSign}讓你被${planetTrait("venus", venusSign)}的特質吸引，也用自己的方式表達在乎。`);
  }
  if (mercury) parts.push(`思考與溝通上，水星${mercury}讓你習慣${planetTrait("mercury", mercury)}；`);
  if (mars) parts.push(`真正要行動或面對衝突時，火星${mars}則讓你${planetTrait("mars", mars)}。`);
  parts.push("這些面向不是互相矛盾的缺點，而是不同需求在同時運作——看懂它們各自想要什麼，你就能更少內耗地把自己活得完整。");
  return parts.join("");
}

/** 單一行星深度解讀卡（付費限定小標 + 落宮領域 + 拆短段落 + 宮位補充句） */
function PlanetDeepBlock({
  icon, title, subtitle, sign, accent, text, houseLabel, notes,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  sign: ZodiacSign;
  accent: string;
  text: string;
  houseLabel?: string | null;
  notes?: string[];
}) {
  const paragraphs = splitToParagraphs(text);
  const extraNotes = (notes ?? []).filter(Boolean);
  return (
    <div className="rounded-2xl border border-white/10 bg-midnight/45 p-5 sm:p-6">
      <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-moon/40">
        <span aria-hidden="true">{icon}</span>{title}
      </div>
      <h3 className={`text-lg font-semibold ${accent}`}>{icon} 在{sign}的你</h3>
      {(houseLabel || subtitle) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {houseLabel && <span className="text-xs text-moon/55">落入{houseLabel}</span>}
          {subtitle && (
            <span className="rounded-full bg-[#d8bd70]/15 px-2.5 py-0.5 text-[11px] font-medium text-[#d8bd70]/90">
              {subtitle}
            </span>
          )}
        </div>
      )}
      <div className="mt-3 space-y-3">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-sm leading-8 text-moon/85">{p}</p>
        ))}
        {extraNotes.map((n, i) => (
          <p key={`note-${i}`} className="rounded-xl border border-[#d8bd70]/15 bg-[#d8bd70]/[0.05] px-4 py-3 text-sm leading-7 text-moon/75">
            {n}
          </p>
        ))}
      </div>
    </div>
  );
}

/** 付費限定行星解析（水星 / 火星 / 木星 / 土星 + 外行星）；整合分析已移到上方主打卡 */
function PaidPlanetSections({ result, planets }: { result: CalcResult; planets: PlanetPosition[] }) {
  void result;
  const mercury = planetSignOf(planets, "mercury");
  const mars    = planetSignOf(planets, "mars");
  const jupiter = planetSignOf(planets, "jupiter");
  const saturn  = planetSignOf(planets, "saturn");
  const uranus  = planetSignOf(planets, "uranus");
  const neptune = planetSignOf(planets, "neptune");
  const pluto   = planetSignOf(planets, "pluto");

  const houseLabelFor = (key: string) => houseDomainLabel(planetHouseOf(planets, key));
  const houseNoteFor = (key: string) => buildHouseFlavor(key, planetHouseOf(planets, key));

  const outerText = buildOuterPlanetText(uranus, neptune, pluto);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 px-1">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#d8bd70]/30" />
        <p className="text-xs uppercase tracking-[0.24em] text-[#d8bd70]/70">付費限定 · 行星深度解析</p>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#d8bd70]/30" />
      </div>

      {mercury && (
        <PlanetDeepBlock
          icon="☿" title="水星｜你的溝通與思考模式" subtitle="職場與溝通私房建議"
          sign={mercury} accent="text-aurora" text={MERCURY_SIGN_TEXTS[mercury]}
          houseLabel={houseLabelFor("mercury")} notes={[houseNoteFor("mercury")]}
        />
      )}
      {mars && (
        <PlanetDeepBlock
          icon="♂" title="火星｜你的行動力與衝突模式" subtitle="當你感到焦慮時的充電指南"
          sign={mars} accent="text-[#e07a5f]" text={MARS_SIGN_TEXTS[mars]}
          houseLabel={houseLabelFor("mars")} notes={[houseNoteFor("mars")]}
        />
      )}
      {jupiter && (
        <PlanetDeepBlock
          icon="♃" title="木星｜你的成長與幸運方向" subtitle="你越做越順的擴張方式"
          sign={jupiter} accent="text-[#d8bd70]" text={JUPITER_SIGN_TEXTS[jupiter]}
          houseLabel={houseLabelFor("jupiter")} notes={[houseNoteFor("jupiter")]}
        />
      )}
      {saturn && (
        <PlanetDeepBlock
          icon="♄" title="土星｜你的課題與責任感" subtitle="你需要慢慢練習成熟的地方"
          sign={saturn} accent="text-lavender" text={SATURN_SIGN_TEXTS[saturn]}
          houseLabel={houseLabelFor("saturn")} notes={[houseNoteFor("saturn")]}
        />
      )}

      {(uranus || neptune || pluto) && (
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 sm:p-6">
          <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-moon/40">
            <span aria-hidden="true">♅ ♆ ♇</span>外行星特質參考
          </div>
          <h3 className="text-lg font-semibold text-moon/85">你的世代底色</h3>
          <div className="mt-3 space-y-3">
            {splitToParagraphs(outerText, 3).map((p, i) => (
              <p key={i} className="text-sm leading-8 text-moon/80">{p}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 付費版主打與精華卡 ──────────────────────────────────────────────────────────

/** 付費解鎖完成提示 / 付費版標題 */
function PaidUnlockBanner() {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-[#d8bd70]/35 bg-gradient-to-br from-[#d8bd70]/12 via-lavender/8 to-midnight/50 shadow-glow">
      <div className="h-1 bg-gradient-to-r from-[#d8bd70]/60 via-lavender/50 to-aurora/40" />
      <div className="p-5 sm:p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-[#d8bd70]/80">✓ 已解鎖 · NT$149 完整星盤深度解析</p>
        <h2 className="mt-1.5 text-xl font-semibold text-moon">完整星盤深度解析已開啟</h2>
        <p className="mt-2 text-sm leading-7 text-moon/65">
          先帶你看整張星盤合起來是個什麼樣的你，再一顆一顆深入，最後附上可收合的完整星盤參數。
        </p>
      </div>
    </div>
  );
}

/** 主打卡：把整張星盤合成一個你（比一般卡更醒目，紫金漸層邊框） */
function FullChartIntegrationHero({ result, planets }: { result: CalcResult; planets: PlanetPosition[] | undefined }) {
  const mercury  = planets ? planetSignOf(planets, "mercury") : null;
  const mars     = planets ? planetSignOf(planets, "mars")    : null;
  const sunHouse  = planetHouseOf(planets, "sun");
  const moonHouse = planetHouseOf(planets, "moon");
  const paras = buildIntegrationHeroParagraphs(result, mercury, mars, sunHouse, moonHouse);

  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border-2 border-[#d8bd70]/30 bg-gradient-to-br from-[#1b1340]/85 via-[#141a3a]/75 to-midnight/60 shadow-glow">
      <div aria-hidden="true" className="pointer-events-none absolute -top-16 right-0 h-48 w-48 rounded-full bg-lavender/15 blur-3xl" />
      <div className="h-1.5 bg-gradient-to-r from-[#d8bd70] via-lavender to-aurora" />
      <div className="relative p-6 sm:p-7">
        <p className="text-[11px] uppercase tracking-[0.26em] text-[#d8bd70]/85">完整星盤整合分析 · 付費限定</p>
        <h2 className="mt-2 text-2xl font-semibold leading-snug">
          <span className="bg-gradient-to-r from-[#f7d987] via-lavender to-aurora bg-clip-text text-transparent">
            把整張星盤合成一個你
          </span>
        </h2>
        <p className="mt-3 text-sm leading-7 text-moon/65">
          這不是單看某一個星座，而是把你的核心個性、情緒需求、外在人設、感情模式與行動方式放在一起看。
        </p>
        <div className="mt-5 space-y-3.5">
          {paras.map((p, i) => (
            <p key={i} className="text-[15px] leading-8 text-moon/90">{p}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 付費版生活化精華卡（3～4 張） */
function PaidEssenceCards({ result, planets }: { result: CalcResult; planets: PlanetPosition[] | undefined }) {
  const cards = buildEssenceCards(result, planets);
  if (!cards.length) return null;
  return (
    <div>
      <div className="mb-3 flex items-center gap-3 px-1">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-lavender/30" />
        <p className="text-xs uppercase tracking-[0.24em] text-lavender/75">為你而寫的重點</p>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-lavender/30" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <div key={c.title} className="rounded-2xl border border-lavender/20 bg-gradient-to-br from-lavender/[0.08] to-midnight/40 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-moon">
              <span aria-hidden="true">{c.icon}</span>{c.title}
            </p>
            <p className="mt-2.5 text-sm leading-7 text-moon/82">{c.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 人生面向延伸（感情 / 內在 / 職涯 / 行動建議）— 沿用既有解析文字 */
function LifeAreasSection({ result }: { result: CalcResult }) {
  const t = ASTRO_PROFILE_TEXTS[result.sunSign];
  const tension = buildInnerTension(result);
  return (
    <div>
      <div className="mb-3 flex items-center gap-3 px-1">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-aurora/30" />
        <p className="text-xs uppercase tracking-[0.24em] text-aurora/75">人生面向延伸</p>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-aurora/30" />
      </div>
      <div className="space-y-4">
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
    </div>
  );
}

/** 收納式完整星盤資料表（預設收合；資料是專業參數，視覺權重低於整合分析） */
function CollapsibleChartTable({ planets }: { planets: PlanetPosition[] }) {
  const [open, setOpen] = useState(false);
  if (!planets || planets.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-midnight/40 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-5 text-left transition hover:bg-white/[0.03] sm:p-6"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-moon/85">展開查看我的詳細星盤參數</p>
          <p className="mt-1 text-xs leading-6 text-moon/45">
            包含星體、星座度數與 Whole Sign 整宮制落宮，可作為完整解析的參考資料。
          </p>
        </div>
        <span className={`shrink-0 text-moon/40 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">▼</span>
      </button>
      {open && (
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          <FullChartTable planets={planets} embedded />
        </div>
      )}
    </div>
  );
}

// ── 免費版（未解鎖）短版解析 ─────────────────────────────────────────────────────
// 目標：免費版有「被說中」的完整感，但不給完整深度解讀；深度與延伸分析仍在解鎖區。

/** 取整句、限制字數：在 max 字內取到最後一個句末標點，否則截斷加 … */
function clampSentences(text: string, max: number): string {
  const clean = (text ?? "").trim();
  if (!clean) return "";
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const lastPunct = Math.max(slice.lastIndexOf("。"), slice.lastIndexOf("！"), slice.lastIndexOf("？"));
  return lastPunct >= Math.floor(max * 0.5) ? slice.slice(0, lastPunct + 1) : `${slice}…`;
}

/**
 * 三重星座輪廓（免費，120～180 字）：整合太陽 / 月亮 / 上升三重星座，
 * 說明「外在看起來如何、內心真正需要什麼、在人際與關係裡常出現的模式」。
 * 金星不在此整合中（金星為延伸參考）。
 */
function buildFreeOutline(result: CalcResult): string {
  const { sunSign, moonSign, risingSign } = result;
  const rise = risingSign ?? sunSign;
  const seg1 = `外在上，你給人的第一印象偏向${rise}——容易顯得${ZODIAC_TRAITS[rise].strengths.slice(0, 2).join("、")}，這是別人最先接收到的你，但未必等於你內心真正的需要。`;
  const seg2 = moonSign
    ? `往內看，你其實是${moonSign}式的：特別在意安全感與被穩定對待，情緒上來時容易先收在心裡，需要確定夠安全才願意打開自己。`
    : `往內看，你比表面看起來更在意安全感，需要確定夠安全才願意打開自己。`;
  const seg3 = `而你的核心始終是${sunSign}，渴望活出${ZODIAC_TRAITS[sunSign].strengths[0]}的樣子。`
    + `在人際或關係裡，你常一邊想撐起${rise}的形象，一邊又希望對方接得住${moonSign ?? sunSign}的需要——這份落差，正是你最值得被理解的地方。`;
  return seg1 + seg2 + seg3;
}

/** 免費提醒（60～100 字）：具體、實用、有陪伴感，不玄 */
function buildFreeReminder(result: CalcResult): string {
  const focus = result.moonSign ?? result.venusSign ?? result.sunSign;
  return `近期可以先觀察自己在哪些關係裡最容易委屈，那通常不是你太敏感，而是${focus}的你已經忍了一段時間。先看見自己的需求，比急著配合別人更重要——把你真正在意的事說出口，關係才會慢慢回到對的節奏。`;
}

/** 免費三重星座解析主要內容：標題 + 一句話總結 + 三星體短解讀 + 三重星座輪廓 + 免費提醒 */
function FreeResultSections({ result }: { result: CalcResult }) {
  const { sunSign, moonSign, risingSign } = result;
  const oneLiner = clampSentences(ASTRO_PROFILE_TEXTS[sunSign].overallSummary, 70);
  // 完整資料才會進到此畫面（isCompleteResult 守衛），月亮 / 上升皆非空。
  // 免費版三重星座 = 太陽、月亮、上升（金星另以「延伸參考」呈現，不在此本體中）。
  const bodies: { icon: string; label: string; sign: ZodiacSign; accent: string; deep: string }[] = [
    { icon: "☀", label: "太陽", sign: sunSign, accent: "text-[#d8bd70]", deep: ASTRO_PROFILE_TEXTS[sunSign].sunCoreText },
    { icon: "🌙", label: "月亮", sign: moonSign as ZodiacSign, accent: "text-lavender", deep: ASTRO_PROFILE_TEXTS[(moonSign ?? sunSign)].moonInnerText },
    { icon: "↑", label: "上升", sign: risingSign as ZodiacSign, accent: "text-aurora", deep: ASTRO_PROFILE_TEXTS[(risingSign ?? sunSign)].risingOuterText },
  ];

  return (
    <>
      {/* 免費版定位標題 */}
      <div className="overflow-hidden rounded-[1.5rem] border border-lavender/20 bg-gradient-to-br from-lavender/10 to-midnight/50 shadow-glow backdrop-blur-sm">
        <div className="h-1 bg-gradient-to-r from-[#d8bd70]/50 via-lavender/50 to-aurora/40" />
        <div className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-moon sm:text-xl">你的免費三重星座解析</h2>
          <p className="mt-2 text-sm leading-7 text-moon/65">
            免費版會先帶你看太陽、月亮與上升星座，了解你的核心個性、情緒需求與外在給人的第一印象。
          </p>
        </div>
      </div>

      {/* 一句話人格總結 */}
      <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-midnight/50 shadow-glow backdrop-blur-sm">
        <div className="h-1 bg-gradient-to-r from-[#d8bd70]/50 to-lavender/40" />
        <div className="p-5 sm:p-6">
          <p className="mb-2 text-xs uppercase tracking-[0.24em] text-[#d8bd70]/70">你的三重星座一句話</p>
          <p className="text-base font-medium leading-8 text-moon/90">{oneLiner}</p>
        </div>
      </div>

      {/* 三張免費短解讀卡（太陽 / 月亮 / 上升）*/}
      <div className="grid gap-3 sm:grid-cols-3">
        {bodies.map((b) => (
          <div key={b.label} className="rounded-2xl border border-white/10 bg-midnight/45 p-4 sm:p-5">
            <p className={`text-sm font-semibold ${b.accent}`}>{b.icon} {b.label}在{b.sign}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ZODIAC_TRAITS[b.sign].strengths.slice(0, 3).map((k) => (
                <span key={k} className="rounded-full border border-white/12 bg-white/5 px-2 py-0.5 text-[11px] text-moon/70">{k}</span>
              ))}
            </div>
            <p className="mt-3 text-sm leading-7 text-moon/80">{clampSentences(b.deep, 110)}</p>
          </div>
        ))}
      </div>

      {/* 三重星座輪廓 */}
      <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-midnight/50 shadow-glow backdrop-blur-sm">
        <div className="h-1 bg-gradient-to-r from-lavender/45 via-aurora/35 to-[#c9a0dc]/35" />
        <div className="p-5 sm:p-6">
          <p className="mb-3 text-xs uppercase tracking-[0.24em] text-lavender/65">你的三重星座輪廓</p>
          <p className="text-sm leading-8 text-moon/85">{buildFreeOutline(result)}</p>
        </div>
      </div>

      {/* 給你的免費提醒 */}
      <div className="rounded-[1.5rem] border border-aurora/20 bg-aurora/[0.06] p-5 sm:p-6">
        <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-aurora/80">
          <span aria-hidden="true">🌿</span>給你的免費提醒
        </p>
        <p className="text-sm leading-8 text-moon/82">{buildFreeReminder(result)}</p>
      </div>
    </>
  );
}

/** 延伸參考：金星星座（免費版下方）。金星非三重星座本體，僅給星座 + 一句短提示 + 完整版引導 */
function VenusExtensionCard({ venusSign }: { venusSign: ZodiacSign }) {
  const kw = ZODIAC_TRAITS[venusSign].strengths.slice(0, 2).join("、");
  // 30～50 字短提示
  const hint = `在感情裡，你容易被${kw}的特質吸引，也會用${venusSign}式的方式默默表達在乎與靠近。`;
  return (
    <div className="rounded-[1.5rem] border border-[#c9a0dc]/20 bg-[#c9a0dc]/[0.06] p-5 sm:p-6">
      <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[#c9a0dc]/85">
        <span aria-hidden="true">♀</span>延伸參考：你的金星星座
      </p>
      <p className="text-sm font-semibold text-moon/90">♀ 金星在{venusSign}</p>
      <p className="mt-2 text-sm leading-7 text-moon/75">{hint}</p>
      <p className="mt-3 border-t border-white/8 pt-3 text-xs leading-6 text-moon/50">
        完整感情模式會在 NT$149 完整星盤解析中展開。
      </p>
    </div>
  );
}

/** 完整版預覽卡（2～3 張，只露一句預告，不放整段模糊）*/
function UnlockPreviewCards() {
  const previews = [
    { icon: "❤️", title: "你的感情模式", teaser: "解鎖後會看見：你在關係中真正需要的安全感，以及為什麼有些互動會讓你特別在意。" },
    { icon: "🌗", title: "你的內在拉扯", teaser: "解鎖後會看見：你想表現的樣子和真正需要的之間，差距在哪、壓力大時會怎麼變。" },
    { icon: "🧩", title: "你的人際盲點", teaser: "解鎖後會看見：你在關係裡容易卡住的地方，以及如何不再反覆委屈自己。" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {previews.map((p) => (
        <div key={p.title} className="rounded-2xl border border-[#d8bd70]/20 bg-midnight/40 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-moon/85">
            <span aria-hidden="true">{p.icon}</span>{p.title}
          </p>
          <p className="mt-2 text-xs leading-6 text-moon/55">{p.teaser}</p>
        </div>
      ))}
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
            <p className="mb-3 text-xs uppercase tracking-[0.24em] text-moon/50">✦ 完整星盤深度解析</p>
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
          <p className="mb-1 text-xs uppercase tracking-[0.24em] text-[#d8bd70]/70">NT$149 完整星盤深度解析</p>
          <h3 className="mt-1 text-xl font-semibold text-moon">升級完整星盤深度解析</h3>
          <p className="mt-3 text-sm leading-7 text-moon/62">
            免費版是三重星座短版解析；升級後會補上金星、水星、火星、木星、土星到外行星的完整星盤資料，並整理你的感情模式、人際盲點、職涯天賦與行動建議。
          </p>
          <p className="mt-3 text-2xl font-bold text-moon">NT$149</p>
          <p className="mt-4 text-sm font-semibold text-moon/74">解鎖後可查看：</p>
          <div className="mt-4 space-y-2">
            {[
              "完整星盤資料表",
              "金星感情模式深度解析",
              "水星到冥王星星座與宮位",
              "內在拉扯與情緒盲點",
              "人際關係容易卡住的地方",
              "職涯天賦與適合發揮的方向",
              "行動建議與 LINE 保存",
              "Email 保存與限動分享圖",
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
              {loading ? "處理中…" : "解鎖完整星盤解析 NT$149"}
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
    // 完整星盤深度內容（與網頁付費版同步）：僅自動模式（有 planets）時可取得各行星星座。
    const planets = result.planets ?? null;
    const hasPlanets = !!(planets && planets.length > 0);
    const mercurySign = planets ? planetSignOf(planets, "mercury") : null;
    const marsSign    = planets ? planetSignOf(planets, "mars")    : null;
    const jupiterSign = planets ? planetSignOf(planets, "jupiter") : null;
    const saturnSign  = planets ? planetSignOf(planets, "saturn")  : null;
    const uranusSign  = planets ? planetSignOf(planets, "uranus")  : null;
    const neptuneSign = planets ? planetSignOf(planets, "neptune") : null;
    const plutoSign   = planets ? planetSignOf(planets, "pluto")   : null;
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
          // ── 完整星盤資料表（舊資料 / 手動模式無 planets → null，Email 端隱藏）──
          planets: hasPlanets
            ? planets!.map((p) => ({ key: p.key, label: p.label, degreeText: p.degreeText, houseText: p.houseText }))
            : null,
          // ── 付費深度星體區塊（同步網頁完整版）──
          mercurySign, marsSign, jupiterSign, saturnSign,
          mercuryText: mercurySign ? MERCURY_SIGN_TEXTS[mercurySign] : null,
          marsText:    marsSign    ? MARS_SIGN_TEXTS[marsSign]       : null,
          jupiterText: jupiterSign ? JUPITER_SIGN_TEXTS[jupiterSign] : null,
          saturnText:  saturnSign  ? SATURN_SIGN_TEXTS[saturnSign]   : null,
          outerPlanetText: (uranusSign || neptuneSign || plutoSign)
            ? buildOuterPlanetText(uranusSign, neptuneSign, plutoSign)
            : null,
          // 主打整合分析（手動模式無水星/火星時仍可用核心四星體生成）
          fullChartIntegrationText: buildFullChartIntegration(result, mercurySign, marsSign),
          // 付費限定生活化精華卡（與網頁付費版同步）
          essenceCards: buildEssenceCards(result, planets ?? undefined).map((c) => ({ icon: c.icon, title: c.title, body: c.body })),
          // 人生面向延伸：內在拉扯（網頁 LifeAreasSection 同款）
          innerTensionText: buildInnerTension(result),
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

// 出生時間：自訂的小時 / 分鐘兩個下拉（沿用 BirthDatePartSelect 的原生 select），
// 桌機與手機共用同一套，避免手機跳出原生圓盤時間選擇器。組合後仍輸出 "HH:mm"。
function BirthTimeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const parsed = useMemo(() => parseBirthTime(value), [value]);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);

  useEffect(() => {
    // 延後到 microtask 同步小時 / 分鐘，避免在 effect body 內同步 setState（與日期選擇器一致）
    queueMicrotask(() => {
      setHour(parsed.hour);
      setMinute(parsed.minute);
    });
  }, [parsed.hour, parsed.minute]);

  const updateTime = useCallback((nextHour: string, nextMinute: string) => {
    setHour(nextHour);
    setMinute(nextMinute);
    // 小時或分鐘任一未選，視為尚未填寫，輸出空字串（不送出半套時間，避免 NaN）。
    if (nextHour && nextMinute) {
      onChange(`${nextHour}:${nextMinute}`);
      return;
    }
    onChange("");
  }, [onChange]);

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <BirthDatePartSelect
        ariaLabel="Birth hour"
        value={hour}
        onChange={(nextHour) => updateTime(nextHour, minute)}
        placeholder="請選擇小時"
        options={BIRTH_HOURS}
        className="min-w-[8rem] flex-1"
      />
      <BirthDatePartSelect
        ariaLabel="Birth minute"
        value={minute}
        onChange={(nextMinute) => updateTime(hour, nextMinute)}
        placeholder="請選擇分鐘"
        options={BIRTH_MINUTES}
        className="min-w-[8rem] flex-1"
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
