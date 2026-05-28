import { randomUUID } from "crypto";
import OpenAI from "openai";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./firebaseAdmin";
import { getTaipeiDate } from "./rateLimit";
import {
  generateDailyFortune,
  type DailyFortuneData,
  type FortuneAspect,
} from "./dailyFortuneGenerator";

const CACHE_COLLECTION = "dailyFortunes";
const STATS_COLLECTION = "fortune_stats";
const DEFAULT_MODEL = "gpt-5.4-mini";
const LOCK_TTL_MS = 15_000;
const LOCK_WAIT_MS = 17_000;

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

const SLUG_TO_ZODIAC = Object.fromEntries(
  Object.entries(ZODIAC_SLUGS).map(([label, slug]) => [slug, label])
) as Record<string, ZodiacSign>;

type DailyFortuneSource = "ai" | "fallback";

export interface DailyFortuneCacheDoc extends DailyFortuneData {
  date: string;
  zodiac: string;
  zodiacLabel: ZodiacSign;
  status: "generating" | "ready";
  source: DailyFortuneSource | "pending";
  lockOwner?: string;
  lockExpiresAt?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FortuneStatsDoc {
  ai_generations: number;
  fallback_generations: number;
  cache_hits: number;
  total_generated: number;
  generated_zodiacs: string[];
}

function normalizeZodiac(input: string): { label: ZodiacSign; slug: string } | null {
  if (ZODIAC_SIGNS.includes(input as ZodiacSign)) {
    const label = input as ZodiacSign;
    return { label, slug: ZODIAC_SLUGS[label] };
  }

  const slug = input.trim().toLowerCase();
  const label = SLUG_TO_ZODIAC[slug];
  return label ? { label, slug } : null;
}

function buildDocId(date: string, slug: string): string {
  return `${date}_${slug}`;
}

function buildFortunePrompt(zodiac: ZodiacSign, date: string): string {
  return `今天是 ${date}（Asia/Taipei），請為「${zodiac}」產生今日運勢。

請只輸出純 JSON，不要加 markdown，不要加說明文字。

JSON 結構：
{
  "overall": "<55-90字，今天整體狀態，溫暖但實際>",
  "luckyColor": "<1-5字幸運色>",
  "luckyNumber": <1到9的整數>,
  "love": {
    "stars": <2到5的整數>,
    "text": "<45-75字，愛情目前狀態與今日提醒>",
    "reminder": "<20-36字，一句具體提醒>"
  },
  "work": {
    "stars": <2到5的整數>,
    "text": "<45-75字，工作目前狀態與今日提醒>",
    "reminder": "<20-36字，一句具體提醒>"
  },
  "life": {
    "stars": <2到5的整數>,
    "text": "<45-75字，生活狀態與今日照顧提醒>",
    "reminder": "<20-36字，一句具體提醒>"
  },
  "mood": {
    "stars": <2到5的整數>,
    "text": "<45-75字，今天內在狀態、情緒流動與自我照顧提醒>",
    "reminder": "<20-36字，一句具體提醒>"
  },
  "action": "<20-42字，今天可以做的一個小行動>"
}

要求：
- 分類只能是 love / work / life / mood，請不要產生金錢相關獨立分類
- 對不同星座寫出不同語氣與重點
- 語氣像深夜朋友陪伴，溫柔、有現況分析、有小建議
- 不要恐嚇、不要絕對預言、不要太玄學
- 使用繁體中文`;
}

function validateAspect(raw: unknown): FortuneAspect | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const rawStars = typeof obj.stars === "number" ? obj.stars : null;
  const text = typeof obj.text === "string" ? obj.text.trim() : "";
  const reminder = typeof obj.reminder === "string" ? obj.reminder.trim() : "";

  if (rawStars === null || !text || !reminder) return null;

  return {
    stars: Math.min(5, Math.max(2, Math.round(rawStars))),
    text,
    reminder,
  };
}

