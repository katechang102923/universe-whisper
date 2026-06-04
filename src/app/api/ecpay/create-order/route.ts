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
  getEcpayCredentials,
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
  const { merchantId, hashKey, hashIV, isStage } = getEcpayCredentials();
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://universe-whisper.vercel.app"
  ).replace(/\/$/, "");

  if (!merchantId || !hashKey || !hashIV) {
    const missing = [
      !merchantId && "ECPAY_MERCHANT_ID",
      !hashKey    && "ECPAY_HASH_KEY",
      !hashIV     && "ECPAY_HASH_IV",
    ].filter(Boolean).join(", ");
    console.error(`[ecpay/create-order] 缺少環境變數：${missing}`);
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
    const isTest          = isStage; // 由 getEcpayCredentials() 已決定

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
    // OrderResultURL 必須是 API route（支援 POST），不可直接指向 Next.js page。
    // 使用者刷卡後，綠界會 POST 到 OrderResultURL，我們再 303 redirect 到 /payment/result。
    const ecpayParams: Record<string, string> = {
      MerchantID:        merchantId,
      MerchantTradeNo:   merchantTradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType:       "aio",
      TotalAmount:       String(plan.price),
      TradeDesc:         "Universe Whisper Pass",       // ASCII only，避免編碼不一致
      ItemName:          `${plan.displayName} x1`,
      ReturnURL:         `${siteUrl}/api/ecpay/return`, // server-to-server 通知
      OrderResultURL:    `${siteUrl}/api/ecpay/order-result`, // 使用者瀏覽器付款後 POST 到這裡
      ClientBackURL:     `${siteUrl}/payment/result?merchantTradeNo=${merchantTradeNo}`,
      ChoosePayment:     "Credit",
      EncryptType:       "1",
      NeedExtraPaidInfo: "Y",
    };

    // CheckMacValue 在 server 端產生，不回傳給前端
    const checkMacValue = generateCheckMacValue(ecpayParams, hashKey, hashIV);
    ecpayParams.CheckMacValue = checkMacValue;

    const actionUrl = getEcpayCheckoutUrl();

    // ── 安全除錯 log（不印 HashKey / HashIV）─────────────────────────────────
    console.log("[ECPay create-order]", {
      stage:          isStage,
      actionUrl,
      merchantId,
      merchantTradeNo,
      totalAmount:    ecpayParams.TotalAmount,
      choosePayment:  ecpayParams.ChoosePayment,
      itemName:       ecpayParams.ItemName,
      tradeDesc:      ecpayParams.TradeDesc,
      hasHashKey:     Boolean(hashKey),
      hasHashIV:      Boolean(hashIV),
      paramKeys:      Object.keys(ecpayParams).sort(),
    });

    // 開發環境或啟用 ECPAY_DEBUG 時，印出遮罩後的簽章字串輔助除錯
    if (process.env.NODE_ENV === "development" || process.env.ECPAY_DEBUG === "true") {
      // 用 *** 遮罩 HashKey / HashIV，只顯示前 4 碼
      const maskedKey = hashKey.slice(0, 4) + "***";
      const maskedIV  = hashIV.slice(0, 4)  + "***";
      const { CheckMacValue: _cmv, ...debugParams } = ecpayParams;
      const sorted = Object.keys(debugParams)
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
        .map((k) => `${k}=${debugParams[k]}`)
        .join("&");
      const rawMasked = `HashKey=${maskedKey}&${sorted}&HashIV=${maskedIV}`;
      console.log("[ECPay create-order debug] raw (masked):", rawMasked.slice(0, 300) + "…");
    }

    return NextResponse.json({
      ok:               true,
      actionUrl,
      params:           ecpayParams,
      merchantTradeNo,
    });
  } catch (err) {
    console.error("[ecpay/create-order] error:", err);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
