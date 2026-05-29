import crypto from "crypto";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

// Temporary server-side store for LINE messages.
// Used when the client cannot rely on sessionStorage/localStorage surviving
// a cross-app OAuth redirect on iOS (Chrome → LINE app → Safari callback).
// TTL: 20 minutes — enough for any reasonable OAuth flow.

const PENDING_TTL_MS = 20 * 60 * 1000;
const COLLECTION = "linePendingMessages";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const message =
    typeof body?.message === "string" ? body.message.trim().slice(0, 4800) : "";

  if (!message) {
    return NextResponse.json({ ok: false, error: "缺少訊息內容。" }, { status: 400 });
  }

  const pendingId = crypto.randomUUID();

  try {
    const db = getAdminDb();
    await db.collection(COLLECTION).doc(pendingId).set({
      pendingId,
      message,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + PENDING_TTL_MS).toISOString(),
    });
    console.info("[line/pending] Saved pending message", { pendingId, messageLength: message.length });
    return NextResponse.json({ ok: true, pendingId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Firestore error";
    console.error("[line/pending] Failed to save:", { pendingId, errorMessage });
    // Non-fatal: client will fall back to localStorage
    return NextResponse.json({ ok: false, error: "暫時無法儲存訊息。" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pendingId = url.searchParams.get("pendingId") ?? "";

  if (!pendingId) {
    return NextResponse.json({ ok: false, error: "缺少 pendingId。" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const snap = await db.collection(COLLECTION).doc(pendingId).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "找不到暫存訊息。" }, { status: 404 });
    }
    const data = snap.data() as { message?: string; expiresAt?: string };
    if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
      return NextResponse.json({ ok: false, error: "暫存訊息已過期。" }, { status: 410 });
    }
    return NextResponse.json({ ok: true, message: data.message ?? "" });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Firestore error";
    console.error("[line/pending] GET failed:", { pendingId, errorMessage });
    return NextResponse.json({ ok: false, error: "無法取得暫存訊息。" }, { status: 500 });
  }
}
