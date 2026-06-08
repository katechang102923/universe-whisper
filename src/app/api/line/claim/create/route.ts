import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { DB_BUSY_MESSAGE } from "@/lib/apiErrors";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const CLAIM_COLLECTION = "lineResultClaims";
const CLAIM_TTL_MS = 60 * 60 * 1000;
const MAX_CLAIMS_PER_30MIN = 3;

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

export type ClaimPurpose = "send_result" | "line_unlock";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    resultId?: unknown;
    visitorId?: unknown;
    purpose?: unknown;
  } | null;

  const resultId = typeof body?.resultId === "string" ? body.resultId.trim() : "";
  const visitorId = typeof body?.visitorId === "string" ? body.visitorId.trim() : "";
  const purpose: ClaimPurpose = body?.purpose === "line_unlock" ? "line_unlock" : "send_result";

  if (!resultId) {
    return NextResponse.json({ ok: false, error: "缺少 resultId。" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const col = db.collection(CLAIM_COLLECTION);
    const now = new Date();

    const allClaimsSnap = await col.where("resultId", "==", resultId).get();
    const allClaims = allClaimsSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Array<{
      id: string;
      claimCode?: string;
      status?: string;
      purpose?: unknown;
      createdAt?: { toDate?: () => Date };
      expiresAt?: { toDate?: () => Date };
    }>;

    const existing = allClaims.find((claim) => {
      if (claim.status !== "pending") return false;
      const claimPurpose: ClaimPurpose = claim.purpose === "line_unlock" ? "line_unlock" : "send_result";
      if (claimPurpose !== purpose) return false;
      const expiresAt = claim.expiresAt?.toDate?.();
      return expiresAt ? expiresAt > now : false;
    });

    if (existing?.claimCode) {
      return NextResponse.json({
        ok: true,
        claimCode: existing.claimCode,
        expiresAt: existing.expiresAt?.toDate?.()?.toISOString() ?? null,
      });
    }

    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const recentCount = allClaims.filter((claim) => {
      const createdAt = claim.createdAt?.toDate?.();
      return createdAt ? createdAt > thirtyMinAgo : false;
    }).length;

    if (recentCount >= MAX_CLAIMS_PER_30MIN) {
      return NextResponse.json(
        { ok: false, error: "驗證碼產生太頻繁，請稍後再試。" },
        { status: 429 },
      );
    }

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
      return NextResponse.json({ ok: false, error: DB_BUSY_MESSAGE }, { status: 503 });
    }

    const expiresAt = new Date(now.getTime() + CLAIM_TTL_MS);
    const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("cf-connecting-ip") ?? "";
    const ua = request.headers.get("user-agent") ?? "";

    await col.doc(claimCode).set({
      claimCode,
      resultId,
      visitorId: visitorId || null,
      purpose,
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[line/claim/create] failed:", message);
    return NextResponse.json({ ok: false, error: DB_BUSY_MESSAGE }, { status: 503 });
  }
}
