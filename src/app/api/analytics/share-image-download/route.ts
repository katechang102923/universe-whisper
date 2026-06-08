/**
 * POST /api/analytics/share-image-download
 *
 * 紀錄使用者下載分享圖的事件。
 * 火後遺忘（fire-and-forget），不阻擋前台操作。
 */
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getTaipeiDate, getAdminUserIds } from "@/lib/rateLimit";
import { SESSION_COOKIE_NAME, verifyAdminSessionCookie } from "@/lib/verifyAdmin";

export const runtime = "nodejs";

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function detectAdminFromCookies(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const lineUserIdCookie = cookieStore.get("line_user_id")?.value ?? null;
    if (lineUserIdCookie && getAdminUserIds().includes(lineUserIdCookie)) return true;
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
    if (!sessionCookie) return false;
    return await verifyAdminSessionCookie(sessionCookie);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      anonymousId?: string | null;
      lineUserId?:  string | null;
      spreadType?:  string | null;
      source?:      string | null;
      isTest?:      boolean;
    };

    const ip         = getIp(req);
    const dateKey    = getTaipeiDate();
    const anonymousId = body.anonymousId || null;
    const lineUserId  = body.lineUserId  || null;
    const spreadType  = body.spreadType  || "unknown";
    const source      = body.source      || "web";
    const isTest      = Boolean(body.isTest);
    const isAdmin     = await detectAdminFromCookies();

    const db = getAdminDb();
    await db.collection("share_image_downloads").add({
      eventType:   "share_image_download",
      createdAt:   FieldValue.serverTimestamp(),
      dateKey,
      anonymousId,
      lineUserId,
      ip,
      spreadType,
      source,
      isTest,
      isAdmin,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[analytics/share-image-download] error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
