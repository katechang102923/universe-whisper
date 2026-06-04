import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { PAYMENT_ORDERS_COLLECTION, REDEEM_CODES_COLLECTION } from "@/lib/redeemCodes";

export const runtime = "nodejs";

function toIso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && "toDate" in v) {
    return (v as { toDate(): Date }).toDate().toISOString();
  }
  return null;
}

/** 遮罩 Email：a***@gmail.com */
function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.replace(/^(.).*@/, (_, c: string) => `${c}***@`);
}

export async function GET(req: NextRequest) {
  const merchantTradeNo = req.nextUrl.searchParams.get("merchantTradeNo");

  if (!merchantTradeNo) {
    return NextResponse.json({ ok: false, error: "MISSING_TRADE_NO" }, { status: 400 });
  }

  try {
    const db   = getAdminDb();
    const snap = await db
      .collection(PAYMENT_ORDERS_COLLECTION)
      .where("merchantTradeNo", "==", merchantTradeNo)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }

    const data = snap.docs[0].data() as {
      status:           string;
      planName?:        string;
      amount?:          number;
      redeemCode?:      string;
      redeemCodeId?:    string;
      buyerEmail?:      string;
      emailSent?:       boolean;
      emailSentAt?:     unknown;
      emailError?:      string;
      paidAt?:          unknown;
      paymentDate?:     string;
      merchantTradeNo?: string;
      ecpayTradeNo?:    string;
      tradeNo?:         string;
      rtnCode?:         string;
      rtnMsg?:          string;
      tradeAmt?:        string;
    };

    // 已付款才撈通行碼詳細資料
    let codeDetail: {
      totalUses?:     number;
      remainingUses?: number;
      expiresAt?:     string | null;
      displayName?:   string;
    } | null = null;

    if (data.status === "paid" && data.redeemCode) {
      const codeSnap = await db
        .collection(REDEEM_CODES_COLLECTION)
        .doc(data.redeemCode)
        .get();
      if (codeSnap.exists) {
        const cd = codeSnap.data() as {
          totalUses?:     number;
          remainingUses?: number;
          expiresAt?:     unknown;
          displayName?:   string;
        };
        codeDetail = {
          totalUses:     cd.totalUses,
          remainingUses: cd.remainingUses,
          expiresAt:     toIso(cd.expiresAt),
          displayName:   cd.displayName,
        };
      }
    }

    return NextResponse.json({
      ok:               true,
      status:           data.status,
      merchantTradeNo:  data.merchantTradeNo ?? merchantTradeNo,
      planName:         data.planName ?? "",
      amount:           data.amount ?? 0,
      // 只在已付款且已產生通行碼時才回傳
      redeemCode:       data.status === "paid" ? (data.redeemCode ?? null) : null,
      redeemCodeId:     data.status === "paid" ? (data.redeemCodeId ?? data.redeemCode ?? null) : null,
      paidAt:           toIso(data.paidAt),
      paymentDate:      data.paymentDate ?? null,
      codeDetail,
      // ECPay 付款資料
      ecpayTradeNo:     data.ecpayTradeNo ?? data.tradeNo ?? null,
      tradeNo:          data.tradeNo ?? data.ecpayTradeNo ?? null,
      rtnCode:          data.rtnCode ?? null,
      rtnMsg:           data.rtnMsg ?? null,
      tradeAmt:         data.tradeAmt ?? null,
      // Email 相關（遮罩 Email 位址）
      buyerEmail:       maskEmail(data.buyerEmail),
      emailSent:        data.emailSent ?? false,
      emailSentAt:      toIso(data.emailSentAt),
      emailError:       data.emailError ?? null,
    });
  } catch (err) {
    console.error("[ecpay/order-status] error:", err);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
