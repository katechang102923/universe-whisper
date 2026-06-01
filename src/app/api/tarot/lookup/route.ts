import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { LINE_RESULTS_COLLECTION } from "@/lib/lineResults";

// -------------------------------------------------------------------
// GET /api/tarot/lookup?code=UW-XXXXXXXX[&visitorId=xxx]
// 以結果查詢碼查詢塔羅結果（安全版本：不回傳 lineUserId 等私密欄位）
// Rate limit: 同一 IP 每分鐘最多 5 次
// -------------------------------------------------------------------

const LOOKUP_CODE_RE = /^UW-[A-Z0-9]{7,9}$/;
const RATE_LIMIT_PER_MIN = 5;
const RATE_COLLECTION = "lookup_rate_limits";

function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 20);
}

/** 以當前分鐘（UTC）為 key 做 rate limit */
async function checkRateLimit(ip: string): Promise<boolean> {
  const db = getAdminDb();
  const minuteKey = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-"); // YYYY-MM-DD_HH-MM
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
    return true; // 降級允許，避免 Firestore 故障擋掉所有請求
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("code") ?? "";
  const code = raw.trim().toUpperCase();

  if (!LOOKUP_CODE_RE.test(code)) {
    return NextResponse.json(
      { ok: false, error: "請輸入有效的結果查詢碼（格式：UW-XXXXXXXX）。" },
      { status: 400 },
    );
  }

  // Rate limit
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

  // 先查 lineResults.lookupCode 欄位（單一欄位查詢，不需複合索引）
  const snap = await db
    .collection(LINE_RESULTS_COLLECTION)
    .where("lookupCode", "==", code)
    .limit(1)
    .get();

  if (snap.empty) {
    return NextResponse.json(
      { ok: false, error: "找不到這組結果查詢碼，請確認是否輸入正確。" },
      { status: 404 },
    );
  }

  const doc = snap.docs[0];
  const data = doc.data();

  // 只回傳安全欄位，不包含 lineUserId、ipHash 等私密資料
  return NextResponse.json({
    ok: true,
    resultId: doc.id,
    resultUrl: typeof data.resultUrl === "string" ? data.resultUrl : null,
    question: typeof data.question === "string" ? data.question : "",
    cards: Array.isArray(data.cards) ? data.cards : [],
    shortText: typeof data.shortText === "string" ? data.shortText.slice(0, 300) : "",
    lookupCode: code,
    createdAt:
      (data.createdAt as { toDate?: () => Date } | undefined)
        ?.toDate?.()
        ?.toISOString() ?? null,
  });
}
