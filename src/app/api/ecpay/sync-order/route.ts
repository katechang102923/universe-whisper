/**
 * ECPay 訂單補救同步 API — 前台付款結果頁與後台皆可呼叫。
 *
 * 用途：
 *  1. 前台：付款後 ReturnURL 尚未觸發時，主動查詢綠界確認付款。
 *  2. 後台：訂單已 paid 但通行碼空白時，手動補產生（forceGenerate=true）。
 *
 * 安全設計：
 *  - HashKey / HashIV 只在 server side 使用，不回傳前端。
 *  - 同一筆 merchantTradeNo 最多查詢 10 次（forceGenerate 跳過此限制）。
 *  - 通行碼產生採 Transaction，確保幂等。
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { PAYMENT_ORDERS_COLLECTION } from "@/lib/redeemCodes";
import { fulfillPaidOrder } from "@/lib/paymentFulfillment";
import { getEcpayCredentials } from "@/lib/ecpay";
import crypto from "crypto";

export const runtime = "nodejs";

// ── 常數 ──────────────────────────────────────────────────────────────────────

const ECPAY_QUERY_URL_PROD  = "https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5";
const ECPAY_QUERY_URL_STAGE = "https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5";
const MAX_SYNC_CALLS        = 20;

// ── ECPay 查詢 CheckMacValue ───────────────────────────────────────────────────

function ecpayUrlEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/%20/g, "+")
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

function buildQueryCheckMac(
  params: Record<string, string>,
  hashKey: string,
  hashIV: string,
): string {
  const sorted  = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  const raw     = `HashKey=${hashKey}&${sorted}&HashIV=${hashIV}`;
  const encoded = ecpayUrlEncode(raw).toLowerCase();
  return crypto.createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 使用 getEcpayCredentials() 確保 stage 模式下使用測試帳號
  const { merchantId, hashKey, hashIV, isStage } = getEcpayCredentials();

  if (!merchantId || !hashKey || !hashIV) {
    return NextResponse.json({ ok: false, error: "PAYMENT_NOT_CONFIGURED" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const { merchantTradeNo, forceGenerate } = body as {
    merchantTradeNo?: string;
    forceGenerate?:   boolean;
  };

  if (!merchantTradeNo || typeof merchantTradeNo !== "string") {
    return NextResponse.json({ ok: false, error: "MISSING_TRADE_NO" }, { status: 400 });
  }

  const db = getAdminDb();

  console.log("[ECPay Sync] start", { merchantTradeNo, forceGenerate, isStage });

  // ── 找到訂單 ──────────────────────────────────────────────────────────────
  const orderQuery = await db
    .collection(PAYMENT_ORDERS_COLLECTION)
    .where("merchantTradeNo", "==", merchantTradeNo)
    .limit(1)
    .get();

  if (orderQuery.empty) {
    console.error("[ECPay Sync] 訂單不存在:", merchantTradeNo);
    return NextResponse.json({ ok: false, error: "ORDER_NOT_FOUND" }, { status: 404 });
  }

  const orderDoc  = orderQuery.docs[0];
  const orderData = orderDoc.data() as {
    status:         string;
    redeemCode?:    string;
    buyerEmail?:    string;
    syncCallCount?: number;
  };

  // ── 已有通行碼：直接回傳 ─────────────────────────────────────────────────
  if (orderData.status === "paid" && orderData.redeemCode) {
    console.log("[ECPay Sync] 已完成，直接回傳", { merchantTradeNo, code: orderData.redeemCode });
    return NextResponse.json({
      ok:         true,
      status:     "paid",
      redeemCode: orderData.redeemCode,
      emailSent:  (orderData as { emailSent?: boolean }).emailSent ?? false,
      message:    "already_paid",
    });
  }

  // ── 訂單已 paid 但無碼（含 forceGenerate）：直接補產，不需再查綠界 ──────
  if (orderData.status === "paid" && !orderData.redeemCode) {
    const mode = forceGenerate ? "admin_force_generate" : "sync_paid_no_code";
    console.log("[ECPay Sync] paid 但無碼，直接補產通行碼", { merchantTradeNo, mode });
    try {
      const result = await fulfillPaidOrder({
        merchantTradeNo,
        providerPayload: {},
        source:          mode,
      });
      console.log("[ECPay Sync] redeem code fulfilled", { merchantTradeNo, code: result.redeemCode });
      return NextResponse.json({
        ok:         true,
        status:     "paid",
        redeemCode: result.redeemCode,
        emailSent:  result.emailSent,
        emailError: result.emailError ?? null,
        message:    forceGenerate ? "force_generated" : "code_generated",
      });
    } catch (err) {
      console.error("[ECPay Sync] 補產通行碼失敗", err);
      return NextResponse.json(
        { ok: false, error: "GENERATE_FAILED", message: "補產通行碼失敗，請稍後再試。" },
        { status: 500 },
      );
    }
  }

  // ── 防濫用：每筆最多查詢 MAX_SYNC_CALLS 次 ────────────────────────────────
  const syncCount = orderData.syncCallCount ?? 0;
  if (syncCount >= MAX_SYNC_CALLS) {
    console.warn("[ECPay Sync] 查詢次數已達上限:", merchantTradeNo, syncCount);
    return NextResponse.json(
      { ok: false, error: "SYNC_LIMIT_EXCEEDED", message: "查詢次數已達上限，請聯繫客服協助補發。" },
      { status: 429 },
    );
  }

  // 累計查詢次數
  await orderDoc.ref.update({ syncCallCount: FieldValue.increment(1) });

  // ── 向綠界查詢訂單狀態 ────────────────────────────────────────────────────
  const timeStamp   = String(Math.floor(Date.now() / 1000));
  const queryParams: Record<string, string> = {
    MerchantID:      merchantId,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp:       timeStamp,
  };
  const checkMacValue = buildQueryCheckMac(queryParams, hashKey, hashIV);
  const queryBody     = new URLSearchParams({ ...queryParams, CheckMacValue: checkMacValue });
  const queryUrl      = isStage ? ECPAY_QUERY_URL_STAGE : ECPAY_QUERY_URL_PROD;

  let ecpayResult: Record<string, string> = {};
  try {
    const ecpayRes   = await fetch(queryUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    queryBody.toString(),
    });
    const resultText = await ecpayRes.text();
    ecpayResult      = Object.fromEntries(new URLSearchParams(resultText));

    console.log("[ECPay Sync] query response", {
      merchantTradeNo,
      TradeStatus:  ecpayResult.TradeStatus,
      TradeNo:      ecpayResult.TradeNo,
      PaymentDate:  ecpayResult.PaymentDate,
      TradeAmt:     ecpayResult.TradeAmt,
      RtnCode:      ecpayResult.RtnCode,
    });
  } catch (err) {
    console.error("[ECPay Sync] 向綠界查詢失敗", err);
    return NextResponse.json(
      { ok: false, error: "ECPAY_QUERY_FAILED", message: "無法連線到綠界，請稍後再試。" },
      { status: 502 },
    );
  }

  // TradeStatus "1" = 付款成功
  if (ecpayResult.TradeStatus !== "1") {
    return NextResponse.json({
      ok:      true,
      status:  "pending",
      message: `目前尚未查到綠界付款成功紀錄（TradeStatus=${ecpayResult.TradeStatus ?? "unknown"}）。`,
    });
  }

  // ── 確認付款成功：呼叫共用交付函式 ──────────────────────────────────────
  console.log("[ECPay Sync] paid confirmed", { merchantTradeNo, TradeNo: ecpayResult.TradeNo });
  try {
    const result = await fulfillPaidOrder({
      merchantTradeNo,
      providerPayload: ecpayResult,
      source:          "sync_order",
    });

    console.log("[ECPay Sync] redeem code fulfilled", {
      merchantTradeNo,
      code:      result.redeemCode,
      emailSent: result.emailSent,
    });

    return NextResponse.json({
      ok:         true,
      status:     "paid",
      redeemCode: result.redeemCode,
      emailSent:  result.emailSent,
      emailError: result.emailError ?? null,
      codeDetail: {
        totalUses:     result.totalUses,
        remainingUses: result.remainingUses,
        expiresAt:     result.expiresAt.toISOString(),
        displayName:   result.displayName,
      },
      message: result.alreadyFulfilled ? "already_paid" : "同步成功",
    });
  } catch (err) {
    console.error("[ECPay Sync] fulfillPaidOrder 失敗", err);
    return NextResponse.json(
      { ok: false, error: "UPDATE_FAILED", message: "補救失敗，請聯繫客服。" },
      { status: 500 },
    );
  }
}

