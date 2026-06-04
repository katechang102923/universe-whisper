/**
 * POST /api/redeem-codes/send-email
 *
 * 寄送宇宙通行碼 Email 的正式 API。
 *
 * 安全設計：
 *  - RESEND_API_KEY 只在 server side，不回傳前端。
 *  - redeemCode 由 server 從 Firestore 查出，不信任前端傳入的 code 值。
 *  - 寄送目標 email：
 *    1. 若前端有傳且格式正確 → 使用前端傳入的 email
 *    2. 若前端未傳或傳空 → 使用 paymentOrders.buyerEmail
 *  - 寄送成功後更新 Firestore emailSent / emailSentAt（paymentOrders + redeemCodes）。
 *  - 失敗時回傳可判斷的 errorCode。
 */
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  PAYMENT_ORDERS_COLLECTION,
  REDEEM_CODES_COLLECTION,
  REDEEM_CODE_EXPIRY_DAYS,
} from "@/lib/redeemCodes";
import { sendRedeemCodeEmail } from "@/lib/sendRedeemCodeEmail";

export const runtime = "nodejs";

// ── 型別 ──────────────────────────────────────────────────────────────────────

type ApiErrorCode =
  | "MISSING_FIELD"
  | "INVALID_EMAIL"
  | "ORDER_NOT_FOUND"
  | "REDEEM_CODE_NOT_FOUND"
  | "MISSING_ENV"
  | "RESEND_FAILED"
  | "UNKNOWN_ERROR";

function fail(
  errorCode: ApiErrorCode,
  message:   string,
  status = 400,
) {
  return NextResponse.json({ ok: false, errorCode, message }, { status });
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function resolveTimestamp(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object" && "toDate" in v) return (v as { toDate(): Date }).toDate();
  if (typeof v === "object" && "seconds" in v)
    return new Date((v as { seconds: number }).seconds * 1000);
  return null;
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    merchantTradeNo?: string;
    email?:           string;
  };

  const merchantTradeNo = (body.merchantTradeNo ?? "").trim();
  const emailInput      = (body.email ?? "").trim();

  console.log("[Email] send redeem code start", {
    merchantTradeNo,
    hasEmail: Boolean(emailInput),
  });

  if (!merchantTradeNo) {
    return fail("MISSING_FIELD", "缺少訂單編號（merchantTradeNo）。");
  }

  // ── 驗證 email 格式（有傳才驗） ───────────────────────────────────────────
  if (emailInput && !validateEmail(emailInput)) {
    console.warn("[Email] invalid email format", { emailInput });
    return fail("INVALID_EMAIL", "Email 格式不正確，請確認後再試。");
  }

  const db = getAdminDb();

  // ── 查找 paymentOrder ─────────────────────────────────────────────────────
  const orderSnap = await db
    .collection(PAYMENT_ORDERS_COLLECTION)
    .where("merchantTradeNo", "==", merchantTradeNo)
    .limit(1)
    .get();

  if (orderSnap.empty) {
    console.error("[Email] order not found", { merchantTradeNo });
    return fail("ORDER_NOT_FOUND", "找不到訂單資料，請複製通行碼並聯繫客服。", 404);
  }

  const orderDoc  = orderSnap.docs[0];
  const orderData = orderDoc.data() as {
    redeemCode?:   string;
    buyerEmail?:   string;
    planName?:     string;
  };

  // ── 決定寄送目標 email ────────────────────────────────────────────────────
  const toEmail = emailInput || orderData.buyerEmail || "";
  if (!toEmail) {
    return fail("INVALID_EMAIL", "請輸入要接收備份的 Email。");
  }
  if (!validateEmail(toEmail)) {
    return fail("INVALID_EMAIL", "Email 格式不正確，請確認後再試。");
  }

  // ── 確認通行碼 ────────────────────────────────────────────────────────────
  const redeemCode = orderData.redeemCode ?? "";
  if (!redeemCode) {
    console.error("[Email] redeem code not found in order", { merchantTradeNo });
    return fail("REDEEM_CODE_NOT_FOUND", "找不到通行碼，請聯繫客服。", 404);
  }

  // ── 從 redeemCodes 取詳細資料 ─────────────────────────────────────────────
  let displayName   = orderData.planName ?? "宇宙通行碼";
  let totalUses     = 1;
  let remainingUses = 1;
  let expiresAt     = new Date(Date.now() + REDEEM_CODE_EXPIRY_DAYS * 86400000);
  let codeDocRef: FirebaseFirestore.DocumentReference | null = null;

  const codeSnap = await db.collection(REDEEM_CODES_COLLECTION).doc(redeemCode).get();
  if (codeSnap.exists) {
    const cd = codeSnap.data() as {
      displayName?:  string;
      totalUses?:    number;
      remainingUses?: number;
      expiresAt?:    unknown;
    };
    displayName   = cd.displayName   ?? displayName;
    totalUses     = cd.totalUses     ?? totalUses;
    remainingUses = cd.remainingUses ?? remainingUses;
    expiresAt     = resolveTimestamp(cd.expiresAt) ?? expiresAt;
    codeDocRef    = codeSnap.ref;
  } else {
    console.warn("[Email] redeemCode doc not found, using order defaults", { redeemCode });
  }

  // ── 寄送 Email ────────────────────────────────────────────────────────────
  const result = await sendRedeemCodeEmail({
    to: toEmail,
    code: redeemCode,
    displayName,
    totalUses,
    remainingUses,
    expiresAt,
  });

  // ── 更新 Firestore ────────────────────────────────────────────────────────
  const now = FieldValue.serverTimestamp();
  try {
    const updates: Promise<unknown>[] = [];
    if (result.ok) {
      const update = { emailSent: true, emailSentAt: now, emailError: null };
      updates.push(orderDoc.ref.update(update));
      if (codeDocRef) updates.push(codeDocRef.update(update));
    } else {
      const update = { emailSent: false, emailError: result.errorMsg ?? "寄送失敗" };
      updates.push(orderDoc.ref.update(update));
      if (codeDocRef) updates.push(codeDocRef.update(update));
    }
    await Promise.all(updates);
  } catch (e) {
    console.error("[Email] firestore update failed", e);
  }

  // ── 回傳 ─────────────────────────────────────────────────────────────────
  if (!result.ok) {
    return NextResponse.json(
      {
        ok:        false,
        errorCode: result.errorCode ?? "UNKNOWN_ERROR",
        message:   result.errorCode === "MISSING_ENV"
          ? "Email 系統尚未設定完成，請先複製通行碼保存，或聯繫客服補寄。"
          : result.errorCode === "RESEND_FAILED"
          ? "Email 備份寄送失敗，可能是寄信服務暫時異常。請先複製通行碼保存，稍後再試。"
          : "Email 備份寄送失敗，不影響通行碼使用。請先複製通行碼保存，或稍後再試。",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, message: "已寄出通行碼，請到信箱確認。" });
}
