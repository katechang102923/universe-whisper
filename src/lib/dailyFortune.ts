import OpenAI from "openai";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./firebaseAdmin";
import { getTaipeiDate } from "./rateLimit";
import {
  generateDailyFortune,
  type DailyFortuneData,
  type FortuneAspect,
} from "./dailyFortuneGenerator";

// ── 常數 ─────────────────────────────────────────────────────────────────────

const CACHE_COLLECTION = "daily_fortune_cache";
const STATS_COLLECTION = "fortune_stats";
const DEFAULT_MODEL = "gpt-5.4-mini";

export const ZODIAC_SIGNS = [
  "牡羊座", "金牛座", "雙子座", "巨蟹座", "獅子座", "處女座",
  "天秤座", "天蠍座", "射手座", "摩羯座", "水瓶座", "雙魚座",
] as const;

export type ZodiacSign = (typeof ZODIAC_SIGNS)[number];

// ── Firestore 文件型別 ────────────────────────────────────────────────────────

export interface DailyFortuneCacheDoc extends DailyFortuneData {
  date: string;
  zodiac: string;
  isAiGenerated: boolean;
  generatedAt: Date | FirebaseFirestore.Timestamp;
}

export interface FortuneStatsDoc {
  ai_generations: number;
  cache_hits: number;
  total_generated: number;
  generated_zodiacs: string[];
}

// ── AI Prompt ─────────────────────────────────────────────────────────────────

function buildFortunePrompt(zodiac: string, date: string): string {
  return `今天是 ${date}，請為「${zodiac}」生成一份今日運勢。

請以 JSON 格式回傳，結構如下（不要加任何其他文字，只輸出純 JSON）：
{
  "overall": {
    "stars": <2到5的整數>,
    "current": "<40-60字，描述今日整體能量狀態>",
    "tip": "<20-40字，溫柔提醒>",
    "action": "<20-40字，今日小行動建議>"
  },
  "love": {
    "stars": <2到5的整數>,
    "current": "<40-60字，描述今日愛情運勢>",
    "tip": "<20-40字，關係提醒>",
    "action": "<20-40字，行動建議>"
  },
  "work": {
    "stars": <2到5的整數>,
    "current": "<40-60字，描述今日工作運勢>",
    "tip": "<20-40字，工作提醒>",
    "action": "<20-40字，行動建議>"
  },
  "wealth": {
    "stars": <2到5的整數>,
    "current": "<40-60字，描述今日財運>",
    "tip": "<20-40字，財務提醒>",
    "action": "<20-40字，行動建議>"
  },
  "mood": {
    "stars": <2到5的整數>,
    "current": "<40-60字，描述今日心情能量>",
    "tip": "<20-40字，情緒照顧提醒>",
    "action": "<20-40字，行動建議>"
  },
  "luckyColor": "<1-4字的幸運色，例如：薰衣草紫>",
  "luckyNumber": <1到9的整數>
}

要求：
- 語氣溫柔、有宇宙感、不恐嚇、不絕對預言
- 配合 ${zodiac} 的個性特質
- 繁體中文
- stars 避免出現 1（太沮喪），保持 2-5 的範圍
- 只輸出純 JSON，不要加 markdown 或說明文字`;
}

// ── 驗證函式 ─────────────────────────────────────────────────────────────────

function validateAspect(raw: unknown): FortuneAspect | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const stars = typeof obj.stars === "number"
    ? Math.min(5, Math.max(2, Math.round(obj.stars)))
    : null;
  const current = typeof obj.current === "string" && obj.current.trim() ? obj.current.trim() : null;
  const tip = typeof obj.tip === "string" && obj.tip.trim() ? obj.tip.trim() : null;
  const action = typeof obj.action === "string" && obj.action.trim() ? obj.action.trim() : null;

  if (!stars || !current || !tip || !action) return null;
  return { stars, current, tip, action };
}

