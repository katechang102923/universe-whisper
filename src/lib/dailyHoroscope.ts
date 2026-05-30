/**
 * Daily Horoscope – generates all 12 zodiac signs once per day (Asia/Taipei)
 * and caches the result in Firestore `dailyHoroscopes/{YYYY-MM-DD}`.
 *
 * Generation is guarded by an optimistic lock to prevent multiple concurrent
 * instances from hitting the AI API simultaneously.
 */

import { randomUUID } from "crypto";
import OpenAI from "openai";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./firebaseAdmin";
import { getTaipeiDate } from "./rateLimit";

// ── Zodiac constants ──────────────────────────────────────────────────────────

export const ZODIAC_SIGNS = [
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

export type ZodiacSign = (typeof ZODIAC_SIGNS)[number];

export const ZODIAC_SLUGS: Record<ZodiacSign, string> = {
  牡羊座: "aries",
  金牛座: "taurus",
  雙子座: "gemini",
  巨蟹座: "cancer",
  獅子座: "leo",
  處女座: "virgo",
  天秤座: "libra",
  天蠍座: "scorpio",
  射手座: "sagittarius",
  摩羯座: "capricorn",
  水瓶座: "aquarius",
  雙魚座: "pisces",
};

export const SLUG_TO_SIGN: Record<string, ZodiacSign> = Object.fromEntries(
  Object.entries(ZODIAC_SLUGS).map(([sign, slug]) => [slug, sign as ZodiacSign]),
);

export const ZODIAC_SYMBOLS: Record<ZodiacSign, string> = {
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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HoroscopeSign {
  signName: string; // "牡羊座"
  symbol: string; // "♈"
  overallStars: number; // 1-5 (weighted avg of 4 aspects)
  loveStars: number;
  workStars: number;
  moneyStars: number;
  socialStars: number;
  summary: string; // 55-80 char overall note
  loveText: string;
  workText: string;
  moneyText: string;
  socialText: string;
  luckyColor: string;
  luckyNumber: string; // string, e.g. "7" or "42"
  luckyTime: string; // e.g. "19:00–21:00"
}

export type HoroscopeSigns = Record<string, HoroscopeSign>; // keyed by slug

export interface DailyHoroscopeResult {
  date: string;
  timezone: string;
  generatedAt: string;
  source: "ai" | "fallback";
  signs: HoroscopeSigns;
}

interface HoroscopeDoc {
  date: string;
  timezone: string;
  status: "generating" | "ready";
  lockOwner?: string;
  lockExpiresAt?: number;
  source?: "ai" | "fallback";
  signs?: HoroscopeSigns;
}

// ── Config ───────────────────────────────────────────────────────────────────

const COLLECTION = "dailyHoroscopes";
const LOCK_TTL_MS = 90_000; // 90 s – AI may take ~30-60 s for 12 signs
const LOCK_WAIT_MS = 95_000; // slightly longer than the lock TTL
const DEFAULT_MODEL = "gpt-4o-mini";

// ── Deterministic fallback (date+sign seeded) ────────────────────────────────

function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function seededStars(seed: number): number {
  const r = seededRandom(seed);
  if (r < 0.10) return 1;
  if (r < 0.30) return 2;
  if (r < 0.65) return 3;
  if (r < 0.90) return 4;
  return 5;
}

function seededPick<T>(arr: T[], seed: number): T {
  return arr[Math.floor(seededRandom(seed) * arr.length)];
}

const FALLBACK_LUCKY_COLORS = [
  "晨光金", "月霧綠", "星河銀", "珍珠白", "暖琥珀",
  "霧藍灰", "玫瑰霧", "深莓紫", "曙光橘", "松石黑",
  "極光藍", "月光紫", "薰衣草紫", "午夜藍", "翡翠綠",
];

const FALLBACK_LUCKY_TIMES = [
  "07:00–09:00", "09:00–11:00", "11:00–13:00",
  "13:00–15:00", "15:00–17:00", "17:00–19:00",
  "19:00–21:00", "21:00–23:00",
];

const FALLBACK_SUMMARIES = [
  "今天適合把節奏放慢一些，讓自己在前進之前先確認方向。不需要急著有結果，穩穩的行動已經很好。",
  "今天的訊息提醒你，最重要的往往是內心已經知道的事。讓自己靜下來聽，答案比你想的更近。",
  "今天適合整理思緒，把複雜的事情拆成小步驟。每一個小進展都值得被肯定，不要只看最終目標。",
  "宇宙今天給你一個喘息的空間。好好接住它，休息是為了讓接下來的每一步更有力量。",
  "今天你的直覺比邏輯更準。相信那個最初的感受，它正在帶你走向對的地方。",
  "今天有些看似繁瑣的事情其實很重要。先把它們一件一件完成，會比較有完整的安心感。",
  "今天適合把自己的需求說清楚。別總是猜對方想要什麼，試著表達自己的想法與感受。",
  "今天能量偏向內收。適合反思、整理、小休息，不需要強迫自己一直輸出。",
];

const FALLBACK_LOVE = [
  "愛情裡今天適合輕鬆自在地靠近。不需要証明什麼，真實的你就是最好的禮物。",
  "感情上今天容易有些小摩擦，但不要把它放大。有話說清楚，比悶在心裡更容易解決。",
  "今天適合用行動代替語言。一個小小的關心，比反覆解釋更能讓對方感覺到你的心意。",
  "感情上今天你可能需要多一點確定感。別急著逼出答案，先照顧自己的穩定。",
  "今天有機會拉近距離。一個真誠的對話或小驚喜，都能讓感情向前走一步。",
];

const FALLBACK_WORK = [
  "工作上今天適合專注在一件最重要的事。完成它，你會感覺到清晰和方向感回來了。",
  "今天工作容易有臨時狀況出現。保持彈性，先確認資訊再決定怎麼應對。",
  "工作能量今天偏向細節與整理。把積累的事情一件一件清理掉，會有輕鬆感。",
  "今天適合主動溝通、推進停滯的事。等待不一定會有答案，先問一步試試看。",
  "工作上今天適合把複雜的事情拆分清楚。小步驟比大計畫更容易帶來進展。",
];

const FALLBACK_MONEY = [
  "財務上今天適合審視而不是行動。先了解現況，再做決定，會比衝動更有把握。",
  "今天財運穩中帶穩。沒有特別驚喜，但也不會有意外。適合做些平日的財務整理。",
  "今天在消費決定上保持謹慎。把衝動型支出先暫停，等一兩天再看看還需不需要。",
  "財運今天有小機會出現。留意身邊的資訊，但也不要為了抓機會而冒太大的風險。",
  "今天適合把收入和支出做個簡單盤點。清楚了解財務現況，能讓你更安心地前進。",
];

const FALLBACK_SOCIAL = [
  "人際上今天一個真誠的互動勝過許多表面的來往。把心打開一點，好的連結自然會靠近。",
  "今天人際能量偏低，不適合強迫交際。給自己一點獨處的空間，也是一種充電方式。",
  "今天適合主動關心一個久沒聯絡的人。一句問候，可能比你想像中更重要。",
  "人際上今天容易有些誤解。先確認對方的意思再回應，不要把猜測當成事實。",
  "今天有機會認識到對你有幫助的人。保持開放，讓自己稍微走出舒適圈看看。",
];

function generateFallbackSign(sign: ZodiacSign, date: string): HoroscopeSign {
  const seed = [...`${date}-${sign}`].reduce((s, c) => s + c.charCodeAt(0), 0);
  const loveStars = seededStars(seed + 100);
  const workStars = seededStars(seed + 200);
  const moneyStars = seededStars(seed + 300);
  const socialStars = seededStars(seed + 400);
  const overallStars = Math.round((loveStars + workStars + moneyStars + socialStars) / 4);

  return {
    signName: sign,
    symbol: ZODIAC_SYMBOLS[sign],
    overallStars,
    loveStars,
    workStars,
    moneyStars,
    socialStars,
    summary: seededPick(FALLBACK_SUMMARIES, seed + 10),
    loveText: seededPick(FALLBACK_LOVE, seed + 110),
    workText: seededPick(FALLBACK_WORK, seed + 210),
    moneyText: seededPick(FALLBACK_MONEY, seed + 310),
    socialText: seededPick(FALLBACK_SOCIAL, seed + 410),
    luckyColor: seededPick(FALLBACK_LUCKY_COLORS, seed + 20),
    luckyNumber: String(1 + Math.floor(seededRandom(seed + 30) * 99)),
    luckyTime: seededPick(FALLBACK_LUCKY_TIMES, seed + 40),
  };
}

function generateFallbackAllSigns(date: string): HoroscopeSigns {
  const signs: HoroscopeSigns = {};
  for (const sign of ZODIAC_SIGNS) {
    signs[ZODIAC_SLUGS[sign]] = generateFallbackSign(sign, date);
  }
  return signs;
}

// ── AI prompt ────────────────────────────────────────────────────────────────

function buildPrompt(date: string): string {
  return `今天是 ${date}（台北時間 Asia/Taipei），請為十二星座各別產生今日運勢。

請只輸出純 JSON，不要加 markdown code block，不要加說明文字，直接輸出 JSON 物件。

JSON 結構（所有鍵名用英文 slug）：
{"aries":{...},"taurus":{...},"gemini":{...},"cancer":{...},"leo":{...},"virgo":{...},"libra":{...},"scorpio":{...},"sagittarius":{...},"capricorn":{...},"aquarius":{...},"pisces":{...}}

每個星座的結構：
{
  "overallStars": <四個面向平均四捨五入，1-5整數>,
  "loveStars": <1-5整數>,
  "workStars": <1-5整數>,
  "moneyStars": <1-5整數>,
  "socialStars": <1-5整數>,
  "summary": "<55-80字整體提醒，溫柔語氣>",
  "loveText": "<45-65字愛情運今日狀態與建議>",
  "workText": "<45-65字工作運今日狀態與建議>",
  "moneyText": "<45-65字財運今日狀態與建議>",
  "socialText": "<45-65字人際運今日狀態與建議>",
  "luckyColor": "<2-6字幸運色>",
  "luckyNumber": "<1-99數字，字串格式>",
  "luckyTime": "<幸運時段，格式如 19:00–21:00>"
}

星級規則（重要）：
- 分布：1星約10%、2星約20%、3星約35%、4星約25%、5星約10%
- 12星座之間必須有明顯差異，不要大家都集中在3-4星
- 1星用溫柔鼓勵語氣，不要太負面
- overallStars = loveStars + workStars + moneyStars + socialStars 四個的平均（四捨五入）
- 各星座要有不同語氣與側重點

語氣要求：
- 繁體中文
- 像深夜好友陪伴，溫柔但有現況分析與具體小建議
- 不要恐嚇、不要絕對預言、不要空洞說教`;
}

// ── AI generation ─────────────────────────────────────────────────────────────

function validateSign(slug: string, raw: unknown): HoroscopeSign | null {
  const sign = SLUG_TO_SIGN[slug];
  if (!sign || !raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const clamp = (v: unknown): number | null =>
    typeof v === "number" ? Math.min(5, Math.max(1, Math.round(v))) : null;

  const loveStars = clamp(obj.loveStars);
  const workStars = clamp(obj.workStars);
  const moneyStars = clamp(obj.moneyStars);
  const socialStars = clamp(obj.socialStars);
  if (!loveStars || !workStars || !moneyStars || !socialStars) return null;

  const overallStars =
    clamp(obj.overallStars) ??
    Math.round((loveStars + workStars + moneyStars + socialStars) / 4);

  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const luckyNumber = (() => {
    if (typeof obj.luckyNumber === "string" && obj.luckyNumber.trim()) return obj.luckyNumber.trim();
    if (typeof obj.luckyNumber === "number") return String(obj.luckyNumber);
    return null;
  })();

  const summary = str(obj.summary);
  const loveText = str(obj.loveText);
  const workText = str(obj.workText);
  const moneyText = str(obj.moneyText);
  const socialText = str(obj.socialText);
  const luckyColor = str(obj.luckyColor);
  const luckyTime = str(obj.luckyTime);

  if (!summary || !loveText || !workText || !moneyText || !socialText || !luckyColor || !luckyTime || !luckyNumber) {
    return null;
  }

  return {
    signName: sign,
    symbol: ZODIAC_SYMBOLS[sign],
    overallStars,
    loveStars,
    workStars,
    moneyStars,
    socialStars,
    summary,
    loveText,
    workText,
    moneyText,
    socialText,
    luckyColor,
    luckyNumber,
    luckyTime,
  };
}

async function generateWithAI(date: string): Promise<HoroscopeSigns> {
  // Returns a partial or complete map; missing signs will be filled by fallback
  const emptyResult: HoroscopeSigns = {};

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[dailyHoroscope] OPENAI_API_KEY not set; using fallback.");
    return emptyResult;
  }

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

  try {
    const response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "你是宇宙偷偷話的每日星座運勢撰寫者。請嚴格輸出符合格式的純 JSON，不含任何 markdown 或說明文字。",
        },
        {
          role: "user",
          content: buildPrompt(date),
        },
      ],
      max_output_tokens: 5000,
    });

    const text = response.output_text?.trim();
    if (!text) return emptyResult;

    const jsonText = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    const raw = JSON.parse(jsonText) as Record<string, unknown>;
    const signs: HoroscopeSigns = {};

    for (const [slug, data] of Object.entries(raw)) {
      const validated = validateSign(slug, data);
      if (validated) signs[slug] = validated;
    }

    return signs;
  } catch (err) {
    console.error("[dailyHoroscope] AI generation failed:", err);
    return emptyResult;
  }
}

