import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { LINE_RESULTS_COLLECTION, type LineResultData } from "@/lib/lineResults";

export const runtime = "nodejs";

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildEmailHtml(
  result: LineResultData,
  resultId: string,
  siteUrl: string,
): string {
  const cardRows = result.cards
    .map((c, i) => {
      const pos = c.position ? `${c.position}・` : "";
      const name = c.nameZh ?? c.name ?? "塔羅牌";
      const ori = c.orientationLabel ? `（${c.orientationLabel}）` : "";
      const kw = c.keywords
        ? `<br/><span style="color:#b89aff;font-size:13px;">關鍵字：${c.keywords}</span>`
        : "";
      return `<p style="margin:6px 0;color:#e8e0f0;">${i + 1}. ${pos}${name}${ori}${kw}</p>`;
    })
    .join("");

  const fullText = (result.fullText || "")
    .replace(/\*\*/g, "")
    .trim()
    .replace(/\n/g, "<br/>");

  const resultUrl = result.resultUrl || `${siteUrl}/share/${resultId}`;
  const dateStr = new Date().toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>你的宇宙偷偷話完整解讀</title>
</head>
<body style="background:#0d0d1a;color:#e8e0f0;font-family:'Helvetica Neue',Arial,sans-serif;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;">

    <p style="font-size:11px;letter-spacing:0.3em;color:#9b8fd4;text-transform:uppercase;margin:0 0 28px;">
      宇宙偷偷話 · Universe Whisper
    </p>

    <h1 style="font-size:26px;font-weight:600;color:#f0eaff;margin:0 0 6px;">
      你的完整塔羅解讀
    </h1>
    <p style="font-size:13px;color:#7a6fa0;margin:0 0 36px;">${dateStr}</p>

    ${
      result.question
        ? `<div style="background:rgba(155,143,212,0.09);border:1px solid rgba(155,143,212,0.22);border-radius:14px;padding:18px 22px;margin-bottom:24px;">
      <p style="font-size:11px;letter-spacing:0.22em;color:#9b8fd4;margin:0 0 10px;text-transform:uppercase;">你的問題</p>
      <p style="font-size:16px;color:#f0eaff;margin:0;line-height:1.7;">${result.question}</p>
    </div>`
        : ""
    }

    <div style="background:rgba(155,143,212,0.07);border:1px solid rgba(155,143,212,0.16);border-radius:14px;padding:18px 22px;margin-bottom:24px;">
      <p style="font-size:11px;letter-spacing:0.22em;color:#9b8fd4;margin:0 0 14px;text-transform:uppercase;">你抽到的牌</p>
      ${cardRows}
    </div>

    <div style="background:rgba(155,143,212,0.07);border:1px solid rgba(155,143,212,0.16);border-radius:14px;padding:20px 22px;margin-bottom:24px;">
      <p style="font-size:11px;letter-spacing:0.22em;color:#9b8fd4;margin:0 0 14px;text-transform:uppercase;">完整解讀</p>
      <p style="font-size:15px;line-height:1.9;color:#e8e0f0;margin:0;">${fullText}</p>
    </div>

    <div style="text-align:center;margin-top:36px;padding-top:28px;border-top:1px solid rgba(255,255,255,0.08);">
      <a href="${resultUrl}"
         style="display:inline-block;background:#9b8fd4;color:#fff;text-decoration:none;padding:13px 32px;border-radius:100px;font-size:14px;font-weight:500;letter-spacing:0.04em;">
        查看線上版本
      </a>
    </div>

    <p style="margin-top:36px;font-size:12px;color:#4a4265;text-align:center;line-height:1.8;">
      宇宙偷偷話 · Universe Whisper<br/>
      此封信件由系統自動發送，請勿直接回覆。
    </p>
  </div>
</body>
</html>`;
}

function buildEmailText(
  result: LineResultData,
  resultId: string,
  siteUrl: string,
): string {
  const cards = result.cards
    .map((c, i) => {
      const pos = c.position ? `${c.position}｜` : "";
      const name = c.nameZh ?? c.name ?? "塔羅牌";
      const ori = c.orientationLabel ? `（${c.orientationLabel}）` : "";
      const kw = c.keywords ? `\n   關鍵字：${c.keywords}` : "";
      return `${i + 1}. ${pos}${name}${ori}${kw}`;
    })
    .join("\n");

  const fullText = (result.fullText || "").replace(/\*\*/g, "").trim();
  const resultUrl = result.resultUrl || `${siteUrl}/share/${resultId}`;
  const dateStr = new Date().toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const parts: string[] = [
    `宇宙偷偷話 · Universe Whisper`,
    `你的完整塔羅解讀 | ${dateStr}`,
    ``,
  ];
  if (result.question) parts.push(`你的問題：\n${result.question}`, ``);
  parts.push(`你抽到的牌：\n${cards}`, ``, `━━━━━━━━━━━━━━━━`, ``, `完整解讀：`, ``, fullText, ``, `━━━━━━━━━━━━━━━━`, ``, `查看線上版本：${resultUrl}`, ``, `宇宙偷偷話 Universe Whisper`);

  return parts.join("\n");
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  const emailFrom =
    process.env.EMAIL_FROM || "宇宙偷偷話 <noreply@universewhisper.com>";

  // ── Email 服務未設定 ──────────────────────────────────────────────────────
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "EMAIL_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { email, resultId } = body as {
      email?: string;
      resultId?: string;
    };

    if (!email || !validateEmail(email)) {
      return NextResponse.json(
        { ok: false, error: "INVALID_EMAIL" },
        { status: 400 },
      );
    }
    if (!resultId || typeof resultId !== "string") {
      return NextResponse.json(
        { ok: false, error: "INVALID_RESULT_ID" },
        { status: 400 },
      );
    }

    const db = getAdminDb();
    const snap = await db
      .collection(LINE_RESULTS_COLLECTION)
      .doc(resultId)
      .get();

    if (!snap.exists) {
      return NextResponse.json(
        { ok: false, error: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const result = snap.data() as LineResultData;

    // ── 只允許已解鎖的結果寄送 ──────────────────────────────────────────────
    if (!result.unlocked) {
      return NextResponse.json(
        { ok: false, error: "NOT_UNLOCKED" },
        { status: 403 },
      );
    }

    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://universe-whisper.vercel.app"
    ).replace(/\/$/, "");

    const html = buildEmailHtml(result, resultId, siteUrl);
    const text = buildEmailText(result, resultId, siteUrl);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [email],
        subject: "你的宇宙偷偷話完整解讀結果",
        html,
        text,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text().catch(() => "");
      console.error("[email/send-result] Resend error:", resendRes.status, errText);
      return NextResponse.json(
        { ok: false, error: "SEND_FAILED" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[email/send-result] error:", err);
    return NextResponse.json(
      { ok: false, error: "SERVER_ERROR" },
      { status: 500 },
    );
  }
}
