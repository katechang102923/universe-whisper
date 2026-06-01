import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { CLAIM_COLLECTION } from "../create/route";

// -------------------------------------------------------------------
// GET /api/line/claim/status?claimCode=UW-XXXXXXX
// 查詢驗證碼狀態：pending | claimed | expired | not_found
// -------------------------------------------------------------------

const CLAIM_CODE_RE = /^UW-[A-Z0-9]{7}$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("claimCode") ?? "";
  const claimCode = raw.trim().toUpperCase();

  if (!CLAIM_CODE_RE.test(claimCode)) {
    return NextResponse.json({ ok: false, error: "無效的驗證碼格式。" }, { status: 400 });
  }

  const db = getAdminDb();
  const snap = await db.collection(CLAIM_COLLECTION).doc(claimCode).get();

  if (!snap.exists) {
    return NextResponse.json({ ok: true, status: "not_found" });
  }

  const data = snap.data() as {
    status?: string;
    expiresAt?: { toDate?: () => Date };
    claimedAt?: { toDate?: () => Date };
  };

  const status = data.status ?? "pending";
  const expiresAt = data.expiresAt?.toDate?.();
  const now = new Date();

  // 若仍是 pending 但已過期
  if (status === "pending" && expiresAt && expiresAt < now) {
    // 非同步更新狀態（fire and forget；不阻塞回應）
    void db.collection(CLAIM_COLLECTION).doc(claimCode).update({ status: "expired" }).catch(() => {});
    return NextResponse.json({ ok: true, status: "expired" });
  }

  return NextResponse.json({
    ok: true,
    status,
    claimedAt: status === "claimed"
      ? (data.claimedAt?.toDate?.()?.toISOString() ?? null)
      : null,
  });
}
