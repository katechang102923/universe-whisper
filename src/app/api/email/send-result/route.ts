import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  LINE_RESULTS_COLLECTION,
  type LineResultData,
  extractCardSectionText,
  parseCardFields,
  extractSpreadSummaryFields,
  extractSpiritualClosing,
  extractSingleCardFields,
} from "@/lib/lineResults";

export const runtime = "nodejs";

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── Email 專屬內容驗證（以 fullText 完整性為主要判斷）─────────────────────────
// 不依賴 structured overallAnswer 是否存在；只要 fullText 夠長且有牌段落即可。
// LINE 驗證（validateLineContent）維持原樣，此函式僅用於 email 流程。

interface EmailValidationResult {
  valid: boolean;
  errors: string[];
  usedFallback: boolean;
}

function validateEmailContent(
  result: LineResultData,
  fullText: string,
  resultId: string,
): EmailValidationResult {
  const errors: string[] = [];
  let usedFallback = false;

  // ── 基本欄位檢查（與 LINE 驗證相同） ───────────────────────────────────────
  if (!fullText || fullText.length < 100) {
    errors.push("fullText 為空或過短");
  }
  if (!result.question?.trim()) {
    errors.push("question 為空");
  }
  if (!result.cards || result.cards.length === 0) {
    errors.push("cards 為空");
  }

  // ── 三張牌：以 fullText 長度 + 有牌段落為主判斷，不強制要求 overallAnswer ─
  if (result.cards.length === 3 && fullText.length > 100) {
    const card1Section = extractCardSectionText(fullText, 0);
    if (!card1Section) {
      errors.push("第1張牌段落 為空");
    }
    const { overallAnswer, summaryRaw } = extractSpreadSummaryFields(fullText);
    if (!overallAnswer) {
      // 允許 fallback：summaryRaw 或 fullText 本身即可
      if (!summaryRaw && fullText.length < 300) {
        errors.push("牌陣總結段落完全缺失且 fullText 過短");
      } else {
        usedFallback = true;
      }
    }
    const spiritualClosing = extractSpiritualClosing(fullText);
    if (!spiritualClosing) {
      // Email fallback：心靈收束空白時用 fullText 結尾，不擋送出
      if (fullText.length < 300) {
        errors.push("心靈收束 為空且 fullText 過短");
      } else {
        usedFallback = true;
      }
    }
  }

  // ── 單張牌：保持原有邏輯 ───────────────────────────────────────────────────
  if (result.cards.length === 1 && fullText.length > 100) {
    const { cardPoint } = extractSingleCardFields(fullText);
    if (!cardPoint) errors.push("單張牌解讀內容 為空");
    const spiritualClosing = extractSpiritualClosing(fullText);
    if (!spiritualClosing && fullText.length < 300) {
      errors.push("心靈收束 為空且 fullText 過短");
    } else if (!spiritualClosing) {
      usedFallback = true;
    }
  }

  if (errors.length > 0) {
    console.error(
      `[email/send-result] 內容驗證失敗 resultId=${resultId}`,
      { errors, cardCount: result.cards.length, fullTextLength: fullText.length },
    );
  }

  return { valid: errors.length === 0, errors, usedFallback };
}

// ── 共用樣式常數 ──────────────────────────────────────────────────────────────

const S = {
  bg:       "#0d0d1a",
  text:     "#e8e0f0",
  textDim:  "#b4a8d0",
  textFaint:"#7a6fa0",
  purple:   "#9b8fd4",
  purpleBg: "rgba(155,143,212,0.09)",
  purpleBorder: "rgba(155,143,212,0.22)",
  cardBg:   "rgba(155,143,212,0.07)",
  cardBorder: "rgba(155,143,212,0.16)",
  divider:  "rgba(255,255,255,0.08)",
  font:     "'Helvetica Neue',Arial,sans-serif",
};

function card(content: string, accent = false): string {
  const bg     = accent ? S.purpleBg  : S.cardBg;
  const border = accent ? S.purpleBorder : S.cardBorder;
  return `<div style="background:${bg};border:1px solid ${border};border-radius:14px;padding:20px 22px;margin-bottom:20px;">${content}</div>`;
}

function label(text: string): string {
  return `<p style="font-size:11px;letter-spacing:0.22em;color:${S.purple};margin:0 0 12px;text-transform:uppercase;">${text}</p>`;
}

function h3(text: string): string {
  return `<p style="font-size:14px;font-weight:600;color:${S.purple};margin:0 0 10px;">${text}</p>`;
}

