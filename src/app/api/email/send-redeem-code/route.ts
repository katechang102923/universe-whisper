/**
 * POST /api/email/send-redeem-code
 *
 * 已遷移到 /api/redeem-codes/send-email。
 * 此路由保留為相容層，直接轉發請求。
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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    merchantTradeNo?: string;
    redeemCode?:      string;
    code?:            string;   // 別名
    email?:           string;
  };

  const merchantTradeNo = (body.merchantTradeNo ?? "").trim();
  const emailInput      = (body.email ?? "").trim();
  // 支援 redeemCode 或 code 兩種欄位名稱
  const codeInput       = (body.redeemCode ?? body.code ?? "").trim();

  console.log("[Email] send redeem code start", {
    hasCode:            Boolean(codeInput),
    hasMerchantTradeNo: Boolean(merchantTradeNo),
    hasEmail:           Boolean(emailInput),
  });

  if (!merchantTradeNo && !codeInput) {
    return NextResponse.json(
      { ok: false, errorCode: "MISSING_REDEEM_CODE", message: "缺少通行碼，無法寄送 Email。請重新整理頁面後再試。" },
      { status: 400 },
    );
  }
  if (emailInput && !validateEmail(emailInput)) {
    return NextResponse.json({ ok: false, errorCode: "INVALID_EMAIL", message: "Email 格式不正確，請確認後再試。" }, { status: 400 });
  }

  const db = getAdminDb();
  let orderDocRef:  FirebaseFirestore.DocumentReference | null = null;
  let codeDocRef:   FirebaseFirestore.DocumentReference | null = null;
  let redeemCode    = codeInput;   // 優先使用前端傳入的通行碼
  let buyerEmail    = "";
  let displayName   = "宇宙通行碼";
  let totalUses     = 1;
  let remainingUses = 1;
  let expiresAt     = new Date(Date.now() + REDEEM_CODE_EXPIRY_DAYS * 86400000);

  // 路徑 A：有 redeemCode → 直接查 redeemCodes
  if (redeemCode) {
    const codeSnap = await db.collection(REDEEM_CODES_COLLECTION).doc(redeemCode).get();
    if (codeSnap.exists) {
      const cd = codeSnap.data() as {
        displayName?: string; totalUses?: number; remainingUses?: number;
        expiresAt?: unknown; buyerEmail?: string; merchantTradeNo?: string;
      };
      displayName   = cd.displayName   ?? displayName;
      totalUses     = cd.totalUses     ?? totalUses;
      remainingUses = cd.remainingUses ?? remainingUses;
      expiresAt     = resolveTimestamp(cd.expiresAt) ?? expiresAt;
      buyerEmail    = cd.buyerEmail    ?? "";
      codeDocRef    = codeSnap.ref;

      // 嘗試找 paymentOrder 以更新 emailSent
      const tradeNo = merchantTradeNo || cd.merchantTradeNo || "";
      if (tradeNo) {
        const oSnap = await db.collection(PAYMENT_ORDERS_COLLECTION).where("merchantTradeNo", "==", tradeNo).limit(1).get();
        if (!oSnap.empty) {
          orderDocRef = oSnap.docs[0].ref;
          const od = oSnap.docs[0].data() as { buyerEmail?: string };
          buyerEmail = buyerEmail || od.buyerEmail || "";
        }
      }
    }
  }

  // 路徑 B：沒有 redeemCode → 用 merchantTradeNo 查
  if (!redeemCode && merchantTradeNo) {
    const snap = await db.collection(PAYMENT_ORDERS_COLLECTION).where("merchantTradeNo", "==", merchantTradeNo).limit(1).get();
    if (snap.empty) {
      return NextResponse.json({ ok: false, errorCode: "ORDER_NOT_FOUND", message: "找不到訂單資料，請複製通行碼並聯繫客服。" }, { status: 404 });
    }
    const od = snap.docs[0].data() as { redeemCode?: string; buyerEmail?: string; planName?: string };
    orderDocRef = snap.docs[0].ref;
    redeemCode  = od.redeemCode ?? "";
    buyerEmail  = od.buyerEmail ?? "";
    displayName = od.planName ?? displayName;

    if (!redeemCode) {
      return NextResponse.json({ ok: false, errorCode: "REDEEM_CODE_NOT_FOUND", message: "找不到通行碼，請聯繫客服。" }, { status: 404 });
    }

    const codeSnap = await db.collection(REDEEM_CODES_COLLECTION).doc(redeemCode).get();
    if (codeSnap.exists) {
      const cd = codeSnap.data() as { displayName?: string; totalUses?: number; remainingUses?: number; expiresAt?: unknown };
      displayName   = cd.displayName   ?? displayName;
      totalUses     = cd.totalUses     ?? totalUses;
      remainingUses = cd.remainingUses ?? remainingUses;
      expiresAt     = resolveTimestamp(cd.expiresAt) ?? expiresAt;
      codeDocRef    = codeSnap.ref;
    }
  }

  if (!redeemCode) {
    return NextResponse.json({ ok: false, errorCode: "REDEEM_CODE_NOT_FOUND", message: "找不到通行碼，請聯繫客服。" }, { status: 404 });
  }

  const toEmail = emailInput || buyerEmail;
  if (!toEmail || !validateEmail(toEmail)) {
    return NextResponse.json({ ok: false, errorCode: "INVALID_EMAIL", message: "請輸入要接收備份的 Email。" }, { status: 400 });
  }

  const result = await sendRedeemCodeEmail({ to: toEmail, code: redeemCode, displayName, totalUses, remainingUses, expiresAt });

  const now = FieldValue.serverTimestamp();
  try {
    const updates: Promise<unknown>[] = [];
    if (result.ok) {
      const u = { emailSent: true, emailSentAt: now, emailError: null };
      if (orderDocRef) updates.push(orderDocRef.update(u));
      if (codeDocRef)  updates.push(codeDocRef.update(u));
    } else {
      const u = { emailSent: false, emailError: result.errorMsg ?? "寄送失敗" };
      if (orderDocRef) updates.push(orderDocRef.update(u));
      if (codeDocRef)  updates.push(codeDocRef.update(u));
    }
    await Promise.all(updates);
  } catch { /* 寫入失敗不影響回傳 */ }

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      errorCode: result.errorCode ?? "UNKNOWN_ERROR",
      message: result.errorCode === "MISSING_ENV"
        ? "Email 系統尚未設定完成，請先複製通行碼保存，或聯繫客服補寄。"
        : "Email 備份寄送失敗，不影響通行碼使用。請先複製通行碼保存，或稍後再試。",
    }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "已寄出通行碼，請到信箱確認。" });
}
