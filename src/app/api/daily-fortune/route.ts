import { NextResponse } from "next/server";
import { getDailyFortune, ZODIAC_SIGNS, type ZodiacSign } from "@/lib/dailyFortune";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const zodiac = searchParams.get("zodiac");

  if (!zodiac || !ZODIAC_SIGNS.includes(zodiac as ZodiacSign)) {
    return NextResponse.json(
      { error: "請提供有效的星座名稱。" },
      { status: 400 }
    );
  }

  try {
    const data = await getDailyFortune(zodiac);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "宇宙訊號有點微弱，請稍後再試。" },
      { status: 500 }
    );
  }
}
