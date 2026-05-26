import { NextResponse } from "next/server";
import { canUseFeature, type UserProfile } from "@/lib/features";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const profile = (body.profile ?? null) as UserProfile | null;
  const access = canUseFeature(profile, "ai_detail");

  if (!access.allowed) {
    return NextResponse.json({ error: access.reason, paymentStatus: profile?.paymentStatus ?? "none" }, { status: 402 });
  }

  if (!process.env.AI_READING_API_KEY) {
    return NextResponse.json({
      status: "reserved",
      reading:
        "宇宙解讀服務尚未串接。這裡會在付款狀態啟用後，將牌卡、問題與使用者狀態送往解讀服務。"
    });
  }

  return NextResponse.json({
    status: "reserved",
    model: process.env.AI_READING_MODEL ?? "not-configured",
    reading: "宇宙解讀串接點已預留，請在此 route 中加入實際呼叫。"
  });
}
