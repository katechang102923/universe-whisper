import { NextRequest, NextResponse } from "next/server";
import { REDEEM_PLANS, type RedeemPlan } from "@/lib/redeemCodes";

export const runtime = "nodejs";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://universe-whisper.vercel.app"
).replace(/\/$/, "");

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildRedeemEmailHtml(
  code: string,
  planName: RedeemPlan,
  displayName: string,
  totalUses: number,
  remainingUses: number,
  expiresAt: string,
): string {
  const plan = REDEEM_PLANS[planName] ?? { description: "" };
  const expiryStr = new Date(expiresAt).toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric",
  });

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>你的宇宙偷偷話宇宙通行碼</title>
</head>
<body style="background:#0d0d1a;color:#e8e0f0;font-family:'Helvetica Neue',Arial,sans-serif;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;">

    <p style="font-size:11px;letter-spacing:0.3em;color:#9b8fd4;text-transform:uppercase;margin:0 0 28px;">
      宇宙偷偷話 · Universe Whisper
    </p>

    <h1 style="font-size:26px;font-weight:600;color:#f0eaff;margin:0 0 6px;">
      你的宇宙通行碼
    </h1>
    <p style="font-size:13px;color:#7a6fa0;margin:0 0 36px;">請妥善保存此通行碼</p>

    <!-- 通行碼卡片 -->
    <div style="background:rgba(216,189,112,0.08);border:1.5px solid rgba(216,189,112,0.35);border-radius:16px;padding:28px 24px;text-align:center;margin-bottom:28px;">
      <p style="font-size:11px;letter-spacing:0.3em;color:#d8bd70;text-transform:uppercase;margin:0 0 12px;">宇宙通行碼</p>
      <p style="font-family:monospace;font-size:28px;font-weight:700;letter-spacing:0.18em;color:#d8bd70;margin:0 0 16px;">${code}</p>
      <table style="width:100%;border-collapse:collapse;text-align:left;">
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#9b8fd4;width:45%;">方案</td>
          <td style="padding:6px 0;font-size:13px;color:#e8e0f0;">${displayName}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#9b8fd4;">可解鎖次數</td>
          <td style="padding:6px 0;font-size:13px;color:#e8e0f0;">${totalUses} 次</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#9b8fd4;">剩餘次數</td>
          <td style="padding:6px 0;font-size:13px;color:#e8e0f0;">${remainingUses} 次</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#9b8fd4;">有效期限</td>
          <td style="padding:6px 0;font-size:13px;color:#e8e0f0;">${expiryStr} 前使用完畢</td>
        </tr>
      </table>
    </div>

    <!-- 使用方式 -->
    <div style="background:rgba(155,143,212,0.07);border:1px solid rgba(155,143,212,0.16);border-radius:14px;padding:20px 22px;margin-bottom:24px;">
      <p style="font-size:11px;letter-spacing:0.22em;color:#9b8fd4;margin:0 0 12px;text-transform:uppercase;">使用方式</p>
      <p style="font-size:14px;line-height:1.9;color:#e8e0f0;margin:0 0 8px;">
        回到塔羅頁，當今日免費次數用完後，在「已有宇宙通行碼？」欄位輸入此通行碼，即可繼續抽牌並解鎖完整解讀。
      </p>
      <p style="font-size:14px;line-height:1.9;color:#e8e0f0;margin:0;">
        每成功抽牌一次會扣除 1 次，次數用完或逾期後即失效。
      </p>
    </div>

    <!-- 查詢次數 CTA -->
    <div style="text-align:center;margin:28px 0;">
      <a href="${SITE_URL}/redeem/check?code=${encodeURIComponent(code)}"
         style="display:inline-block;background:#d8bd70;color:#1a0e2e;text-decoration:none;padding:13px 32px;border-radius:100px;font-size:14px;font-weight:600;letter-spacing:0.04em;">
        查詢剩餘次數
      </a>
    </div>

    <!-- 注意事項 -->
    <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:24px;margin-top:8px;">
      <p style="font-size:12px;color:#6a5f88;line-height:1.9;margin:0;">
        · 此通行碼不綁帳號，可自行使用，也可分享給朋友共同使用。<br/>
        · 每解鎖一次完整版扣除 1 次，次數用完或逾期後即失效。<br/>
        · 如有問題，請聯繫 <a href="mailto:ciut0000@gmail.com" style="color:#9b8fd4;">ciut0000@gmail.com</a>
      </p>
    </div>

    <p style="margin-top:32px;font-size:12px;color:#4a4265;text-align:center;line-height:1.8;">
      宇宙偷偷話 · Universe Whisper<br/>
      此封信件由系統自動發送，請勿直接回覆。
    </p>
  </div>
