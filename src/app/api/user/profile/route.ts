import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { defaultEntitlements, type UserProfile } from "@/lib/features";
import { getAdminDb } from "@/lib/firebaseAdmin";

function unavailable(error: unknown) {
  return NextResponse.json(
    {
      error: "Firebase Admin 尚未設定完成。",
      detail: error instanceof Error ? error.message : "Unknown error"
    },
    { status: 503 }
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("uid");

  if (!uid) {
    return NextResponse.json({ error: "缺少 uid。" }, { status: 400 });
  }

  try {
    const snapshot = await getAdminDb().collection("users").doc(uid).get();
    if (!snapshot.exists) {
      return NextResponse.json({ error: "找不到使用者。" }, { status: 404 });
    }

    return NextResponse.json({ profile: snapshot.data() });
  } catch (error) {
    return unavailable(error);
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<UserProfile>;

  if (!body.uid) {
    return NextResponse.json({ error: "缺少 uid。" }, { status: 400 });
  }

  const profile = {
    uid: body.uid,
    lineUserId: body.lineUserId ?? null,
    displayName: body.displayName ?? "",
    photoURL: body.photoURL ?? "",
    birthDate: body.birthDate ?? "",
    zodiacSign: body.zodiacSign ?? "",
    plan: body.plan ?? "free",
    paymentStatus: body.paymentStatus ?? "none",
    entitlements: body.entitlements ?? defaultEntitlements,
    usage: body.usage ?? {
      freeTarotCount: 0,
      aiReadingCount: 0
    },
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp()
  };

  try {
    await getAdminDb().collection("users").doc(body.uid).set(profile, { merge: true });
    return NextResponse.json({ profile });
  } catch (error) {
    return unavailable(error);
  }
}
