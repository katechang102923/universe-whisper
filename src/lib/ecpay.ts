/**
 * ECPay server-only utilities.
 * HashKey / HashIV are read exclusively from env vars here — never exposed to the browser.
 */
import crypto from "crypto";

export const ECPAY_PROD_URL =
  "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5";
export const ECPAY_STAGE_URL =
  "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5";

// ECPay 官方公開測試商家帳號（可安全寫進程式碼）
export const ECPAY_TEST_MERCHANT_ID = "3002607";
export const ECPAY_TEST_HASH_KEY    = "pwFHCqoQZGmho4w6";
export const ECPAY_TEST_HASH_IV     = "EkRm7iFT261dpevs";

/** Return the checkout URL based on ECPAY_STAGE env. */
export function getEcpayCheckoutUrl(): string {
  return process.env.ECPAY_STAGE === "true" ? ECPAY_STAGE_URL : ECPAY_PROD_URL;
}

/**
 * 依 ECPAY_STAGE 回傳對應的 credentials。
 *
 * Stage=true：
 *   永遠使用 ECPay 官方公開測試帳號（hardcode）。
 *   完全不讀取 ECPAY_MERCHANT_ID / ECPAY_HASH_KEY / ECPAY_HASH_IV 環境變數，
 *   防止 Vercel 同時存在正式帳號設定時混用，造成 CheckMacValue Error。
 *
 * Stage=false：
 *   使用正式環境變數（若缺失回傳 undefined，呼叫端自行錯誤處理）。
 */
export function getEcpayCredentials(): {
  merchantId: string | undefined;
  hashKey:    string | undefined;
  hashIV:     string | undefined;
  isStage:    boolean;
} {
  const isStage = process.env.ECPAY_STAGE === "true";

  if (isStage) {
    // ⚠ 測試模式：永遠使用硬編碼的官方測試帳號，絕對不讀取正式環境變數
    console.log(
      "[ECPay] Stage 模式 — 使用官方測試帳號 MerchantID=3002607，" +
      "URL=payment-stage.ecpay.com.tw",
    );
    return {
      merchantId: ECPAY_TEST_MERCHANT_ID,  // "3002607"
      hashKey:    ECPAY_TEST_HASH_KEY,      // "pwFHCqoQZGmho4w6"
      hashIV:     ECPAY_TEST_HASH_IV,       // "EkRm7iFT261dpevs"
      isStage:    true,
    };
  }

  // 正式模式：讀取正式環境變數
  return {
    merchantId: process.env.ECPAY_MERCHANT_ID,
    hashKey:    process.env.ECPAY_HASH_KEY,
    hashIV:     process.env.ECPAY_HASH_IV,
    isStage:    false,
  };
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
 *   2. Sort remaining keys A-Z (case-insensitive, per ECPay spec).
 *   3. Join as key=value&… pairs.
 *   4. Prepend HashKey=…& and append &HashIV=…
 *   5. PHP-urlencode, lowercase.
 *   6. SHA-256 → hex → UPPERCASE.
 */
/**
 * Case-insensitive ASCII (byte-wise) key comparison — matches ECPay's official
 * PHP SDK, which sorts with `uksort($p, 'strcasecmp')`.
 *
 * 不可改用 String.prototype.localeCompare：localeCompare 依 runtime 預設 locale
 * 與 ICU collation，對含底線/數字的欄位（信用卡 callback 的 auth_code、card_4no、
 * process_date…）排序結果可能與綠界的 strcasecmp 不一致，且不同部署環境結果不一定相同，
 * 會造成 CheckMacValue 驗證偶發失敗。此處用 lowercase + code-unit 比較，對 ASCII 欄位名
 * 與 strcasecmp 完全等價且確定性。
 */
function ecpayKeyCompare(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  return la < lb ? -1 : la > lb ? 1 : 0;
}

export function generateCheckMacValue(
  params: Record<string, string>,
  hashKey: string,
  hashIV: string,
): string {
  const { CheckMacValue: _removed, ...rest } = params;

  // Case-insensitive ASCII sort（與綠界官方 SDK strcasecmp 一致，且不受 locale 影響）
  const sorted = Object.keys(rest)
    .sort(ecpayKeyCompare)
    .map((k) => `${k}=${rest[k]}`)
    .join("&");

  const raw     = `HashKey=${hashKey}&${sorted}&HashIV=${hashIV}`;
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
 * 安全診斷資訊：判斷 stage/production 與 ReturnURL 等設定是否正確。
 * 絕對不回傳 HashKey / HashIV / 任何密鑰；正式 MerchantID 只回傳「是否已設定」與末四碼。
 */
export function getEcpayConfigDiagnostics(): {
  ecpayStageRaw:        string | null;
  isStage:              boolean;
  hasMerchantId:        boolean;
  merchantIdTail:       string | null;
  usingTestMerchant:    boolean;
  hasHashKey:           boolean;
  hasHashIV:            boolean;
  checkoutUrl:          string;
  queryUrl:             string;
  siteUrl:              string;
  returnUrl:            string;
  orderResultUrl:       string;
  returnHost:           string;
  isProductionHost:     boolean;
  notes:                string[];
} {
  const { merchantId, hashKey, hashIV, isStage } = getEcpayCredentials();
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://universe-whisper.vercel.app"
  ).replace(/\/$/, "");
  const returnUrl      = `${siteUrl}/api/ecpay/return`;
  const orderResultUrl = `${siteUrl}/api/ecpay/order-result`;

  let returnHost = "";
  try { returnHost = new URL(returnUrl).host; } catch { /* ignore */ }
  const isProductionHost = returnHost === "universe-whisper.vercel.app";

  const notes: string[] = [];
  if (isStage) {
    notes.push("ECPAY_STAGE=true：使用官方測試帳號 3002607 與 payment-stage.ecpay.com.tw，不會真的扣款。若使用者刷的是正式卡卻顯示 stage，付款不會被正式環境記錄。");
  }
  if (!isStage && !merchantId) {
    notes.push("正式模式但缺少 ECPAY_MERCHANT_ID，create-order 會回 503，使用者無法結帳。");
  }
  if (!isProductionHost) {
    notes.push(`ReturnURL host 為 ${returnHost || "(空白)"}，非正式站 universe-whisper.vercel.app。若為 preview/localhost，綠界 server-to-server callback 可能無法回到正確站台。`);
  }
  if (/localhost|127\.0\.0\.1|vercel\.app$/.test(returnHost) && returnHost !== "universe-whisper.vercel.app" && returnHost.endsWith("vercel.app")) {
    notes.push("ReturnURL 指向 preview deployment（*.vercel.app 但非正式 host）；preview 部署常啟用 Deployment Protection，會擋下綠界的 server callback。");
  }

  return {
    ecpayStageRaw:     process.env.ECPAY_STAGE ?? null,
    isStage,
    hasMerchantId:     Boolean(merchantId),
    merchantIdTail:    merchantId ? merchantId.slice(-4) : null,
    usingTestMerchant: merchantId === ECPAY_TEST_MERCHANT_ID,
    hasHashKey:        Boolean(hashKey),
    hasHashIV:         Boolean(hashIV),
    checkoutUrl:       getEcpayCheckoutUrl(),
    queryUrl:          isStage
      ? "https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5"
      : "https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5",
    siteUrl,
    returnUrl,
    orderResultUrl,
    returnHost,
    isProductionHost,
    notes,
  };
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
