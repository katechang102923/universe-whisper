import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  REDEEM_CODES_COLLECTION,
  REDEEM_PLANS,
  REDEEM_CODE_EXPIRY_DAYS,
  generateRedeemCode,
  type RedeemPlan,
} from "@/lib/redeemCodes";

export const runtime = "nodejs";

/**
 * POST /api/redeem/purchase
 * 模擬付款成功後建立宇宙通行碼（正式環境應由金流 webhook 觸發）。
 * 不需登入，任何人都可呼叫（模擬流程用）。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { planName } = body as { planName?: RedeemPlan };

    if (!planName || !REDEEM_PLANS[planName]) {
      return NextResponse.json({ ok: false, error: "Invalid plan" }, { status: 400 });
    }

    const plan = REDEEM_PLANS[planName];
    const db = getAdminDb();

    // 產生唯一通行碼（最多重試 10 次）
    let code = "";
    for (let i = 0; i < 10; i++) {
      const candidate = generateRedeemCode();
      const snap = await db.collection(REDEEM_CODES_COLLECTION).doc(candidate).get();
      if (!snap.exists) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      return NextResponse.json({ ok: false, error: "Failed to generate unique code" }, { status: 500 });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + REDEEM_CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

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

    return NextResponse.json({
      ok: true,
      code,
      planName,
      displayName: plan.displayName,
      totalUses: plan.totalUses,
      remainingUses: plan.totalUses,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error("[redeem/purchase] error:", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
