import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  REDEEM_CODES_COLLECTION,
  type RedeemCodeData,
} from "@/lib/redeemCodes";

export const runtime = "nodejs";

/**
 * POST /api/redeem/check
 * 公開查詢宇宙通行碼狀態（不需登入）。
 * 不回傳 usedLogs 問題內容，只回傳次數統計與狀態。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { code } = body as { code?: string };

    if (!code || typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ ok: false, error: "請輸入通行碼" }, { status: 400 });
    }

    const normalizedCode = code.trim().toUpperCase();
    const db = getAdminDb();
    const snap = await db.collection(REDEEM_CODES_COLLECTION).doc(normalizedCode).get();

    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "查無此宇宙通行碼" }, { status: 404 });
    }

    const data = snap.data() as RedeemCodeData;

    // 檢查是否過期（若 Firestore 狀態還未更新，這裡即時判斷）
    const now = new Date();
    const expiresAt =
      data.expiresAt instanceof Date
        ? data.expiresAt
        : (data.expiresAt as import("firebase-admin/firestore").Timestamp).toDate();

    const isExpired = data.status === "expired" || (data.status === "active" && now > expiresAt);
    const effectiveStatus = isExpired ? "expired" : data.status;

    const statusLabel: Record<string, string> = {
      active: "可使用",
      used_up: "已用完",
      expired: "已過期",
      disabled: "已停用",
    };

    // usedCount：只回傳次數，不回傳問題或個資
    const usedCount = (data.usedLogs ?? []).length;

    // 最近使用時間（只取最後一次，不含問題文字）
    const lastUsedAt = usedCount > 0
      ? (() => {
          const lastLog = data.usedLogs[usedCount - 1];
          const d = lastLog.usedAt instanceof Date
            ? lastLog.usedAt
            : (lastLog.usedAt as import("firebase-admin/firestore").Timestamp).toDate();
          return d.toISOString();
        })()
      : null;

    return NextResponse.json({
      ok: true,
      code: data.code,
      planName: data.planName,
      displayName: data.displayName,
      totalUses: data.totalUses,
      remainingUses: data.remainingUses,
      status: effectiveStatus,
      statusLabel: statusLabel[effectiveStatus] ?? effectiveStatus,
      expiresAt: expiresAt.toISOString(),
      usedCount,
      lastUsedAt,
    });
  } catch (err) {
    console.error("[redeem/check] error:", err);
    return NextResponse.json({ ok: false, error: "系統忙碌中，請稍後再試" }, { status: 500 });
  }
}
