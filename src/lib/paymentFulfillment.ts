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
import {
  PAYMENT_ORDERS_COLLECTION,
  REDEEM_CODES_COLLECTION,
  REDEEM_PLANS,
  REDEEM_CODE_EXPIRY_DAYS,
  generateRedeemCode,
  type RedeemPlan,
} from "@/lib/redeemCodes";

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

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://universe-whisper.vercel.app"
).replace(/\/$/, "");

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

// ── Email 直接呼叫 Resend API（不透過自我 HTTP，避免 Vercel 冷啟動延遲） ─────

async function sendRedeemEmailDirect(opts: {
  email:        string;
  code:         string;
  planName:     RedeemPlan;
  displayName:  string;
  totalUses:    number;
  remainingUses: number;
  expiresAt:    Date;
}): Promise<{ emailSent: boolean; emailError?: string }> {
  const apiKey   = process.env.RESEND_API_KEY;
  const fromAddr = process.env.EMAIL_FROM || "宇宙偷偷話 <noreply@universewhisper.com>";

  if (!apiKey) {
    return { emailSent: false, emailError: "RESEND_API_KEY 未設定" };
  }

  const expiryStr = opts.expiresAt.toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric",
  });

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>你的宇宙通行碼</title>
</head>
<body style="background:#0d0d1a;color:#e8e0f0;font-family:'Helvetica Neue',Arial,sans-serif;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;">
    <p style="font-size:11px;letter-spacing:0.3em;color:#9b8fd4;text-transform:uppercase;margin:0 0 28px;">
      宇宙偷偷話 · Universe Whisper
    </p>
    <h1 style="font-size:26px;font-weight:600;color:#f0eaff;margin:0 0 6px;">購買成功！你的宇宙通行碼</h1>
    <p style="font-size:13px;color:#7a6fa0;margin:0 0 36px;">請妥善保存此通行碼，不綁帳號，可自行使用或分享。</p>

    <div style="background:rgba(216,189,112,0.08);border:1.5px solid rgba(216,189,112,0.35);border-radius:16px;padding:28px 24px;text-align:center;margin-bottom:28px;">
      <p style="font-size:11px;letter-spacing:0.3em;color:#d8bd70;text-transform:uppercase;margin:0 0 12px;">宇宙通行碼</p>
      <p style="font-family:monospace;font-size:28px;font-weight:700;letter-spacing:0.18em;color:#d8bd70;margin:0 0 20px;">${opts.code}</p>
      <table style="width:100%;border-collapse:collapse;text-align:left;">
        <tr><td style="padding:5px 0;font-size:13px;color:#9b8fd4;width:45%;">方案</td><td style="padding:5px 0;font-size:13px;color:#e8e0f0;">${opts.displayName}</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#9b8fd4;">可用次數</td><td style="padding:5px 0;font-size:13px;color:#e8e0f0;">${opts.totalUses} 次</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#9b8fd4;">有效期限</td><td style="padding:5px 0;font-size:13px;color:#e8e0f0;">${expiryStr} 前</td></tr>
      </table>
    </div>

    <div style="background:rgba(155,143,212,0.07);border:1px solid rgba(155,143,212,0.16);border-radius:14px;padding:20px 22px;margin-bottom:24px;">
      <p style="font-size:11px;letter-spacing:0.22em;color:#9b8fd4;margin:0 0 10px;text-transform:uppercase;">使用方式</p>
      <ol style="font-size:14px;line-height:1.9;color:#e8e0f0;margin:0;padding-left:20px;">
        <li>回到宇宙偷偷話網站</li>
        <li>進入塔羅抽牌頁</li>
        <li>在「已有宇宙通行碼？」欄位輸入此通行碼</li>
        <li>啟用後即可抽牌，每次扣除 1 次</li>
      </ol>
    </div>

    <div style="text-align:center;margin:28px 0;">
      <a href="${SITE_URL}/redeem/check?code=${encodeURIComponent(opts.code)}"
         style="display:inline-block;background:#d8bd70;color:#1a0e2e;text-decoration:none;padding:13px 32px;border-radius:100px;font-size:14px;font-weight:600;">
        查詢剩餘次數
      </a>
    </div>

    <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:20px;">
      <p style="font-size:12px;color:#6a5f88;line-height:1.9;margin:0;">
        · 此通行碼不綁帳號，可自行使用，也可分享給朋友。<br/>
        · 如有問題，請聯繫 <a href="mailto:ciut0000@gmail.com" style="color:#9b8fd4;">ciut0000@gmail.com</a>
      </p>
    </div>
    <p style="margin-top:32px;font-size:12px;color:#4a4265;text-align:center;">
      宇宙偷偷話 · Universe Whisper<br/>此信件由系統自動發送。
    </p>
  </div>
</body>
</html>`;

  const text = [
    "宇宙偷偷話｜你的宇宙通行碼",
    "",
    "購買成功！",
    `你的宇宙通行碼：${opts.code}`,
    "",
    `方案：${opts.displayName}`,
    `可用次數：${opts.totalUses} 次`,
    `有效期限：${expiryStr} 前`,
    "",
    "【使用方式】",
    "1. 回到宇宙偷偷話網站",
    "2. 進入塔羅抽牌頁",
    "3. 在「已有宇宙通行碼？」欄位輸入此通行碼",
    "4. 啟用後即可抽牌，每次扣除 1 次",
    "",
    `查詢剩餘次數：${SITE_URL}/redeem/check?code=${encodeURIComponent(opts.code)}`,
    "",
    "· 此通行碼不綁帳號，可自行使用，也可分享給朋友。",
    "· 如有問題，請聯繫 ciut0000@gmail.com",
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    fromAddr,
        to:      [opts.email],
        subject: "宇宙偷偷話｜你的宇宙通行碼",
        html,
        text,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const msg = `Resend HTTP ${res.status}: ${errText.slice(0, 200)}`;
      console.error("[ECPay Fulfillment] email failed", msg);
      return { emailSent: false, emailError: msg };
    }

    console.log("[ECPay Fulfillment] email sent", { email: opts.email, code: opts.code });
    return { emailSent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ECPay Fulfillment] email exception", msg);
    return { emailSent: false, emailError: msg.slice(0, 200) };
  }
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
    let emailSent  = orderData.emailSent ?? false;
    let emailError: string | undefined;
    if (buyerEmail && !emailSent) {
      const result = await sendRedeemEmailDirect({
        email: buyerEmail, code: existingCode, planName,
        displayName: plan.displayName, totalUses, remainingUses, expiresAt,
      });
      emailSent  = result.emailSent;
      emailError = result.emailError;
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
  let emailSent  = false;
  let emailError: string | undefined;

  if (generatedCode && buyerEmail) {
    const result = await sendRedeemEmailDirect({
      email: buyerEmail, code: generatedCode, planName,
      displayName: plan.displayName, totalUses: plan.totalUses,
      remainingUses: plan.totalUses, expiresAt,
    });
    emailSent  = result.emailSent;
    emailError = result.emailError;

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
    emailError,
    alreadyFulfilled: false,
  };
}
