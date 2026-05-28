/**
 * Server-side Firebase ID token verification.
 * Used by API routes to confirm the caller is an admin.
 * Do NOT trust adminEmail from the request body — always verify the token here.
 */
import { getAuth } from "firebase-admin/auth";
import { getAdminDb } from "./firebaseAdmin";

const ADMIN_EMAILS_HARDCODED = ["ciut0000@gmail.com"];

function getAdminEmailList(): string[] {
  const env = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...ADMIN_EMAILS_HARDCODED.map((e) => e.toLowerCase()), ...env]));
}

/**
 * Verifies a Firebase ID token and returns true if the caller is an admin.
 * Returns false for missing, invalid, or expired tokens.
 */
export async function verifyAdminIdToken(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    // Calling getAdminDb() ensures the Firebase Admin app is initialised.
    // getAuth() then re-uses the same default app.
    getAdminDb();
    const decoded = await getAuth().verifyIdToken(token);
    const email = decoded.email?.toLowerCase() ?? "";
    return getAdminEmailList().includes(email);
  } catch {
    return false;
  }
}
