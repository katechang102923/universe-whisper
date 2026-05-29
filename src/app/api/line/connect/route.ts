import { NextResponse } from "next/server";
import { pushLineTextMessage } from "@/lib/lineResults";
import { getAdminDb } from "@/lib/firebaseAdmin";

type VerifiedLineProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
};

type LineTokenResponse = {
  access_token?: string;
  id_token?: string;
};

const DESKTOP_REDIRECT_URI = "https://universe-whisper.vercel.app/line/connect";

function maskClientId(value: string) {
  if (value.length <= 6) {
    return `${value.slice(0, 2)}***`;
  }

  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

async function verifyIdToken(idToken: string): Promise<VerifiedLineProfile> {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;

  if (!channelId) {
    console.error("[line/connect] Missing LINE_LOGIN_CHANNEL_ID.");
    throw new Error("LINE_LOGIN_CHANNEL_ID is not configured.");
  }

  console.info("[line/connect] Verifying ID token", {
    verifyClientId: maskClientId(channelId),
    hasLineLoginChannelId: Boolean(process.env.LINE_LOGIN_CHANNEL_ID),
  });
  const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      id_token: idToken,
      client_id: channelId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("[line/connect] ID token verify failed", { status: response.status, message: errorText });
    throw new Error(`LINE ID token verify failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { sub?: string; name?: string; picture?: string };

  if (!data.sub) {
    throw new Error("LINE ID token did not include user id.");
  }

  return {
    userId: data.sub,
    displayName: data.name ?? "",
    pictureUrl: data.picture,
  };
}

async function verifyAccessToken(accessToken: string): Promise<VerifiedLineProfile> {
  console.info("[line/connect] Fetching LINE profile with access token");
  const response = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("[line/connect] Profile fetch failed", { status: response.status, message: errorText });
    throw new Error(`LINE profile fetch failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { userId?: string; displayName?: string; pictureUrl?: string };

  if (!data.userId) {
    throw new Error("LINE profile did not include user id.");
  }

  return {
    userId: data.userId,
    displayName: data.displayName ?? "",
    pictureUrl: data.pictureUrl,
  };
}

async function exchangeCodeForAccessToken(code: string, redirectUri: string): Promise<LineTokenResponse> {
  const clientId = process.env.LINE_LOGIN_CHANNEL_ID;
  const clientSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;

  if (!clientId) {
    console.error("[line/connect] Missing LINE_LOGIN_CHANNEL_ID.");
    throw new Error("LINE_LOGIN_CHANNEL_ID is not configured.");
  }

  if (!clientSecret) {
    console.error("[line/connect] Missing LINE_LOGIN_CHANNEL_SECRET.");
    throw new Error("LINE_LOGIN_CHANNEL_SECRET is not configured.");
  }

  console.info("[line/connect] Exchanging callback code", {
    verifyClientId: maskClientId(clientId),
    redirectUri,
  });
  const response = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("[line/connect] Code exchange failed", { status: response.status, message: errorText, redirectUri });
    throw new Error(`LINE code exchange failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as LineTokenResponse;
  if (!data.access_token) {
    throw new Error("LINE token response did not include access_token.");
  }

  return data;
}

async function verifyLineProfile(params: {
  code: string;
  redirectUri: string;
  idToken: string;
  accessToken: string;
}): Promise<VerifiedLineProfile> {
  if (params.code) {
    const tokenResponse = await exchangeCodeForAccessToken(
      params.code,
      params.redirectUri || DESKTOP_REDIRECT_URI,
    );

    if (tokenResponse.id_token) {
      await verifyIdToken(tokenResponse.id_token);
    }

    return verifyAccessToken(tokenResponse.access_token ?? "");
  }

  if (params.idToken) {
    try {
      return await verifyIdToken(params.idToken);
    } catch (error) {
      if (!params.accessToken) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : "ID token verification failed.";
      console.warn("[line/connect] ID token verify failed; falling back to access token", { errorMessage });
    }
  }

  return verifyAccessToken(params.accessToken);
}

function normalizeLineMessage(message: string) {
  return message.replace(/\r\n/g, "\n").trim().slice(0, 4800);
}

// Fetch message from the server-side pending store by pendingId.
// Used as fallback when the client-side message is missing (cross-browser mobile).
async function fetchPendingMessage(pendingId: string): Promise<string> {
  try {
    const db = getAdminDb();
    const snap = await db.collection("linePendingMessages").doc(pendingId).get();
    if (!snap.exists) return "";
    const data = snap.data() as { message?: string; expiresAt?: string };
    if (data.expiresAt && new Date(data.expiresAt) < new Date()) return "";
    return typeof data.message === "string" ? data.message : "";
  } catch (err) {
    console.warn("[line/connect] fetchPendingMessage failed:", err);
    return "";
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
    pendingId?: unknown;
    code?: unknown;
    redirectUri?: unknown;
    idToken?: unknown;
    accessToken?: unknown;
  } | null;

  let message = normalizeLineMessage(typeof body?.message === "string" ? body.message : "");
  const pendingId = typeof body?.pendingId === "string" ? body.pendingId.trim() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const redirectUri = typeof body?.redirectUri === "string" ? body.redirectUri.trim() : DESKTOP_REDIRECT_URI;
  const idToken = typeof body?.idToken === "string" ? body.idToken.trim() : "";
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken.trim() : "";

  const envStatus = {
    hasLineLoginChannelId: Boolean(process.env.LINE_LOGIN_CHANNEL_ID),
    hasLineLoginChannelSecret: Boolean(process.env.LINE_LOGIN_CHANNEL_SECRET),
    hasLineChannelAccessToken: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
  };

  console.info("[line/connect] Request", {
    hasMessage: Boolean(message),
    hasPendingId: Boolean(pendingId),
    messageLength: message.length,
    hasCode: Boolean(code),
    hasRedirectUri: Boolean(redirectUri),
    hasIdToken: Boolean(idToken),
    hasAccessToken: Boolean(accessToken),
    envStatus,
  });

  // If local message is missing, try fetching from server-side pending store.
  // This handles iOS cross-browser case: Chrome → LINE app → Safari (different localStorage).
  if (!message && pendingId) {
    console.info("[line/connect] Local message missing; fetching via pendingId", { pendingId });
    message = normalizeLineMessage(await fetchPendingMessage(pendingId));
  }

  if (!message || (!code && !idToken && !accessToken)) {
    return NextResponse.json({ ok: false, error: "缺少 LINE 登入資料或本次抽牌訊息。" }, { status: 400 });
  }

  try {
    const profile = await verifyLineProfile({ code, redirectUri, idToken, accessToken });
    await pushLineTextMessage(profile.userId, message);

    console.info("[line/connect] Push success", {
      hasUserId: Boolean(profile.userId),
      displayName: profile.displayName,
      messageLength: message.length,
      usedPendingId: !body?.message && Boolean(pendingId),
    });

    return NextResponse.json({
      ok: true,
      pushStatus: "sent",
      lineDisplayName: profile.displayName,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "LINE connect failed.";
    console.error("[line/connect] Failed:", { errorMessage, envStatus });
    return NextResponse.json(
      {
        ok: false,
        pushStatus: "failed",
        error: errorMessage.includes("LINE push failed")
          ? "LINE 推送失敗，請確認已加入官方帳號好友後再試一次。"
          : errorMessage,
      },
      { status: 500 },
    );
  }
}
