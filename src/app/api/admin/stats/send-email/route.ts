/**
 * POST /api/admin/stats/send-email
 *
 * 後台手動寄送統計報表到 Email。只允許管理員呼叫。
 * 寄信邏輯全在 server 端（Resend），RESEND_API_KEY 不回傳前端、不印完整金鑰。
 *
 * Body:
 *   { email, dateFrom, dateTo, source, statsResult, diagnostics }
 *
 * 不會自動寄送；由前台管理員手動觸發。
 * 寄送成功後，若 admin_stats_manual_cache 已有對應保存資料，補寫 emailedAt / emailedTo / emailStatus。
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getAdminUserIds } from "@/lib/rateLimit";
import {
  verifyAdminSessionCookie,
  SESSION_COOKIE_NAME,
  getAdminEmailList,
} from "@/lib/verifyAdmin";
import {
  sendStatsReportEmail,
  type StatsEmailPayload,
  type StatsEmailDay,
  type StatsEmailFeatureRow,
} from "@/lib/adminStatsEmail";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MANUAL_CACHE_COLLECTION = "admin_stats_manual_cache";

async function verifyAdmin() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const isGoogleAdmin = await verifyAdminSessionCookie(sessionCookie);
  const lineUserId = cookieStore.get("line_user_id")?.value ?? null;
  return isGoogleAdmin || Boolean(lineUserId && getAdminUserIds().includes(lineUserId));
}

function num(v: unknown): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

// 將前端傳來（不受信任）的 statsResult 規格化成 Email payload，缺值補 0。
function normalizePayload(body: Record<string, unknown>): StatsEmailPayload {
  const dateFrom = String(body.dateFrom ?? "");
  const dateTo = String(body.dateTo ?? "");
  const source = body.source === "manual_cache" ? "manual_cache" : "raw_events";

  const stats = (body.statsResult ?? {}) as Record<string, unknown>;
  const t = (stats.totals ?? {}) as Record<string, unknown>;
  const rawDays = Array.isArray(stats.days) ? (stats.days as Record<string, unknown>[]) : [];
  const rawFeatures = Array.isArray(stats.featureRanking)
    ? (stats.featureRanking as Record<string, unknown>[])
    : [];
  const diag = (body.diagnostics ?? {}) as Record<string, unknown>;

  const days: StatsEmailDay[] = rawDays.map((d) => ({
    date: String(d.date ?? ""),
    visitors: num(d.visitors),
    pageViews: num(d.pageViews),
    tarotSingleSuccess: num(d.tarotSingleSuccess),
    tarotThreeSuccess: num(d.tarotThreeSuccess),
    astroProfileSuccess: num(d.astroProfileSuccess),
    paidAttempts: num(d.paidAttempts),
    paidSuccess: num(d.paidSuccess),
    revenue: num(d.revenue),
  }));

  const featureRanking: StatsEmailFeatureRow[] = rawFeatures.map((r) => ({
    label: String(r.label ?? ""),
    count: num(r.count),
  }));

  return {
    dateFrom,
    dateTo,
    source,
    totals: {
      visitors: num(t.visitors),
      pageViews: num(t.pageViews),
      tarotDrawSuccess: num(t.tarotDrawSuccess),
      tarotSingleSuccess: num(t.tarotSingleSuccess),
      tarotThreeSuccess: num(t.tarotThreeSuccess),
      freeSuccess: num(t.freeSuccess),
      paidAttempts: num(t.paidAttempts),
      paidSuccess: num(t.paidSuccess),
      revenue: num(t.revenue),
      astroProfilePageViews: num(t.astroProfilePageViews),
      astroProfileFreeSuccess: num(t.astroProfileFreeSuccess),
      astroProfileAttempts: num(t.astroProfileAttempts),
      astroProfilePaidSuccess: num(t.astroProfilePaidSuccess),
      astroProfileRevenue: num(t.astroProfileRevenue),
    },
    days,
    featureRanking,
    diagnostics: {
      analyticsEventsRead: num(diag.analyticsEventsRead),
      rateLimitsRead: num(diag.rateLimitsRead),
      tripleZodiacEventsRead: num(diag.tripleZodiacEventsRead),
      paymentOrdersRead: num(diag.paymentOrdersRead),
      astroProfileOrdersRead: num(diag.astroProfileOrdersRead),
      excludedAdminTest: num(diag.excludedAdminTest),
    },
  };
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // 收件人：未提供 → 預設管理員白名單第一個
  const requested = typeof body.email === "string" ? body.email.trim() : "";
  const fallbackAdmin = getAdminEmailList()[0] ?? "";
  const to = requested || fallbackAdmin;

  if (!to || !EMAIL_RE.test(to)) {
    return NextResponse.json({ ok: false, error: "INVALID_EMAIL", message: "請輸入有效的收件 Email。" }, { status: 400 });
  }

  const payload = normalizePayload(body);
  if (!DATE_RE.test(payload.dateFrom) || !DATE_RE.test(payload.dateTo)) {
    return NextResponse.json({ ok: false, error: "INVALID_DATE" }, { status: 400 });
  }

  const result = await sendStatsReportEmail({ to, payload });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "EMAIL_FAILED", message: "Email 寄送失敗，請稍後再試。" },
      { status: 502 },
    );
  }

  // 寄送成功：若已有保存資料則補寫寄送紀錄（沒有則略過，不強制建立）
  try {
    const db = getAdminDb();
    const docId = `${payload.dateFrom}_${payload.dateTo}`;
    const ref = db.collection(MANUAL_CACHE_COLLECTION).doc(docId);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.update({
        emailedAt: FieldValue.serverTimestamp(),
        emailedTo: to,
        emailStatus: "sent",
      });
    }
  } catch (err) {
    // 寫紀錄失敗不影響「Email 已寄出」的結果
    console.error("[admin/stats/send-email] cache record update failed:", err);
  }

  return NextResponse.json({ ok: true, emailedTo: to, messageId: result.messageId ?? null });
}
