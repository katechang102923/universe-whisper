import { NextResponse } from "next/server";
import { prefillAllZodiacs } from "@/lib/dailyFortune";

export const runtime = "nodejs";

/**
 * GET /api/cron/daily-fortune
 * Vercel Cron Job：每天 00:00 Asia/Taipei（UTC 16:00）自動觸發，
 * 預生成 12 星座今日運勢快取。
 *
 * 以 CRON_SECRET 驗證呼叫來源。
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // 驗證 Vercel Cron 的 Bearer token
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const results = await prefillAllZodiacs();
    const generated = results.filter((r) => r.success && !r.fromCache).length;
    const fromCache = results.filter((r) => r.fromCache).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(`[cron/daily-fortune] generated=${generated} fromCache=${fromCache} failed=${failed}`);

    return NextResponse.json({
      ok: true,
      summary: { generated, fromCache, failed, total: results.length },
    });
  } catch (err) {
    console.error("[cron/daily-fortune] failed:", err);
    return NextResponse.json({ error: "Cron job failed." }, { status: 500 });
  }
}
