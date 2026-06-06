/**
 * sendRedeemCodeEmail.ts
 *
 * 宇宙通行碼 Email 寄送共用工具。
 * 只在 server side 呼叫，RESEND_API_KEY 不回傳前端。
 */

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://universe-whisper.vercel.app"
).replace(/\/$/, "");

// ── 回傳型別 ──────────────────────────────────────────────────────────────────

export type EmailErrorCode =
  | "MISSING_ENV"
  | "RESEND_AUTH_FAILED"
  | "RESEND_FAILED"
  | "UNKNOWN_ERROR";

export interface SendRedeemEmailResult {
  ok:          boolean;
  messageId?:  string;
  errorCode?:  EmailErrorCode;
  errorMsg?:   string;
}

// ── Email 內容產生 ────────────────────────────────────────────────────────────

function buildHtml(opts: {
  code:          string;
  displayName:   string;
  totalUses:     number;
  remainingUses: number;
  expiresAt:     Date;
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
        · 如有問題，請透過網站聯絡客服。
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
  code:          string;
  displayName:   string;
  totalUses:     number;
  remainingUses: number;
  expiresAt:     Date;
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
  ].join("\n");
}

// ── 主函式 ────────────────────────────────────────────────────────────────────

export async function sendRedeemCodeEmail(opts: {
  to:            string;
  code:          string;
  displayName:   string;
  totalUses:     number;
  remainingUses: number;
  expiresAt:     Date;
}): Promise<SendRedeemEmailResult> {
  const apiKey   = process.env.RESEND_API_KEY;
  const fromAddr = process.env.EMAIL_FROM || "宇宙偷偷話 <noreply@universewhisper.com>";

  // ── 環境變數檢查 ─────────────────────────────────────────────────────────
  if (!apiKey) {
    console.error("[Email] Missing env", { missing: ["RESEND_API_KEY"], hasApiKey: false });
    return {
      ok: false,
      errorCode: "MISSING_ENV",
      errorMsg: "Email 服務尚未設定，請管理員檢查 RESEND_API_KEY",
    };
  }

  console.log("[Email] send redeem code start", {
    to:         opts.to,
    hasApiKey:  true,
    keyPrefix:  apiKey.slice(0, 4) + "…",   // 只印前 4 碼，不洩漏完整 key
    from:       fromAddr,
    codePrefix: opts.code.slice(0, 5) + "…",
  });

  const html = buildHtml(opts);
  const text = buildText(opts);

  try {
    console.log("[Email] resend request start");
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    fromAddr,
        to:      [opts.to],
        subject: "宇宙偷偷話｜你的宇宙通行碼",
        html,
        text,
      }),
    });

    if (res.ok) {
      const json = (await res.json().catch(() => ({}))) as { id?: string };
      console.log("[Email] resend success", { to: opts.to, id: json.id });
      return { ok: true, messageId: json.id };
    }

    // Resend 回傳錯誤
    const errText = await res.text().catch(() => "");
    let parsed: { name?: string; message?: string; statusCode?: number } = {};
    try { parsed = JSON.parse(errText); } catch { /* ignore */ }

    const isAuthError = res.status === 401 ||
      parsed.name === "validation_error" ||
      (parsed.message ?? "").toLowerCase().includes("api key");

    console.error("[Email] resend failed", {
      to:         opts.to,
      from:       fromAddr,
      statusCode: res.status,
      name:       parsed.name,
      message:    parsed.message ?? errText.slice(0, 300),
      code:       (parsed as { code?: string }).code,
      isAuthError,
    });

    if (isAuthError) {
      return {
        ok:        false,
        errorCode: "RESEND_AUTH_FAILED",
        errorMsg:  `Resend HTTP ${res.status}: API 金鑰無效或未授權`,
      };
    }

    return {
      ok:        false,
      errorCode: "RESEND_FAILED",
      errorMsg:  `Resend HTTP ${res.status}: ${parsed.message ?? errText.slice(0, 200)}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Email] resend exception", { to: opts.to, error: msg });
    return { ok: false, errorCode: "UNKNOWN_ERROR", errorMsg: msg.slice(0, 200) };
  }
}