function validateFortuneData(raw: unknown): DailyFortuneData | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const overall = validateAspect(obj.overall);
  const love = validateAspect(obj.love);
  const work = validateAspect(obj.work);
  const wealth = validateAspect(obj.wealth);
  const mood = validateAspect(obj.mood);

  const luckyColor =
    typeof obj.luckyColor === "string" && obj.luckyColor.trim() ? obj.luckyColor.trim() : null;
  const luckyNumber =
    typeof obj.luckyNumber === "number"
      ? Math.min(9, Math.max(1, Math.round(obj.luckyNumber)))
      : null;

  if (!overall || !love || !work || !wealth || !mood || !luckyColor || !luckyNumber) return null;
  return { overall, love, work, wealth, mood, luckyColor, luckyNumber };
}

// ── AI 生成 ───────────────────────────────────────────────────────────────────

async function generateWithAI(zodiac: string, date: string): Promise<DailyFortuneData | null> {
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
          content: "你是宇宙偷偷話的運勢生成助理。請嚴格依照使用者要求的 JSON 格式輸出，不要加任何額外文字。",
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

    // 移除可能的 markdown code block
    const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(jsonText) as unknown;
    return validateFortuneData(parsed);
  } catch (err) {
    console.error(`[dailyFortune] AI generation failed for ${zodiac}:`, err);
    return null;
  }
}

// ── 統計更新 ──────────────────────────────────────────────────────────────────

async function updateStats(
  date: string,
  type: "ai_generation" | "cache_hit",
  zodiac?: string
) {
  try {
    const db = getAdminDb();
    const ref = db.collection(STATS_COLLECTION).doc(date);

    if (type === "cache_hit") {
      await ref.set({ cache_hits: FieldValue.increment(1) }, { merge: true });
    } else {
      const update: Record<string, unknown> = {
        ai_generations: FieldValue.increment(1),
        total_generated: FieldValue.increment(1),
      };
      if (zodiac) {
        update.generated_zodiacs = FieldValue.arrayUnion(zodiac);
      }
      await ref.set(update, { merge: true });
    }
  } catch (err) {
    // 統計失敗不影響主流程
    console.error("[dailyFortune] updateStats failed:", err);
  }
}

// ── 主要 export：快取優先取得運勢 ──────────────────────────────────────────────

export async function getDailyFortune(zodiac: string): Promise<DailyFortuneData> {
  const date = getTaipeiDate();
  const docId = `${date}_${zodiac}`;

  try {
    const db = getAdminDb();
    const ref = db.collection(CACHE_COLLECTION).doc(docId);
    const snap = await ref.get();

    if (snap.exists) {
      // Cache hit：回傳快取資料，背景更新統計
      updateStats(date, "cache_hit").catch(() => {});
      const cached = snap.data() as DailyFortuneCacheDoc;
      // 只取 DailyFortuneData 欄位
      return {
        overall: cached.overall,
        love: cached.love,
        work: cached.work,
        wealth: cached.wealth,
        mood: cached.mood,
        luckyColor: cached.luckyColor,
        luckyNumber: cached.luckyNumber,
      };
    }

    // Cache miss：呼叫 AI 或使用 seeded fallback
    const aiData = await generateWithAI(zodiac, date);
    const isAiGenerated = aiData !== null;
    const fortuneData = aiData ?? generateDailyFortune(zodiac);

    // 存入快取（fire-and-forget）
    ref
      .set({
        ...fortuneData,
        date,
        zodiac,
        isAiGenerated,
        generatedAt: new Date(),
      } satisfies DailyFortuneCacheDoc)
      .catch((err) => console.error("[dailyFortune] cache write failed:", err));

    // 更新統計
    if (isAiGenerated) {
      updateStats(date, "ai_generation", zodiac).catch(() => {});
    }

    return fortuneData;
  } catch (err) {
    console.error("[dailyFortune] getDailyFortune failed, using seeded fallback:", err);
    return generateDailyFortune(zodiac);
  }
}

// ── 預生成所有星座 ─────────────────────────────────────────────────────────────

export async function prefillAllZodiacs(): Promise<
  Array<{ zodiac: string; success: boolean; fromCache: boolean }>
> {
  const date = getTaipeiDate();
  const db = getAdminDb();
  const results: Array<{ zodiac: string; success: boolean; fromCache: boolean }> = [];

  for (const zodiac of ZODIAC_SIGNS) {
    const docId = `${date}_${zodiac}`;
    try {
      const snap = await db.collection(CACHE_COLLECTION).doc(docId).get();

      if (snap.exists) {
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
