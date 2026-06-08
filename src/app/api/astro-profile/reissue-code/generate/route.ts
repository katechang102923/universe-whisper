/**
 * POST /api/astro-profile/reissue-code/generate
 * Admin-only: generate a single-use astro-profile reissue code (AP-XXXXXXXX).
 * Body: { note?: string }
 * Returns: { ok: true, code: string, expiresAt: string }
 *
 * 限制：僅管理員可呼叫（驗證 session cookie）
 * 不共用塔羅通行碼，獨立 collection: astroProfileReissueCodes
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyAdminSessionCookie, SESSION_COOKIE_NAME } from "@/lib/verifyAdmin";
import { jsonServerError } from "@/lib/apiErrors";

export const runtime = "nodejs";

const COLLECTION = "astroProfileReissueCodes";

// AP- + 8 chars from unambiguous charset
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN = 8;

function generateCode(): string {
  let code = "AP-";
  const arr = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(arr);
  for (const byte of arr) {
    code += CHARSET[byte % CHARSET.length];
  }
  return code;
}

async function isUnique(code: string): Promise<boolean> {
  const db = getAdminDb();
  const snap = await db.collection(COLLECTION).doc(code).get();
  return !snap.exists;
}

export async function POST(request: Request) {
  // ── 管理員驗證 ────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const isAdmin = await verifyAdminSessionCookie(sessionCookie);
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
  const body = await request.json().catch(() => ({})) as { note?: string };
  const note = typeof body.note === "string" ? body.note.slice(0, 200).trim() : "";

  // ── 產生唯一序號 ──────────────────────────────────────────────────────────────
  let code = generateCode();
  // 最多重試 5 次（碰撞機率極低）
  for (let i = 0; i < 5; i++) {
    if (await isUnique(code)) break;
    code = generateCode();
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 天

  const db = getAdminDb();
  await db.collection(COLLECTION).doc(code).set({
    code,
    type:             "astro-profile-reissue",
    status:           "active",
    createdAt:        FieldValue.serverTimestamp(),
    expiresAt,
    createdByAdmin:   true,
    note:             note || null,
    usedAt:           null,
    usedSessionId:    null,
  });

  console.info("[astro-profile/reissue-code/generate] Created code", { code, note });

  return NextResponse.json({
    ok:        true,
    code,
    expiresAt: expiresAt.toISOString(),
  });
  } catch (err) {
    console.error("[astro-profile/reissue-code/generate] failed:", err);
    return jsonServerError(err, "REISSUE_CODE_FAILED");
  }
}
