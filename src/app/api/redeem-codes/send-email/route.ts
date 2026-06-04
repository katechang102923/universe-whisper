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
  | "MISSING_REDEEM_CODE"
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
    redeemCode?:      string;   // 優先：畫面上已顯示的通行碼
    code?:            string;   // 別名
    merchantTradeNo?: string;   // 次要：用於查 paymentOrders
    email?:           string;   // 收件人（空白時用 buyerEmail）
  };

  const codeInput         = (body.redeemCode ?? body.code ?? "").trim();
  const merchantTradeNo   = (body.merchantTradeNo ?? "").trim();
  const emailInput        = (body.email ?? "").trim();

  console.log("[Email] send redeem code start", {
    hasCode:            Boolean(codeInput),
    hasMerchantTradeNo: Boolean(merchantTradeNo),
    hasEmail:           Boolean(emailInput),
  });

  // 兩個識別符都沒有 → 失敗
  if (!codeInput && !merchantTradeNo) {
    console.warn("[Email] missing both redeemCode and merchantTradeNo");
    return fail(
      "MISSING_REDEEM_CODE",
      "缺少通行碼，無法寄送 Email。請重新整理頁面後再試。",
    );
  }

  // email 格式驗證（有傳才驗）
  if (emailInput && !validateEmail(emailInput)) {
    console.warn("[Email] invalid email format");
    return fail("INVALID_EMAIL", "Email 格式不正確，請確認後再試。");
  }

  const db = getAdminDb();

  let redeemCode    = codeInput;
  let buyerEmail    = "";
  let displayName   = "宇宙通行碼";
  let totalUses     = 1;
  let remainingUses = 1;
  let expiresAt     = new Date(Date.now() + REDEEM_CODE_EXPIRY_DAYS * 86400000);
  let orderDocRef:  FirebaseFirestore.DocumentReference | null = null;
  let codeDocRef:   FirebaseFirestore.DocumentReference | null = null;

  // ── 路徑 A：有 redeemCode → 直接查 redeemCodes ────────────────────────────
  if (redeemCode) {
    const codeSnap = await db.collection(REDEEM_CODES_COLLECTION).doc(redeemCode).get();
    if (codeSnap.exists) {
      const cd = codeSnap.data() as {
        displayName?:  string;
        totalUses?:    number;
        remainingUses?: number;
        expiresAt?:    unknown;
        buyerEmail?:   string;
        merchantTradeNo?: string;
      };
      displayName   = cd.displayName   ?? displayName;
      totalUses     = cd.totalUses     ?? totalUses;
      remainingUses = cd.remainingUses ?? remainingUses;
      expiresAt     = resolveTimestamp(cd.expiresAt) ?? expiresAt;
      buyerEmail    = cd.buyerEmail    ?? "";
      codeDocRef    = codeSnap.ref;

      // 也嘗試找 paymentOrder（用於更新 emailSent）
      const tradeNo = merchantTradeNo || cd.merchantTradeNo || "";
      if (tradeNo) {
        const orderSnap = await db
          .collection(PAYMENT_ORDERS_COLLECTION)
          .where("merchantTradeNo", "==", tradeNo)
          .limit(1)
          .get();
        if (!orderSnap.empty) {
          orderDocRef = orderSnap.docs[0].ref;
          const od = orderSnap.docs[0].data() as { buyerEmail?: string };
          buyerEmail = buyerEmail || od.buyerEmail || "";
        }
      }
    } else {
      console.warn("[Email] redeemCode doc not found in Firestore", { redeemCode });
      // 繼續嘗試 merchantTradeNo 路徑
    }
  }

  // ── 路徑 B：沒有 redeemCode 或 Firestore 查不到 → 用 merchantTradeNo ──────
  if (!redeemCode && merchantTradeNo) {
    const orderSnap = await db
      .collection(PAYMENT_ORDERS_COLLECTION)
      .where("merchantTradeNo", "==", merchantTradeNo)
      .limit(1)
      .get();

    if (orderSnap.empty) {
      console.error("[Email] order not found", { merchantTradeNo });
      return fail("ORDER_NOT_FOUND", "找不到訂單資料，請複製通行碼並聯繫客服。", 404);
    }

    const od = orderSnap.docs[0].data() as {
      redeemCode?: string; buyerEmail?: string; planName?: string;
    };
    orderDocRef = orderSnap.docs[0].ref;
    redeemCode  = od.redeemCode ?? "";
    buyerEmail  = od.buyerEmail ?? "";
    displayName = od.planName ?? displayName;

    if (!redeemCode) {
      console.error("[Email] redeem code not found in order", { merchantTradeNo });
      return fail("REDEEM_CODE_NOT_FOUND", "找不到通行碼，請聯繫客服。", 404);
    }

    // 補查 redeemCodes 詳細資料
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
    }
  }

  // 最終確認 redeemCode 存在
  if (!redeemCode) {
    return fail("REDEEM_CODE_NOT_FOUND", "找不到通行碼，請聯繫客服。", 404);
  }

  // 決定收件人 email
  const toEmail = emailInput || buyerEmail;
  if (!toEmail || !validateEmail(toEmail)) {
    return fail("INVALID_EMAIL", "請輸入要接收備份的 Email。");
  }

  // ── 寄送 Email ────────────────────────────────────────────────────────────
  const result = await sendRedeemCodeEmail({
    to: toEmail, code: redeemCode,
    displayName, totalUses, remainingUses, expiresAt,
  });

  // ── 更新 Firestore ────────────────────────────────────────────────────────
  const now = FieldValue.serverTimestamp();
  try {
    const updates: Promise<unknown>[] = [];
    const u = result.ok
      ? { emailSent: true,  emailSentAt: now, emailError: null }
      : { emailSent: false, emailError: result.errorMsg ?? "寄送失敗" };
    if (orderDocRef) updates.push(orderDocRef.update(u));
    if (codeDocRef)  updates.push(codeDocRef.update(u));
    await Promise.all(updates);
  } catch (e) {
    console.error("[Email] firestore update failed", e);
  }

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
