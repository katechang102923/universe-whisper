/**
 * ECPay 訂單補救同步 API — 前台付款結果頁與後台皆可呼叫。
 *
 * 當 ReturnURL server-to-server 通知沒有打進來時（常見原因：Vercel 冷啟動延遲、
 * 綠界重試超時、IP 白名單問題），使用者可主動呼叫此 API 向綠界查詢付款狀態並補救。
 *
 * 安全設計：
 * - HashKey / HashIV 只在 server side 使用，不回傳前端。
 * - 同一筆 merchantTradeNo 最多查詢 10 次，防止無限輪詢。
 * - 不重複產生通行碼（idempotent）。
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
import { generateCheckMacValue } from "@/lib/ecpay";
import crypto from "crypto";

export const runtime = "nodejs";

// ── 常數 ──────────────────────────────────────────────────────────────────────

const ECPAY_QUERY_URL_PROD  = "https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5";
const ECPAY_QUERY_URL_STAGE = "https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5";
const MAX_SYNC_CALLS        = 10; // 每筆訂單最多允許查詢 10 次

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

// ── ECPay 查詢 CheckMacValue（使用與 return 相同的演算法） ────────────────────

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

// ── 通行碼產生與訂單更新（可複用） ───────────────────────────────────────────

async function applyPaidUpdate(
  db: ReturnType<typeof getAdminDb>,
  orderDoc: FirebaseFirestore.DocumentSnapshot,
  orderData: {
    planId?:     string;
    planName?:   string;
    buyerEmail?: string;
    amount?:     number;
    isTest?:     boolean;
  },
  ecpayResult: Record<string, string>,
): Promise<string> {
  const ecpayTradeNo = ecpayResult.TradeNo ?? "";
  let generatedCode  = "";

  await db.runTransaction(async (tx) => {
    const freshSnap = await tx.get(orderDoc.ref);
    const fresh     = freshSnap.data() as typeof orderData & {
      status?:     string;
      redeemCode?: string;
    };

    // Idempotent
    if (fresh.status === "paid" && fresh.redeemCode) {
      generatedCode = fresh.redeemCode;
      return;
    }

    const planId: string = fresh.planId ?? orderData.planId ?? "single";
    const planName: RedeemPlan =
      PLAN_KEY_MAP[planId] ??
      PLAN_NAME_MAP[fresh.planName ?? orderData.planName ?? ""] ??
      "single";
    const plan = REDEEM_PLANS[planName];

    // 產生唯一通行碼
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
      merchantTradeNo: (fresh as { merchantTradeNo?: string }).merchantTradeNo ?? "",
      ecpayTradeNo,
      amount:         fresh.amount ?? orderData.amount ?? plan.price,
      buyerEmail:     fresh.buyerEmail ?? orderData.buyerEmail ?? null,
      emailSent:      false,
      createdAt:      FieldValue.serverTimestamp(),
      expiresAt,
      usedLogs:       [],
      isTest:         fresh.isTest ?? orderData.isTest ?? false,
    });

    tx.update(orderDoc.ref, {
      status:       "paid",
      ecpayTradeNo,
      tradeNo:      ecpayTradeNo,
      paymentType:  ecpayResult.PaymentType ?? null,
      paymentDate:  ecpayResult.PaymentDate ?? null,
      tradeAmt:     ecpayResult.TradeAmt ?? null,
      rtnCode:      ecpayResult.TradeStatus ?? null,
      redeemCode:   code,
      redeemCodeId: code,
      paidAt:       FieldValue.serverTimestamp(),
      syncedAt:     FieldValue.serverTimestamp(),
      syncedBy:     "sync_order_api",
    });
  });

  return generatedCode;
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const merchantId = process.env.ECPAY_MERCHANT_ID;
  const hashKey    = process.env.ECPAY_HASH_KEY;
  const hashIV     = process.env.ECPAY_HASH_IV;
  const isStage    = process.env.ECPAY_STAGE === "true";
  const siteUrl    = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://universe-whisper.vercel.app"
  ).replace(/\/$/, "");

  if (!merchantId || !hashKey || !hashIV) {
    return NextResponse.json({ ok: false, error: "PAYMENT_NOT_CONFIGURED" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const { merchantTradeNo } = body as { merchantTradeNo?: string };

  if (!merchantTradeNo || typeof merchantTradeNo !== "string") {
    return NextResponse.json({ ok: false, error: "MISSING_TRADE_NO" }, { status: 400 });
  }

  const db = getAdminDb();

  // ── 找到訂單 ──────────────────────────────────────────────────────────────
  const orderQuery = await db
    .collection(PAYMENT_ORDERS_COLLECTION)
    .where("merchantTradeNo", "==", merchantTradeNo)
    .limit(1)
    .get();

  if (orderQuery.empty) {
    console.error("[sync-order] order not found:", merchantTradeNo);
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
    syncCallCount?: number;
  };

  // ── Idempotent：已處理過直接回傳 ──────────────────────────────────────────
  if (orderData.status === "paid" && orderData.redeemCode) {
    return NextResponse.json({
      ok:         true,
      status:     "paid",
      redeemCode: orderData.redeemCode,
      message:    "already_paid",
    });
  }

  // ── 防濫用：每筆最多查詢 MAX_SYNC_CALLS 次 ────────────────────────────────
  const syncCount = orderData.syncCallCount ?? 0;
  if (syncCount >= MAX_SYNC_CALLS) {
    console.warn("[sync-order] rate limit:", merchantTradeNo, syncCount);
    return NextResponse.json(
      { ok: false, error: "SYNC_LIMIT_EXCEEDED", message: "請聯繫客服協助補發。" },
      { status: 429 },
    );
  }

  // 累計查詢次數
  await orderDoc.ref.update({ syncCallCount: FieldValue.increment(1) });

  // ── 向綠界查詢訂單 ────────────────────────────────────────────────────────
  const timeStamp  = String(Math.floor(Date.now() / 1000));
  const queryParams: Record<string, string> = {
    MerchantID:      merchantId,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp:       timeStamp,
  };
  const checkMacValue = buildQueryCheckMac(queryParams, hashKey, hashIV);
  const queryBody     = new URLSearchParams({ ...queryParams, CheckMacValue: checkMacValue });

  const queryUrl = isStage ? ECPAY_QUERY_URL_STAGE : ECPAY_QUERY_URL_PROD;

  let ecpayResult: Record<string, string> = {};
  try {
    const ecpayRes   = await fetch(queryUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    queryBody.toString(),
    });
    const resultText = await ecpayRes.text();
    ecpayResult      = Object.fromEntries(new URLSearchParams(resultText));

    console.log("[sync-order] ECPay QueryTradeInfo result:", {
      merchantTradeNo,
      TradeStatus:  ecpayResult.TradeStatus,
      TradeNo:      ecpayResult.TradeNo,
      PaymentDate:  ecpayResult.PaymentDate,
      TradeAmt:     ecpayResult.TradeAmt,
    });
  } catch (err) {
    console.error("[sync-order] ECPay query fetch failed:", err);
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

  // ── 付款成功：補寫訂單 + 產生通行碼 ──────────────────────────────────────
  let generatedCode = "";
  try {
    generatedCode = await applyPaidUpdate(db, orderDoc, orderData, ecpayResult);
    console.log("[sync-order] paid synced:", merchantTradeNo, "→ code:", generatedCode);
  } catch (err) {
    console.error("[sync-order] applyPaidUpdate failed:", err);
    return NextResponse.json(
      { ok: false, error: "UPDATE_FAILED", message: "補救失敗，請聯繫客服。" },
      { status: 500 },
    );
  }

  // ── 若有 buyerEmail，補寄通行碼 Email ─────────────────────────────────────
  const buyerEmail = orderData.buyerEmail;
  if (generatedCode && buyerEmail) {
    const planId: string = orderData.planId ?? "single";
    const planName: RedeemPlan =
      PLAN_KEY_MAP[planId] ??
      PLAN_NAME_MAP[orderData.planName ?? ""] ??
      "single";
    const plan   = REDEEM_PLANS[planName];
    const expIso = new Date(
      Date.now() + REDEEM_CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    void fetch(`${siteUrl}/api/email/send-redeem-code`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email:         buyerEmail,
        code:          generatedCode,
        planName,
        displayName:   plan.displayName,
        totalUses:     plan.totalUses,
        remainingUses: plan.totalUses,
        expiresAt:     expIso,
      }),
    }).then(async (r) => {
      const emailSent = r.ok;
      const updates   = { emailSent, emailSentAt: FieldValue.serverTimestamp() };
      await Promise.all([
        orderDoc.ref.update(updates),
        db.collection(REDEEM_CODES_COLLECTION).doc(generatedCode).update(updates),
      ]);
      if (!emailSent) console.error("[sync-order] email send failed:", await r.text().catch(() => ""));
    }).catch((err: unknown) => console.error("[sync-order] email exception:", err));
  }

  // 重新讀取通行碼詳細資料
  let codeDetail: {
    totalUses?:     number;
    remainingUses?: number;
    expiresAt?:     string | null;
    displayName?:   string;
  } | null = null;

  if (generatedCode) {
    try {
      const codeSnap = await db.collection(REDEEM_CODES_COLLECTION).doc(generatedCode).get();
      if (codeSnap.exists) {
        const cd = codeSnap.data() as {
          totalUses?:     number;
          remainingUses?: number;
          expiresAt?:     { toDate(): Date } | Date | null;
          displayName?:   string;
        };
        const expiresAtIso = cd.expiresAt
          ? (cd.expiresAt instanceof Date
              ? cd.expiresAt.toISOString()
              : (cd.expiresAt as { toDate(): Date }).toDate().toISOString())
          : null;
        codeDetail = {
          totalUses:     cd.totalUses,
          remainingUses: cd.remainingUses,
          expiresAt:     expiresAtIso,
          displayName:   cd.displayName,
        };
      }
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    ok:         true,
    status:     "paid",
    redeemCode: generatedCode,
    codeDetail,
    message:    "同步成功",
  });
}
