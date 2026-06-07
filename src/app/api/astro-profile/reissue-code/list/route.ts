/**
 * GET /api/astro-profile/reissue-code/list
 * Admin-only: list recent astro-profile reissue codes (latest 50).
 * Returns: { ok: true, codes: ReissueCodeEntry[] }
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyAdminSessionCookie, SESSION_COOKIE_NAME } from "@/lib/verifyAdmin";

export const runtime = "nodejs";

const COLLECTION = "astroProfileReissueCodes";

function toISO(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null && "toDate" in v) {
    return (v as { toDate(): Date }).toDate().toISOString();
  }
  return null;
}

export async function GET() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const isAdmin = await verifyAdminSessionCookie(sessionCookie);
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const db = getAdminDb();
  const snap = await db
    .collection(COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  const codes = snap.docs.map((d) => {
    const data = d.data();
    return {
      code:      d.id,
      status:    data.status    ?? "active",
      note:      data.note      ?? null,
      createdAt: toISO(data.createdAt),
      expiresAt: toISO(data.expiresAt),
      usedAt:    toISO(data.usedAt),
    };
  });

  return NextResponse.json({ ok: true, codes });
}
