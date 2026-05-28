import { NextResponse } from "next/server";

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

  const state = crypto.randomUUID();
  const response = NextResponse.redirect(
    `https://access.line.me/oauth2/v2.1/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: DESKTOP_REDIRECT_URI,
      state,
      scope: "profile openid",
    }).toString()}`,
  );

  response.cookies.set("line_connect_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  return response;
}
