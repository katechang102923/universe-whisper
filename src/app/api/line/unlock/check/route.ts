import { NextResponse } from "next/server";
import { DB_BUSY_MESSAGE, isQuotaError } from "@/lib/apiErrors";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { LINE_RESULTS_COLLECTION } from "@/lib/lineResults";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const resultId = searchParams.get("resultId")?.trim() ?? "";

  if (!resultId) {
    return NextResponse.json({ ok: false, error: "缺少 resultId" }, { status: 400 });
  }

  try {
    const snap = await getAdminDb().collection(LINE_RESULTS_COLLECTION).doc(resultId).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: true, unlockStatus: "not_found" });
    }

    const data = snap.data() as { unlockStatus?: string };
    return NextResponse.json({ ok: true, unlockStatus: data.unlockStatus ?? "pending" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[line/unlock/check] failed:", message);
    return NextResponse.json(
      { ok: false, error: isQuotaError(err) ? DB_BUSY_MESSAGE : "伺服器錯誤" },
      { status: isQuotaError(err) ? 503 : 500 },
    );
  }
}
