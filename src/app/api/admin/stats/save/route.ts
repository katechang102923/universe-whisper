/**
 * POST /api/admin/stats/save
 *
 * 手動保存後台統計查詢結果到 admin_stats_manual_cache（每個日期區間一筆）。
 * 只允許管理員呼叫。read/write 僅限此後台快取 collection，不影響其他資料。
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getAdminUserIds } from "@/lib/rateLimit";
import { verifyAdminSessionCookie, SESSION_COOKIE_NAME } from "@/lib/verifyAdmin";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MANUAL_CACHE_COLLECTION = "admin_stats_manual_cache";

async function verifyAdmin() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const isGoogleAdmin = await verifyAdminSessionCookie(sessionCookie);
  const lineUserId = cookieStore.get("line_user_id")?.value ?? null;
  return isGoogleAdmin || Boolean(lineUserId && getAdminUserIds().includes(lineUserId));
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { start, end, source, statsResult, diagnostics } = body as {
    start?: string;
    end?: string;
    source?: string;
    statsResult?: unknown;
    diagnostics?: unknown;
  };

  if (!start || !end || !DATE_RE.test(start) || !DATE_RE.test(end)) {
    return NextResponse.json({ ok: false, error: "INVALID_DATE" }, { status: 400 });
  }
  if (!statsResult || typeof statsResult !== "object") {
    return NextResponse.json({ ok: false, error: "MISSING_STATS" }, { status: 400 });
  }

  const lo = start <= end ? start : end;
  const hi = start <= end ? end : start;
  const docId = `${lo}_${hi}`;

  try {
    const db = getAdminDb();
    await db.collection(MANUAL_CACHE_COLLECTION).doc(docId).set(
      {
        start: lo,
        end: hi,
        source: source ?? "raw_events",
        statsResult,
        diagnostics: diagnostics ?? null,
        savedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true, id: docId, savedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[admin/stats/save] failed:", err);
    return NextResponse.json({ ok: false, error: "SAVE_FAILED" }, { status: 500 });
  }
}
