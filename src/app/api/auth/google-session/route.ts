/**
 * Google Admin Session Cookie
 *
 * POST  → verifies Firebase ID token → issues httpOnly session cookie (7 days)
 * DELETE → clears the session cookie (logout)
 *
 * Only used for admin panel access — regular users never call this.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export const SESSION_COOKIE_NAME = "__admin_session";
const SESSION_DURATION_MS = 60 * 60 * 24 * 7 * 1000; // 7 days

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { idToken } = body as { idToken?: string };

    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
    }

    // Ensure Firebase Admin is initialised before calling getAuth()
    getAdminDb();
    const sessionCookie = await getAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_DURATION_MS,
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_DURATION_MS / 1000,
      path: "/",
    });
    return response;
  } catch (err) {
    console.error("[auth/google-session] POST error:", err);
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
