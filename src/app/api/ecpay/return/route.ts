/**
 * ECPay ReturnURL — server-to-server payment notification.
 *
 * Security requirements:
 *  - Verify CheckMacValue before processing.
 *  - Idempotent: same MerchantTradeNo processed only once.
 *  - RedeemCode generated only after verified successful payment.
 *  - Must reply "1|OK" as plain text on success.
 */
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  PAYMENT_ORDERS_COLLECTION,
  REDEEM_CODES_COLLECTION,
  REDEEM_PLANS,
  REDEEM_CODE_EXPIRY_DAYS,
  generateRedeemCode,
  type RedeemPlan,
} from "@/lib/redeemCodes";
import { verifyCheckMacValue } from "@/lib/ecpay";

export const runtime = "nodejs";

const PLAN_NAME_MAP: Record<string, RedeemPlan> = {
  "宇宙通行碼 單次": "single",
  "宇宙通行碼 五次": "five_pack",
  "宇宙通行碼 十次": "ten_pack",
};

function ok(): NextResponse {
  return new NextResponse("1|OK", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

function fail(msg: string): NextResponse {
  console.warn("[ecpay/return] rejected:", msg);
  return new NextResponse(`0|${msg}`, {
    status: 200, // ECPay expects HTTP 200 regardless
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(req: NextRequest) {
  const hashKey = process.env.ECPAY_HASH_KEY;
  const hashIV  = process.env.ECPAY_HASH_IV;

  if (!hashKey || !hashIV) {
    console.error("[ecpay/return] HashKey/IV not configured");
    return fail("NOT_CONFIGURED");
  }

  // ── 解析 form-urlencoded body ─────────────────────────────────────────────
  let params: Record<string, string> = {};
  try {
    const text = await req.text();
    params = Object.fromEntries(new URLSearchParams(text));
  } catch {
    return fail("PARSE_ERROR");
  }

  console.log("[ECPay Return] received", {
    merchantTradeNo:   params.MerchantTradeNo,
    rtnCode:           params.RtnCode,
    rtnMsg:            params.RtnMsg,
    tradeNo:           params.TradeNo,
    tradeAmt:          params.TradeAmt,
    paymentType:       params.PaymentType,
    paymentDate:       params.PaymentDate,
    hasCheckMacValue:  Boolean(params.CheckMacValue),
  });

  // ── 驗證 CheckMacValue ───────────────────────────────────────────────────
  if (!verifyCheckMacValue(params, hashKey, hashIV)) {
    console.error("[ECPay Return] CheckMacValue invalid", {
      merchantTradeNo: params.MerchantTradeNo,
    });
    return fail("INVALID_MAC");
  }

  const merchantTradeNo = params.MerchantTradeNo;
  const rtnCode         = params.RtnCode;
  const ecpayTradeNo    = params.TradeNo;

  if (!merchantTradeNo) return fail("MISSING_TRADE_NO");

  const db = getAdminDb();

  // ── 找到對應的 paymentOrders 文件 ────────────────────────────────────────
  const orderQuery = await db
    .collection(PAYMENT_ORDERS_COLLECTION)
    .where("merchantTradeNo", "==", merchantTradeNo)
    .limit(1)
    .get();

  if (orderQuery.empty) {
    console.error("[ECPay Return] order not found", { merchantTradeNo });
    return fail("ORDER_NOT_FOUND");
  }

  const orderDoc  = orderQuery.docs[0];
  const orderData = orderDoc.data() as {
    status: string;
    planId?: string;
    planName?: string;
    buyerEmail?: string;
    userId?: string;
    redeemCode?: string;
    amount?: number;
    isTest?: boolean;
  };

  // ── Idempotent: 已處理過則直接回 OK ─────────────────────────────────────
  if (orderData.status === "paid" && orderData.redeemCode) {
    console.log("[ecpay/return] already processed:", merchantTradeNo);
    return ok();
  }

  // ── 付款失敗 ─────────────────────────────────────────────────────────────
  if (rtnCode !== "1") {
    await orderDoc.ref.update({
      status:             "failed",
      ecpayTradeNo:       ecpayTradeNo ?? null,
      rawReturnPayload:   params,
      failedAt:           FieldValue.serverTimestamp(),
    });
    console.log("[ecpay/return] payment failed, RtnCode:", rtnCode, merchantTradeNo);
    return ok(); // Always reply 1|OK to ECPay
  }

  // ── 付款成功：產生通行碼（使用 Firestore transaction 確保 idempotency） ──
  try {
    await db.runTransaction(async (tx) => {
      // Re-read inside transaction to prevent race conditions
      const freshSnap = await tx.get(orderDoc.ref);
      const fresh = freshSnap.data() as typeof orderData;

      if (fresh.status === "paid" && fresh.redeemCode) {
        return; // Already processed by another concurrent call
      }

      // Determine plan
      const planId   = fresh.planId ?? "single";
      const PLAN_KEY_MAP: Record<string, RedeemPlan> = {
        single:    "single",
        five:      "five_pack",
        five_pack: "five_pack",
        ten:       "ten_pack",
        ten_pack:  "ten_pack",
      };
      const planName: RedeemPlan =
        PLAN_KEY_MAP[planId] ??
        PLAN_NAME_MAP[fresh.planName ?? ""] ??
        "single";
      const plan = REDEEM_PLANS[planName];

      // Generate unique redeem code
      let code = "";
      for (let i = 0; i < 10; i++) {
        const candidate = generateRedeemCode();
        const existing  = await tx.get(
          db.collection(REDEEM_CODES_COLLECTION).doc(candidate),
        );
        if (!existing.exists) {
          code = candidate;
          break;
        }
      }
      if (!code) throw new Error("Could not generate unique redeem code");

      const now       = new Date();
      const expiresAt = new Date(
        now.getTime() + REDEEM_CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      );

      // Write redeemCode document
      const codeRef = db.collection(REDEEM_CODES_COLLECTION).doc(code);
      tx.set(codeRef, {
        code,
        planName,
        displayName:      plan.displayName,
        price:            plan.price,
        totalUses:        plan.totalUses,
        remainingUses:    plan.totalUses,
        status:           "active",
        source:           "ecpay_paid",
        paymentOrderId:   orderDoc.id,
        merchantTradeNo,
        ecpayTradeNo:     ecpayTradeNo ?? null,
        amount:           fresh.amount ?? plan.price,
        buyerEmail:       fresh.buyerEmail ?? null,
        userId:           fresh.userId ?? null,
        emailSent:        false,
        createdAt:        FieldValue.serverTimestamp(),
        expiresAt,
        usedLogs:         [],
        isTest:           fresh.isTest ?? false,
      });

      // Update paymentOrder
      tx.update(orderDoc.ref, {
        status:           "paid",
        ecpayTradeNo:     ecpayTradeNo ?? null,
        tradeNo:          ecpayTradeNo ?? null,
        paymentMethod:    params.PaymentType ?? null,
        paymentType:      params.PaymentType ?? null,
        paymentDate:      params.PaymentDate ?? null,
        tradeAmt:         params.TradeAmt ?? null,
        rtnCode:          params.RtnCode ?? null,
        rtnMsg:           params.RtnMsg ?? null,
        authCode:         params.auth_code ?? null,
        cardLast4:        params.card_4no  ?? null,
        cardType:         params.card_Type ?? null,
        redeemCode:       code,
        redeemCodeId:     code,
        rawReturnPayload: params,
        paidAt:           FieldValue.serverTimestamp(),
      });
    });

    // ── 寄送通行碼 Email（transaction 外，失敗不影響回傳） ─────────────────
    const updatedSnap = await orderDoc.ref.get();
    const updated     = updatedSnap.data() as typeof orderData & {
      redeemCode?: string;
    };
    const code        = updated.redeemCode;
    const buyerEmail  = updated.buyerEmail ?? orderData.buyerEmail;

    if (code && buyerEmail) {
      void sendRedeemEmail(code, buyerEmail, orderData, orderDoc.id, db);
    }

    console.log("[ECPay Return] success", { merchantTradeNo, code });
    return ok();
  } catch (err) {
    console.error("[ECPay Return] redeem code create failed", {
      merchantTradeNo,
      error: err instanceof Error ? err.message : String(err),
    });
    return fail("TRANSACTION_ERROR");
  }
}

async function sendRedeemEmail(
  code: string,
  email: string,
  orderData: { planId?: string; planName?: string },
  orderId: string,
  db: ReturnType<typeof import("@/lib/firebaseAdmin").getAdminDb>,
) {
  const PLAN_KEY_MAP: Record<string, RedeemPlan> = {
    single:    "single",
    five:      "five_pack",
    five_pack: "five_pack",
    ten:       "ten_pack",
    ten_pack:  "ten_pack",
  };
  const planName: RedeemPlan =
    PLAN_KEY_MAP[orderData.planId ?? ""] ??
    PLAN_NAME_MAP[orderData.planName ?? ""] ??
    "single";
  const plan     = REDEEM_PLANS[planName];
  const expiresAt = new Date(
    Date.now() + REDEEM_CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://universe-whisper.vercel.app"
  ).replace(/\/$/, "");

  try {
    const res = await fetch(`${siteUrl}/api/email/send-redeem-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        code,
        planName,
        displayName:    plan.displayName,
        totalUses:      plan.totalUses,
        remainingUses:  plan.totalUses,
        expiresAt,
      }),
    });

    const emailSent = res.ok;
    let emailError: string | null = null;

    if (!emailSent) {
      const errText = await res.text().catch(() => "");
      emailError = `HTTP ${res.status}: ${errText.slice(0, 200)}`;
      console.error("[ecpay/return] Email 寄送失敗:", res.status, errText);
    }

    const orderUpdate: Record<string, unknown> = {
      emailSent,
      emailSentAt: FieldValue.serverTimestamp(),
    };
    if (emailError) orderUpdate.emailError = emailError;

    await db.collection(PAYMENT_ORDERS_COLLECTION).doc(orderId).update(orderUpdate);
    await db.collection(REDEEM_CODES_COLLECTION).doc(code).update({
      emailSent,
      emailSentAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ecpay/return] Email 寄送 exception:", msg);
    await db
      .collection(PAYMENT_ORDERS_COLLECTION)
      .doc(orderId)
      .update({ emailSent: false, emailError: msg.slice(0, 200) })
      .catch(() => {});
  }
}
