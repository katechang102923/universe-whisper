import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getAdminUserIds, getTaipeiDate } from "@/lib/rateLimit";
import { SESSION_COOKIE_NAME, verifyAdminSessionCookie } from "@/lib/verifyAdmin";
import {
  getDailyFortune,
  getReadyZodiacSet,
  ZODIAC_SIGNS,
  ZODIAC_SLUGS,
  type FortuneGenerationStatus,
  type ZodiacSign,
} from "@/lib/dailyFortune";

export const runtime = "nodejs";
export const maxDuration = 60;

async function verifyAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (await verifyAdminSessionCookie(sessionCookie)) return true;
  const lineUserId = cookieStore.get("line_user_id")?.value;
  return Boolean(lineUserId && getAdminUserIds().includes(lineUserId));
}

/**
 * POST /api/admin/fortune-fill
 * Body: { zodiac?: string, regenerate?: boolean }
 * 填補缺少的今日星座或全部重新生成，限管理員。
 */
export async function POST(req: NextRequest) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as {
    zodiac?: string;
    regenerate?: boolean;
  };
  const { zodiac, regenerate } = body;
  const date = getTaipeiDate();
  const db = getAdminDb();

  let toGenerate: ZodiacSign[];
  let mode: "regenerate-all" | "regenerate-one" | "fill-missing";

  if (zodiac) {
    if (!ZODIAC_SIGNS.includes(zodiac as ZodiacSign)) {
      return NextResponse.json({ ok: false, error: "Invalid zodiac" }, { status: 400 });
    }
    toGenerate = [zodiac as ZodiacSign];
    mode = regenerate ? "regenerate-one" : "fill-missing";
    if (regenerate) {
      // 覆蓋重生：僅刪除這一個星座的今日快取
      const slug = ZODIAC_SLUGS[zodiac as ZodiacSign];
      await db.collection("dailyFortunes").doc(`${date}_${slug}`).delete().catch(() => {});
    }
  } else if (regenerate) {
    // 重新生成全部：明確覆蓋——先刪除全部今日快取，再重生 12 星座
    mode = "regenerate-all";
    toGenerate = [...ZODIAC_SIGNS];
    const deleteOps = ZODIAC_SIGNS.map((z) =>
      db.collection("dailyFortunes").doc(`${date}_${ZODIAC_SLUGS[z]}`).delete().catch(() => {})
    );
    await Promise.allSettled(deleteOps);
  } else {
    // 補齊缺少：以實際 dailyFortunes 為準找缺漏，只補缺、不刪不覆蓋已完成內容
    mode = "fill-missing";
    const ready = await getReadyZodiacSet(date);
    toGenerate = ZODIAC_SIGNS.filter((s) => !ready.has(s));
  }

  console.log(`[admin/fortune-fill] date=${date} mode=${mode} toGenerate=[${toGenerate.join("、") || "無"}]`);

  let success = 0;
  let failed = 0;
  const failedZodiacs: string[] = [];

  if (toGenerate.length > 0) {
    // Promise.allSettled：單一星座失敗不影響其他；getDailyFortune 內含 1+3 次重試
    const results = await Promise.allSettled(toGenerate.map((z) => getDailyFortune(z)));
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        success++;
        console.log(`[admin/fortune-fill] date=${date} zodiac=${toGenerate[i]} result=success`);
      } else {
        failed++;
        failedZodiacs.push(toGenerate[i]);
        console.error(`[admin/fortune-fill] date=${date} zodiac=${toGenerate[i]} result=failed reason=`, result.reason);
      }
    });
  }

  // 補完後再次確認當天實際達成狀態（讀當天 12 筆）
  const after = await getReadyZodiacSet(date);
  const missing = ZODIAC_SIGNS.filter((z) => !after.has(z));
  const status: FortuneGenerationStatus =
    after.size >= ZODIAC_SIGNS.length ? "complete" : after.size > 0 ? "partial" : "failed";

  console.log(`[admin/fortune-fill] date=${date} mode=${mode} done status=${status} ready=${after.size}/12 missing=[${missing.join("、") || "無"}]`);

  return NextResponse.json({
    ok: true,
    date,
    mode,
    generated: success,
    failed,
    failedZodiacs,
    readyCount: after.size,
    total: ZODIAC_SIGNS.length,
    missing,
    status,
  });
}
