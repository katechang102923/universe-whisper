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
    const summary = await prefillAllZodiacs();

    console.log(
      `[cron/daily-fortune] date=${summary.date} status=${summary.status} ready=${summary.readyCount}/${summary.total} generated=${summary.generated.length} fromCache=${summary.fromCache.length} failed=${summary.failed.length} missing=[${summary.missing.join("、") || "無"}]`
    );

    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    console.error("[cron/daily-fortune] failed:", err);
    return NextResponse.json({ error: "Cron job failed." }, { status: 500 });
  }
}
