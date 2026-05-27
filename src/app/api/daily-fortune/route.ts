import { NextResponse } from "next/server";
import {
  getDailyFortune,
  ZODIAC_SIGNS,
  ZODIAC_SLUGS,
  type ZodiacSign,
} from "@/lib/dailyFortune";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const zodiac = searchParams.get("zodiac");
  const isValidZodiac =
    Boolean(zodiac) &&
    (ZODIAC_SIGNS.includes(zodiac as ZodiacSign) ||
      Object.values(ZODIAC_SLUGS).includes(zodiac as string));

  if (!zodiac || !isValidZodiac) {
    return NextResponse.json(
      { error: "請提供有效的星座名稱。" },
      { status: 400 }
    );
  }

  try {
    const data = await getDailyFortune(zodiac);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Daily fortune failed.";
    console.error("[daily-fortune] failed:", message);
    return NextResponse.json(
      {
        error: message.startsWith("Missing Firebase Admin") || message.startsWith("Firebase Admin initialization failed")
          ? message
          : "宇宙訊號有點微弱，請稍後再試。",
      },
      { status: 500 }
    );
  }
}
