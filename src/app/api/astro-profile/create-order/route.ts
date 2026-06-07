/**
 * POST /api/astro-profile/create-order
 * Creates an ECPay order for the astro-profile NT$149 unlock.
 * Entirely separate from tarot redeem codes — stores in "astroProfileOrders" collection.
 */
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  generateCheckMacValue,
  getEcpayCheckoutUrl,
  getEcpayCredentials,
  generateMerchantTradeNo,
  formatEcpayDate,
} from "@/lib/ecpay";

export const runtime = "nodejs";

const ASTRO_PROFILE_AMOUNT = 149;
const ASTRO_PROFILE_DISPLAY_NAME = "三重星座完整解析";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  const { merchantId, hashKey, hashIV, isStage } = getEcpayCredentials();
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://universe-whisper.vercel.app"
  ).replace(/\/$/, "");

  if (!merchantId || !hashKey || !hashIV) {
    return NextResponse.json({ ok: false, error: "PAYMENT_NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      sessionId?: string;
      buyerEmail?: string;
    };
    const { sessionId, buyerEmail } = body;

    if (!sessionId || typeof sessionId !== "string" || sessionId.length < 8) {
      return NextResponse.json({ ok: false, error: "INVALID_SESSION" }, { status: 400 });
    }
    if (buyerEmail && !isValidEmail(buyerEmail)) {
      return NextResponse.json({ ok: false, error: "INVALID_EMAIL" }, { status: 400 });
    }

    const merchantTradeNo = generateMerchantTradeNo();
    const tradeDate = formatEcpayDate(new Date());

    const db = getAdminDb();
    const orderRef = db.collection("astroProfileOrders").doc();
    await orderRef.set({
      id: orderRef.id,
      merchantTradeNo,
      sessionId,
      status: "pending",
      productType: "astro_profile",
      amount: ASTRO_PROFILE_AMOUNT,
      currency: "TWD",
      buyerEmail: buyerEmail ?? null,
      createdAt: FieldValue.serverTimestamp(),
      isTest: isStage,
    });

    const paramsForSign: Record<string, string> = {
      MerchantID: merchantId,
      MerchantTradeNo: merchantTradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType: "aio",
      TotalAmount: String(ASTRO_PROFILE_AMOUNT),
      TradeDesc: "Astro Profile Unlock",
      ItemName: `${ASTRO_PROFILE_DISPLAY_NAME} x1`,
      ReturnURL: `${siteUrl}/api/astro-profile/payment-return`,
      OrderResultURL: `${siteUrl}/api/astro-profile/order-result`,
      ClientBackURL: `${siteUrl}/astro-profile?session=${encodeURIComponent(sessionId)}&order=${encodeURIComponent(merchantTradeNo)}`,
      ChoosePayment: "Credit",
      EncryptType: "1",
      NeedExtraPaidInfo: "Y",
    };

    const checkMacValue = generateCheckMacValue(paramsForSign, hashKey, hashIV);
    const ecpayParams: Record<string, string> = { ...paramsForSign, CheckMacValue: checkMacValue };

    console.log("[astro-profile/create-order]", {
      stage: isStage,
      merchantTradeNo,
      totalAmount: ASTRO_PROFILE_AMOUNT,
      sessionId: sessionId.slice(0, 8) + "...",
    });

    return NextResponse.json({ ok: true, actionUrl: getEcpayCheckoutUrl(), params: ecpayParams, merchantTradeNo });
  } catch (err) {
    console.error("[astro-profile/create-order] error:", err);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
