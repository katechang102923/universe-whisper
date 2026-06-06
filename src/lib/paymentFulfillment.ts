/**
 * paymentFulfillment.ts
 *
 * 共用的「付款交付」函式。
 * 呼叫後會：
 *  1. 確認訂單存在
 *  2. 若已有 redeemCode → 幂等回傳（不重複產生）
 *  3. 若尚無 redeemCode → Transaction 內產生唯一碼、建立 redeemCodes 文件、更新 paymentOrders
 *  4. 若 buyerEmail 存在且 emailSent !== true → 直接呼叫 Resend API 寄出通行碼 Email
 *  5. 寄信成功寫入 emailSent / emailSentAt；失敗寫入 emailError（不讓主流程失敗）
 *
 * 安全：HashKey / HashIV 不在此函式內使用，不回傳前端。
 */

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getTaipeiDate } from "@/lib/rateLimit";
import {
  PAYMENT_ORDERS_COLLECTION,
  REDEEM_CODES_COLLECTION,
  REDEEM_PLANS,
  REDEEM_CODE_EXPIRY_DAYS,
  generateRedeemCode,
  type RedeemPlan,
} from "@/lib/redeemCodes";
import { sendRedeemCodeEmail } from "@/lib/sendRedeemCodeEmail";

// ── 型別 ──────────────────────────────────────────────────────────────────────

export interface FulfillResult {
  redeemCode:       string;
  redeemCodeId:     string;
  planName:         RedeemPlan;
  displayName:      string;
  totalUses:        number;
  remainingUses:    number;
  expiresAt:        Date;
  emailSent:        boolean;
  emailMessageId?:  string;
  emailError?:      string;
  alreadyFulfilled: boolean;
}

// ── 常數 ──────────────────────────────────────────────────────────────────────

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

// ── 工具函式 ──────────────────────────────────────────────────────────────────

function resolvePlanName(planId?: string, planName?: string): RedeemPlan {
  return (
    PLAN_KEY_MAP[planId ?? ""] ??
    PLAN_NAME_MAP[planName ?? ""] ??
    "single"
  );
}

function resolveTimestamp(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object" && "toDate" in v) return (v as { toDate(): Date }).toDate();
  if (typeof v === "object" && "seconds" in v) {
    return new Date((v as { seconds: number }).seconds * 1000);
  }
  return null;
}

// ── Email 寄送（使用共用工具函式） ───────────────────────────────────────────

async function sendRedeemEmailDirect(opts: {
  email:         string;
  code:          string;
  planName:      RedeemPlan;
  displayName:   string;
  totalUses:     number;
  remainingUses: number;
  expiresAt:     Date;
}): Promise<{ emailSent: boolean; emailMessageId?: string; emailError?: string }> {
  const result = await sendRedeemCodeEmail({
    to:            opts.email,
    code:          opts.code,
    displayName:   opts.displayName,
    totalUses:     opts.totalUses,
    remainingUses: opts.remainingUses,
    expiresAt:     opts.expiresAt,
  });
  return {
    emailSent:      result.ok,
    emailMessageId: result.messageId,
    emailError:     result.ok ? undefined : result.errorMsg,
  };
}

// ── 主函式 ────────────────────────────────────────────────────────────────────

/**
 * fulfillPaidOrder
 *
 * 付款交付主函式。幂等安全，可多次呼叫同一筆訂單。
 *
 * @param opts.merchantTradeNo  綠界 MerchantTradeNo
 * @param opts.providerPayload  綠界回傳欄位（用於更新 TradeNo / PaymentDate 等，可為空物件）
 * @param opts.source           呼叫來源標記（用於 log）
 */
