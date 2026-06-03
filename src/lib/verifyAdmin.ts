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
  if (!sessionCookie) return false;
  try {
    getAdminDb();
    // checkRevoked=true: rejects cookies whose underlying token was revoked
    const decoded = await getAuth().verifySessionCookie(sessionCookie, true);
    return getAdminEmailList().includes(decoded.email?.toLowerCase() ?? "");
  } catch {
    return false;
  }
}
