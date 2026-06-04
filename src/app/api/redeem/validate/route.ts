import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  REDEEM_CODES_COLLECTION,
  type RedeemCodeData,
  type RedeemErrorCode,
} from "@/lib/redeemCodes";
import { LINE_RESULTS_COLLECTION } from "@/lib/lineResults";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { code, resultId } = body as { code?: string; resultId?: string };

    if (!code || typeof code !== "string" || !resultId || typeof resultId !== "string") {
      return NextResponse.json(
        { ok: false, errorCode: "NOT_FOUND" as RedeemErrorCode },
        { status: 400 },
      );
    }

    const normalizedCode = code.trim().toUpperCase();
    const db = getAdminDb();

    type TxResult =
      | { ok: true; remainingUses: number; fullText: string }
      | { ok: false; errorCode: RedeemErrorCode };

    const txResult: TxResult = await db.runTransaction(async (tx) => {
      // ── 讀取兌換碼 ─────────────────────────────────────────────────────────
      const codeRef = db.collection(REDEEM_CODES_COLLECTION).doc(normalizedCode);
      const codeSnap = await tx.get(codeRef);

      if (!codeSnap.exists) {
        return { ok: false, errorCode: "NOT_FOUND" as RedeemErrorCode };
      }

      const codeData = codeSnap.data() as RedeemCodeData;

      // ── 狀態檢查 ───────────────────────────────────────────────────────────
      if (codeData.status === "used_up") {
        return { ok: false, errorCode: "USED_UP" as RedeemErrorCode };
      }
      if (codeData.status === "disabled") {
        return { ok: false, errorCode: "DISABLED" as RedeemErrorCode };
      }

      // ── 過期檢查 ───────────────────────────────────────────────────────────
      const now = new Date();
      const expiresAt =
        codeData.expiresAt instanceof Date
          ? codeData.expiresAt
          : (codeData.expiresAt as import("firebase-admin/firestore").Timestamp).toDate();

      if (codeData.status === "expired" || now > expiresAt) {
        if (codeData.status !== "expired") {
          tx.update(codeRef, { status: "expired" });
        }
        return { ok: false, errorCode: "EXPIRED" as RedeemErrorCode };
      }

      // ── 次數檢查 ───────────────────────────────────────────────────────────
      if (codeData.remainingUses <= 0) {
        tx.update(codeRef, { status: "used_up" });
        return { ok: false, errorCode: "USED_UP" as RedeemErrorCode };
      }

      // ── 重複解鎖檢查（同一 resultId + 同一 code） ─────────────────────────
      const alreadyUsed = (codeData.usedLogs ?? []).some(
        (log) => log.resultId === resultId,
      );
      if (alreadyUsed) {
        return { ok: false, errorCode: "ALREADY_USED" as RedeemErrorCode };
      }

      // ── 讀取塔羅結果 ──────────────────────────────────────────────────────
      const resultRef = db.collection(LINE_RESULTS_COLLECTION).doc(resultId);
      const resultSnap = await tx.get(resultRef);

      if (!resultSnap.exists) {
        return { ok: false, errorCode: "NOT_FOUND" as RedeemErrorCode };
      }

      const resultData = resultSnap.data() as {
        question?: string;
        type?: string;
        spreadType?: string;
        fullText?: string;
        unlocked?: boolean;
      };

      // ── 扣除次數（Atomic） ────────────────────────────────────────────────
      const newRemainingUses = codeData.remainingUses - 1;
      const newStatus = newRemainingUses <= 0 ? "used_up" : "active";

      const rawSpread = resultData.spreadType ?? resultData.type ?? "";
      const mode: "single" | "three" | "unknown" =
        rawSpread === "three" || rawSpread === "three_card" ? "three"
        : rawSpread === "single" || rawSpread === "tarot" || rawSpread === "single_tarot" ? "single"
        : "unknown";

      const logEntry = {
        usedAt: new Date(),
        resultId,
        question: resultData.question ?? "",
        spreadType: resultData.type ?? "tarot",
        mode,
        source: "web" as const,
        remainingUsesAfter: newRemainingUses,
      };

      tx.update(codeRef, {
        remainingUses: newRemainingUses,
        status: newStatus,
        usedLogs: FieldValue.arrayUnion(logEntry),
      });

      // ── 標記結果為已解鎖 ──────────────────────────────────────────────────
      tx.update(resultRef, { unlocked: true });

      return {
        ok: true,
        remainingUses: newRemainingUses,
        fullText: (resultData.fullText ?? "").replace(/\*\*/g, "").trim(),
      };
    });

    if (!txResult.ok) {
      return NextResponse.json(
        { ok: false, errorCode: txResult.errorCode },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      remainingUses: txResult.remainingUses,
      fullText: txResult.fullText,
    });
  } catch (err) {
    console.error("[redeem/validate] error:", err);
    return NextResponse.json(
      { ok: false, errorCode: "SERVER_ERROR" as RedeemErrorCode },
      { status: 500 },
    );
  }
}
