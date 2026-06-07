/**
 * POST /api/astro-profile/reissue-code/validate
 * Public: validate & consume an astro-profile reissue code.
 * Body: { code: string, sessionId?: string }
 * Returns:
 *   { ok: true }                           — valid, marked as used
 *   { ok: false, error: string }           — invalid / expired / already used
 */

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const COLLECTION = "astroProfileReissueCodes";

const CODE_RE = /^AP-[A-Z0-9]{8}$/;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    code?: string;
    sessionId?: string;
  };

  const rawCode = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!CODE_RE.test(rawCode)) {
    return NextResponse.json({ ok: false, error: "INVALID_CODE_FORMAT" }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 128) : null;

  const db = getAdminDb();
  const ref  = db.collection(COLLECTION).doc(rawCode);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json({ ok: false, error: "CODE_NOT_FOUND" }, { status: 404 });
  }

  const data = snap.data() as {
    type?:     string;
    status?:   string;
    expiresAt?: { toDate?: () => Date } | Date | null;
  };

  if (data.type !== "astro-profile-reissue") {
    return NextResponse.json({ ok: false, error: "CODE_NOT_FOUND" }, { status: 404 });
  }

  if (data.status === "used") {
    return NextResponse.json({ ok: false, error: "CODE_ALREADY_USED" }, { status: 409 });
  }

  if (data.status === "revoked" || data.status === "expired") {
    return NextResponse.json({ ok: false, error: "CODE_EXPIRED" }, { status: 410 });
  }

  if (data.status !== "active") {
    return NextResponse.json({ ok: false, error: "CODE_INVALID" }, { status: 400 });
  }

  // 到期檢查
  const expiresAt =
    data.expiresAt instanceof Date
      ? data.expiresAt
      : typeof data.expiresAt === "object" && data.expiresAt !== null && "toDate" in data.expiresAt
        ? (data.expiresAt as { toDate(): Date }).toDate()
        : null;

  if (!expiresAt || expiresAt < new Date()) {
    await ref.update({ status: "expired" });
    return NextResponse.json({ ok: false, error: "CODE_EXPIRED" }, { status: 410 });
  }

  // ── 標記為已使用（原子性更新）────────────────────────────────────────────────
  await ref.update({
    status:        "used",
    usedAt:        FieldValue.serverTimestamp(),
    usedSessionId: sessionId ?? null,
  });

  console.info("[astro-profile/reissue-code/validate] Code redeemed", { code: rawCode, sessionId });

  return NextResponse.json({ ok: true });
}
