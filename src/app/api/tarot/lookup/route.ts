import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { LINE_RESULTS_COLLECTION } from "@/lib/lineResults";
import { CLAIM_COLLECTION } from "@/app/api/line/claim/create/route";

// -------------------------------------------------------------------
// GET /api/tarot/lookup?code=UW-XXXXXXX
// 以 1 小時驗證碼查詢塔羅結果（查 lineResultClaims）
// 向下相容：若查不到 claim，嘗試舊 lineResults.lookupCode 欄位
// Rate limit: 同一 IP 每分鐘最多 5 次
// -------------------------------------------------------------------

const CLAIM_CODE_RE = /^UW-[A-Z0-9]{7}$/;
const LEGACY_CODE_RE = /^UW-[A-Z0-9]{8,9}$/;
const RATE_LIMIT_PER_MIN = 5;
const RATE_COLLECTION = "lookup_rate_limits";

function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 20);
}

async function checkRateLimit(ip: string): Promise<boolean> {
  const db = getAdminDb();
  const minuteKey = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  const docRef = db.collection(RATE_COLLECTION).doc(minuteKey);
  const ipKey = hashIp(ip || "unknown");

  try {
    let allowed = false;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      const data = (snap.data() ?? {}) as Record<string, number>;
      const count = data[ipKey] ?? 0;
      if (count >= RATE_LIMIT_PER_MIN) return;
      tx.set(docRef, { [ipKey]: count + 1, _ttl: FieldValue.serverTimestamp() }, { merge: true });
      allowed = true;
    });
    return allowed;
  } catch {
    return true;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("code") ?? "";
  const code = raw.trim().toUpperCase();

  const isClaimCode = CLAIM_CODE_RE.test(code);
  const isLegacyCode = LEGACY_CODE_RE.test(code);

  if (!isClaimCode && !isLegacyCode) {
    return NextResponse.json(
      { ok: false, error: "請輸入有效的驗證碼（格式：UW-XXXXXXX）。" },
      { status: 400 },
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("cf-connecting-ip") ??
    "unknown";

  const allowed = await checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "查詢過於頻繁，請稍後再試。" },
      { status: 429 },
    );
  }

  const db = getAdminDb();

  // 1. 查 lineResultClaims（1 小時驗證碼）
  if (isClaimCode) {
    const claimSnap = await db.collection(CLAIM_COLLECTION).doc(code).get();

    if (claimSnap.exists) {
      const claim = claimSnap.data() as {
        resultId?: string;
        status?: string;
        expiresAt?: { toDate?: () => Date };
      };

      // 過期檢查
      const expiresAt = claim.expiresAt?.toDate?.();
      if (claim.status === "expired" || (expiresAt && expiresAt < new Date())) {
        return NextResponse.json(
          { ok: false, expired: true, error: "驗證碼已過期，請重新抽牌。" },
          { status: 410 },
        );
      }

      const resultId = claim.resultId ?? "";
      if (!resultId) {
        return NextResponse.json(
          { ok: false, error: "驗證碼資料異常，請回網站重新操作。" },
          { status: 500 },
        );
      }

      const resultSnap = await db.collection(LINE_RESULTS_COLLECTION).doc(resultId).get();
      if (!resultSnap.exists) {
        return NextResponse.json(
          { ok: false, error: "找不到對應的塔羅結果，請重新抽牌。" },
          { status: 404 },
        );
      }

      const data = resultSnap.data()!;
      return NextResponse.json({
        ok: true,
        resultId,
        question: typeof data.question === "string" ? data.question : "",
        cards: Array.isArray(data.cards) ? data.cards : [],
        shortText: typeof data.shortText === "string" ? data.shortText : "",
        fullText: typeof data.fullText === "string" ? data.fullText : "",
        createdAt:
          (data.createdAt as { toDate?: () => Date } | undefined)
            ?.toDate?.()
            ?.toISOString() ?? null,
      });
    }
  }

  // 2. 向下相容：查舊的 lineResults.lookupCode 欄位
  const legacySnap = await db
    .collection(LINE_RESULTS_COLLECTION)
    .where("lookupCode", "==", code)
    .limit(1)
    .get();

  if (legacySnap.empty) {
    return NextResponse.json(
      { ok: false, error: "找不到這組驗證碼，可能已過期或輸入錯誤。" },
      { status: 404 },
    );
  }

  const doc = legacySnap.docs[0];
  const data = doc.data();

  return NextResponse.json({
    ok: true,
    resultId: doc.id,
    question: typeof data.question === "string" ? data.question : "",
    cards: Array.isArray(data.cards) ? data.cards : [],
    shortText: typeof data.shortText === "string" ? data.shortText : "",
    fullText: typeof data.fullText === "string" ? data.fullText : "",
    createdAt:
      (data.createdAt as { toDate?: () => Date } | undefined)
        ?.toDate?.()
        ?.toISOString() ?? null,
  });
}
