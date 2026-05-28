import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDrawUsage, getAdminUserIds, LINE_DAILY_LIMIT, UNAUTH_DAILY_LIMIT } from "@/lib/rateLimit";

function getRequestIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwardedFor ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const anonymousId = requestUrl.searchParams.get("anonymousId") ?? null;
  const cookieStore = await cookies();
  const lineUserId = cookieStore.get("line_user_id")?.value ?? null;
  const ip = getRequestIp(request);

  // Admins have unlimited draws
  if (lineUserId && getAdminUserIds().includes(lineUserId)) {
    return NextResponse.json({
      remaining: 999,
      limit: 999,
      isLineUser: true,
      resetAt: "不限制",
    });
  }

  const limit = lineUserId ? LINE_DAILY_LIMIT : UNAUTH_DAILY_LIMIT;
  const isLineUser = Boolean(lineUserId);

  try {
    const usage = await getDrawUsage({ ip, anonymousId, lineUserId }, "draw_limits");
    return NextResponse.json({
      remaining: usage.remaining,
      limit: usage.limit,
      isLineUser,
      resetAt: "明天 00:00 (台灣時間)",
    });
  } catch (err) {
    console.warn("[tarot/usage] Failed to read draw limits:", err);
    // Fail open — assume user has remaining draws
    return NextResponse.json({
      remaining: limit,
      limit,
      isLineUser,
      resetAt: "明天 00:00 (台灣時間)",
    });
  }
}