export async function fulfillPaidOrder(opts: {
  merchantTradeNo:  string;
  providerPayload?: Record<string, string>;
  source?:          string;
}): Promise<FulfillResult> {
  const { merchantTradeNo, providerPayload = {}, source = "unknown" } = opts;
  const db = getAdminDb();

  console.log("[ECPay Fulfillment] start", { merchantTradeNo, source });

  // ── 查找訂單 ──────────────────────────────────────────────────────────────
  const orderQuery = await db
    .collection(PAYMENT_ORDERS_COLLECTION)
    .where("merchantTradeNo", "==", merchantTradeNo)
    .limit(1)
    .get();

  if (orderQuery.empty) {
    throw new Error(`訂單不存在：${merchantTradeNo}`);
  }

  const orderDoc  = orderQuery.docs[0];
  const orderData = orderDoc.data() as {
    status:        string;
    planId?:       string;
    planName?:     string;
    buyerEmail?:   string;
    redeemCode?:   string;
    redeemCodeId?: string;
    amount?:       number;
    isTest?:       boolean;
    userId?:       string;
    emailSent?:    boolean;
    merchantTradeNo?: string;
  };

  const planName   = resolvePlanName(orderData.planId, orderData.planName);
  const plan       = REDEEM_PLANS[planName];
  const buyerEmail = orderData.buyerEmail;

  // ── 幂等：已有通行碼 ─────────────────────────────────────────────────────
  if (orderData.redeemCode) {
    const existingCode = orderData.redeemCode;
    console.log("[ECPay Fulfillment] already fulfilled", { merchantTradeNo, code: existingCode });

    // 讀取通行碼詳情（取得正確 expiresAt / remainingUses）
    let expiresAt     = new Date(Date.now() + REDEEM_CODE_EXPIRY_DAYS * 86400000);
    let totalUses     = plan.totalUses;
    let remainingUses = plan.totalUses;
    try {
      const codeSnap = await db.collection(REDEEM_CODES_COLLECTION).doc(existingCode).get();
      if (codeSnap.exists) {
        const cd = codeSnap.data() as {
          totalUses?:     number;
          remainingUses?: number;
          expiresAt?:     unknown;
        };
        totalUses     = cd.totalUses     ?? plan.totalUses;
        remainingUses = cd.remainingUses ?? plan.totalUses;
        expiresAt     = resolveTimestamp(cd.expiresAt) ?? expiresAt;
      }
    } catch { /* 讀取失敗不影響主流程 */ }

    // 若 buyerEmail 存在且還沒寄 → 補寄
    let emailSent      = orderData.emailSent ?? false;
    let emailMessageId: string | undefined;
    let emailError:     string | undefined;
    if (buyerEmail && !emailSent) {
      const result = await sendRedeemEmailDirect({
        email: buyerEmail, code: existingCode, planName,
        displayName: plan.displayName, totalUses, remainingUses, expiresAt,
      });
      emailSent      = result.emailSent;
      emailMessageId = result.emailMessageId;
      emailError     = result.emailError;
      // 寫回 Firestore
      try {
        const update: Record<string, unknown> = { emailSent, emailSentAt: FieldValue.serverTimestamp() };
        if (emailError) update.emailError = emailError;
        await Promise.all([
          orderDoc.ref.update(update),
          db.collection(REDEEM_CODES_COLLECTION).doc(existingCode).update(update),
        ]);
      } catch { /* 寫入失敗不影響回傳 */ }
    }

    return {
      redeemCode:       existingCode,
      redeemCodeId:     existingCode,
      planName,
      displayName:      plan.displayName,
      totalUses,
      remainingUses,
      expiresAt,
      emailSent,
      emailMessageId,
      emailError,
      alreadyFulfilled: true,
    };
  }

  // ── 產生新通行碼（Transaction） ───────────────────────────────────────────
  let generatedCode = "";
  const expiresAt   = new Date(Date.now() + REDEEM_CODE_EXPIRY_DAYS * 86400000);

  await db.runTransaction(async (tx) => {
    // 再次讀取，防止並發競爭
    const freshSnap = await tx.get(orderDoc.ref);
    const fresh     = freshSnap.data() as typeof orderData;

    if (fresh.redeemCode) {
      generatedCode = fresh.redeemCode;
      return;
    }

    // 產生唯一碼
    let code = "";
    for (let i = 0; i < 10; i++) {
      const candidate = generateRedeemCode();
      const snap = await tx.get(db.collection(REDEEM_CODES_COLLECTION).doc(candidate));
      if (!snap.exists) { code = candidate; break; }
    }
    if (!code) throw new Error("無法產生唯一通行碼，請重試");
    generatedCode = code;

    const resolvedMerchantTradeNo =
      (fresh as { merchantTradeNo?: string }).merchantTradeNo ?? merchantTradeNo;

    // 建立 redeemCodes 文件
    tx.set(db.collection(REDEEM_CODES_COLLECTION).doc(code), {
      code,
      planName,
      displayName:      plan.displayName,
      price:            plan.price,
      totalUses:        plan.totalUses,
      remainingUses:    plan.totalUses,
      status:           "active",
      source:           "ecpay_paid",
      paymentOrderId:   orderDoc.id,
      merchantTradeNo:  resolvedMerchantTradeNo,
      ecpayTradeNo:     providerPayload.TradeNo ?? null,
      amount:           fresh.amount ?? plan.price,
      buyerEmail:       fresh.buyerEmail ?? null,
      userId:           fresh.userId ?? null,
      emailSent:        false,
      createdAt:        FieldValue.serverTimestamp(),
      expiresAt,
      usedLogs:         [],
      isTest:           fresh.isTest ?? false,
    });

    // 更新 paymentOrders
    const orderUpdate: Record<string, unknown> = {
      status:       "paid",
      redeemCode:   code,
      redeemCodeId: code,
      paidAt:       FieldValue.serverTimestamp(),
      paidDateKey:  getTaipeiDate(),
    };
    if (providerPayload.TradeNo)     { orderUpdate.ecpayTradeNo = providerPayload.TradeNo; orderUpdate.tradeNo = providerPayload.TradeNo; }
    if (providerPayload.PaymentType) orderUpdate.paymentType  = providerPayload.PaymentType;
    if (providerPayload.PaymentDate) orderUpdate.paymentDate  = providerPayload.PaymentDate;
    if (providerPayload.TradeAmt)    orderUpdate.tradeAmt     = providerPayload.TradeAmt;
    if (providerPayload.RtnCode)     orderUpdate.rtnCode      = providerPayload.RtnCode;
    if (providerPayload.RtnMsg)      orderUpdate.rtnMsg       = providerPayload.RtnMsg;
    if (providerPayload.auth_code)   orderUpdate.authCode     = providerPayload.auth_code;
    if (providerPayload.card_4no)    orderUpdate.cardLast4    = providerPayload.card_4no;
    if (providerPayload.card_Type)   orderUpdate.cardType     = providerPayload.card_Type;

    tx.update(orderDoc.ref, orderUpdate);
  });

  console.log("[ECPay Fulfillment] redeem code created", { merchantTradeNo, code: generatedCode, source });

  // ── 寄出 Email（Transaction 外，失敗不讓主流程失敗） ─────────────────────
  let emailSent      = false;
  let emailMessageId: string | undefined;
  let emailError:     string | undefined;

  if (generatedCode && buyerEmail) {
    const result = await sendRedeemEmailDirect({
      email: buyerEmail, code: generatedCode, planName,
      displayName: plan.displayName, totalUses: plan.totalUses,
      remainingUses: plan.totalUses, expiresAt,
    });
    emailSent      = result.emailSent;
    emailMessageId = result.emailMessageId;
    emailError     = result.emailError;

    // 寫回 Firestore
    try {
      const update: Record<string, unknown> = { emailSent, emailSentAt: FieldValue.serverTimestamp() };
      if (emailError) update.emailError = emailError;
      await Promise.all([
        orderDoc.ref.update(update),
        db.collection(REDEEM_CODES_COLLECTION).doc(generatedCode).update(update),
      ]);
    } catch (err) {
      console.error("[ECPay Fulfillment] email status write failed", err);
    }
  }

  return {
    redeemCode:       generatedCode,
    redeemCodeId:     generatedCode,
    planName,
    displayName:      plan.displayName,
    totalUses:        plan.totalUses,
    remainingUses:    plan.totalUses,
    expiresAt,
    emailSent,
    emailMessageId,
    emailError,
    alreadyFulfilled: false,
  };
}
