import { getAdminDb } from "./firebaseAdmin";

export const UNAUTH_DAILY_LIMIT = 1;

// ─── FB Share Unlock ──────────────────────────────────────────────────────────

export async function checkFbShareUnlock({
  anonymousId,
}: {
  anonymousId: string | null;
}): Promise<boolean> {
  if (!anonymousId) return false;
  const today = getTaipeiDate();
  const anonKey = encodeKey(anonymousId);
  try {
    const db = getAdminDb();
    const snap = await db.collection("draw_limits").doc(today).get();
    const data = (snap.data() ?? {}) as { fb_share_unlock?: Record<string, boolean> };
    return data.fb_share_unlock?.[anonKey] === true;
  } catch {
    return false;
  }
}

export async function markFbShareUnlock({
  anonymousId,
}: {
  anonymousId: string | null;
}): Promise<void> {
  if (!anonymousId) return;
  const today = getTaipeiDate();
  const anonKey = encodeKey(anonymousId);
  try {
    const db = getAdminDb();
    const docRef = db.collection("draw_limits").doc(today);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      const data = (snap.data() ?? {}) as { fb_share_unlock?: Record<string, boolean> };
      const existing = { ...(data.fb_share_unlock ?? {}) };
      existing[anonKey] = true;
      tx.set(docRef, { fb_share_unlock: existing }, { merge: true });
    });
  } catch (err) {
    console.error("[rateLimit] markFbShareUnlock failed:", err);
    throw err;
  }
}

export const LINE_DAILY_LIMIT = 3;
export const ADMIN_EMAILS = ["ciut0000@gmail.com"];

export type RateLimitFeature = "single_tarot" | "three_card";

export interface RateLimitParams {
  ip: string;
  anonymousId: string | null;
  lineUserId: string | null;
  adminEmail?: string | null;
  feature: RateLimitFeature;
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; message: string; remaining: 0 };

export interface DrawUsageResult {
  used: number;
  limit: number;
  remaining: number;
  isLineUser: boolean;
}

export interface DailyUsageDoc {
  total_requests: number;
  total_blocked: number;
  ip_usage: Record<string, number>;
  ip_display: Record<string, string>;
  anon_usage: Record<string, number>;
  line_usage: Record<string, number>;
  feature_usage: Record<string, number>;
}

export function getTaipeiDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

