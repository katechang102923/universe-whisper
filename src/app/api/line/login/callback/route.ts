import { FieldValue } from "firebase-admin/firestore";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

type LineProfile = {
  userId: string;
  displayName?: string;
  pictureUrl?: string;
};

function getBaseUrl(request: Request) {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
}

function withStatus(returnTo: string, status: string, baseUrl: string) {
  return new URL(`${returnTo}${returnTo.includes("?") ? "&" : "?"}lineLogin=${status}`, baseUrl);
}

async function saveLineUser(profile: LineProfile) {
  try {
    await getAdminDb()
      .collection("users")
      .doc(profile.userId)
      .set(
        {
          uid: profile.userId,
          lineUserId: profile.userId,
          displayName: profile.displayName ?? "",
          photoURL: profile.pictureUrl ?? "",
          plan: "free",
          paymentStatus: "none",
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
  } catch (error) {
    console.warn("LINE user profile was not saved:", error);
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const baseUrl = getBaseUrl(request);
  const cookieStore = await cookies();
  const returnTo = cookieStore.get("line_login_return_to")?.value || "/tarot";
  const savedState = cookieStore.get("line_login_state")?.value;
  const state = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code");
  const clientId = process.env.LINE_LOGIN_CHANNEL_ID;
  const clientSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  const redirectUri = process.env.LINE_LOGIN_REDIRECT_URI || `${baseUrl}/api/line/login/callback`;

  cookieStore.delete("line_login_state");
  cookieStore.delete("line_login_return_to");

  if (!code || !savedState || state !== savedState || !clientId || !clientSecret) {
    return NextResponse.redirect(withStatus(returnTo, "failed", baseUrl));
  }

  const tokenResponse = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret
    })
  });

  if (!tokenResponse.ok) {
    return NextResponse.redirect(withStatus(returnTo, "failed", baseUrl));
  }

  const tokenData = (await tokenResponse.json()) as { access_token?: string };

  if (!tokenData.access_token) {
    return NextResponse.redirect(withStatus(returnTo, "failed", baseUrl));
  }

  const profileResponse = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });

  if (!profileResponse.ok) {
    return NextResponse.redirect(withStatus(returnTo, "failed", baseUrl));
  }

  const profile = (await profileResponse.json()) as LineProfile;

  if (!profile.userId) {
    return NextResponse.redirect(withStatus(returnTo, "failed", baseUrl));
  }

  await saveLineUser(profile);

  const secure = requestUrl.protocol === "https:";
  cookieStore.set("line_user_id", profile.userId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secure
  });
  cookieStore.set("line_display_name", encodeURIComponent(profile.displayName ?? ""), {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secure
  });

  return NextResponse.redirect(withStatus(returnTo, "success", baseUrl));
}
