import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getAdminUserIds, getTaipeiDate } from "@/lib/rateLimit";
import { SESSION_COOKIE_NAME, verifyAdminSessionCookie } from "@/lib/verifyAdmin";
import {
  getDailyFortune,
  ZODIAC_SIGNS,
  ZODIAC_SLUGS,
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

  if (zodiac) {
    if (!ZODIAC_SIGNS.includes(zodiac as ZodiacSign)) {
      return NextResponse.json({ ok: false, error: "Invalid zodiac" }, { status: 400 });
    }
    toGenerate = [zodiac as ZodiacSign];
    if (regenerate) {
      const slug = ZODIAC_SLUGS[zodiac as ZodiacSign];
      await db.collection("dailyFortunes").doc(`${date}_${slug}`).delete().catch(() => {});
    }
  } else if (regenerate) {
    // 全部重新生成：先刪除所有今日快取
    toGenerate = [...ZODIAC_SIGNS];
    const deleteOps = ZODIAC_SIGNS.map((z) => {
      const slug = ZODIAC_SLUGS[z];
      return db.collection("dailyFortunes").doc(`${date}_${slug}`).delete().catch(() => {});
    });
    await Promise.allSettled(deleteOps);
  } else {
    // 只補缺少的
    const statsSnap = await db.collection("fortune_stats").doc(date).get();
    const statsData = statsSnap.data() ?? {};
    const generated: string[] = statsData.generated_zodiacs ?? [];
    toGenerate = [...ZODIAC_SIGNS].filter((s) => !generated.includes(s));
  }

  if (toGenerate.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "所有星座已生成",
      generated: 0,
      failed: 0,
      failedZodiacs: [],
    });
  }

  let success = 0;
  let failed = 0;
  const failedZodiacs: string[] = [];

  // 使用 Promise.allSettled 避免單一失敗影響其他
  const results = await Promise.allSettled(
    toGenerate.map((z) => getDailyFortune(z))
  );

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      success++;
    } else {
      failed++;
      failedZodiacs.push(toGenerate[i]);
      console.error(`[admin/fortune-fill] failed for ${toGenerate[i]}:`, result.reason);
    }
  });

  return NextResponse.json({ ok: true, generated: success, failed, failedZodiacs });
}
