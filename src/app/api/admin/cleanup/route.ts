import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getAdminUserIds } from "@/lib/rateLimit";
import { SESSION_COOKIE_NAME, verifyAdminSessionCookie } from "@/lib/verifyAdmin";
import { REDEEM_CODES_COLLECTION, PAYMENT_ORDERS_COLLECTION } from "@/lib/redeemCodes";

export const runtime = "nodejs";

async function verifyAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (await verifyAdminSessionCookie(sessionCookie)) return true;
  const lineUserId = cookieStore.get("line_user_id")?.value;
  return Boolean(lineUserId && getAdminUserIds().includes(lineUserId));
}

/**
 * DELETE /api/admin/cleanup?type=test_codes|test_orders
 * 刪除標記為測試的資料，限管理員。
 */
export async function DELETE(req: NextRequest) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  const type = new URL(req.url).searchParams.get("type");
  if (!type) {
    return NextResponse.json({ ok: false, error: "Missing type" }, { status: 400 });
  }

  const db = getAdminDb();
  let deleted = 0;

  try {
    if (type === "test_codes") {
      const snap = await db
        .collection(REDEEM_CODES_COLLECTION)
        .where("isTest", "==", true)
        .get();
      if (!snap.empty) {
        const batch = db.batch();
        snap.docs.forEach((doc) => {
          batch.delete(doc.ref);
          deleted++;
        });
        await batch.commit();
      }
    } else if (type === "test_orders") {
      const snap = await db
        .collection(PAYMENT_ORDERS_COLLECTION)
        .where("isTest", "==", true)
        .get();
      if (!snap.empty) {
        const batch = db.batch();
        snap.docs.forEach((doc) => {
          batch.delete(doc.ref);
          deleted++;
        });
        await batch.commit();
      }
    } else {
      return NextResponse.json({ ok: false, error: "Unknown type" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    console.error("[admin/cleanup] error:", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
