import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getAdminUserIds } from "@/lib/rateLimit";
import { REDEEM_CODES_COLLECTION } from "@/lib/redeemCodes";
import { SESSION_COOKIE_NAME, verifyAdminSessionCookie } from "@/lib/verifyAdmin";

export const runtime = "nodejs";

/**
 * DELETE /api/redeem/delete
 * body: { code: string }
 * 只有管理員可以刪除通行碼。
 */
export async function DELETE(req: NextRequest) {
  // ── 管理員驗證 ────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const isGoogleAdmin = await verifyAdminSessionCookie(sessionCookie);
  const lineUserId = cookieStore.get("line_user_id")?.value ?? null;
  const isLineAdmin = Boolean(lineUserId && getAdminUserIds().includes(lineUserId));

  if (!isGoogleAdmin && !isLineAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { code } = body as { code?: string };

    if (!code || typeof code !== "string") {
      return NextResponse.json({ ok: false, error: "Missing code" }, { status: 400 });
    }

    const normalizedCode = code.trim().toUpperCase();
    const db = getAdminDb();

    // redeemCodes 用 code 當 document id
    const docRef = db.collection(REDEEM_CODES_COLLECTION).doc(normalizedCode);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    await docRef.delete();

    return NextResponse.json({ ok: true, code: normalizedCode });
  } catch (err) {
    console.error("[redeem/delete] error:", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
