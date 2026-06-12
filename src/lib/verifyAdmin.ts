/**
 * Server-side admin verification.
 *
 * Two verification paths:
 *   verifyAdminIdToken()       — used by API routes (Authorization: Bearer <idToken>)
 *   verifyAdminSessionCookie() — used by page routes (httpOnly __admin_session cookie)
 *
 * Admin email list is read from env vars:
 *   ADMIN_GOOGLE_EMAILS  — primary (comma-separated)
 *   ADMIN_EMAILS         — legacy fallback (comma-separated)
 *   ADMIN_EMAILS_HARDCODED — compile-time fallback
 *
 * Do NOT trust any email value from the request body — always verify the token here.
 */
import { getAuth } from "firebase-admin/auth";
import { getAdminDb } from "./firebaseAdmin";

export const SESSION_COOKIE_NAME = "__admin_session";

// Compile-time fallback — prevents lockout if env vars are misconfigured.
const ADMIN_EMAILS_HARDCODED = ["ciut0000@gmail.com"];

export function getAdminEmailList(): string[] {
  const fromGoogle = (process.env.ADMIN_GOOGLE_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const fromLegacy = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(
    new Set([
      ...ADMIN_EMAILS_HARDCODED.map((e) => e.toLowerCase()),
      ...fromGoogle,
      ...fromLegacy,
    ]),
  );
}

/**
 * Verifies a Firebase ID token from the Authorization header.
 * Used by API routes.
 */
export async function verifyAdminIdToken(
  token: string | null | undefined,
): Promise<boolean> {
  if (!token) return false;
  try {
    getAdminDb();
    const decoded = await getAuth().verifyIdToken(token);
    return getAdminEmailList().includes(decoded.email?.toLowerCase() ?? "");
  } catch {
    return false;
  }
}

/**
 * Verifies the httpOnly __admin_session cookie value.
 * Used by admin page Server Components.
 *
 * Pass the raw cookie string (not the cookie name):
 *   const val = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
 *   const ok  = await verifyAdminSessionCookie(val);
 */
export async function verifyAdminSessionCookie(
  sessionCookie: string | null | undefined,
): Promise<boolean> {
  return (await checkAdminSession(sessionCookie)).ok;
}

export type AdminSessionCheck = {
  /** true 表示有效 session 且 email 在管理員白名單內 */
  ok: boolean;
  /** session 解出的 email（即使非管理員也會回傳，供顯示「此帳號沒有權限」）*/
  email: string | null;
  /** 是否存在可驗證的 Google session cookie（區分「未登入」與「已登入但非管理員」）*/
  hasSession: boolean;
};

/**
 * 驗證 admin session cookie，回傳細節以便：
 *  - 區分「未登入 / 已登入但非管理員」並顯示對應訊息
 *  - server console 診斷
 * 註：checkRevoked=false，只驗簽章與效期（admin 面板可接受；避免撤銷檢查在 production 偶發失敗造成被踢出）。
 */
export async function checkAdminSession(
  sessionCookie: string | null | undefined,
): Promise<AdminSessionCheck> {
  if (!sessionCookie) return { ok: false, email: null, hasSession: false };
  try {
    getAdminDb();
    const decoded = await getAuth().verifySessionCookie(sessionCookie, false);
    const email = decoded.email?.toLowerCase() ?? null;
    return { ok: getAdminEmailList().includes(email ?? ""), email, hasSession: true };
  } catch (err) {
    console.error("[verifyAdmin] session cookie verify failed:", err instanceof Error ? err.message : err);
    return { ok: false, email: null, hasSession: false };
  }
}
