/**
 * LINE message formatter for Astro-Profile (三重星座) results.
 * Completely separate from the tarot formatter in lineResults.ts.
 * Do NOT import this from any tarot-related file.
 */

const DIVIDER = "━━━━━━━━━━━━";

/** Safely truncate text at sentence boundary */
function sliceText(text: string, maxChars: number): string {
  if (!text || !text.trim()) return "";
  const s = text
    .replace(/\*\*/g, "")
    .replace(/\n+/g, " ")
    .trim();
  if (s.length <= maxChars) return s;
  const sub = s.slice(0, maxChars);
  const last = Math.max(
    sub.lastIndexOf("。"),
    sub.lastIndexOf("！"),
    sub.lastIndexOf("？"),
  );
  if (last > maxChars * 0.4) return sub.slice(0, last + 1);
  return sub + "…";
}

/** Strip markdown, undefined/null literals, and trim */
function clean(text: string | null | undefined): string {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/\*\*/g, "")
    .replace(/\bundefined\b|\bnull\b/gi, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export interface AstroProfileClaimData {
  resultType?: string;
  sunSign?: string | null;
  moonSign?: string | null;
  risingSign?: string | null;
  venusSign?: string | null;
  overallSummary?: string | null;
  sunCoreText?: string | null;
  moonInnerText?: string | null;
  risingOuterText?: string | null;
  venusLoveText?: string | null;
  whisper?: string | null;
  advice?: string | null;
  shortSummary?: string | null;
}

export function buildLineAstroProfileMessage(data: AstroProfileClaimData): string {
  const parts: string[] = [];

  parts.push("✦ 你的三重星座完整解析");
  parts.push("");

  // Signs header
  const signLines: string[] = [];
  if (data.sunSign) signLines.push(`太陽：${data.sunSign}`);
  if (data.moonSign) signLines.push(`月亮：${data.moonSign}`);
  if (data.risingSign) signLines.push(`上升：${data.risingSign}`);
  if (data.venusSign) signLines.push(`金星：${data.venusSign}`);
  if (signLines.length > 0) {
    parts.push(...signLines);
    parts.push("");
  }

  // Overall summary
  const overall = sliceText(clean(data.overallSummary), 200);
  if (overall) {
    parts.push(DIVIDER);
    parts.push("三重星座整體解析");
    parts.push(overall);
    parts.push("");
  }

  // Sun core text
  const sunCore = sliceText(clean(data.sunCoreText), 150);
  if (sunCore && data.sunSign) {
    parts.push(DIVIDER);
    parts.push(`核心本質｜${data.sunSign}`);
    parts.push(sunCore);
    parts.push("");
  }

  // Moon inner text
  const moonInner = sliceText(clean(data.moonInnerText), 120);
  if (moonInner && data.moonSign) {
    parts.push(DIVIDER);
    parts.push(`內在情感｜${data.moonSign}`);
    parts.push(moonInner);
    parts.push("");
  }

  // Rising outer text
  const risingOuter = sliceText(clean(data.risingOuterText), 120);
  if (risingOuter && data.risingSign) {
    parts.push(DIVIDER);
    parts.push(`外在展現｜${data.risingSign}`);
    parts.push(risingOuter);
    parts.push("");
  }

  // Venus love text
  const venusLove = sliceText(clean(data.venusLoveText), 100);
  if (venusLove && data.venusSign) {
    parts.push(DIVIDER);
    parts.push(`感情吸引力｜${data.venusSign}`);
    parts.push(venusLove);
    parts.push("");
  }

  // Whisper
  const whisperText = sliceText(clean(data.whisper), 120);
  if (whisperText) {
    parts.push(DIVIDER);
    parts.push("宇宙偷偷話");
    parts.push(whisperText);
    parts.push("");
  }

  // Advice
  const adviceText = sliceText(clean(data.advice), 100);
  if (adviceText) {
    parts.push(DIVIDER);
    parts.push("給你的提醒");
    parts.push(adviceText);
    parts.push("");
  }

  parts.push(DIVIDER);
  parts.push("✦ Universe Whisper｜宇宙偷偷話");

  return parts.join("\n").trim();
}
