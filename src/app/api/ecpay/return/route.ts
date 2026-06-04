/**
 * ECPay ReturnURL — server-to-server 付款通知。
 *
 * 安全要求：
 *  - 驗證 CheckMacValue 才處理。
 *  - 幂等：同一筆 MerchantTradeNo 只處理一次。
 *  - 通行碼只在驗證成功後於 server side 產生。
 *  - 最後必須回覆純文字 "1|OK"。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyCheckMacValue, getEcpayCredentials } from "@/lib/ecpay";
import { fulfillPaidOrder } from "@/lib/paymentFulfillment";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { PAYMENT_ORDERS_COLLECTION } from "@/lib/redeemCodes";

export const runtime = "nodejs";

function ok(): NextResponse {
  return new NextResponse("1|OK", {
    status:  200,
    headers: { "Content-Type": "text/plain" },
  });
}

function fail(msg: string): NextResponse {
  console.warn("[ECPay Return] rejected:", msg);
  return new NextResponse(`0|${msg}`, {
    status:  200, // ECPay 要求 HTTP 200
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(req: NextRequest) {
  console.log("[ECPay Return] received raw request");

  // ── 讀取正確 credentials（stage 模式自動切換測試帳號） ───────────────────
  const { hashKey, hashIV, isStage } = getEcpayCredentials();

  if (!hashKey || !hashIV) {
    console.error("[ECPay Return] HashKey/IV 未設定");
    return fail("NOT_CONFIGURED");
  }

  // ── 解析 form-urlencoded body ────────────────────────────────────────────
  let params: Record<string, string> = {};
  try {
    const text = await req.text();
    params = Object.fromEntries(new URLSearchParams(text));
  } catch {
    return fail("PARSE_ERROR");
  }

  const merchantTradeNo = params.MerchantTradeNo;
  const rtnCode         = params.RtnCode;

  console.log("[ECPay Return] parsed", {
    merchantTradeNo,
    merchantId:       params.MerchantID,
    rtnCode,
    rtnMsg:           params.RtnMsg,
    tradeNo:          params.TradeNo,
    tradeAmt:         params.TradeAmt,
    paymentDate:      params.PaymentDate,
    paymentType:      params.PaymentType,
    hasCheckMacValue: Boolean(params.CheckMacValue),
    stage:            isStage,
  });

  // ── 驗證 CheckMacValue ───────────────────────────────────────────────────
  if (!verifyCheckMacValue(params, hashKey, hashIV)) {
    console.error("[ECPay Return] CheckMacValue invalid", {
      merchantTradeNo,
      merchantId: params.MerchantID,
      rtnCode,
      rtnMsg:     params.RtnMsg,
      stage:      isStage,
    });
    return fail("INVALID_MAC");
  }

  if (!merchantTradeNo) return fail("MISSING_TRADE_NO");

  // ── 付款失敗 ─────────────────────────────────────────────────────────────
  if (rtnCode !== "1") {
    try {
      const db = getAdminDb();
      const snap = await db
        .collection(PAYMENT_ORDERS_COLLECTION)
        .where("merchantTradeNo", "==", merchantTradeNo)
        .limit(1)
        .get();
      if (snap.empty) {
        console.error("[ECPay Return] order not found", { merchantTradeNo });
      } else {
        await snap.docs[0].ref.update({
          status:           "failed",
          ecpayTradeNo:     params.TradeNo ?? null,
          rtnCode:          params.RtnCode ?? null,
          rtnMsg:           params.RtnMsg ?? null,
          rawReturnPayload: params,
          failedAt:         FieldValue.serverTimestamp(),
        });
      }
    } catch (e) {
      console.error("[ECPay Return] 寫入失敗狀態時發生錯誤", e);
    }
    console.log("[ECPay Return] 付款失敗，RtnCode:", rtnCode, merchantTradeNo);
    return ok(); // 永遠回 1|OK 給綠界
  }

  // ── 付款成功：呼叫共用交付函式 ───────────────────────────────────────────
  try {
    const result = await fulfillPaidOrder({
      merchantTradeNo,
      providerPayload: params,
      source:          "ecpay_return",
    });

    console.log("[ECPay Return] paid confirmed", {
      merchantTradeNo,
      tradeNo:          params.TradeNo,
      code:             result.redeemCode,
      alreadyFulfilled: result.alreadyFulfilled,
      emailSent:        result.emailSent,
    });

    return ok();
  } catch (err) {
    console.error("[ECPay Return] fulfillPaidOrder 失敗", {
      merchantTradeNo,
      error: err instanceof Error ? err.message : String(err),
    });
    // 即使交付失敗也回 1|OK，避免綠界不斷重試
    return ok();
  }
}
