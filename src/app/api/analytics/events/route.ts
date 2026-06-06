import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const VALID_EVENT_TYPES = new Set([
  "page_view",
  "session_start",
  "session_heartbeat",
  "tarot_draw_complete",
  "full_reading_click",
  "free_unlock",
  "line_save",
  "share_image_download_click",
  "payment_success",
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

function normalizePath(path: unknown) {
  if (typeof path !== "string") return "/";
  try {
    return new URL(path, "https://example.com").pathname;
  } catch {
    return path.startsWith("/") ? path.slice(0, 160) : "/";
  }
}

function isAdminPath(path: string) {
  return path.startsWith("/admin") || path.startsWith("/api/admin") || path.startsWith("/api/");
}

function getDeviceType(userAgent: string) {
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet/.test(ua)) return "tablet";
  if (/mobile|iphone|android/.test(ua)) return "mobile";
  if (ua) return "desktop";
  return "unknown";
}

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanSeconds(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), 7200);
}

function isLikelyTest(req: NextRequest, body: Record<string, unknown>) {
  if (body.isTest === true) return true;
  const host = req.headers.get("host") ?? "";
  return host.includes("localhost") || host.includes("127.0.0.1");
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const eventType = cleanString(body.eventType, 64);
    if (!VALID_EVENT_TYPES.has(eventType)) {
      return NextResponse.json({ ok: false, error: "INVALID_EVENT_TYPE" }, { status: 400 });
    }

    const path = normalizePath(body.path);
    if (isAdminPath(path)) return NextResponse.json({ ok: true, skipped: true });

    const now = new Date();
    const { dateKey, monthKey } = getTaipeiDateParts(now);
    const ip = getIp(req);
    const userAgent = req.headers.get("user-agent") ?? "";
    const referrer = cleanString(body.referrer, 500) || req.headers.get("referer") || "";

    const event: Record<string, unknown> = {
      eventType,
      createdAt: FieldValue.serverTimestamp(),
      clientCreatedAt: now.toISOString(),
      dateKey,
      monthKey,
      sessionId: cleanString(body.sessionId, 160) || null,
      anonymousId: cleanString(body.anonymousId, 160) || null,
      lineUserId: cleanString(body.lineUserId, 160) || null,
      ipHash: hashIp(ip),
      path,
      referrer,
      userAgent: userAgent.slice(0, 500),
      deviceType: getDeviceType(userAgent),
      isTest: isLikelyTest(req, body),
    };

    if (eventType === "session_start") {
      event.landingPath = normalizePath(body.landingPath ?? path);
    }
    if (eventType === "session_heartbeat") {
      event.activeSeconds = cleanSeconds(body.activeSeconds);
      event.pageActiveSeconds = cleanSeconds(body.pageActiveSeconds);
      event.totalSeconds = cleanSeconds(body.totalSeconds);
      event.lastActiveAt = cleanString(body.lastActiveAt, 64) || null;
    }

    await getAdminDb().collection("analytics_events").add(event);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[analytics/events] failed:", err);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
