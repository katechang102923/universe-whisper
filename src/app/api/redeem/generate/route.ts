import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getAdminUserIds } from "@/lib/rateLimit";
import {
  REDEEM_CODES_COLLECTION,
  REDEEM_PLANS,
  REDEEM_CODE_EXPIRY_DAYS,
  generateRedeemCode,
  buildRedeemShareText,
  type RedeemPlan,
} from "@/lib/redeemCodes";
import {
  SESSION_COOKIE_NAME,
  verifyAdminSessionCookie,
} from "@/lib/verifyAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // ── 管理員驗證（Google session cookie 或 LINE cookie）─────────────────────
  const cookieStore = await cookies();

  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const isGoogleAdmin = await verifyAdminSessionCookie(sessionCookie);

  const lineUserId = cookieStore.get("line_user_id")?.value ?? null;
  const isLineAdmin = Boolean(lineUserId && getAdminUserIds().includes(lineUserId));

  if (!isGoogleAdmin && !isLineAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { planName } = body as { planName?: RedeemPlan };

    if (!planName || !REDEEM_PLANS[planName]) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const plan = REDEEM_PLANS[planName];
    const db = getAdminDb();

    // ── 產生唯一兌換碼（最多重試 10 次） ─────────────────────────────────────
    let code = "";
    for (let i = 0; i < 10; i++) {
      const candidate = generateRedeemCode();
      const snap = await db
        .collection(REDEEM_CODES_COLLECTION)
        .doc(candidate)
        .get();
      if (!snap.exists) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      return NextResponse.json(
        { error: "Failed to generate unique code" },
        { status: 500 },
      );
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + REDEEM_CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    await db.collection(REDEEM_CODES_COLLECTION).doc(code).set({
      code,
      planName,
      displayName: plan.displayName,
      price: plan.price,
      totalUses: plan.totalUses,
      remainingUses: plan.totalUses,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
      usedLogs: [],
    });

    const shareText = buildRedeemShareText(code, planName, expiresAt);

    return NextResponse.json({
      ok: true,
      code,
      shareText,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error("[redeem/generate] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
