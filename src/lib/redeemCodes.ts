import type { Timestamp } from "firebase-admin/firestore";

export type RedeemPlan = "single" | "five_pack" | "ten_pack";
export type RedeemStatus = "active" | "used_up" | "expired" | "disabled";

export interface RedeemUsedLog {
  usedAt: Timestamp | Date;
  resultId: string;
  question?: string;
  spreadType?: string;
  remainingUsesAfter: number;
  userAgent?: string;
  emailSent?: boolean;
}

export interface RedeemCodeData {
  code: string;
  planName: RedeemPlan;
  displayName: string;
  price: number;
  totalUses: number;
  remainingUses: number;
  status: RedeemStatus;
  createdAt: Timestamp | Date;
  expiresAt: Timestamp | Date;
  usedLogs: RedeemUsedLog[];
}

export const REDEEM_CODES_COLLECTION = "redeemCodes";
export const REDEEM_CODE_EXPIRY_DAYS = 60;

export const REDEEM_PLANS: Record<
  RedeemPlan,
  { displayName: string; price: number; totalUses: number; description: string }
> = {
  single: {
    displayName: "宇宙通行碼 單次",
    price: 49,
    totalUses: 1,
    description: "原價體驗",
  },
  five_pack: {
    displayName: "宇宙通行碼 五次",
    price: 220,
    totalUses: 5,
    description: "小資優惠，平均 44 元，約九折",
  },
  ten_pack: {
    displayName: "宇宙通行碼 十次",
    price: 350,
    totalUses: 10,
    description: "限時最划算，平均 35 元，約七折",
  },
};

/** 產生格式 UW-XXXX-XXXX 的兌換碼，去掉易混淆字元 I O 1 0 */
export function generateRedeemCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (len: number) =>
    Array.from(
      { length: len },
      () => chars[Math.floor(Math.random() * chars.length)],
    ).join("");
  return `UW-${seg(4)}-${seg(4)}`;
}

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://universe-whisper.vercel.app";

/** 產生可複製的宇宙通行碼發送文字 */
export function buildRedeemShareText(
  code: string,
  planName: RedeemPlan,
  expiresAt: Date,
): string {
  const { displayName, totalUses } = REDEEM_PLANS[planName];
  const expiry = expiresAt.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return [
    `你的宇宙通行碼：${code}`,
    `方案：${displayName}`,
    `可解鎖次數：${totalUses} 次`,
    `有效期限：${expiry} 前使用完畢`,
    `查詢剩餘次數：${SITE_URL}/redeem/check`,
    `使用方式：抽牌完成後，在結果頁輸入通行碼，即可解鎖完整版。`,
    `此通行碼不綁帳號，可自行使用，也可分享給朋友共同使用。`,
    `每解鎖一次完整版會扣除 1 次，次數用完或逾期後即失效。`,
  ].join("\n");
}

export type RedeemErrorCode =
  | "NOT_FOUND"
  | "USED_UP"
  | "EXPIRED"
  | "DISABLED"
  | "ALREADY_USED"
  | "SERVER_ERROR";

export function getRedeemErrorMessage(code: RedeemErrorCode): string {
  const map: Record<RedeemErrorCode, string> = {
    NOT_FOUND: "查無此通行碼",
    USED_UP: "此通行碼已使用完畢",
    EXPIRED: "此通行碼已過期",
    DISABLED: "此通行碼已停用",
    ALREADY_USED: "此結果已使用此通行碼解鎖過",
    SERVER_ERROR: "系統忙碌中，請稍後再試",
  };
  return map[code] ?? "系統忙碌中，請稍後再試";
}
