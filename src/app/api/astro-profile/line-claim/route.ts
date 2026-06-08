/**
 * POST /api/astro-profile/line-claim
 * 產生三重星座 LINE 查詢驗證碼。
 * 星座解析資料直接儲存於驗證碼記錄（lineResultClaims）中，
 * 以 resultType: "astro_profile" 與塔羅驗證碼區分。
 *
 * 不影響塔羅流程，不寫入 lineResults collection。
 */

import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { CLAIM_COLLECTION } from "@/app/api/line/claim/create/route";

const CLAIM_TTL_MS = 60 * 60 * 1000; // 1 小時有效
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

function safeStr(val: unknown): string | null {
  return typeof val === "string" && val.trim() ? val.trim() : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "請求格式錯誤。" }, { status: 400 });
  }

  const sunSign = safeStr(body.sunSign);
  if (!sunSign) {
    return NextResponse.json({ ok: false, error: "缺少太陽星座資料。" }, { status: 400 });
  }

  let db: ReturnType<typeof getAdminDb>;
  try {
    db = getAdminDb();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Firebase Admin 初始化失敗。";
    console.error("[astro-profile/line-claim] Firebase Admin unavailable:", msg);
    return NextResponse.json({ ok: false, error: "目前無法產生查詢碼，請稍後再試。" }, { status: 500 });
  }

  const col = db.collection(CLAIM_COLLECTION);
  const now = new Date();

  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("cf-connecting-ip") ?? "";
  const ua = request.headers.get("user-agent") ?? "";
  const ipHash = ip ? hashString(ip) : null;

  // 速率限制
  if (ipHash) {
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const recentSnap = await col
      .where("ipHash", "==", ipHash)
      .where("resultType", "==", "astro_profile")
      .get();
    const recentCount = recentSnap.docs.filter((d) => {
      const created = (d.data().createdAt as { toDate?: () => Date } | undefined)?.toDate?.();
      return created ? created > thirtyMinAgo : false;
    }).length;
    if (recentCount >= MAX_CLAIMS_PER_30MIN) {
      return NextResponse.json(
        { ok: false, error: "驗證碼申請過於頻繁，請稍後再試。" },
        { status: 429 },
      );
    }
  }

  // 產生唯一驗證碼
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
    return NextResponse.json({ ok: false, error: "無法產生查詢碼，請稍後再試。" }, { status: 500 });
  }

  const expiresAt = new Date(now.getTime() + CLAIM_TTL_MS);

  await col.doc(claimCode).set({
    claimCode,
    resultType: "astro_profile",
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    claimedAt: null,
    lineUserId: null,
    ipHash,
    userAgentHash: ua ? hashString(ua) : null,
    // 星座資料直接儲存於驗證碼記錄
    sunSign,
    moonSign: safeStr(body.moonSign),
    risingSign: safeStr(body.risingSign),
    venusSign: safeStr(body.venusSign),
    overallSummary: safeStr(body.overallSummary),
    sunCoreText: safeStr(body.sunCoreText),
    moonInnerText: safeStr(body.moonInnerText),
    risingOuterText: safeStr(body.risingOuterText),
    venusLoveText: safeStr(body.venusLoveText),
    whisper: safeStr(body.whisper),
    advice: safeStr(body.advice),
    shortSummary: safeStr(body.shortSummary),
    // 延伸深度解析四章節
    careerWealthText:    safeStr(body.careerWealthText),
    loveRelationshipText: safeStr(body.loveRelationshipText),
    yearlyFortuneText:   safeStr(body.yearlyFortuneText),
    soulLessonText:      safeStr(body.soulLessonText),
  });

  console.info("[astro-profile/line-claim] Created claim", { claimCode, sunSign });
  return NextResponse.json({ ok: true, claimCode, expiresAt: expiresAt.toISOString() });
}
