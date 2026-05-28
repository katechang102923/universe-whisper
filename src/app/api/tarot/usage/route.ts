import { NextResponse } from "next/server";
import { getDrawUsage, UNAUTH_DAILY_LIMIT } from "@/lib/rateLimit";
import { verifyAdminIdToken } from "@/lib/verifyAdmin";

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
  const ip = getRequestIp(request);

  // Admins have unlimited draws — verified by Firebase Google login email.
  const idToken = request.headers.get("x-firebase-id-token");
  const isAdminByToken = await verifyAdminIdToken(idToken);

  if (isAdminByToken) {
    return NextResponse.json({
      remaining: 999,
      limit: 999,
      isLineUser: false,
      resetAt: "不限制",
    });
  }

  const limit = UNAUTH_DAILY_LIMIT;

  try {
    const usage = await getDrawUsage({ ip, anonymousId, lineUserId: null }, "draw_limits");
    return NextResponse.json({
      remaining: usage.remaining,
      limit: usage.limit,
      isLineUser: false,
      resetAt: "明天 00:00 (台灣時間)",
    });
  } catch (err) {
    console.warn("[tarot/usage] Failed to read draw limits:", err);
    // Fail open — assume user has remaining draws
    return NextResponse.json({
      remaining: limit,
      limit,
      isLineUser: false,
      resetAt: "明天 00:00 (台灣時間)",
    });
  }
}
