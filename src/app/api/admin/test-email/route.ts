/**
 * POST /api/admin/test-email
 * 管理員測試 Email 寄送設定。
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminSessionCookie, SESSION_COOKIE_NAME } from "@/lib/verifyAdmin";
import { getAdminUserIds } from "@/lib/rateLimit";
import { sendRedeemCodeEmail } from "@/lib/sendRedeemCodeEmail";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // ── 驗證管理員 ─────────────────────────────────────────────────────────────
  const cookieStore   = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const isGoogleAdmin = await verifyAdminSessionCookie(sessionCookie);
  const lineUserId    = cookieStore.get("line_user_id")?.value ?? null;
  const isLineAdmin   = Boolean(lineUserId && getAdminUserIds().includes(lineUserId));
  if (!isGoogleAdmin && !isLineAdmin) {
    return NextResponse.json({ ok: false, message: "未授權" }, { status: 401 });
  }

  // ── 解析 body ────────────────────────────────────────────────────────────
  const body = await req.json().catch(() => ({})) as { email?: string };
  const email = (body.email ?? "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, message: "請輸入正確的 Email 格式。" }, { status: 400 });
  }

  console.log("[Admin] test email requested", { to: email });

  // ── 寄送測試信 ───────────────────────────────────────────────────────────
  const result = await sendRedeemCodeEmail({
    to:            email,
    code:          "UW-TEST-EMAIL",
    displayName:   "測試用（不計入通行碼）",
    totalUses:     1,
    remainingUses: 1,
    expiresAt:     new Date(Date.now() + 7 * 86400000),
  });

  if (result.ok) {
    return NextResponse.json({ ok: true, message: `測試信已寄出到 ${email}，請到信箱確認。` });
  }

  return NextResponse.json({
    ok:      false,
    errorCode: result.errorCode,
    message: result.errorMsg ?? "寄送失敗，請查看 Vercel Logs。",
  }, { status: 500 });
}
