import { NextResponse } from "next/server";
import { markFbShareUnlock, checkFbShareUnlock, getTaipeiDate } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let anonymousId: string | null = null;

  try {
    const body = (await request.json()) as { anonymousId?: string };
    anonymousId = typeof body.anonymousId === "string" ? body.anonymousId : null;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!anonymousId) {
    return NextResponse.json({ error: "anonymousId is required." }, { status: 400 });
  }

  try {
    // Check if already unlocked today
    const alreadyUnlocked = await checkFbShareUnlock({ anonymousId });
    if (alreadyUnlocked) {
      return NextResponse.json({ success: true, alreadyUnlocked: true, date: getTaipeiDate() });
    }

    await markFbShareUnlock({ anonymousId });
    return NextResponse.json({ success: true, alreadyUnlocked: false, date: getTaipeiDate() });
  } catch (err) {
    console.error("[tarot/mark-fb-unlock] failed:", err);
    return NextResponse.json({ error: "伺服器錯誤，請稍後再試。" }, { status: 500 });
  }
}
