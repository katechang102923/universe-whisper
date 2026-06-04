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

    // ── 組 ECPay AioCheckOut 參數（用於簽章的 params 與 form submit 的完全一致）──
    // ① 先組好所有欄位（不含 CheckMacValue）
    // ② 計算 CheckMacValue
    // ③ 把 CheckMacValue 加入（這之後不再修改任何欄位）
    // ④ 回傳給前端 hidden form submit
    //
    // OrderResultURL 必須是 API route（支援 POST），不可直接指向 Next.js page。
    // 使用者刷卡後，綠界會 POST 到 OrderResultURL，我們再 303 redirect 到 /payment/result。
    const paramsForSign: Record<string, string> = {
      MerchantID:        merchantId,
      MerchantTradeNo:   merchantTradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType:       "aio",
      TotalAmount:       String(plan.price),   // 整數字串，無小數
      TradeDesc:         "Universe Whisper Pass",       // ASCII only
      ItemName:          `${plan.displayName} x1`,
      ReturnURL:         `${siteUrl}/api/ecpay/return`,
      OrderResultURL:    `${siteUrl}/api/ecpay/order-result`,
      ClientBackURL:     `${siteUrl}/payment/result?merchantTradeNo=${merchantTradeNo}`,
      ChoosePayment:     "Credit",
      EncryptType:       "1",   // SHA-256，必須參與 CheckMacValue 計算
      NeedExtraPaidInfo: "Y",
    };

    // ② 計算簽章（CheckMacValue 本身不參與計算）
    const checkMacValue = generateCheckMacValue(paramsForSign, hashKey, hashIV);

    // ③ 把 CheckMacValue 加入 — 之後不再修改任何欄位
    const ecpayParams: Record<string, string> = {
      ...paramsForSign,
      CheckMacValue: checkMacValue,
    };

    const actionUrl = getEcpayCheckoutUrl();

    // ── 安全除錯 log（絕對不印 HashKey / HashIV 明文）────────────────────────
    console.log("[ECPay create-order]", {
      stage:          isStage,
      actionUrl,
      merchantId,
      merchantTradeNo,
      totalAmount:    paramsForSign.TotalAmount,
      itemName:       paramsForSign.ItemName,
      tradeDesc:      paramsForSign.TradeDesc,
      hasHashKey:     Boolean(hashKey),
      hasHashIV:      Boolean(hashIV),
      // 列出所有送出的 key（含 CheckMacValue），方便核對是否有多餘/缺少欄位
      paramKeys:      Object.keys(ecpayParams).sort(),
    });

    // ECPAY_DEBUG=true 時額外印出遮罩後的簽章原文，方便與綠界 log 比對
    if (process.env.ECPAY_DEBUG === "true") {
      const maskedKey = hashKey.slice(0, 4) + "****";
      const maskedIV  = hashIV.slice(0, 4)  + "****";
      const sortedPairs = Object.keys(paramsForSign)
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
        .map((k) => `${k}=${paramsForSign[k]}`)
        .join("&");
      const rawMasked = `HashKey=${maskedKey}&${sortedPairs}&HashIV=${maskedIV}`;
      console.log("[ECPay create-order ECPAY_DEBUG] raw string (masked):", rawMasked.slice(0, 400));
      console.log("[ECPay create-order ECPAY_DEBUG] checkMacValue:", checkMacValue);
    }

    return NextResponse.json({
      ok:               true,
      actionUrl,
      params:           ecpayParams,   // ④ 前端 hidden form 原封不動 submit 這些欄位
      merchantTradeNo,
    });
  } catch (err) {
    console.error("[ecpay/create-order] error:", err);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