function para(text: string, mt = "0"): string {
  const safe = text.replace(/\n/g, "<br/>");
  return `<p style="font-size:15px;line-height:1.85;color:${S.text};margin:${mt} 0 0;">${safe}</p>`;
}

function subPara(text: string): string {
  const safe = text.replace(/\n/g, "<br/>");
  return `<p style="font-size:14px;line-height:1.8;color:${S.textDim};margin:10px 0 0;">${safe}</p>`;
}

function dividerHr(): string {
  return `<div style="height:1px;background:${S.divider};margin:6px 0;"></div>`;
}

// ── Email HTML 建構（三張牌）─────────────────────────────────────────────────

function buildThreeCardEmailHtml(
  result: LineResultData,
  fullText: string,
  resultUrl: string,
  dateStr: string,
): string {
  const DEFAULT_POSITIONS = ["過去", "現在", "未來"];
  const { overallAnswer: rawOverallAnswer, whyThisHappens, actionAdvice, summaryRaw } =
    extractSpreadSummaryFields(fullText);
  const rawSpiritualClosing = extractSpiritualClosing(fullText);

  // ── Fallback：overallAnswer 空時用 summaryRaw 或 fullText 後段 ───────────────
  let overallAnswer = rawOverallAnswer;
  let usedFallback = false;
  if (!overallAnswer) {
    overallAnswer =
      summaryRaw.trim() ||
      fullText.slice(Math.max(0, fullText.length - 400)).trim();
    if (overallAnswer) usedFallback = true;
  }

  // ── Fallback：心靈收束空時用 fullText 最後兩句 ───────────────────────────────
  let spiritualClosing = rawSpiritualClosing;
  if (!spiritualClosing && fullText.length > 200) {
    const lastPart = fullText.slice(Math.max(0, fullText.length - 300)).trim();
    spiritualClosing = lastPart;
    usedFallback = true;
  }

  if (usedFallback) {
    console.log("[email/send-result] 使用 fallback summary content");
  }

  // ── 問題卡 ────────────────────────────────────────────────────────────────
  const questionCard = result.question
    ? card(label("你的問題") + para(result.question, "0"), true)
    : "";

  // ── 抽到的牌摘要卡 ────────────────────────────────────────────────────────
  const cardSummaryRows = result.cards
    .map((c, i) => {
      const pos  = c.position ?? DEFAULT_POSITIONS[i] ?? `第${i + 1}張`;
      const name = c.nameZh ?? c.name ?? "塔羅牌";
      const ori  = c.orientationLabel ? `（${c.orientationLabel}）` : "";
      return `<p style="font-size:15px;color:${S.text};margin:6px 0;">${i + 1}. <strong>${pos}</strong>｜${name}${ori}</p>`;
    })
    .join("");
  const cardsSummaryCard = card(label("你抽到的牌") + cardSummaryRows);

  // ── 每張牌完整解讀卡 ──────────────────────────────────────────────────────
  const cardReadingCards = result.cards
    .map((c, i) => {
      const pos  = c.position ?? DEFAULT_POSITIONS[i] ?? `第${i + 1}張`;
      const name = c.nameZh ?? c.name ?? "塔羅牌";
      const ori  = c.orientationLabel ? `（${c.orientationLabel}）` : "";

      const sectionRaw = extractCardSectionText(fullText, i);
      const { cardPoint, questionMeaning, cardAdvice } = parseCardFields(sectionRaw);

      let inner = h3(`${pos}｜${name}${ori}`);
      inner += dividerHr();
      if (cardPoint) {
        inner += `<p style="font-size:12px;letter-spacing:0.1em;color:${S.purple};margin:12px 0 4px;">牌面重點</p>`;
        inner += subPara(cardPoint);
      }
      if (questionMeaning) {
        inner += `<p style="font-size:12px;letter-spacing:0.1em;color:${S.purple};margin:12px 0 4px;">在你的問題中代表</p>`;
        inner += subPara(questionMeaning);
      }
      if (cardAdvice) {
        inner += `<p style="font-size:12px;letter-spacing:0.1em;color:${S.purple};margin:12px 0 4px;">這張牌提醒你</p>`;
        inner += subPara(cardAdvice);
      }
      if (!cardPoint && !questionMeaning && !cardAdvice && sectionRaw) {
        inner += subPara(sectionRaw.replace(/\*\*/g, "").trim());
      }
      return card(inner);
    })
    .join("");

  // ── 牌陣總結卡 ────────────────────────────────────────────────────────────
  let summaryInner = label("✨ 牌陣總結");
  if (overallAnswer) {
    summaryInner += `<p style="font-size:12px;letter-spacing:0.1em;color:${S.purple};margin:0 0 4px;">整體答案</p>`;
    summaryInner += subPara(overallAnswer);
  }
  if (whyThisHappens) {
    summaryInner += `<p style="font-size:12px;letter-spacing:0.1em;color:${S.purple};margin:12px 0 4px;">為什麼會這樣</p>`;
    summaryInner += subPara(whyThisHappens);
  }
  if (actionAdvice) {
    summaryInner += `<p style="font-size:12px;letter-spacing:0.1em;color:${S.purple};margin:12px 0 4px;">接下來 3～7 天建議</p>`;
    summaryInner += subPara(actionAdvice);
  }
  const summaryCard = card(summaryInner, true);

  // ── 心靈收束卡 ────────────────────────────────────────────────────────────
  const closingCard = spiritualClosing
    ? card(label("🧘 心靈收束") + para(spiritualClosing))
    : "";

  return assembleEmailHtml(
    dateStr,
    [questionCard, cardsSummaryCard, cardReadingCards, summaryCard, closingCard].join(""),
    resultUrl,
  );
}

