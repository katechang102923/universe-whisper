import { getAdminDb } from "./firebaseAdmin";

export const UNAUTH_DAILY_LIMIT = 1;
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
  | { allowed: false; message: string };

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

export async function checkAndIncrementLimit(params: RateLimitParams): Promise<RateLimitResult> {
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
  const docRef = db.collection("rate_limits").doc(today);
  let isAllowed = false;

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

    if (ipCount >= UNAUTH_DAILY_LIMIT || anonCount >= UNAUTH_DAILY_LIMIT) {
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

  if (!isAllowed) {
    return { allowed: false, message: "今日免費宇宙訊息已使用完畢 ✨" };
  }

  return { allowed: true };
}
