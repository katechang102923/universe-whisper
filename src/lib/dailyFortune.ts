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
// 單一星座 AI 生成失敗時的重試間隔（最多 3 次重試：1 秒、3 秒、5 秒）
const RETRY_DELAYS_MS = [1_000, 3_000, 5_000] as const;

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

export type FortuneGenerationStatus = "complete" | "partial" | "failed";

export interface FortuneStatsDoc {
  ai_generations: number;
  fallback_generations: number;
  cache_hits: number;
  total_generated: number;
  generated_zodiacs: string[];
  missing_zodiacs?: string[];
  generation_status?: FortuneGenerationStatus;
  generation_checked_at?: unknown;
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
    "stars": <1到5的整數，依真實狀況給分，分布大致 1星10%、2星20%、3星35%、4星25%、5星10%>,
    "text": "<45-75字，愛情目前狀態與今日提醒>",
    "reminder": "<20-36字，一句具體提醒>"
  },
  "work": {
    "stars": <1到5的整數，依真實狀況給分，分布大致 1星10%、2星20%、3星35%、4星25%、5星10%>,
    "text": "<45-75字，工作目前狀態與今日提醒>",
    "reminder": "<20-36字，一句具體提醒>"
  },
  "life": {
    "stars": <1到5的整數，依真實狀況給分，分布大致 1星10%、2星20%、3星35%、4星25%、5星10%>,
    "text": "<45-75字，生活狀態與今日照顧提醒>",
    "reminder": "<20-36字，一句具體提醒>"
  },
  "mood": {
    "stars": <1到5的整數，依真實狀況給分，分布大致 1星10%、2星20%、3星35%、4星25%、5星10%>,
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
    stars: Math.min(5, Math.max(1, Math.round(rawStars))),
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

    // ── 生成重試：最多 1 + 3 次（間隔 1s/3s/5s），單一星座失敗不影響整批 ───────────
    let aiFortune: DailyFortuneData | null = null;
    const totalAttempts = RETRY_DELAYS_MS.length + 1;
    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      if (attempt > 1) {
        await wait(RETRY_DELAYS_MS[attempt - 2]);
        // 續鎖：重試期間延長鎖效期，避免被其他呼叫搶走而重複生成
        await ref
          .set({ lockExpiresAt: Date.now() + LOCK_TTL_MS, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
          .catch(() => {});
      }
      console.log(`[dailyFortune] date=${date} zodiac=${label} attempt=${attempt}/${totalAttempts} generating...`);
      aiFortune = await generateWithAI(label, date);
      if (aiFortune) {
        console.log(`[dailyFortune] date=${date} zodiac=${label} attempt=${attempt} result=success`);
        break;
      }
      console.warn(`[dailyFortune] date=${date} zodiac=${label} attempt=${attempt} result=failed`);
    }

    if (!aiFortune) {
      // 釋放鎖（status 退回 pending、清掉鎖），讓之後的補缺流程可以乾淨重試
      await ref
        .set(
          { status: "pending", lockOwner: FieldValue.delete(), lockExpiresAt: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        )
        .catch(() => {});
      console.error(`[dailyFortune] date=${date} zodiac=${label} result=failed-after-retries`);
      throw new Error("Daily fortune AI generation failed after retries.");
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

/**
 * 讀取指定日期實際「已就緒(ready)」的星座集合。
 * 直接讀當天 12 筆 dailyFortunes 文件（getAll，共 12 次讀取），
 * 以實際快取為準，不依賴可能漂移的 fortune_stats.generated_zodiacs。
 */
export async function getReadyZodiacSet(date = getTaipeiDate()): Promise<Set<ZodiacSign>> {
  const db = getAdminDb();
  const refs = ZODIAC_SIGNS.map((z) => db.collection(CACHE_COLLECTION).doc(buildDocId(date, ZODIAC_SLUGS[z])));
  const snaps = await db.getAll(...refs);
  const ready = new Set<ZodiacSign>();
  snaps.forEach((snap, i) => {
    const data = snap.data() as Partial<DailyFortuneCacheDoc> | undefined;
    if (data?.status === "ready" && toClientFortune(data)) ready.add(ZODIAC_SIGNS[i]);
  });
  return ready;
}

export interface PrefillSummary {
  date: string;
  status: FortuneGenerationStatus;
  total: number;
  readyCount: number;
  generated: ZodiacSign[];
  fromCache: ZodiacSign[];
  failed: ZodiacSign[];
  missing: ZodiacSign[];
}

/** 將當天生成狀態寫回 fortune_stats（單筆寫入），供後台顯示準確的 X/12 與缺漏 */
async function writeFortuneStatus(
  db: FirebaseFirestore.Firestore,
  date: string,
  ready: ZodiacSign[],
  missing: ZodiacSign[],
  status: FortuneGenerationStatus
) {
  try {
    await db.collection(STATS_COLLECTION).doc(date).set(
      {
        generated_zodiacs: ready,
        missing_zodiacs: missing,
        generation_status: status,
        generation_checked_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error("[dailyFortune] writeFortuneStatus failed:", err);
  }
}

/**
 * 預生成當日 12 星座運勢（排程／管理員手動共用）。
 *  - 以實際 dailyFortunes 為完整清單檢查，只補缺、不重生已完成。
 *  - 每個星座獨立 try/catch，單一失敗不中斷整批（getDailyFortune 內含 3 次重試）。
 *  - 批次結束後再次讀取當天資料確認，並回報最終缺漏與狀態。
 */
export async function prefillAllZodiacs(): Promise<PrefillSummary> {
  const date = getTaipeiDate();
  let db: FirebaseFirestore.Firestore;

  try {
    db = getAdminDb();
  } catch (err) {
    console.error("[dailyFortune][prefill] cannot initialize Firebase Admin:", err);
    return {
      date,
      status: "failed",
      total: ZODIAC_SIGNS.length,
      readyCount: 0,
      generated: [],
      fromCache: [],
      failed: [...ZODIAC_SIGNS],
      missing: [...ZODIAC_SIGNS],
    };
  }

  // 1) 先讀當天實際已完成的星座（12 次讀取），只補缺
  const before = await getReadyZodiacSet(date);
  const fromCache = ZODIAC_SIGNS.filter((z) => before.has(z));
  const toGenerate = ZODIAC_SIGNS.filter((z) => !before.has(z));
  console.log(
    `[dailyFortune][prefill] date=${date} existing=${fromCache.length}/12 toGenerate=[${toGenerate.join("、") || "無"}]`
  );

  // 2) 逐一補缺（每個星座獨立 try/catch，失敗不影響其他）
  const generated: ZodiacSign[] = [];
  const failedFirstPass: ZodiacSign[] = [];
  for (const zodiac of toGenerate) {
    try {
      await getDailyFortune(zodiac); // 內含 1 + 3 次重試
      generated.push(zodiac);
      console.log(`[dailyFortune][prefill] date=${date} zodiac=${zodiac} result=success`);
    } catch (err) {
      failedFirstPass.push(zodiac);
      console.error(
        `[dailyFortune][prefill] date=${date} zodiac=${zodiac} result=failed reason=`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // 3) 批次結束後再次確認（讀當天 12 筆），以實際 ready 為準
  const after = await getReadyZodiacSet(date);
  const missing = ZODIAC_SIGNS.filter((z) => !after.has(z));
  const failed = failedFirstPass.filter((z) => missing.includes(z));
  const status: FortuneGenerationStatus =
    after.size >= ZODIAC_SIGNS.length ? "complete" : after.size > 0 ? "partial" : "failed";

  console.log(
    `[dailyFortune][prefill] date=${date} done status=${status} ready=${after.size}/12 missing=[${missing.join("、") || "無"}]`
  );

  await writeFortuneStatus(db, date, [...after], missing, status);

  return {
    date,
    status,
    total: ZODIAC_SIGNS.length,
    readyCount: after.size,
    generated,
    fromCache,
    failed,
    missing,
  };
}
