import { getAdminDb } from "./firebaseAdmin";

// ── 限制設定 ──────────────────────────────────────────────────────────────────

/** 未登入用戶：同 IP 或同 anonymousId 每日最多 N 次 */
export const UNAUTH_DAILY_LIMIT = 1;

/** LINE 登入用戶：同 userId 每日最多 N 次 */
export const LINE_DAILY_LIMIT = 3;

/** 從環境變數讀取管理員 LINE userId 清單（逗號分隔） */
export function getAdminUserIds(): string[] {
  return (process.env.ADMIN_LINE_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── 工具函式 ──────────────────────────────────────────────────────────────────

/**
 * 回傳 Asia/Taipei 的 YYYY-MM-DD 日期字串。
 * Firestore 文件以此為 ID，自動達到每日 00:00（台北時間）重置效果。
 */
export function getTaipeiDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

/**
 * 將任意字串編碼為安全的 Firestore map key。
 * 避免 IP、UUID 中的 `.` `:` 等被 Firestore 誤判為巢狀路徑。
 */
function encodeKey(key: string): string {
  return key
    .replace(/[.:#$[\]/\\@!%^&*()+=,<>?~`|{}]/g, "_")
    .slice(0, 200);
}

// ── 型別 ──────────────────────────────────────────────────────────────────────

export type RateLimitFeature = "single_tarot" | "three_card";

export interface RateLimitParams {
  ip: string;
  anonymousId: string | null;
  lineUserId: string | null;
  feature: RateLimitFeature;
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; message: string };

// ── Firestore 文件型別（後台讀取用） ─────────────────────────────────────────

export interface DailyUsageDoc {
  total_requests: number;
  total_blocked: number;
  ip_usage: Record<string, number>;   // encodedIP → count
  ip_display: Record<string, string>; // encodedIP → original IP (供顯示)
  anon_usage: Record<string, number>; // anonymousId → count
  line_usage: Record<string, number>; // lineUserId → count
  feature_usage: Record<string, number>; // feature → count
}

// ── 核心函式 ──────────────────────────────────────────────────────────────────

/**
 * 原子性地檢查並遞增今日使用次數（Firestore transaction）。
 *
 * 規則：
 *   - 管理員（ADMIN_LINE_USER_IDS）：永遠通過，不計次數
 *   - LINE 用戶：同 userId 每日 LINE_DAILY_LIMIT 次
 *   - 未登入：同 IP **或** 同 anonymousId 任一達到 UNAUTH_DAILY_LIMIT 即阻擋
 *   - 次數在 Asia/Taipei 00:00 自動重置（新文件 ID = 新日期）
 */
export async function checkAndIncrementLimit(
  params: RateLimitParams
): Promise<RateLimitResult> {
  const { ip, anonymousId, lineUserId, feature } = params;

  // 管理員直接通過
  if (lineUserId && getAdminUserIds().includes(lineUserId)) {
    return { allowed: true };
  }

  const today = getTaipeiDate();
  const db = getAdminDb();
  const docRef = db.collection("rate_limits").doc(today);

  let isAllowed = false;

  await db.runTransaction(async (tx) => {
    isAllowed = false; // 確保重試時重置

    const snap = await tx.get(docRef);
    const d = snap.data() ?? {};

    const totalRequests = (d.total_requests as number | undefined) ?? 0;
    const totalBlocked = (d.total_blocked as number | undefined) ?? 0;

    if (lineUserId) {
      // ── LINE 登入用戶 ──────────────────────────────────────────────
      const lineUsage = {
        ...(d.line_usage as Record<string, number> | undefined ?? {}),
      };
      const current = lineUsage[lineUserId] ?? 0;

      if (current >= LINE_DAILY_LIMIT) {
        tx.set(docRef, { total_blocked: totalBlocked + 1 }, { merge: true });
        return; // isAllowed stays false
      }

      lineUsage[lineUserId] = current + 1;

      const feat = {
        ...(d.feature_usage as Record<string, number> | undefined ?? {}),
      };
      feat[feature] = (feat[feature] ?? 0) + 1;

      tx.set(
        docRef,
        { line_usage: lineUsage, total_requests: totalRequests + 1, feature_usage: feat },
        { merge: true }
      );
      isAllowed = true;

    } else {
      // ── 未登入用戶（IP + anonymousId 雙重檢查）────────────────────
      const ipKey = encodeKey(ip);
      const anonKey = anonymousId ? encodeKey(anonymousId) : null;

      const ipUsage = {
        ...(d.ip_usage as Record<string, number> | undefined ?? {}),
      };
      const ipDisplay = {
        ...(d.ip_display as Record<string, string> | undefined ?? {}),
      };
      const anonUsage = {
        ...(d.anon_usage as Record<string, number> | undefined ?? {}),
      };

      const ipCount = ipUsage[ipKey] ?? 0;
      const anonCount = anonKey ? (anonUsage[anonKey] ?? 0) : 0;

      if (ipCount >= UNAUTH_DAILY_LIMIT || anonCount >= UNAUTH_DAILY_LIMIT) {
        tx.set(docRef, { total_blocked: totalBlocked + 1 }, { merge: true });
        return; // isAllowed stays false
      }

      ipUsage[ipKey] = ipCount + 1;
      ipDisplay[ipKey] = ip; // 保留原始 IP 以便後台顯示
      if (anonKey) anonUsage[anonKey] = anonCount + 1;

      const feat = {
        ...(d.feature_usage as Record<string, number> | undefined ?? {}),
      };
      feat[feature] = (feat[feature] ?? 0) + 1;

      tx.set(
        docRef,
        {
          ip_usage: ipUsage,
          ip_display: ipDisplay,
          anon_usage: anonUsage,
          total_requests: totalRequests + 1,
          feature_usage: feat,
        },
        { merge: true }
      );
      isAllowed = true;
    }
  });

  if (!isAllowed) {
    return {
      allowed: false,
      message:
        "今天的免費宇宙訊息已用完，加入 LINE 可獲得每日 3 次免費訊息。",
    };
  }

  return { allowed: true };
}
