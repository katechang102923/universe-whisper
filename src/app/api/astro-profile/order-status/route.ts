/**
 * GET /api/astro-profile/order-status?merchantTradeNo=XXX
 * Returns whether an astro-profile order is paid.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const merchantTradeNo = searchParams.get("merchantTradeNo");

  if (!merchantTradeNo) {
    return NextResponse.json({ ok: false, error: "MISSING_TRADE_NO" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const query = await db
      .collection("astroProfileOrders")
      .where("merchantTradeNo", "==", merchantTradeNo)
      .limit(1)
      .get();

    if (query.empty) {
      return NextResponse.json({ ok: false, paid: false, error: "NOT_FOUND" });
    }

    const data = query.docs[0].data() as { status: string; sessionId?: string };
    return NextResponse.json({
      ok: true,
      paid: data.status === "paid",
      status: data.status,
      sessionId: data.sessionId ?? null,
    });
  } catch (err) {
    console.error("[astro-profile/order-status] error:", err);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