</body>
</html>`;
}

function buildRedeemEmailText(
  code: string,
  displayName: string,
  totalUses: number,
  remainingUses: number,
  expiresAt: string,
): string {
  const expiryStr = new Date(expiresAt).toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric",
  });
  return [
    "宇宙偷偷話 · Universe Whisper",
    "你的宇宙通行碼",
    "",
    `通行碼：${code}`,
    `方案：${displayName}`,
    `可解鎖次數：${totalUses} 次`,
    `剩餘次數：${remainingUses} 次`,
    `有效期限：${expiryStr} 前使用完畢`,
    "",
    "【使用方式】",
    "回到塔羅頁，當今日免費次數用完後，在「已有宇宙通行碼？」欄位輸入此通行碼，",
    "即可繼續抽牌並解鎖完整解讀。每成功抽牌一次會扣除 1 次。",
    "",
    `查詢剩餘次數：${SITE_URL}/redeem/check?code=${encodeURIComponent(code)}`,
    "",
    "【注意事項】",
    "· 此通行碼不綁帳號，可自行使用，也可分享給朋友共同使用。",
    "· 每解鎖一次完整版扣除 1 次，次數用完或逾期後即失效。",
    "",
    "宇宙偷偷話 Universe Whisper",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM || "宇宙偷偷話 <noreply@universewhisper.com>";

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "EMAIL_NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { email, code, planName, displayName, totalUses, remainingUses, expiresAt } =
      body as {
        email?: string;
        code?: string;
        planName?: RedeemPlan;
        displayName?: string;
        totalUses?: number;
        remainingUses?: number;
        expiresAt?: string;
      };

    if (!email || !validateEmail(email)) {
      return NextResponse.json({ ok: false, error: "INVALID_EMAIL" }, { status: 400 });
    }
    if (!code || typeof code !== "string" || !code.startsWith("UW-")) {
      return NextResponse.json({ ok: false, error: "INVALID_CODE" }, { status: 400 });
    }
    if (!planName || !REDEEM_PLANS[planName]) {
      return NextResponse.json({ ok: false, error: "INVALID_PLAN" }, { status: 400 });
    }

    const resolvedDisplayName = displayName ?? REDEEM_PLANS[planName].displayName;
    const resolvedTotalUses = totalUses ?? REDEEM_PLANS[planName].totalUses;
    const resolvedRemainingUses = remainingUses ?? resolvedTotalUses;
    const resolvedExpiresAt = expiresAt ?? new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    const html = buildRedeemEmailHtml(
      code, planName, resolvedDisplayName,
      resolvedTotalUses, resolvedRemainingUses, resolvedExpiresAt,
    );
    const text = buildRedeemEmailText(
      code, resolvedDisplayName,
      resolvedTotalUses, resolvedRemainingUses, resolvedExpiresAt,
    );

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [email],
        subject: "你的宇宙偷偷話宇宙通行碼",
        html,
        text,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text().catch(() => "");
      console.error("[email/send-redeem-code] Resend error:", resendRes.status, errText);
      return NextResponse.json({ ok: false, error: "SEND_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[email/send-redeem-code] error:", err);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
