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
  const response = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
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

  if (!resultId || (!idToken && !accessToken)) {
    return NextResponse.json({ ok: false, error: "缺少 LINE 登入資料或 resultId。" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const resultRef = db.collection(LINE_RESULTS_COLLECTION).doc(resultId);
    const resultSnap = await resultRef.get();

    if (!resultSnap.exists) {
      return NextResponse.json({ ok: false, error: "找不到這次的宇宙訊息。" }, { status: 404 });
    }

    const profile = idToken ? await verifyIdToken(idToken) : await verifyAccessToken(accessToken);

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

    return NextResponse.json({
      ok: true,
      resultId,
      pushStatus: "sent",
      lineDisplayName: profile.displayName,
    });
  } catch (error) {
    console.error("[line/connect] Failed:", error);
    return NextResponse.json(
      { ok: false, pushStatus: "failed", error: "宇宙訊號有點微弱，請稍後再試一次。" },
      { status: 500 },
    );
  }
}