// ── Cache / lock helpers ──────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollForReady(
  ref: FirebaseFirestore.DocumentReference,
  timeoutMs: number,
): Promise<HoroscopeSigns | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(1500);
    const snap = await ref.get();
    const data = snap.data() as Partial<HoroscopeDoc> | undefined;
    if (data?.status === "ready" && data.signs) return data.signs;
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function getDailyHoroscope(dateOverride?: string): Promise<DailyHoroscopeResult> {
  const date = dateOverride ?? getTaipeiDate();
  const lockOwner = randomUUID();

  try {
    const db = getAdminDb();
    const ref = db.collection(COLLECTION).doc(date);
    const now = Date.now();

    let cachedSigns: HoroscopeSigns | null = null;
    let shouldGenerate = false;
    let shouldWait = false;

    // ── Phase 1: optimistic lock transaction ──────────────────────────────
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data() as Partial<HoroscopeDoc> | undefined;

      if (data?.status === "ready" && data.signs) {
        cachedSigns = data.signs;
        return;
      }

      const lockExpiresAt = typeof data?.lockExpiresAt === "number" ? data.lockExpiresAt : 0;
      if (data?.status === "generating" && lockExpiresAt > now) {
        shouldWait = true;
        return;
      }

      // Acquire lock
      shouldGenerate = true;
      tx.set(
        ref,
        {
          date,
          timezone: "Asia/Taipei",
          status: "generating",
          lockOwner,
          lockExpiresAt: now + LOCK_TTL_MS,
          updatedAt: FieldValue.serverTimestamp(),
        } as Record<string, unknown>,
        { merge: true },
      );
    });

    // ── Phase 2: return cache or wait ─────────────────────────────────────
    if (cachedSigns) {
      return {
        date,
        timezone: "Asia/Taipei",
        generatedAt: new Date().toISOString(),
        source: "ai",
        signs: cachedSigns,
      };
    }

    if (shouldWait) {
      const ready = await pollForReady(ref, LOCK_WAIT_MS);
      if (ready) {
        return {
          date,
          timezone: "Asia/Taipei",
          generatedAt: new Date().toISOString(),
          source: "ai",
          signs: ready,
        };
      }
      // Lock expired but doc still not ready — fall through to generation
    }

    // ── Phase 3: generate ─────────────────────────────────────────────────
    const aiSigns = await generateWithAI(date);

    // Fill in any missing slugs with deterministic fallback
    const allSigns: HoroscopeSigns = {};
    let aiCount = 0;
    for (const zodiacSign of ZODIAC_SIGNS) {
      const slug = ZODIAC_SLUGS[zodiacSign];
      if (aiSigns[slug]) {
        allSigns[slug] = aiSigns[slug];
        aiCount++;
      } else {
        allSigns[slug] = generateFallbackSign(zodiacSign, date);
      }
    }
    const source: "ai" | "fallback" = aiCount >= 6 ? "ai" : "fallback";

    // ── Phase 4: write-back (safe: skip if another instance beat us) ──────
    let finalSigns = allSigns;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.data() as Partial<HoroscopeDoc> | undefined;
      if (current?.status === "ready" && current.signs) {
        finalSigns = current.signs;
        return;
      }
      tx.set(
        ref,
        {
          date,
          timezone: "Asia/Taipei",
          status: "ready",
          generatedAt: FieldValue.serverTimestamp(),
          source,
          signs: allSigns,
          lockOwner,
          lockExpiresAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        } as Record<string, unknown>,
        { merge: true },
      );
    });

    console.info("[dailyHoroscope] Generated", { date, source, aiCount });

    return {
      date,
      timezone: "Asia/Taipei",
      generatedAt: new Date().toISOString(),
      source,
      signs: finalSigns,
    };
  } catch (err) {
    // Emergency fallback: no Firestore, purely deterministic
    console.error("[dailyHoroscope] getDailyHoroscope failed; using emergency fallback:", err);
    const signs = generateFallbackAllSigns(date);
    return {
      date,
      timezone: "Asia/Taipei",
      generatedAt: new Date().toISOString(),
      source: "fallback",
      signs,
    };
  }
}
