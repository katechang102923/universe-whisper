/**
 * 共用：LINE 官網入口文字與關鍵字回覆。
 *
 * 用途：
 *  - LINE 電腦版看不到圖文選單，所以用「關鍵字回覆」補上官網網址。
 *  - 集中管理，避免在 webhook / formatter 重複硬編。
 *
 * 注意：這裡只讀環境變數組官網網址，不涉及 LINE token，也不改任何傳送流程。
 */

const RAW_SITE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://universe-whisper.vercel.app";

/** 官網首頁網址（保證結尾帶一個斜線，例如 https://universe-whisper.vercel.app/）。 */
export const SITE_HOME_URL = `${RAW_SITE.replace(/\/+$/, "")}/`;

/** 結果訊息底部的純文字官網入口。 */
export const LINE_WEBSITE_FOOTER = `🌙 官網入口：\n${SITE_HOME_URL}`;

/** 觸發官網連結回覆的關鍵字（使用者輸入其中之一就回官網）。 */
export const LINE_WEBSITE_KEYWORDS = [
  "官網",
  "網址",
  "首頁",
  "抽牌",
  "連結",
  "網站",
  "link",
  "website",
];

/** 關鍵字命中時回覆的訊息（電腦版 LINE 也看得到網址）。 */
export const LINE_WEBSITE_KEYWORD_REPLY =
  `🌙 宇宙偷偷話官網在這裡：\n${SITE_HOME_URL}\n\n` +
  "你可以回來抽牌、查看每日星座，或輸入序號查詢之前的結果。";

/**
 * 判斷訊息是否為「想看官網」的關鍵字。
 * 先 trim，再把英文轉小寫精準比對，避免把驗證碼或一般句子誤判成關鍵字。
 */
export function matchesWebsiteKeyword(text: string | null | undefined): boolean {
  const normalized = (text ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return LINE_WEBSITE_KEYWORDS.includes(normalized);
}
