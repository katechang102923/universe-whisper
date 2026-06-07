/**
 * POST /api/astro-profile/payment-return
 * ECPay ReturnURL (server-to-server) for astro-profile orders only.
 * Does NOT touch tarot redeem codes or the existing payment system.
 */
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyCheckMacValue, getEcpayCredentials } from "@/lib/ecpay";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

function replyOk(): NextResponse {
  return new NextResponse("1|OK", { status: 200, headers: { "Content-Type": "text/plain" } });
}

function replyFail(msg: string): NextResponse {
  console.warn("[astro-profile/payment-return] rejected:", msg);
  return new NextResponse(`0|${msg}`, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(req: NextRequest) {
  const { hashKey, hashIV } = getEcpayCredentials();
  if (!hashKey || !hashIV) return replyFail("NOT_CONFIGURED");

  let params: Record<string, string> = {};
  try {
    const text = await req.text();
    params = Object.fromEntries(new URLSearchParams(text));
  } catch {
    return replyFail("PARSE_ERROR");
  }

  if (!verifyCheckMacValue(params, hashKey, hashIV)) {
    console.error("[astro-profile/payment-return] invalid CheckMacValue", {
      merchantTradeNo: params.MerchantTradeNo,
    });
    return replyFail("INVALID_MAC");
  }

  const merchantTradeNo = params.MerchantTradeNo;
  const rtnCode = params.RtnCode;
  if (!merchantTradeNo) return replyFail("MISSING_TRADE_NO");

  try {
    const db = getAdminDb();
    const query = await db
      .collection("astroProfileOrders")
      .where("merchantTradeNo", "==", merchantTradeNo)
      .limit(1)
      .get();

    if (query.empty) {
      console.error("[astro-profile/payment-return] order not found:", merchantTradeNo);
      return replyOk();
    }

    const orderDoc = query.docs[0];
    const orderData = orderDoc.data() as { status: string };

    if (orderData.status === "paid") {
      console.log("[astro-profile/payment-return] already paid (idempotent):", merchantTradeNo);
      return replyOk();
    }

    if (rtnCode === "1") {
      await orderDoc.ref.update({
        status: "paid",
        ecpayTradeNo: params.TradeNo ?? null,
        rtnCode,
        rtnMsg: params.RtnMsg ?? null,
        paidAt: FieldValue.serverTimestamp(),
      });
      console.log("[astro-profile/payment-return] paid:", merchantTradeNo);
    } else {
      await orderDoc.ref.update({
        status: "failed",
        rtnCode,
        rtnMsg: params.RtnMsg ?? null,
        failedAt: FieldValue.serverTimestamp(),
      });
      console.log("[astro-profile/payment-return] failed:", merchantTradeNo, "RtnCode:", rtnCode);
    }
  } catch (err) {
    console.error("[astro-profile/payment-return] db error:", err);
  }

  return replyOk();
}
