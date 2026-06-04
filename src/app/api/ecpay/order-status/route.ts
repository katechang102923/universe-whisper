import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { PAYMENT_ORDERS_COLLECTION, REDEEM_CODES_COLLECTION } from "@/lib/redeemCodes";

export const runtime = "nodejs";

function toIso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && "toDate" in v) {
    return (v as { toDate(): Date }).toDate().toISOString();
  }
  return null;
}

export async function GET(req: NextRequest) {
  const merchantTradeNo = req.nextUrl.searchParams.get("merchantTradeNo");

  if (!merchantTradeNo) {
    return NextResponse.json({ ok: false, error: "MISSING_TRADE_NO" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const snap = await db
      .collection(PAYMENT_ORDERS_COLLECTION)
      .where("merchantTradeNo", "==", merchantTradeNo)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }

    const data = snap.docs[0].data() as {
      status: string;
      planName?: string;
      amount?: number;
      redeemCode?: string;
      buyerEmail?: string;
      paidAt?: unknown;
    };

    // Fetch redeem code details if paid
    let codeDetail: {
      totalUses?: number;
      remainingUses?: number;
      expiresAt?: string | null;
      displayName?: string;
    } | null = null;

    if (data.status === "paid" && data.redeemCode) {
      const codeSnap = await db
        .collection(REDEEM_CODES_COLLECTION)
        .doc(data.redeemCode)
        .get();
      if (codeSnap.exists) {
        const cd = codeSnap.data() as {
          totalUses?: number;
          remainingUses?: number;
          expiresAt?: unknown;
          displayName?: string;
        };
        codeDetail = {
          totalUses:     cd.totalUses,
          remainingUses: cd.remainingUses,
          expiresAt:     toIso(cd.expiresAt),
          displayName:   cd.displayName,
        };
      }
    }

    return NextResponse.json({
      ok:           true,
      status:       data.status,
      planName:     data.planName ?? "",
      amount:       data.amount ?? 0,
      redeemCode:   data.status === "paid" ? (data.redeemCode ?? null) : null,
      paidAt:       toIso(data.paidAt),
      codeDetail,
    });
  } catch (err) {
    console.error("[ecpay/order-status] error:", err);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
