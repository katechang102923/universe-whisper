import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyAdminSessionCookie, SESSION_COOKIE_NAME } from "@/lib/verifyAdmin";
import { getAdminUserIds, getTaipeiDate } from "@/lib/rateLimit";
import { jsonServerError } from "@/lib/apiErrors";

export const runtime = "nodejs";

async function verifyAdmin() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const isGoogleAdmin = await verifyAdminSessionCookie(sessionCookie);
  const lineUserId = cookieStore.get("line_user_id")?.value ?? null;
  return isGoogleAdmin || Boolean(lineUserId && getAdminUserIds().includes(lineUserId));
}

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days, 16));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function taipeiMinutes() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function snapshotCandidates(today: string) {
  const yesterday = addDays(today, -1);
  if (taipeiMinutes() >= 12 * 60 + 5) {
    return [`${today}_am`, `${yesterday}_full`];
  }
  return [`${yesterday}_full`];
}

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const today = getTaipeiDate();
  const db = getAdminDb();
  const candidates = snapshotCandidates(today);

  try {
    const snapDocs = await Promise.all(candidates.map((id) => db.collection("daily_admin_stats").doc(id).get()));
    const found = snapDocs.find((doc) => doc.exists);
    if (!found) {
      return NextResponse.json({
        ok: true,
        today,
        monthKey: today.slice(0, 7),
        unlock: {
          today: { free: 0, paid: 0, total: 0, ratio: "0%" },
          month: { free: 0, paid: 0, total: 0, ratio: "0%" },
          all: { free: 0, paid: 0, total: 0, ratio: "0%" },
        },
        questionTypes: { today: [], month: [], all: [] },
        spread: { today: [], month: [], all: [] },
        lineSave: {
          today: { count: 0, users: 0 },
          month: { count: 0, users: 0 },
          all: { count: 0, users: 0 },
        },
        traffic: {
          today: { visitors: 0, sessions: 0, pageViews: 0, avgActiveSeconds: 0, bounceRate: "0%" },
          month: { visitors: 0, sessions: 0, pageViews: 0, avgActiveSeconds: 0, bounceRate: "0%" },
          all: { visitors: 0, sessions: 0, pageViews: 0, avgActiveSeconds: 0, bounceRate: "0%" },
        },
        trafficSources: [],
        pageStay: [],
        funnel: [],
        funnelFilter: { type: "today", date: today },
        paymentOrderCount: 0,
        _snapshotMissing: true,
      });
    }

    const snap = found.data() as { statsPayload?: Record<string, unknown>; date?: string; period?: string };
    if (!snap.statsPayload) {
      return NextResponse.json({ ok: false, error: "SNAPSHOT_INVALID" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      _snapshotId: found.id,
      _snapshotDate: snap.date,
      _snapshotPeriod: snap.period,
      ...snap.statsPayload,
    });
  } catch (error) {
    console.error("[admin/stats] snapshot read failed:", error);
    return jsonServerError(error, "SNAPSHOT_READ_FAILED");
  }
}
