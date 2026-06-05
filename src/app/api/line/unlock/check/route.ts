import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { LINE_RESULTS_COLLECTION } from "@/lib/lineResults";

export const runtime = "nodejs";

// GET /api/line/unlock/check?resultId=xxx
// 查詢指定 resultId 的 LINE 解鎖狀態
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const resultId = searchParams.get("resultId")?.trim() ?? "";

  if (!resultId) {
    return NextResponse.json({ ok: false, error: "缺少 resultId" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const snap = await db.collection(LINE_RESULTS_COLLECTION).doc(resultId).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: true, unlockStatus: "not_found" });
    }
    const data = snap.data() as { unlockStatus?: string };
    return NextResponse.json({ ok: true, unlockStatus: data.unlockStatus ?? "pending" });
  } catch (err) {
    console.error("[line/unlock/check] failed:", err);
    return NextResponse.json({ ok: false, error: "伺服器錯誤" }, { status: 500 });
  }
}
