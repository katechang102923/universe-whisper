/**
 * ECPay OrderResultURL handler.
 *
 * 綠界刷卡完成後，使用者瀏覽器會 POST 到這裡（不是直接 GET /payment/result）。
 * 這個 route 只負責：
 *   1. 讀取 MerchantTradeNo。
 *   2. 303 redirect 到 /payment/result?merchantTradeNo=XXX。
 *
 * 不在這裡產生通行碼、不在這裡判斷付款成功。
 * 付款結果由 /api/ecpay/return（server-to-server ReturnURL）處理。
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const BASE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://universe-whisper.vercel.app"
).replace(/\/$/, "");

function buildRedirectUrl(merchantTradeNo: string | null): URL {
  const url = new URL("/payment/result", BASE_URL);
  if (merchantTradeNo) {
    url.searchParams.set("merchantTradeNo", merchantTradeNo);
  } else {
    url.searchParams.set("error", "missing_merchant_trade_no");
  }
  return url;
}

/** 綠界刷卡完成後 POST 到此（帶 form data） */
export async function POST(req: NextRequest) {
  let merchantTradeNo: string | null = null;

  try {
    const text = await req.text();
    const params = new URLSearchParams(text);
    merchantTradeNo =
      params.get("MerchantTradeNo") ??
      params.get("merchantTradeNo") ??
      null;
  } catch {
    // 解析失敗也要 redirect，不能卡住使用者
  }

  console.log("[ecpay/order-result] POST redirect →", merchantTradeNo);
  return NextResponse.redirect(buildRedirectUrl(merchantTradeNo), 303);
}

/** Fallback：少數情況下可能是 GET */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const merchantTradeNo =
    searchParams.get("MerchantTradeNo") ??
    searchParams.get("merchantTradeNo") ??
    null;

  console.log("[ecpay/order-result] GET redirect →", merchantTradeNo);
  return NextResponse.redirect(buildRedirectUrl(merchantTradeNo), 303);
}
