/**
 * GET /api/ecpay/diagnostics
 *
 * 只做診斷與回報，不修改任何金流設定，也不回傳任何密鑰（HashKey / HashIV / token）。
 * 用於確認 stage/production 設定、ReturnURL/OrderResultURL 是否指向正式站，
 * 以及（可選）某筆訂單目前在 Firestore 的狀態與 isTest。
 *
 * 權限：僅管理員（Google session cookie 或 LINE admin id）。
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getAdminUserIds } from "@/lib/rateLimit";
import { verifyAdminSessionCookie, SESSION_COOKIE_NAME } from "@/lib/verifyAdmin";
import { getEcpayConfigDiagnostics } from "@/lib/ecpay";
import { PAYMENT_ORDERS_COLLECTION } from "@/lib/redeemCodes";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // ── 管理員驗證 ─────────────────────────────────────────────────────────────
  const cookieStore   = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const isGoogleAdmin = await verifyAdminSessionCookie(sessionCookie);
  const lineUserId    = cookieStore.get("line_user_id")?.value ?? null;
  const isLineAdmin   = Boolean(lineUserId && getAdminUserIds().includes(lineUserId));

  if (!isGoogleAdmin && !isLineAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  const config = getEcpayConfigDiagnostics();

  // ── 可選：附帶查詢某筆訂單目前狀態（只讀，不修改） ─────────────────────────
  const merchantTradeNo = req.nextUrl.searchParams.get("merchantTradeNo");
  let order: Record<string, unknown> | null = null;
  if (merchantTradeNo) {
    try {
      const db   = getAdminDb();
      const snap = await db
        .collection(PAYMENT_ORDERS_COLLECTION)
        .where("merchantTradeNo", "==", merchantTradeNo)
        .limit(1)
        .get();
      if (!snap.empty) {
        const d = snap.docs[0].data() as Record<string, unknown>;
        order = {
          collection:      PAYMENT_ORDERS_COLLECTION,
          docId:           snap.docs[0].id,
          merchantTradeNo: d.merchantTradeNo ?? null,
          status:          d.status ?? null,
          isTest:          d.isTest ?? null,
          amount:          d.amount ?? null,
          planName:        d.planName ?? null,
          hasRedeemCode:   Boolean(d.redeemCode),
          ecpayTradeNo:    d.ecpayTradeNo ?? d.tradeNo ?? null,
          rtnCode:         d.rtnCode ?? null,
          syncCallCount:   d.syncCallCount ?? 0,
        };
      } else {
        // 也看一下是不是 NT$149 四核心星座訂單
        const astro = await db
          .collection("astroProfileOrders")
          .where("merchantTradeNo", "==", merchantTradeNo)
          .limit(1)
          .get();
        if (!astro.empty) {
          const d = astro.docs[0].data() as Record<string, unknown>;
          order = {
            collection:      "astroProfileOrders",
            docId:           astro.docs[0].id,
            merchantTradeNo: d.merchantTradeNo ?? null,
            status:          d.status ?? null,
            isTest:          d.isTest ?? null,
            amount:          d.amount ?? null,
            productType:     d.productType ?? "astro_profile",
          };
        } else {
          order = { found: false };
        }
      }
    } catch (err) {
      order = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json({ ok: true, config, order });
}
