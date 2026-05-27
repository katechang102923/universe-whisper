import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getSiteUrl, LINE_RESULTS_COLLECTION, pushResultToLine } from "@/lib/lineResults";

type VerifiedLineProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
};

async function verifyIdToken(idToken: string): Promise<VerifiedLineProfile> {
  const channelId = process.env.LINE_CHANNEL_ID || process.env.LINE_LOGIN_CHANNEL_ID;

  if (!channelId) {
    console.error("[line/connect] Missing LINE_CHANNEL_ID.");
    throw new Error("LINE_CHANNEL_ID is not configured.");
  }

  console.info("[line/connect] Verifying ID token", { hasLineChannelId: Boolean(process.env.LINE_CHANNEL_ID), hasFallbackLoginChannelId: Boolean(process.env.LINE_LOGIN_CHANNEL_ID) });
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

async function saveLineUser(profile: VerifiedLineProfile) {
  await getAdminDb()
    .collection("users")
    .doc(profile.userId)
    .set(
      {
        uid: profile.userId,
        lineUserId: profile.userId,
        displayName: profile.displayName,
        photoURL: profile.pictureUrl ?? "",
        plan: "free",
        paymentStatus: "none",
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    resultId?: unknown;
    idToken?: unknown;
    accessToken?: unknown;
  } | null;

  const resultId = typeof body?.resultId === "string" ? body.resultId.trim() : "";
  const idToken = typeof body?.idToken === "string" ? body.idToken.trim() : "";
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken.trim() : "";
  const envStatus = {
    hasLineChannelId: Boolean(process.env.LINE_CHANNEL_ID || process.env.LINE_LOGIN_CHANNEL_ID),
    hasLineChannelSecret: Boolean(process.env.LINE_CHANNEL_SECRET),
    hasLineChannelAccessToken: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
    hasFirebaseProjectId: Boolean(process.env.FIREBASE_PROJECT_ID),
    hasFirebaseClientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
    hasFirebasePrivateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY),
  };
  console.info("[line/connect] Request", {
    resultId,
    hasIdToken: Boolean(idToken),
    hasAccessToken: Boolean(accessToken),
    envStatus,
  });

  if (!resultId || (!idToken && !accessToken)) {
    return NextResponse.json({ ok: false, error: "缺少 LINE 登入資料或 resultId。" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const resultRef = db.collection(LINE_RESULTS_COLLECTION).doc(resultId);
    const resultSnap = await resultRef.get();
    console.info("[line/connect] Result lookup", { resultId, exists: resultSnap.exists });

    if (!resultSnap.exists) {
      return NextResponse.json({ ok: false, error: "找不到這次的宇宙訊息。" }, { status: 404 });
    }

    const profile = idToken ? await verifyIdToken(idToken) : await verifyAccessToken(accessToken);
    console.info("[line/connect] LINE profile verified", { resultId, hasUserId: Boolean(profile.userId), displayName: profile.displayName });

    await saveLineUser(profile);
    await resultRef.set(
      {
        lineUserId: profile.userId,
        lineDisplayName: profile.displayName,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await pushResultToLine(resultId, profile.userId, getSiteUrl(request), profile.displayName);
    console.info("[line/connect] Push result success", { resultId });

    return NextResponse.json({
      ok: true,
      resultId,
      pushStatus: "sent",
      lineDisplayName: profile.displayName,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "LINE connect failed.";
    console.error("[line/connect] Failed:", { resultId, errorMessage, envStatus });
    return NextResponse.json(
      { ok: false, pushStatus: "failed", error: errorMessage.includes("LINE push failed") ? "LINE 推送失敗，請確認你已加入宇宙偷偷話 LINE 好友後再試一次。" : "宇宙訊號有點微弱，請稍後再試一次。" },
      { status: 500 },
    );
  }
}
