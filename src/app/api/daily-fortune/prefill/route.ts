import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminUserIds } from "@/lib/rateLimit";
import { prefillAllZodiacs } from "@/lib/dailyFortune";

export const runtime = "nodejs";

/**
 * POST /api/daily-fortune/prefill
 * 管理員手動觸發，預生成今日 12 星座運勢快取。
 */
export async function POST() {
  // 驗證管理員身份
  const cookieStore = await cookies();
  const lineUserId = cookieStore.get("line_user_id")?.value ?? null;
  const adminIds = getAdminUserIds();

  if (!lineUserId || !adminIds.includes(lineUserId)) {
    return NextResponse.json({ error: "未授權。" }, { status: 403 });
  }

  try {
    const summary = await prefillAllZodiacs();
    return NextResponse.json({ success: true, summary });
  } catch (err) {
    console.error("[prefill] failed:", err);
    return NextResponse.json({ error: "預生成失敗，請稍後再試。" }, { status: 500 });
  }
}
