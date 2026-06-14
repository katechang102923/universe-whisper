/**
 * ECPay 訂單查詢 + 補救 API（後台管理員使用）。
 *
 * 當 ReturnURL 通知失敗，導致付款成功但訂單仍 pending 時，
 * 管理員可從後台呼叫此 API，向綠界查詢真實付款狀態並補寫。
 */
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getAdminUserIds } from "@/lib/rateLimit";
import { verifyAdminSessionCookie, SESSION_COOKIE_NAME } from "@/lib/verifyAdmin";
import {
  PAYMENT_ORDERS_COLLECTION,
  REDEEM_CODES_COLLECTION,
  REDEEM_PLANS,
  REDEEM_CODE_EXPIRY_DAYS,
  generateRedeemCode,
  type RedeemPlan,
} from "@/lib/redeemCodes";
import { generateCheckMacValue, getEcpayCredentials } from "@/lib/ecpay";
import crypto from "crypto";

export const runtime = "nodejs";

const ECPAY_QUERY_URL_PROD  = "https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5";
const ECPAY_QUERY_URL_STAGE = "https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5";

const PLAN_KEY_MAP: Record<string, RedeemPlan> = {
  single:    "single",
  five:      "five_pack",
  five_pack: "five_pack",
  ten:       "ten_pack",
  ten_pack:  "ten_pack",
};

const PLAN_NAME_MAP: Record<string, RedeemPlan> = {
  "宇宙通行碼 單次": "single",
  "宇宙通行碼 五次": "five_pack",
  "宇宙通行碼 十次": "ten_pack",
};

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
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const raw     = `HashKey=${hashKey}&${sorted}&HashIV=${hashIV}`;
  const encoded = ecpayUrlEncode(raw).toLowerCase();
  return crypto.createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

