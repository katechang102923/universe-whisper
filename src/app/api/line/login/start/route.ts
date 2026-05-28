import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function getBaseUrl(request: Request) {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const baseUrl = getBaseUrl(request);
  const returnTo = requestUrl.searchParams.get("returnTo") || "/tarot";
  const clientId = process.env.LINE_LOGIN_CHANNEL_ID;
  // LINE_LOGIN_REDIRECT_URI must exactly match the Callback URL registered in LINE Developers console.
  // Required: https://universe-whisper.vercel.app/api/line/login/callback
  const redirectUri = process.env.LINE_LOGIN_REDIRECT_URI || `${baseUrl}/api/line/login/callback`;

  console.log("[LINE Login] start", {
    LINE_LOGIN_CHANNEL_ID_set: Boolean(clientId),
    LINE_LOGIN_REDIRECT_URI: redirectUri,
    derivedBaseUrl: baseUrl,
    returnTo,
  });

  if (!clientId) {
    console.warn("[LINE Login] LINE_LOGIN_CHANNEL_ID is not set");
    return NextResponse.redirect(new URL(`${returnTo}${returnTo.includes("?") ? "&" : "?"}lineLogin=missing`, baseUrl));
  }

  const state = crypto.randomBytes(24).toString("hex");
  const cookieStore = await cookies();
  const secure = requestUrl.protocol === "https:";

  cookieStore.set("line_login_state", state, {
    httpOnly: true,
    maxAge: 600,
    path: "/",
    sameSite: "lax",
    secure
  });
  cookieStore.set("line_login_return_to", returnTo, {
    httpOnly: true,
    maxAge: 600,
    path: "/",
    sameSite: "lax",
    secure
  });

  const authorizeUrl = new URL("https://access.line.me/oauth2/v2.1/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("scope", "profile openid");

  // Log the full authorize URL for debugging (redirect_uri is not secret)
  console.log("[LINE Login] authorize URL:", authorizeUrl.toString());

  return NextResponse.redirect(authorizeUrl);
}
