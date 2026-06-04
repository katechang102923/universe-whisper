/**
 * POST /api/email/send-redeem-code
 *
 * 寄送宇宙通行碼 Email。
 *
 * 安全設計：
 *  - RESEND_API_KEY 只在 server side 使用，不回傳前端。
 *  - redeemCode 由 server 從 Firestore 查出，不信任前端傳入的 code 內容。
 *  - 接受 merchantTradeNo + email（從 paymentOrders 找 redeemCode），
 *    或 redeemCode + email（直接從 redeemCodes 查詳細資料）。
 *  - 寄送成功後更新 Firestore emailSent / emailSentAt。
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import {
  PAYMENT_ORDERS_COLLECTION,
  REDEEM_CODES_COLLECTION,
  REDEEM_CODE_EXPIRY_DAYS,
} from "@/lib/redeemCodes";

export const runtime = "nodejs";

// ── 常數 ──────────────────────────────────────────────────────────────────────

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://universe-whisper.vercel.app"
).replace(/\/$/, "");

// ── 工具 ──────────────────────────────────────────────────────────────────────

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function resolveTimestamp(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object" && "toDate" in v) return (v as { toDate(): Date }).toDate();
  if (typeof v === "object" && "seconds" in v)
    return new Date((v as { seconds: number }).seconds * 1000);
  return null;
}

// ── Email 內容 ────────────────────────────────────────────────────────────────

function buildHtml(opts: {
  code:         string;
  displayName:  string;
  totalUses:    number;
  remainingUses: number;
  expiresAt:    Date;
}): string {
  const expiryStr = opts.expiresAt.toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric",
  });
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>你的宇宙通行碼</title>
</head>
<body style="background:#0d0d1a;color:#e8e0f0;font-family:'Helvetica Neue',Arial,sans-serif;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;">
    <p style="font-size:11px;letter-spacing:0.3em;color:#9b8fd4;text-transform:uppercase;margin:0 0 28px;">
      宇宙偷偷話 · Universe Whisper
    </p>
    <h1 style="font-size:26px;font-weight:600;color:#f0eaff;margin:0 0 6px;">購買成功！你的宇宙通行碼</h1>
    <p style="font-size:13px;color:#7a6fa0;margin:0 0 36px;">請妥善保存此通行碼，不綁帳號，可自行使用或分享。</p>

    <div style="background:rgba(216,189,112,0.08);border:1.5px solid rgba(216,189,112,0.35);border-radius:16px;padding:28px 24px;text-align:center;margin-bottom:28px;">
      <p style="font-size:11px;letter-spacing:0.3em;color:#d8bd70;text-transform:uppercase;margin:0 0 12px;">宇宙通行碼</p>
      <p style="font-family:monospace;font-size:28px;font-weight:700;letter-spacing:0.18em;color:#d8bd70;margin:0 0 20px;">${opts.code}</p>
      <table style="width:100%;border-collapse:collapse;text-align:left;">
        <tr><td style="padding:5px 0;font-size:13px;color:#9b8fd4;width:45%;">方案</td><td style="padding:5px 0;font-size:13px;color:#e8e0f0;">${opts.displayName}</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#9b8fd4;">可用次數</td><td style="padding:5px 0;font-size:13px;color:#e8e0f0;">${opts.totalUses} 次</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#9b8fd4;">有效期限</td><td style="padding:5px 0;font-size:13px;color:#e8e0f0;">${expiryStr} 前</td></tr>
      </table>
    </div>

    <div style="background:rgba(155,143,212,0.07);border:1px solid rgba(155,143,212,0.16);border-radius:14px;padding:20px 22px;margin-bottom:24px;">
      <p style="font-size:11px;letter-spacing:0.22em;color:#9b8fd4;margin:0 0 10px;text-transform:uppercase;">使用方式</p>
      <ol style="font-size:14px;line-height:1.9;color:#e8e0f0;margin:0;padding-left:20px;">
        <li>回到宇宙偷偷話網站</li>
        <li>進入塔羅抽牌頁</li>
        <li>在「已有宇宙通行碼？」欄位輸入此通行碼</li>
        <li>啟用後即可抽牌，每次扣除 1 次</li>
      </ol>
    </div>

    <div style="text-align:center;margin:28px 0;">
      <a href="${SITE_URL}/redeem/check?code=${encodeURIComponent(opts.code)}"
         style="display:inline-block;background:#d8bd70;color:#1a0e2e;text-decoration:none;padding:13px 32px;border-radius:100px;font-size:14px;font-weight:600;">
        查詢剩餘次數
      </a>
    </div>

    <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:20px;">
      <p style="font-size:12px;color:#6a5f88;line-height:1.9;margin:0;">
        · 此通行碼不綁帳號，可自行使用，也可分享給朋友。<br/>
        · 如有問題，請聯繫 <a href="mailto:ciut0000@gmail.com" style="color:#9b8fd4;">ciut0000@gmail.com</a>
      </p>
    </div>
    <p style="margin-top:32px;font-size:12px;color:#4a4265;text-align:center;">
      宇宙偷偷話 · Universe Whisper<br/>此信件由系統自動發送。
    </p>
  </div>
</body>
</html>`;
}

function buildText(opts: {
  code:         string;
  displayName:  string;
  totalUses:    number;
  remainingUses: number;
  expiresAt:    Date;
}): string {
  const expiryStr = opts.expiresAt.toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric",
  });
  return [
    "宇宙偷偷話｜你的宇宙通行碼",
    "",
    "購買成功！",
    `你的宇宙通行碼：${opts.code}`,
    "",
    `方案：${opts.displayName}`,
    `可用次數：${opts.totalUses} 次`,
    `有效期限：${expiryStr} 前`,
    "",
    "【使用方式】",
    "1. 回到宇宙偷偷話網站",
    "2. 進入塔羅抽牌頁",
    "3. 在「已有宇宙通行碼？」欄位輸入此通行碼",
    "4. 啟用後即可抽牌，每次扣除 1 次",
    "",
    `查詢剩餘次數：${SITE_URL}/redeem/check?code=${encodeURIComponent(opts.code)}`,
    "",
    "· 此通行碼不綁帳號，可自行使用，也可分享給朋友。",
    "· 如有問題，請聯繫 ciut0000@gmail.com",
  ].join("\n");
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 環境變數檢查 ─────────────────────────────────────────────────────────
  const apiKey   = process.env.RESEND_API_KEY;
  const fromAddr = process.env.EMAIL_FROM || "宇宙偷偷話 <noreply@universewhisper.com>";

  const missing: string[] = [];
  if (!apiKey)   missing.push("RESEND_API_KEY");
  if (missing.length > 0) {
    console.error("[Email] missing env", { missing });
    return NextResponse.json(
      { ok: false, message: "Email 服務尚未設定，請聯繫客服。" },
      { status: 503 },
    );
  }

  // ── 解析 body ────────────────────────────────────────────────────────────
  const body = await req.json().catch(() => ({})) as {
    merchantTradeNo?: string;
    redeemCode?:      string;
    email?:           string;
  };
  const { merchantTradeNo, redeemCode: clientCode, email } = body;

  console.log("[Email] send redeem code start", {
    merchantTradeNo,
    hasCode: Boolean(clientCode),
    hasEmail: Boolean(email),
  });

  // ── Email 格式驗證 ───────────────────────────────────────────────────────
  if (!email || !validateEmail(email)) {
    console.warn("[Email] invalid email");
    return NextResponse.json(
      { ok: false, message: "請輸入正確的 Email 格式。" },
      { status: 400 },
    );
  }

  if (!merchantTradeNo && !clientCode) {
    return NextResponse.json(
      { ok: false, message: "缺少訂單編號或通行碼。" },
      { status: 400 },
    );
  }

  const db = getAdminDb();

  // ── 查找通行碼（優先用 merchantTradeNo） ─────────────────────────────────
  let code         = "";
  let displayName  = "宇宙通行碼";
  let totalUses    = 1;
  let remainingUses = 1;
  let expiresAt    = new Date(Date.now() + REDEEM_CODE_EXPIRY_DAYS * 86400000);
  let orderDocRef: FirebaseFirestore.DocumentReference | null = null;
  let codeDocRef:  FirebaseFirestore.DocumentReference | null = null;

  if (merchantTradeNo) {
    // 從 paymentOrders 找 redeemCode
    const orderSnap = await db
      .collection(PAYMENT_ORDERS_COLLECTION)
      .where("merchantTradeNo", "==", merchantTradeNo)
      .limit(1)
      .get();

    if (orderSnap.empty) {
      console.error("[Email] order not found", { merchantTradeNo });
      return NextResponse.json(
        { ok: false, message: "找不到此訂單，請聯繫客服。" },
        { status: 404 },
      );
    }

    const orderData = orderSnap.docs[0].data() as {
      redeemCode?: string;
      status?:     string;
    };
    orderDocRef = orderSnap.docs[0].ref;
    code = orderData.redeemCode ?? clientCode ?? "";
  } else if (clientCode) {
    code = clientCode;
  }

  if (!code) {
    console.error("[Email] redeem code not found", { merchantTradeNo });
    return NextResponse.json(
      { ok: false, message: "尚未產生通行碼，請稍後再試或聯繫客服。" },
      { status: 404 },
    );
  }

  // ── 從 redeemCodes 取得詳細資料 ──────────────────────────────────────────
  const codeSnap = await db.collection(REDEEM_CODES_COLLECTION).doc(code).get();
  if (codeSnap.exists) {
    const cd = codeSnap.data() as {
      displayName?:  string;
      totalUses?:    number;
      remainingUses?: number;
      expiresAt?:    unknown;
    };
    displayName   = cd.displayName   ?? displayName;
    totalUses     = cd.totalUses     ?? totalUses;
    remainingUses = cd.remainingUses ?? remainingUses;
    expiresAt     = resolveTimestamp(cd.expiresAt) ?? expiresAt;
    codeDocRef    = codeSnap.ref;
  } else {
    console.warn("[Email] redeemCode doc not found in Firestore, using defaults", { code });
  }

  // ── 寄送 Email ────────────────────────────────────────────────────────────
  const html = buildHtml({ code, displayName, totalUses, remainingUses, expiresAt });
  const text = buildText({ code, displayName, totalUses, remainingUses, expiresAt });

  let resendOk  = false;
  let errorMsg  = "";

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    fromAddr,
        to:      [email],
        subject: "宇宙偷偷話｜你的宇宙通行碼",
        html,
        text,
      }),
    });

    if (resendRes.ok) {
      resendOk = true;
      console.log("[Email] resend success", { email, code });
    } else {
      const errText = await resendRes.text().catch(() => "");
      errorMsg = `Resend HTTP ${resendRes.status}: ${errText.slice(0, 200)}`;
      console.error("[Email] resend failed", { status: resendRes.status, error: errText.slice(0, 200) });
    }
  } catch (err) {
    errorMsg = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
    console.error("[Email] resend exception", errorMsg);
  }

  // ── 更新 Firestore ────────────────────────────────────────────────────────
  const now = FieldValue.serverTimestamp();
  try {
    const updates: Promise<unknown>[] = [];
    if (resendOk) {
      const update = { emailSent: true, emailSentAt: now, emailError: null };
      if (orderDocRef) updates.push(orderDocRef.update(update));
      if (codeDocRef)  updates.push(codeDocRef.update(update));
    } else {
      const update = { emailSent: false, emailError: errorMsg || "未知錯誤" };
      if (orderDocRef) updates.push(orderDocRef.update(update));
      if (codeDocRef)  updates.push(codeDocRef.update(update));
    }
    await Promise.all(updates);
  } catch (e) {
    console.error("[Email] firestore update failed", e);
  }

  if (!resendOk) {
    return NextResponse.json(
      { ok: false, message: "寄送失敗，請稍後再試或先複製通行碼保存。" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
