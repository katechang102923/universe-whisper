import crypto from "crypto";
import { NextResponse } from "next/server";

// The redirect_uri must exactly match what is registered in LINE Developers Console.
const DESKTOP_REDIRECT_URI = "https://universe-whisper.vercel.app/line/connect";

function getBaseUrl(request: Request) {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
}

export async function GET(request: Request) {
  const clientId = process.env.LINE_LOGIN_CHANNEL_ID;
  const baseUrl = getBaseUrl(request);

  if (!clientId) {
    return NextResponse.redirect(new URL("/tarot?lineLogin=missing", baseUrl));
  }

  const url = new URL(request.url);
  // pendingId is the server-side message reference — encode it in the OAuth state so
  // it survives the cross-app redirect on mobile (Chrome → LINE app → Safari callback).
  const pendingId = url.searchParams.get("pendingId") ?? "";

  const csrf = crypto.randomUUID();
  // State carries both a CSRF nonce and the pendingId.
  // LINE passes the state back unchanged in the callback URL.
  const state = JSON.stringify({ csrf, pendingId });

  const response = NextResponse.redirect(
    `https://access.line.me/oauth2/v2.1/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: DESKTOP_REDIRECT_URI,
      state,
      scope: "profile openid",
    }).toString()}`,
  );

  // Store only the csrf nonce in the cookie for CSRF validation.
  response.cookies.set("line_connect_oauth_state", csrf, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  return response;
}
