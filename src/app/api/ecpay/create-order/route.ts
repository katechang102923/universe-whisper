import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  PAYMENT_ORDERS_COLLECTION,
  REDEEM_PLANS,
  type RedeemPlan,
} from "@/lib/redeemCodes";
import {
  generateCheckMacValue,
  getEcpayCheckoutUrl,
  generateMerchantTradeNo,
  formatEcpayDate,
} from "@/lib/ecpay";

export const runtime = "nodejs";

// planId → RedeemPlan mapping (accepts both short and full key names)
const PLAN_KEY_MAP: Record<string, RedeemPlan> = {
  single:    "single",
  five:      "five_pack",
  five_pack: "five_pack",
  ten:       "ten_pack",
  ten_pack:  "ten_pack",
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  const merchantId = process.env.ECPAY_MERCHANT_ID;
  const hashKey    = process.env.ECPAY_HASH_KEY;
  const hashIV     = process.env.ECPAY_HASH_IV;
  const siteUrl    = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://universe-whisper.vercel.app"
  ).replace(/\/$/, "");

  if (!merchantId || !hashKey || !hashIV) {
    console.error("[ecpay/create-order] 環境變數 ECPAY_MERCHANT_ID / HASH_KEY / HASH_IV 未設定");
    return NextResponse.json(
      { ok: false, error: "PAYMENT_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { planId, buyerEmail, userId } = body as {
      planId?: string;
      buyerEmail?: string;
      userId?: string;
    };

    if (!planId || !PLAN_KEY_MAP[planId]) {
      return NextResponse.json({ ok: false, error: "INVALID_PLAN" }, { status: 400 });
    }
    if (buyerEmail && !isValidEmail(buyerEmail)) {
      return NextResponse.json({ ok: false, error: "INVALID_EMAIL" }, { status: 400 });
    }

    const planName        = PLAN_KEY_MAP[planId];
    const plan            = REDEEM_PLANS[planName];
    const merchantTradeNo = generateMerchantTradeNo();
    const tradeDate       = formatEcpayDate(new Date());
    const isTest          = process.env.ECPAY_STAGE === "true";

    // ── 建立 paymentOrders 文件（status: pending） ────────────────────────────
    const db       = getAdminDb();
    const orderRef = db.collection(PAYMENT_ORDERS_COLLECTION).doc();
    await orderRef.set({
      id:               orderRef.id,
      merchantTradeNo,
      status:           "pending",
      planId,
      planName:         plan.displayName,
      amount:           plan.price,
      currency:         "TWD",
      uses:             plan.totalUses,
      buyerEmail:       buyerEmail ?? null,
      userId:           userId ?? null,
      createdAt:        FieldValue.serverTimestamp(),
      isTest,
    });

    // ── 組 ECPay AioCheckOut 參數 ─────────────────────────────────────────────
    const resultPageUrl = `${siteUrl}/payment/result?merchantTradeNo=${merchantTradeNo}`;

    const ecpayParams: Record<string, string> = {
      MerchantID:        merchantId,
      MerchantTradeNo:   merchantTradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType:       "aio",
      TotalAmount:       String(plan.price),
      TradeDesc:         "宇宙偷偷話通行碼",
      ItemName:          `${plan.displayName} x1`,
      ReturnURL:         `${siteUrl}/api/ecpay/return`,
      OrderResultURL:    resultPageUrl,
      ClientBackURL:     resultPageUrl,
      ChoosePayment:     "Credit",
      EncryptType:       "1",
      NeedExtraPaidInfo: "Y",
    };

    // CheckMacValue 在 server 端產生，不回傳給前端
    const checkMacValue = generateCheckMacValue(ecpayParams, hashKey, hashIV);
    ecpayParams.CheckMacValue = checkMacValue;

    return NextResponse.json({
      ok:               true,
      actionUrl:        getEcpayCheckoutUrl(),
      params:           ecpayParams,
      merchantTradeNo,
    });
  } catch (err) {
    console.error("[ecpay/create-order] error:", err);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