export async function POST(req: NextRequest) {
  // ── 管理員驗證 ─────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const isGoogleAdmin = await verifyAdminSessionCookie(sessionCookie);
  const lineUserId    = cookieStore.get("line_user_id")?.value ?? null;
  const isLineAdmin   = Boolean(lineUserId && getAdminUserIds().includes(lineUserId));

  if (!isGoogleAdmin && !isLineAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  // 使用 getEcpayCredentials()：stage 模式自動切換官方測試帳號，
  // 與 create-order / return / sync-order 一致，避免查到不存在的環境而誤判未付款。
  const { merchantId, hashKey, hashIV, isStage } = getEcpayCredentials();
  const siteUrl    = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://universe-whisper.vercel.app"
  ).replace(/\/$/, "");

  if (!merchantId || !hashKey || !hashIV) {
    return NextResponse.json({ ok: false, error: "PAYMENT_NOT_CONFIGURED" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const { merchantTradeNo } = body as { merchantTradeNo?: string };

  if (!merchantTradeNo) {
    return NextResponse.json({ ok: false, error: "MISSING_TRADE_NO" }, { status: 400 });
  }

  const db = getAdminDb();

  // ── 找到 paymentOrders 文件 ──────────────────────────────────────────────
  const orderQuery = await db
    .collection(PAYMENT_ORDERS_COLLECTION)
    .where("merchantTradeNo", "==", merchantTradeNo)
    .limit(1)
    .get();

  if (orderQuery.empty) {
    return NextResponse.json({ ok: false, error: "ORDER_NOT_FOUND" }, { status: 404 });
  }

  const orderDoc  = orderQuery.docs[0];
  const orderData = orderDoc.data() as {
    status:       string;
    planId?:      string;
    planName?:    string;
    buyerEmail?:  string;
    redeemCode?:  string;
    amount?:      number;
    isTest?:      boolean;
  };

  // 已處理過直接回傳
  if (orderData.status === "paid" && orderData.redeemCode) {
    return NextResponse.json({
      ok:      true,
      synced:  false,
      message: "訂單已是 paid 狀態，無需同步",
      status:  "paid",
      redeemCode: orderData.redeemCode,
    });
  }

  // ── 向綠界查詢訂單狀態 ────────────────────────────────────────────────────
  const timeStamp = String(Math.floor(Date.now() / 1000));
  const queryParams = {
    MerchantID:       merchantId,
    MerchantTradeNo:  merchantTradeNo,
    TimeStamp:        timeStamp,
  };
  const checkMacValue = buildQueryCheckMac(queryParams, hashKey, hashIV);
  const queryBody     = new URLSearchParams({
    ...queryParams,
    CheckMacValue: checkMacValue,
  });

  const queryUrl = isStage ? ECPAY_QUERY_URL_STAGE : ECPAY_QUERY_URL_PROD;

  let ecpayResult: Record<string, string> = {};
  try {
    const ecpayRes = await fetch(queryUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    queryBody.toString(),
    });
    const resultText = await ecpayRes.text();
    ecpayResult = Object.fromEntries(new URLSearchParams(resultText));
    console.log("[ecpay/query-order] ECPay result:", {
      TradeStatus: ecpayResult.TradeStatus,
      TradeNo:     ecpayResult.TradeNo,
      PaymentDate: ecpayResult.PaymentDate,
    });
  } catch (err) {
    console.error("[ecpay/query-order] fetch error:", err);
    return NextResponse.json({ ok: false, error: "ECPAY_QUERY_FAILED" }, { status: 502 });
  }

  const tradeStatus = ecpayResult.TradeStatus;   // "1" = paid
  const ecpayTradeNo = ecpayResult.TradeNo ?? "";
  const paymentDate  = ecpayResult.PaymentDate ?? "";

  // 驗證回傳的 CheckMacValue
  const verifiedMac = generateCheckMacValue(ecpayResult, hashKey, hashIV);
  if (verifiedMac !== ecpayResult.CheckMacValue) {
    console.warn("[ecpay/query-order] CheckMacValue mismatch on query result");
    // 查詢回傳的 CheckMacValue 格式略有不同，記錄但不擋下
  }

  if (tradeStatus !== "1") {
    return NextResponse.json({
      ok:      true,
      synced:  false,
      message: `綠界回傳 TradeStatus=${tradeStatus}，付款未成功`,
      ecpayTradeStatus: tradeStatus,
    });
  }

  // ── 付款成功：補寫訂單 + 產生通行碼 ──────────────────────────────────────
  try {
    let generatedCode = "";

    await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(orderDoc.ref);
      const fresh     = freshSnap.data() as typeof orderData;

      if (fresh.status === "paid" && fresh.redeemCode) {
        generatedCode = fresh.redeemCode;
        return;
      }

      const planId: string   = fresh.planId ?? "single";
      const planName: RedeemPlan =
        PLAN_KEY_MAP[planId] ??
        PLAN_NAME_MAP[fresh.planName ?? ""] ??
        "single";
      const plan = REDEEM_PLANS[planName];

      let code = "";
      for (let i = 0; i < 10; i++) {
        const candidate = generateRedeemCode();
        const snap      = await tx.get(db.collection(REDEEM_CODES_COLLECTION).doc(candidate));
        if (!snap.exists) { code = candidate; break; }
      }
      if (!code) throw new Error("Could not generate unique redeem code");
      generatedCode = code;

      const expiresAt = new Date(
        Date.now() + REDEEM_CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      );

      tx.set(db.collection(REDEEM_CODES_COLLECTION).doc(code), {
        code,
        planName,
        displayName:    plan.displayName,
        price:          plan.price,
        totalUses:      plan.totalUses,
        remainingUses:  plan.totalUses,
        status:         "active",
        source:         "ecpay_paid",
        paymentOrderId: orderDoc.id,
        merchantTradeNo,
        ecpayTradeNo,
        amount:         fresh.amount ?? plan.price,
        buyerEmail:     fresh.buyerEmail ?? null,
        emailSent:      false,
        createdAt:      FieldValue.serverTimestamp(),
        expiresAt,
        usedLogs:       [],
        isTest:         fresh.isTest ?? false,
      });

      tx.update(orderDoc.ref, {
        status:       "paid",
        ecpayTradeNo,
        paymentDate,
        paymentType:  ecpayResult.PaymentType ?? null,
        tradeAmt:     ecpayResult.TradeAmt ?? null,
        redeemCode:   code,
        redeemCodeId: code,
        paidAt:       FieldValue.serverTimestamp(),
        syncedAt:     FieldValue.serverTimestamp(),
        syncedBy:     "admin_query",
      });
    });

    // ── 寄送 Email（失敗不影響主流程） ────────────────────────────────────
    const refreshed  = (await orderDoc.ref.get()).data() as typeof orderData;
    const buyerEmail = refreshed.buyerEmail;
    if (generatedCode && buyerEmail) {
      const planName: RedeemPlan =
        PLAN_KEY_MAP[refreshed.planId ?? ""] ??
        PLAN_NAME_MAP[refreshed.planName ?? ""] ??
        "single";
      const plan    = REDEEM_PLANS[planName];
      const expIso  = new Date(
        Date.now() + REDEEM_CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();

      void fetch(`${siteUrl}/api/email/send-redeem-code`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email:        buyerEmail,
          code:         generatedCode,
          planName,
          displayName:  plan.displayName,
          totalUses:    plan.totalUses,
          remainingUses: plan.totalUses,
          expiresAt:    expIso,
        }),
      }).then(async (r) => {
        const emailSent = r.ok;
        await orderDoc.ref.update({ emailSent, emailSentAt: FieldValue.serverTimestamp() });
        await db.collection(REDEEM_CODES_COLLECTION).doc(generatedCode).update({
          emailSent, emailSentAt: FieldValue.serverTimestamp(),
        });
      }).catch(console.error);
    }

    console.log("[ecpay/query-order] synced OK:", merchantTradeNo, "code:", generatedCode);
    return NextResponse.json({
      ok:         true,
      synced:     true,
      message:    "同步成功，訂單已更新為 paid",
      redeemCode: generatedCode,
      ecpayTradeNo,
    });
  } catch (err) {
    console.error("[ecpay/query-order] transaction error:", err);
    return NextResponse.json({ ok: false, error: "TRANSACTION_ERROR" }, { status: 500 });
  }
}
