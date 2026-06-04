/**
 * ECPay server-only utilities.
 * HashKey / HashIV are read exclusively from env vars here — never exposed to the browser.
 */
import crypto from "crypto";

export const ECPAY_PROD_URL =
  "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5";
export const ECPAY_STAGE_URL =
  "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5";

/** Return the checkout URL based on ECPAY_STAGE env. */
export function getEcpayCheckoutUrl(): string {
  return process.env.ECPAY_STAGE === "true" ? ECPAY_STAGE_URL : ECPAY_PROD_URL;
}

/**
 * PHP-style urlencode compatible with ECPay's CheckMacValue spec.
 * Spaces → `+`; !, ', (, ), * are percent-encoded.
 */
function ecpayUrlEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/%20/g, "+")
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

/**
 * Compute ECPay CheckMacValue (EncryptType=1, SHA-256).
 * Algorithm:
 *   1. Remove CheckMacValue from params.
 *   2. Sort remaining keys A-Z.
 *   3. Join as key=value&… pairs.
 *   4. Prepend HashKey=…& and append &HashIV=…
 *   5. PHP-urlencode, lowercase.
 *   6. SHA-256 → hex → UPPERCASE.
 */
export function generateCheckMacValue(
  params: Record<string, string>,
  hashKey: string,
  hashIV: string,
): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { CheckMacValue: _removed, ...rest } = params;

  const sorted = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("&");

  const raw = `HashKey=${hashKey}&${sorted}&HashIV=${hashIV}`;
  const encoded = ecpayUrlEncode(raw).toLowerCase();

  return crypto.createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

/**
 * Verify the CheckMacValue present in an ECPay callback.
 * Returns false if CheckMacValue is missing or does not match.
 */
export function verifyCheckMacValue(
  params: Record<string, string>,
  hashKey: string,
  hashIV: string,
): boolean {
  const received = params.CheckMacValue;
  if (!received) return false;
  const expected = generateCheckMacValue(params, hashKey, hashIV);
  return received === expected;
}

/**
 * Generate a unique MerchantTradeNo (≤20 alphanumeric chars).
 * Format: UW + 8-char base-36 timestamp + 4-char random = 14 chars.
 */
export function generateMerchantTradeNo(): string {
  const ts = Date.now().toString(36).toUpperCase().slice(-8);
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  const rand = Array.from(
    { length: 4 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
  return `UW${ts}${rand}`;
}

/**
 * Format a Date as ECPay's required `yyyy/MM/dd HH:mm:ss` in Asia/Taipei timezone.
 */
export function formatEcpayDate(date: Date): string {
  const twStr = date.toLocaleString("en-US", { timeZone: "Asia/Taipei" });
  const tw = new Date(twStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${tw.getFullYear()}/${pad(tw.getMonth() + 1)}/${pad(tw.getDate())} ` +
    `${pad(tw.getHours())}:${pad(tw.getMinutes())}:${pad(tw.getSeconds())}`
  );
}