function validateFortuneData(raw: unknown): DailyFortuneData | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const overall = typeof obj.overall === "string" ? obj.overall.trim() : "";
  const luckyColor = typeof obj.luckyColor === "string" ? obj.luckyColor.trim() : "";
  const luckyNumber =
    typeof obj.luckyNumber === "number"
      ? Math.min(9, Math.max(1, Math.round(obj.luckyNumber)))
      : null;
  const love = validateAspect(obj.love);
  const work = validateAspect(obj.work);
  const life = validateAspect(obj.life);
  const mood = validateAspect(obj.mood);
  const action = typeof obj.action === "string" ? obj.action.trim() : "";

  if (!overall || !luckyColor || !luckyNumber || !love || !work || !life || !mood || !action) {
    return null;
  }

  return { overall, luckyColor, luckyNumber, love, work, life, mood, action };
}

function toClientFortune(data: Partial<DailyFortuneCacheDoc>): DailyFortuneData | null {
  return validateFortuneData(data);
}

async function generateWithAI(
  zodiac: ZodiacSign,
  date: string
): Promise<DailyFortuneData | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

  try {
    const response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "你是宇宙偷偷話的每日運勢撰寫者。請嚴格輸出符合格式的純 JSON。",
        },
        {
          role: "user",
          content: buildFortunePrompt(zodiac, date),
        },
      ],
      max_output_tokens: 1200,
    });

    const text = response.output_text?.trim();
    if (!text) return null;

    const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    return validateFortuneData(JSON.parse(jsonText) as unknown);
  } catch (err) {
    console.error(`[dailyFortune] generation failed for ${zodiac}:`, err);
    return null;
  }
}

async function updateStats(
  date: string,
  type: "cache_hit" | "ai_generation" | "fallback_generation",
  zodiac?: ZodiacSign
) {
  try {
    const db = getAdminDb();
    const ref = db.collection(STATS_COLLECTION).doc(date);

    if (type === "cache_hit") {
      await ref.set({ cache_hits: FieldValue.increment(1) }, { merge: true });
      return;
    }

    const update: Record<string, unknown> = {
      total_generated: FieldValue.increment(1),
    };

    if (type === "ai_generation") {
      update.ai_generations = FieldValue.increment(1);
    } else {
      update.fallback_generations = FieldValue.increment(1);
    }

    if (zodiac) {
      update.generated_zodiacs = FieldValue.arrayUnion(zodiac);
    }

    await ref.set(update, { merge: true });
  } catch (err) {
    console.error("[dailyFortune] updateStats failed:", err);
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReadyFortune(
  ref: FirebaseFirestore.DocumentReference,
  timeoutMs: number
): Promise<DailyFortuneData | null> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await wait(900);
    const snap = await ref.get();
    const data = snap.data() as Partial<DailyFortuneCacheDoc> | undefined;

    if (data?.status === "ready") {
      const cached = toClientFortune(data);
      if (cached) return cached;
    }
  }

  return null;
}

async function writeReadyFortune(
  ref: FirebaseFirestore.DocumentReference,
  params: {
    date: string;
    slug: string;
    label: ZodiacSign;
    fortune: DailyFortuneData;
    source: DailyFortuneSource;
    lockOwner: string;
  }
): Promise<DailyFortuneData> {
  const payload: Record<string, unknown> = {
    ...params.fortune,
    date: params.date,
    zodiac: params.slug,
    zodiacLabel: params.label,
    status: "ready",
    source: params.source,
    lockOwner: params.lockOwner,
    lockExpiresAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  let resolvedFortune: DailyFortuneData = params.fortune;

  await ref.firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.data() as Partial<DailyFortuneCacheDoc> | undefined;
    const currentReady = current?.status === "ready" ? toClientFortune(current) : null;

    if (currentReady) {
      resolvedFortune = currentReady;
      return;
    }

    const currentLockOwner = current?.lockOwner;
    const currentLockExpiresAt =
      typeof current?.lockExpiresAt === "number" ? current.lockExpiresAt : 0;

    if (
      current?.status === "generating" &&
      currentLockOwner &&
      currentLockOwner !== params.lockOwner &&
      currentLockExpiresAt > Date.now()
    ) {
      return;
    }

    tx.set(ref, payload, { merge: true });
  });

  return resolvedFortune;
}

