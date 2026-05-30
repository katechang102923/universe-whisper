import { NextResponse } from "next/server";
import { getDailyHoroscope } from "@/lib/dailyHoroscope";
import { getTaipeiDate } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * GET /api/daily-horoscope?date=YYYY-MM-DD
 *
 * Returns all 12 zodiac signs' horoscope for the requested date
 * (defaults to today in Asia/Taipei).
 *
 * The result is cached in Firestore dailyHoroscopes/{date}.
 * All users requesting the same date see identical content.
 * AI generation is only triggered when no cached doc exists.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  const today = getTaipeiDate();

  // Accept an explicit date param but default to today
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;

  try {
    const result = await getDailyHoroscope(date);

    return NextResponse.json(result, {
      headers: {
        // Cache at the edge for 5 min; allow stale while revalidating
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Daily horoscope failed.";
    console.error("[daily-horoscope] route failed:", message);
    return NextResponse.json(
      { error: "宇宙訊號有點微弱，請稍後再試。" },
      { status: 500 },
    );
  }
}
