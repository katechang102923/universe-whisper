import { NextResponse } from "next/server";
import { getFirebaseAdminEnvStatus } from "@/lib/firebaseAdmin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const isProduction = process.env.NODE_ENV === "production";
  const guard = process.env.DEBUG_ENV_CHECK_TOKEN || process.env.LINE_CHANNEL_SECRET;
  const providedKey = url.searchParams.get("key");

  if (isProduction && (!guard || providedKey !== guard)) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({
    hasLineLoginChannelId: Boolean(process.env.LINE_LOGIN_CHANNEL_ID),
    hasLineLoginChannelSecret: Boolean(process.env.LINE_LOGIN_CHANNEL_SECRET),
    hasLineChannelAccessToken: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
    hasLineChannelSecret: Boolean(process.env.LINE_CHANNEL_SECRET),
    hasLineLiffId: Boolean(process.env.LINE_LIFF_ID),
    hasNextPublicLineLiffId: Boolean(process.env.NEXT_PUBLIC_LINE_LIFF_ID),
    ...getFirebaseAdminEnvStatus(),
  });
}