// ── Email HTML 建構（單張牌）────────────────────────────────────────────────

function buildSingleCardEmailHtml(
  result: LineResultData,
  fullText: string,
  resultUrl: string,
  dateStr: string,
): string {
  const c0 = result.cards[0] ?? {};
  const cardName = c0.nameZh ?? c0.name ?? "塔羅牌";
  const cardOri  = c0.orientationLabel ? `（${c0.orientationLabel}）` : "";

  const {
    cardPoint, questionMeaning, cardAdvice,
    overallAnswer, actionAdvice, spiritualClosing,
  } = extractSingleCardFields(fullText);

  // ── 問題卡 ────────────────────────────────────────────────────────────────
  const questionCard = result.question
    ? card(label("你的問題") + para(result.question), true)
    : "";

  // ── 抽到的牌卡 ────────────────────────────────────────────────────────────
  const cardSummaryCard = card(
    label("你抽到的牌") +
    `<p style="font-size:16px;font-weight:600;color:${S.text};margin:0;">${cardName}${cardOri}</p>`,
  );

  // ── 完整解讀卡 ────────────────────────────────────────────────────────────
  let readingInner = h3(`本次訊息｜${cardName}${cardOri}`) + dividerHr();
  if (cardPoint) {
    readingInner += `<p style="font-size:12px;letter-spacing:0.1em;color:${S.purple};margin:12px 0 4px;">牌面重點</p>`;
    readingInner += subPara(cardPoint);
  }
  if (questionMeaning) {
    readingInner += `<p style="font-size:12px;letter-spacing:0.1em;color:${S.purple};margin:12px 0 4px;">在你的問題中代表</p>`;
    readingInner += subPara(questionMeaning);
  }
  if (cardAdvice) {
    readingInner += `<p style="font-size:12px;letter-spacing:0.1em;color:${S.purple};margin:12px 0 4px;">這張牌提醒你</p>`;
    readingInner += subPara(cardAdvice);
  }
  const readingCard = card(readingInner);

  // ── 解讀總結卡 ────────────────────────────────────────────────────────────
  let summaryInner = label("✨ 解讀總結");
  if (overallAnswer) {
    summaryInner += `<p style="font-size:12px;letter-spacing:0.1em;color:${S.purple};margin:0 0 4px;">整體答案</p>`;
    summaryInner += subPara(overallAnswer);
  }
  if (actionAdvice) {
    summaryInner += `<p style="font-size:12px;letter-spacing:0.1em;color:${S.purple};margin:12px 0 4px;">接下來 3～7 天建議</p>`;
    summaryInner += subPara(actionAdvice);
  }
  const summaryCard = card(summaryInner, true);

  // ── 心靈收束卡 ────────────────────────────────────────────────────────────
  const closingCard = spiritualClosing
    ? card(label("🧘 心靈收束") + para(spiritualClosing))
    : "";

  return assembleEmailHtml(
    dateStr,
    [questionCard, cardSummaryCard, readingCard, summaryCard, closingCard].join(""),
    resultUrl,
  );
}

// ── Email HTML 組裝 ───────────────────────────────────────────────────────────