export async function getDailyFortune(zodiacInput: string): Promise<DailyFortuneData> {
  const normalized = normalizeZodiac(zodiacInput);

  if (!normalized) {
    throw new Error(`Invalid zodiac: ${zodiacInput}`);
  }

  const date = getTaipeiDate();
  const { label, slug } = normalized;
  const lockOwner = randomUUID();

  try {
    const db = getAdminDb();
    const ref = db.collection(CACHE_COLLECTION).doc(buildDocId(date, slug));
    const now = Date.now();
    let cachedFortune: DailyFortuneData | null = null;
    let shouldGenerate = false;
    let shouldWait = false;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data() as Partial<DailyFortuneCacheDoc> | undefined;

      if (data?.status === "ready") {
        cachedFortune = toClientFortune(data);
        if (cachedFortune) return;
      }

      const lockExpiresAt = typeof data?.lockExpiresAt === "number" ? data.lockExpiresAt : 0;
      if (data?.status === "generating" && lockExpiresAt > now) {
        shouldWait = true;
        return;
      }

      shouldGenerate = true;
      tx.set(
        ref,
        {
          date,
          zodiac: slug,
          zodiacLabel: label,
          status: "generating",
          source: "pending",
          lockOwner,
          lockExpiresAt: now + LOCK_TTL_MS,
          createdAt: data?.createdAt ?? FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        } satisfies Partial<DailyFortuneCacheDoc>,
        { merge: true }
      );
    });

    if (cachedFortune) {
      updateStats(date, "cache_hit").catch(() => {});
      return cachedFortune;
    }

    if (shouldWait) {
      const ready = await waitForReadyFortune(ref, LOCK_WAIT_MS);
      if (ready) {
        updateStats(date, "cache_hit").catch(() => {});
        return ready;
      }
    }

    if (!shouldGenerate && shouldWait) {
      throw new Error("Daily fortune is still generating. Please retry shortly.");
    }

    const aiFortune = await generateWithAI(label, date);
    if (!aiFortune) {
      throw new Error("Daily fortune AI generation failed.");
    }

    const storedFortune = await writeReadyFortune(ref, {
      date,
      slug,
      label,
      fortune: aiFortune,
      source: "ai",
      lockOwner,
    });
    updateStats(date, "ai_generation", label).catch(() => {});

    return storedFortune;
  } catch (err) {
    console.error("[dailyFortune] getDailyFortune failed:", err);
    throw err;
  }
}

export async function prefillAllZodiacs(): Promise<
  Array<{ zodiac: ZodiacSign; success: boolean; fromCache: boolean }>
> {
  const date = getTaipeiDate();
  const results: Array<{ zodiac: ZodiacSign; success: boolean; fromCache: boolean }> = [];
  let db: FirebaseFirestore.Firestore;

  try {
    db = getAdminDb();
  } catch (err) {
    console.error("[dailyFortune] prefill cannot initialize Firebase Admin:", err);
    return ZODIAC_SIGNS.map((zodiac) => ({ zodiac, success: false, fromCache: false }));
  }

  for (const zodiac of ZODIAC_SIGNS) {
    const slug = ZODIAC_SLUGS[zodiac];

    try {
      const snap = await db.collection(CACHE_COLLECTION).doc(buildDocId(date, slug)).get();
      const data = snap.data() as Partial<DailyFortuneCacheDoc> | undefined;

      if (data?.status === "ready" && toClientFortune(data)) {
        results.push({ zodiac, success: true, fromCache: true });
        continue;
      }

      await getDailyFortune(zodiac);
      results.push({ zodiac, success: true, fromCache: false });
    } catch (err) {
      console.error(`[dailyFortune] prefill failed for ${zodiac}:`, err);
      results.push({ zodiac, success: false, fromCache: false });
    }
  }

  return results;
}
