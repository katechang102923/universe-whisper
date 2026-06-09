/**
 * POST /api/astro-profile/track
 * 三重星座（astro-profile）行為事件記錄端點。
 *
 * 純儀表化（instrumentation）：
 *  - 只記錄「行為事件」，不記錄出生日期 / 時間 / 城市等敏感個資，
 *    也不記錄完整解析內容。
 *  - 與塔羅、每日星座分開，獨立寫入 triple_zodiac_events collection，
 *    不混入 analytics_events，也不影響任何前台表單 / 付款 / LINE / Email 流程。
 *  - best-effort：任何錯誤都吞掉並回 { ok: true }，永遠不阻擋前台。
 */
import crypto from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { SESSION_COOKIE_NAME, verifyAdminSessionCookie } from "@/lib/verifyAdmin";
import { getAdminUserIds } from "@/lib/rateLimit";
import { isQuotaError } from "@/lib/apiErrors";

export const runtime = "nodejs";

export const TRIPLE_ZODIAC_EVENTS_COLLECTION = "triple_zodiac_events";

/** 允許記錄的三重星座事件類型（行為事件，不含內容）。 */
const VALID_EVENT_TYPES = new Set([
  "triple_zodiac_page_view",
  "triple_zodiac_started",
  "triple_zodiac_generated",
  "triple_zodiac_free_success",
  "triple_zodiac_line_sent",
  "triple_zodiac_email_sent",
  "triple_zodiac_story_downloaded",
]);

function getIp(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function hashIp(ip: string) {
  if (!ip || ip === "unknown") return null;
  const salt = process.env.ANALYTICS_IP_HASH_SALT ?? process.env.NEXTAUTH_SECRET ?? "universe-whisper";
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function getTaipeiDateParts(date = new Date()) {
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return { dateKey, monthKey: dateKey.slice(0, 7) };
}

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isLikelyTest(req: NextRequest, body: Record<string, unknown>) {
  if (body.isTest === true) return true;
  const host = req.headers.get("host") ?? "";
  return host.includes("localhost") || host.includes("127.0.0.1");
}

/** 與 analytics/events 相同的低成本管理員偵測：僅在有 admin cookie 時才驗證。 */
async function detectAdminFromCookies(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const lineUserIdCookie = cookieStore.get("line_user_id")?.value ?? null;
    if (lineUserIdCookie && getAdminUserIds().includes(lineUserIdCookie)) return true;
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
    if (!sessionCookie) return false;
    return await verifyAdminSessionCookie(sessionCookie);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const eventType = cleanString(body.eventType, 64);
    if (!VALID_EVENT_TYPES.has(eventType)) {
      return NextResponse.json({ ok: false, error: "INVALID_EVENT_TYPE" }, { status: 400 });
    }

    const isAdmin = await detectAdminFromCookies();
    const now = new Date();
    const { dateKey, monthKey } = getTaipeiDateParts(now);
    const userAgent = req.headers.get("user-agent") ?? "";

    // 只記錄行為相關欄位 — 絕不寫入出生資料或解析內容。
    const event = {
      eventType,
      feature: "triple_zodiac",
      createdAt: FieldValue.serverTimestamp(),
      clientCreatedAt: now.toISOString(),
      dateKey,
      monthKey,
      sessionId: cleanString(body.sessionId, 160) || null,
      source: cleanString(body.source, 64) || null,
      isPaid: body.isPaid === true,
      amount: typeof body.amount === "number" && Number.isFinite(body.amount) ? body.amount : 0,
      paymentSource: cleanString(body.paymentSource, 64) || null,
      pagePath: cleanString(body.pagePath, 160) || "/astro-profile",
      userAgent: userAgent.slice(0, 500),
      ipHash: hashIp(getIp(req)),
      isTest: isLikelyTest(req, body),
      isAdmin,
    };

    await getAdminDb().collection(TRIPLE_ZODIAC_EVENTS_COLLECTION).add(event);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const level = isQuotaError(err) ? "warn" : "error";
    console[level]("[astro-profile/track] best-effort write skipped:", err);
    // best-effort：永遠不阻擋前台
    return NextResponse.json({ ok: true, skipped: true });
  }
}
