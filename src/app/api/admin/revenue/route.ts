/**
 * GET /api/admin/revenue?year=2026&month=6
 *
 * 回傳指定月份的收入統計。
 * 需要管理員 session 才可存取。
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { PAYMENT_ORDERS_COLLECTION } from "@/lib/redeemCodes";
import { verifyAdminSessionCookie, SESSION_COOKIE_NAME } from "@/lib/verifyAdmin";
import { getAdminUserIds } from "@/lib/rateLimit";

export const runtime = "nodejs";

// ── 工具 ──────────────────────────────────────────────────────────────────────

function resolveDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object" && "toDate" in v) return (v as { toDate(): Date }).toDate();
  if (typeof v === "object" && "seconds" in v)
    return new Date((v as { seconds: number }).seconds * 1000);
  if (typeof v === "string") { const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  return null;
}

function resolveAmount(order: Record<string, unknown>): number {
  const v = order.paidAmount ?? order.amount ?? order.tradeAmt;
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
  return 0;
}

function isTestOrder(order: Record<string, unknown>): boolean {
  return Boolean(order.isTest) || Boolean(order.isTestPayment);
}

function pad2(n: number) { return String(n).padStart(2, "0"); }

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── 驗證管理員 ─────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const isGoogleAdmin = await verifyAdminSessionCookie(sessionCookie);
  const lineUserId = cookieStore.get("line_user_id")?.value ?? null;
  const isLineAdmin = Boolean(lineUserId && getAdminUserIds().includes(lineUserId));
  if (!isGoogleAdmin && !isLineAdmin) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  // ── 解析月份參數 ────────────────────────────────────────────────────────────
  const url = new URL(req.url);
  const now  = new Date();
  const year  = parseInt(url.searchParams.get("year")  ?? String(now.getFullYear()), 10);
  const month = parseInt(url.searchParams.get("month") ?? String(now.getMonth() + 1), 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ ok: false, error: "INVALID_PARAMS" }, { status: 400 });
  }

  // 台北時區月份起訖（用 UTC+8 轉換）
  const tzOffset = 8 * 60 * 60 * 1000;
  const monthStart = new Date(Date.UTC(year, month - 1, 1) - tzOffset);   // 台北 1 日 00:00 → UTC
  const monthEnd   = new Date(Date.UTC(year, month, 1) - tzOffset);       // 台北 下月 1 日 00:00 → UTC

  // ── 查詢 Firestore ─────────────────────────────────────────────────────────
  const db = getAdminDb();
  let allDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];

  try {
    // 優先以 paidAt 範圍查詢
    const snap = await db
      .collection(PAYMENT_ORDERS_COLLECTION)
      .where("createdAt", ">=", monthStart)
      .where("createdAt", "<",  monthEnd)
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();
    allDocs = snap.docs;
  } catch (e) {
    console.error("[admin/revenue] Firestore query failed:", e);
    return NextResponse.json({ ok: false, error: "QUERY_FAILED" }, { status: 500 });
  }

  // ── 計算統計 ───────────────────────────────────────────────────────────────

  // 每日資料 map: "2026-06-04" → { paid, revenue, test, refund }
  const dailyMap = new Map<string, { paid: number; revenue: number; test: number; refund: number; pending: number; failed: number; lastPaidAt: string | null }>();
  // 方案分布 map: planName → { count, revenue }
  const planMap = new Map<string, { count: number; revenue: number }>();

  let totalPaid      = 0;
  let totalPending   = 0;
  let totalFailed    = 0;
  let totalRefunded  = 0;
  let totalTest      = 0;
  let grossRevenue   = 0;  // 所有 paid（含測試）
  let realRevenue    = 0;  // paid 排除測試
  let refundedAmount = 0;
  let testRevenue    = 0;

  for (const doc of allDocs) {
    const o = doc.data() as Record<string, unknown>;
    const status  = (o.status as string) ?? "pending";
    const amount  = resolveAmount(o);
    const isTest  = isTestOrder(o);
    const planName = (o.planName as string) ?? (o.planId as string) ?? "未知方案";

    // 判斷日期（台北時區日期字串）
    const dateRef =
      resolveDate(o.paidAt) ??
      resolveDate(o.paymentDate) ??
      resolveDate(o.createdAt);

    const dayKey = dateRef
      ? dateRef.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" })
      : null;

    // 初始化每日 bucket
    if (dayKey && !dailyMap.has(dayKey)) {
      dailyMap.set(dayKey, { paid: 0, revenue: 0, test: 0, refund: 0, pending: 0, failed: 0, lastPaidAt: null });
    }
    const day = dayKey ? dailyMap.get(dayKey)! : null;

    if (status === "paid") {
      totalPaid++;
      grossRevenue += amount;
      if (isTest) {
        totalTest++;
        testRevenue += amount;
        if (day) day.test++;
      } else {
        realRevenue += amount;
        if (day) {
          day.paid++;
          day.revenue += amount;
          // 記錄最近一筆成功付款時間（ISO 字串）
          const paidTs = resolveDate(o.paidAt) ?? resolveDate(o.paymentDate) ?? resolveDate(o.createdAt);
          if (paidTs) {
            const paidIso = paidTs.toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }).replace(" ", "T");
            if (!day.lastPaidAt || paidIso > day.lastPaidAt) day.lastPaidAt = paidIso;
          }
        }
      }
      // 方案分布（只算實際付款，含測試也顯示）
      if (!isTest) {
        const p = planMap.get(planName) ?? { count: 0, revenue: 0 };
        p.count++;
        p.revenue += amount;
        planMap.set(planName, p);
      }
    } else if (status === "refunded") {
      totalRefunded++;
      refundedAmount += amount;
      if (day) day.refund++;
    } else if (status === "pending") {
      totalPending++;
      if (day) day.pending++;
    } else if (status === "failed") {
      totalFailed++;
      if (day) day.failed++;
    }
  }

  const avgOrderValue = totalPaid > 0 ? Math.round(realRevenue / (totalPaid - totalTest)) || 0 : 0;

  // 每日明細陣列（依日期排序）
  const dailyRows = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, ...d }));

  // 方案分布陣列
  const planRows = Array.from(planMap.entries())
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .map(([name, d]) => ({
      planName: name,
      count:    d.count,
      revenue:  d.revenue,
      avgPrice: d.count > 0 ? Math.round(d.revenue / d.count) : 0,
      ratio:    realRevenue > 0 ? Math.round((d.revenue / realRevenue) * 100) : 0,
    }));

  return NextResponse.json({
    ok: true,
    year,
    month,
    summary: {
      totalPaid,
      totalPending,
      totalFailed,
      totalRefunded,
      totalTest,
      grossRevenue,
      realRevenue,
      refundedAmount,
      testRevenue,
      netRevenue: realRevenue - refundedAmount,
      avgOrderValue,
    },
    planRows,
    dailyRows,
  });
}