function assembleEmailHtml(dateStr: string, bodyCards: string, resultUrl: string): string {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>你的宇宙偷偷話完整解讀</title>
</head>
<body style="background:${S.bg};color:${S.text};font-family:${S.font};margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">

    <p style="font-size:11px;letter-spacing:0.3em;color:${S.purple};text-transform:uppercase;margin:0 0 24px;">
      宇宙偷偷話 · Universe Whisper
    </p>

    <h1 style="font-size:24px;font-weight:600;color:#f0eaff;margin:0 0 6px;">
      你的完整塔羅解讀
    </h1>
    <p style="font-size:13px;color:${S.textFaint};margin:0 0 32px;">${dateStr}</p>

    ${bodyCards}

    <div style="text-align:center;margin-top:32px;padding-top:24px;border-top:1px solid ${S.divider};">
      <a href="${resultUrl}"
         style="display:inline-block;background:${S.purple};color:#fff;text-decoration:none;padding:13px 32px;border-radius:100px;font-size:14px;font-weight:500;letter-spacing:0.04em;">
        查看線上版本
      </a>
    </div>

    <p style="margin-top:32px;font-size:12px;color:#3a3255;text-align:center;line-height:1.8;">
      宇宙偷偷話 · Universe Whisper<br/>
      此封信件由系統自動發送，請勿直接回覆。
    </p>
  </div>
</body>
</html>`;
}

// ── Email 純文字版本 ──────────────────────────────────────────────────────────

function buildEmailText(
  result: LineResultData,
  fullText: string,
  resultUrl: string,
  dateStr: string,
): string {
  const D = "━━━━━━━━━━━━━━━━";
  const parts: string[] = [
    "宇宙偷偷話 · Universe Whisper",
    `你的完整塔羅解讀 | ${dateStr}`,
    "",
  ];

  if (result.question) parts.push(`你的問題：\n${result.question}`, "");

  if (result.cards.length === 3) {
    const DEFAULT_POSITIONS = ["過去", "現在", "未來"];
    const cardLines = result.cards.map((c, i) => {
      const pos  = c.position ?? DEFAULT_POSITIONS[i] ?? `第${i + 1}張`;
      const name = c.nameZh ?? c.name ?? "塔羅牌";
      const ori  = c.orientationLabel ? `（${c.orientationLabel}）` : "";
      return `${i + 1}. ${pos}｜${name}${ori}`;
    }).join("\n");
    parts.push(`你抽到的牌：\n${cardLines}`, "", D, "");

    result.cards.forEach((c, i) => {
      const pos  = c.position ?? DEFAULT_POSITIONS[i] ?? `第${i + 1}張`;
      const name = c.nameZh ?? c.name ?? "塔羅牌";
      const ori  = c.orientationLabel ? `（${c.orientationLabel}）` : "";
      const sectionRaw = extractCardSectionText(fullText, i);
      const { cardPoint, questionMeaning, cardAdvice } = parseCardFields(sectionRaw);
      parts.push(`${pos}｜${name}${ori}`);
      if (cardPoint)       parts.push(`牌面重點：\n${cardPoint}`);
      if (questionMeaning) parts.push(`在你的問題中代表：\n${questionMeaning}`);
      if (cardAdvice)      parts.push(`這張牌提醒你：\n${cardAdvice}`);
      parts.push("");
    });

    const { overallAnswer, whyThisHappens, actionAdvice } = extractSpreadSummaryFields(fullText);
    parts.push(D, "", "✨ 牌陣總結");
    if (overallAnswer)  parts.push(`整體答案：\n${overallAnswer}`);
    if (whyThisHappens) parts.push(`為什麼會這樣：\n${whyThisHappens}`);
    if (actionAdvice)   parts.push(`接下來 3～7 天建議：\n${actionAdvice}`);

  } else {
    // 單張牌
    const c0 = result.cards[0] ?? {};
    const cardName = c0.nameZh ?? c0.name ?? "塔羅牌";
    const cardOri  = c0.orientationLabel ? `（${c0.orientationLabel}）` : "";
    parts.push(`你抽到的牌：\n${cardName}${cardOri}`, "", D, "");

    const { cardPoint, questionMeaning, cardAdvice, overallAnswer, actionAdvice } =
      extractSingleCardFields(fullText);
    parts.push(`本次訊息｜${cardName}${cardOri}`);
    if (cardPoint)       parts.push(`牌面重點：\n${cardPoint}`);
    if (questionMeaning) parts.push(`在你的問題中代表：\n${questionMeaning}`);
    if (cardAdvice)      parts.push(`這張牌提醒你：\n${cardAdvice}`);
    parts.push("", D, "", "✨ 解讀總結");
    if (overallAnswer) parts.push(`整體答案：\n${overallAnswer}`);
    if (actionAdvice)  parts.push(`接下來 3～7 天建議：\n${actionAdvice}`);
  }

  const spiritualClosing = extractSpiritualClosing(fullText);
  parts.push("", D, "", "🧘 心靈收束");
  if (spiritualClosing) parts.push(spiritualClosing);

  parts.push("", D, "", `查看線上版本：${resultUrl}`, "", "宇宙偷偷話 Universe Whisper");
  return parts.join("\n");
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey    = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM || "宇宙偷偷話 <noreply@universewhisper.com>";

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "EMAIL_NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { email, resultId } = body as { email?: string; resultId?: string };

    if (!email || !validateEmail(email)) {
      return NextResponse.json({ ok: false, error: "INVALID_EMAIL" }, { status: 400 });
    }
    if (!resultId || typeof resultId !== "string") {
      return NextResponse.json({ ok: false, error: "INVALID_RESULT_ID" }, { status: 400 });
    }

    const db   = getAdminDb();
    const snap = await db.collection(LINE_RESULTS_COLLECTION).doc(resultId).get();

    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }

    const result   = snap.data() as LineResultData;
    const fullText = (result.fullText || "").replace(/\*\*/g, "").trim();

    // ── 只允許已解鎖的結果寄送 ─────────────────────────────────────────────
    if (!result.unlocked) {
      return NextResponse.json({ ok: false, error: "NOT_UNLOCKED" }, { status: 403 });
    }

    // ── 防濫用：同一筆結果最多寄 5 次，且 1 分鐘內只能寄 1 次 ─────────────
    const rateRef  = db.collection("emailSendLogs").doc(resultId);
    const rateSnap = await rateRef.get();
    const rateData = rateSnap.exists
      ? (rateSnap.data() as { count: number; lastSentAt: number })
      : null;

    const now     = Date.now();
    const MAX_SENDS   = 5;
    const COOLDOWN_MS = 60_000;

    if (rateData) {
      if (rateData.count >= MAX_SENDS) {
        return NextResponse.json({ ok: false, error: "RATE_LIMIT_EXCEEDED" }, { status: 429 });
      }
      if (now - rateData.lastSentAt < COOLDOWN_MS) {
        return NextResponse.json({ ok: false, error: "COOLDOWN_ACTIVE" }, { status: 429 });
      }
    }

    // ── Email 內容完整性驗證（以 fullText 為主要判斷，不強制要求 structured overallAnswer）
    const validation = validateEmailContent(result, fullText, resultId);
    if (!validation.valid) {
      return NextResponse.json(
        { ok: false, error: "CONTENT_INCOMPLETE", detail: validation.errors },
        { status: 422 },
      );
    }
    if (validation.usedFallback) {
      console.log(
        `[email/send-result] 使用 fallback summary content resultId=${resultId}`,
        { cardCount: result.cards.length, fullTextLength: fullText.length },
      );
    }

    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL || "https://universe-whisper.vercel.app"
    ).replace(/\/$/, "");

    const resultUrl = result.resultUrl || `${siteUrl}/share/${resultId}`;
    const dateStr   = new Date().toLocaleDateString("zh-TW", {
      year: "numeric", month: "long", day: "numeric",
    });

    const html =
      result.cards.length === 3
        ? buildThreeCardEmailHtml(result, fullText, resultUrl, dateStr)
        : buildSingleCardEmailHtml(result, fullText, resultUrl, dateStr);

    const text = buildEmailText(result, fullText, resultUrl, dateStr);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    emailFrom,
        to:      [email],
        subject: "宇宙偷偷話｜你的完整塔羅解讀",
        html,
        text,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text().catch(() => "");
      console.error("[email/send-result] Resend error:", resendRes.status, errText);
      return NextResponse.json({ ok: false, error: "SEND_FAILED" }, { status: 500 });
    }

    // ── 更新寄送次數記錄 ──────────────────────────────────────────────────
    const maskedEmail = email.replace(/^(.).*@/, (_, c: string) => `${c}***@`);
    await rateRef.set(
      {
        count:      (rateData?.count ?? 0) + 1,
        lastSentAt: now,
        lastEmail:  maskedEmail,
        resultId,
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[email/send-result] error:", err);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
