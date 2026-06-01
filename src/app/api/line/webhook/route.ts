import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  buildLineResultMessage,
  LINE_RESULTS_COLLECTION,
  type LineResultData,
} from "@/lib/lineResults";
import { CLAIM_COLLECTION } from "../claim/create/route";

// -------------------------------------------------------------------
// LINE Webhook  —  處理所有來自 LINE 的事件
//
// 保護區（絕對不改）：
//   - isValidLineSignature()
//   - replyToLine()
//   - 一般訊息的 fallback 回覆邏輯
//
// 新增：驗證碼（UW-XXXXXXX）解析與自動回傳塔羅結果
// -------------------------------------------------------------------

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { userId?: string; groupId?: string; roomId?: string };
  message?: { type: string; text?: string };
};

const FALLBACK_REPLY = "宇宙正在傾聽你✨";
const CLAIM_CODE_RE = /^UW-[A-Z0-9]{7}$/;
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://universe-whisper.vercel.app";

// ── 既有：LINE Signature 驗證（完全不動）────────────────────────────────────
function isValidLineSignature(body: string, signature: string | null) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return true;
  if (!signature) return false;

  const digest = crypto.createHmac("sha256", secret).update(body).digest("base64");
  if (digest.length !== signature.length) return false;

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

// ── 既有：一般 fallback reply（完全不動）────────────────────────────────────
async function replyToLine(replyToken: string) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    return { skipped: true, reason: "LINE_CHANNEL_ACCESS_TOKEN is not configured." };
  }

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text: FALLBACK_REPLY }],
    }),
  });

  return { skipped: false, ok: response.ok, status: response.status };
}

// ── 新增：用 replyToken 回傳指定文字 ────────────────────────────────────────
async function replyWithText(replyToken: string, text: string) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) return;

  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  });
}

// ── 新增：處理驗證碼事件 ─────────────────────────────────────────────────────
async function handleClaimCode(
  claimCode: string,
  replyToken: string,
  lineUserId: string,
): Promise<void> {
  const db = getAdminDb();

  // 1. 查詢 claim 記錄（以 claimCode 為 doc ID，O(1)）
  const claimRef = db.collection(CLAIM_COLLECTION).doc(claimCode);
  const claimSnap = await claimRef.get();

  if (!claimSnap.exists) {
    await replyWithText(replyToken, "找不到此驗證碼，請確認輸入是否正確，或回網站重新取得。");
    return;
  }

  const claim = claimSnap.data() as {
    resultId?: string;
    status?: string;
    expiresAt?: { toDate?: () => Date };
  };

  if (claim.status === "claimed") {
    await replyWithText(replyToken, "這組驗證碼已使用過，無法重複領取。若有問題請聯繫客服：ciut0000@gmail.com");
    return;
  }

  if (claim.status === "expired") {
    await replyWithText(replyToken, "此驗證碼已過期，請回到網站重新點擊「加入 LINE 並領取結果」取得新的驗證碼。");
    return;
  }

  const expiresAt = claim.expiresAt?.toDate?.();
  if (!expiresAt || expiresAt < new Date()) {
    await claimRef.update({ status: "expired" });
    await replyWithText(replyToken, "此驗證碼已過期，請回到網站重新點擊「加入 LINE 並領取結果」取得新的驗證碼。");
    return;
  }

  const resultId = claim.resultId ?? "";
  if (!resultId) {
    await replyWithText(replyToken, "驗證碼資料異常，請回網站重新操作。");
    return;
  }

  // 2. 取得塔羅結果
  const resultSnap = await db.collection(LINE_RESULTS_COLLECTION).doc(resultId).get();

  if (!resultSnap.exists) {
    await replyWithText(replyToken, "找不到對應的塔羅結果，可能已過期。請回到網站重新抽牌。");
    return;
  }

  const result = resultSnap.data() as LineResultData;
  const message = buildLineResultMessage(result, resultId, SITE_URL);

  // 3. 回覆結果 + 更新 claim 狀態（並行執行）
  await Promise.all([
    replyWithText(replyToken, message),
    claimRef.update({
      status: "claimed",
      lineUserId,
      claimedAt: FieldValue.serverTimestamp(),
    }),
  ]);

  console.info("[webhook/claim] Claim redeemed", { claimCode, resultId, lineUserId });
}

// ── 主要 POST handler ────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const bodyText = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!isValidLineSignature(bodyText, signature)) {
    return NextResponse.json({ error: "Invalid LINE signature." }, { status: 401 });
  }

  const payload = JSON.parse(bodyText || "{}") as { events?: LineEvent[] };
  const messageEvents = (payload.events ?? []).filter(
    (e) => e.type === "message" && e.message?.type === "text" && e.replyToken,
  );

  const results = await Promise.allSettled(
    messageEvents.map(async (event) => {
      const replyToken = event.replyToken as string;
      const rawText = (event.message?.text ?? "").trim();
      const upperText = rawText.toUpperCase();
      const lineUserId = event.source?.userId ?? "";

      // 若訊息符合驗證碼格式 → 處理驗證碼
      if (CLAIM_CODE_RE.test(upperText)) {
        await handleClaimCode(upperText, replyToken, lineUserId);
        return { type: "claim", claimCode: upperText };
      }

      // 其他訊息 → 既有 fallback 回覆（完全不動）
      const reply = await replyToLine(replyToken);
      return { type: "reply", ...reply };
    }),
  );

  return NextResponse.json({ ok: true, results });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "/api/line/webhook" });
}
