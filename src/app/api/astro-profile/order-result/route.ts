/**
 * POST/GET /api/astro-profile/order-result
 * ECPay OrderResultURL — browser POST-redirect after payment.
 * Redirects to /astro-profile?session=X&order=Y so client can check status.
 */
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyCheckMacValue, getEcpayCredentials } from "@/lib/ecpay";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://universe-whisper.vercel.app"
).replace(/\/$/, "");

async function resolveRedirectUrl(merchantTradeNo: string | null, params: Record<string, string>): Promise<string> {
  if (!merchantTradeNo) return `${SITE_URL}/astro-profile`;

  try {
    const db = getAdminDb();
    const query = await db
      .collection("astroProfileOrders")
      .where("merchantTradeNo", "==", merchantTradeNo)
      .limit(1)
      .get();

    if (!query.empty) {
      const data = query.docs[0].data() as { sessionId?: string; status?: string };
      const { hashKey, hashIV } = getEcpayCredentials();

      if (hashKey && hashIV && verifyCheckMacValue(params, hashKey, hashIV) && params.RtnCode === "1") {
        if (data.status !== "paid") {
          await query.docs[0].ref.update({
            status: "paid",
            ecpayTradeNo: params.TradeNo ?? null,
            paidAt: FieldValue.serverTimestamp(),
          });
        }
      }

      const sessionId = data.sessionId ?? "";
      if (sessionId) {
        return `${SITE_URL}/astro-profile?session=${encodeURIComponent(sessionId)}&order=${encodeURIComponent(merchantTradeNo)}`;
      }
    }
  } catch (err) {
    console.error("[astro-profile/order-result] db error:", err);
  }

  return `${SITE_URL}/astro-profile?order=${encodeURIComponent(merchantTradeNo)}`;
}

export async function POST(req: NextRequest) {
  let params: Record<string, string> = {};
  let merchantTradeNo: string | null = null;
  try {
    const text = await req.text();
    params = Object.fromEntries(new URLSearchParams(text));
    merchantTradeNo = params.MerchantTradeNo ?? null;
  } catch { /* ignore */ }

  console.log("[astro-profile/order-result] POST →", merchantTradeNo);
  const redirectUrl = await resolveRedirectUrl(merchantTradeNo, params);
  return NextResponse.redirect(redirectUrl, 303);
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const merchantTradeNo = searchParams.get("MerchantTradeNo") ?? searchParams.get("merchantTradeNo") ?? null;
  console.log("[astro-profile/order-result] GET →", merchantTradeNo);
  const redirectUrl = await resolveRedirectUrl(merchantTradeNo, {});
  return NextResponse.redirect(redirectUrl, 303);
}
