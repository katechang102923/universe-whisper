import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

// -------------------------------------------------------------------
// POST /api/line/claim/create
// 為某個 resultId 產生（或返回現有的）LINE 驗證碼
// Body: { resultId: string, visitorId?: string }
// -------------------------------------------------------------------

export const CLAIM_COLLECTION = "lineResultClaims";
const CLAIM_TTL_MS = 60 * 60 * 1000;       // 1 小時有效
const MAX_CLAIMS_PER_30MIN = 3;             // 每 30 分鐘最多申請 3 次

/** 產生 UW-XXXXXXX 格式驗證碼（去除易混淆字元 0/O/1/I） */
function generateClaimCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "UW-";
  for (let i = 0; i < 7; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function hashString(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    resultId?: unknown;
    visitorId?: unknown;
  } | null;

  const resultId = typeof body?.resultId === "string" ? body.resultId.trim() : "";
  const visitorId = typeof body?.visitorId === "string" ? body.visitorId.trim() : "";

  if (!resultId) {
    return NextResponse.json({ ok: false, error: "缺少 resultId。" }, { status: 400 });
  }

  const db = getAdminDb();
  const col = db.collection(CLAIM_COLLECTION);
  const now = new Date();
  const expiryThreshold = new Date(now.getTime() + 1000); // 稍微往後，避免時間誤差

  // ── 1. 查詢此 resultId 的所有 claim 記錄（單一欄位查詢，不需複合索引）──────
  const allClaimsSnap = await col.where("resultId", "==", resultId).get();
  const allClaims = allClaimsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as {
    id: string;
    claimCode: string;
    status: string;
    createdAt?: { toDate?: () => Date };
    expiresAt?: { toDate?: () => Date };
  }));

  // ── 2. 若已有 pending 且未過期的碼，直接返回 ──────────────────────────────
  const existing = allClaims.find((c) => {
    if (c.status !== "pending") return false;
    const exp = c.expiresAt?.toDate?.();
    return exp ? exp > now : false;
  });
  if (existing) {
    const expDate = (existing.expiresAt as { toDate?: () => Date })?.toDate?.();
    return NextResponse.json({
      ok: true,
      claimCode: existing.claimCode,
      expiresAt: expDate?.toISOString() ?? null,
    });
  }

  // ── 3. 速率限制：最近 30 分鐘內申請次數 ──────────────────────────────────
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const recentCount = allClaims.filter((c) => {
    const created = c.createdAt?.toDate?.();
    return created ? created > thirtyMinAgo : false;
  }).length;

  if (recentCount >= MAX_CLAIMS_PER_30MIN) {
    return NextResponse.json(
      { ok: false, error: "驗證碼申請過於頻繁，請稍後再試。" },
      { status: 429 },
    );
  }

  // ── 4. 產生唯一驗證碼（以驗證碼為 Document ID，O(1) 查詢）────────────────
  let claimCode = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateClaimCode();
    const dup = await col.doc(candidate).get();
    if (!dup.exists) {
      claimCode = candidate;
      break;
    }
  }
  if (!claimCode) {
    return NextResponse.json(
      { ok: false, error: "無法產生驗證碼，請稍後再試。" },
      { status: 500 },
    );
  }

  const expiresAt = new Date(now.getTime() + CLAIM_TTL_MS);
  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("cf-connecting-ip") ?? "";
  const ua = request.headers.get("user-agent") ?? "";

  await col.doc(claimCode).set({
    claimCode,
    resultId,
    visitorId: visitorId || null,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    claimedAt: null,
    lineUserId: null,
    ipHash: ip ? hashString(ip) : null,
    userAgentHash: ua ? hashString(ua) : null,
  });

  console.info("[line/claim/create] Created claim", { claimCode, resultId });
  return NextResponse.json({ ok: true, claimCode, expiresAt: expiresAt.toISOString() });
}
