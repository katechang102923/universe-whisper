import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("line_user_id")?.value;
  const displayName = cookieStore.get("line_display_name")?.value;

  return NextResponse.json({
    loggedIn: Boolean(userId),
    userId: userId ?? null,
    displayName: displayName ? decodeURIComponent(displayName) : ""
  });
}