export function getAdminUserIds(): string[] {
  return (process.env.ADMIN_LINE_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getAdminEmails(): string[] {
  return Array.from(
    new Set([
      ...ADMIN_EMAILS,
      ...(process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ]),
  );
}

function encodeKey(key: string): string {
  return key.replace(/[.:#$[\]/\\@!%^&*()+=,<>?~`|{}]/g, "_").slice(0, 200);
}

export async function getDrawUsage(params: {
  ip: string;
  anonymousId: string | null;
  lineUserId: string | null;
}, collectionName = "draw_limits"): Promise<DrawUsageResult> {
  const { ip, anonymousId, lineUserId } = params;

  if (lineUserId && getAdminUserIds().includes(lineUserId)) {
    return { used: 0, limit: 999, remaining: 999, isLineUser: true };
  }

  const limit = lineUserId ? LINE_DAILY_LIMIT : UNAUTH_DAILY_LIMIT;
  const isLineUser = Boolean(lineUserId);
  const today = getTaipeiDate();

  try {
    const db = getAdminDb();
    const snap = await db.collection(collectionName).doc(today).get();
    const data = (snap.data() ?? {}) as Partial<DailyUsageDoc>;

    let used = 0;
    if (lineUserId) {
      used = data.line_usage?.[lineUserId] ?? 0;
    } else {
      const ipKey = encodeKey(ip || "unknown");
      const anonKey = anonymousId ? encodeKey(anonymousId) : null;
      // 優先以 anonymousId 判斷（各瀏覽器獨立），避免共用 IP 誤傷新用戶
      // 只在沒有 anonymousId 時才回退到 IP 判斷
      if (anonKey) {
        used = data.anon_usage?.[anonKey] ?? 0;
      } else {
        used = data.ip_usage?.[ipKey] ?? 0;
      }
    }

    return { used, limit, remaining: Math.max(0, limit - used), isLineUser };
  } catch {
    return { used: 0, limit, remaining: limit, isLineUser };
  }
}

export async function checkAndIncrementLimit(params: RateLimitParams, collectionName = "rate_limits"): Promise<RateLimitResult> {
  const { ip, anonymousId, lineUserId, adminEmail, feature } = params;

  if (lineUserId && getAdminUserIds().includes(lineUserId)) {
    return { allowed: true };
  }

  if (adminEmail && getAdminEmails().includes(adminEmail.trim().toLowerCase())) {
    return { allowed: true };
  }

  let db: ReturnType<typeof getAdminDb>;
  try {
    db = getAdminDb();
  } catch (error) {
    console.error("[rate-limit] Firebase Admin unavailable, allowing request:", error);
    return { allowed: true };
  }

  const today = getTaipeiDate();
  const docRef = db.collection(collectionName).doc(today);
  let isAllowed = false;

  try {
  await db.runTransaction(async (tx) => {
    isAllowed = false;
    const snap = await tx.get(docRef);
    const data = (snap.data() ?? {}) as Partial<DailyUsageDoc>;
    const totalRequests = data.total_requests ?? 0;
    const totalBlocked = data.total_blocked ?? 0;
    const featureUsage = { ...(data.feature_usage ?? {}) };

    if (lineUserId) {
      const lineUsage = { ...(data.line_usage ?? {}) };
      const current = lineUsage[lineUserId] ?? 0;

      if (current >= LINE_DAILY_LIMIT) {
        tx.set(docRef, { total_blocked: totalBlocked + 1 }, { merge: true });
        return;
      }

      lineUsage[lineUserId] = current + 1;
      featureUsage[feature] = (featureUsage[feature] ?? 0) + 1;
      tx.set(
        docRef,
        {
          line_usage: lineUsage,
          feature_usage: featureUsage,
          total_requests: totalRequests + 1,
        },
        { merge: true },
      );
      isAllowed = true;
      return;
    }

    const ipKey = encodeKey(ip || "unknown");
    const anonKey = anonymousId ? encodeKey(anonymousId) : null;
    const ipUsage = { ...(data.ip_usage ?? {}) };
    const ipDisplay = { ...(data.ip_display ?? {}) };
    const anonUsage = { ...(data.anon_usage ?? {}) };
    const ipCount = ipUsage[ipKey] ?? 0;
    const anonCount = anonKey ? anonUsage[anonKey] ?? 0 : 0;

    // 優先以 anonymousId 判斷（各瀏覽器獨立），避免共用 IP 誤傷新用戶
    const limitCount = anonKey ? anonCount : ipCount;
    if (limitCount >= UNAUTH_DAILY_LIMIT) {
      tx.set(docRef, { total_blocked: totalBlocked + 1 }, { merge: true });
      return;
    }

    ipUsage[ipKey] = ipCount + 1;
    ipDisplay[ipKey] = ip || "unknown";
    if (anonKey) anonUsage[anonKey] = anonCount + 1;
    featureUsage[feature] = (featureUsage[feature] ?? 0) + 1;

    tx.set(
      docRef,
      {
        ip_usage: ipUsage,
        ip_display: ipDisplay,
        anon_usage: anonUsage,
        feature_usage: featureUsage,
        total_requests: totalRequests + 1,
      },
      { merge: true },
    );
    isAllowed = true;
  });
  } catch (error) {
    console.error("[rate-limit] Firestore transaction failed, allowing request:", error);
    return { allowed: true };
  }

  if (!isAllowed) {
    return { allowed: false, message: "今日免費宇宙訊息已使用完畢 ✨", remaining: 0 };
  }

  return { allowed: true };
}
