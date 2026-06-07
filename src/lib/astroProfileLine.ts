/**
 * LINE message formatter for Astro-Profile (三重星座) results.
 * Completely separate from the tarot formatter in lineResults.ts.
 * Do NOT import this from any tarot-related file.
 */

const DIVIDER = "━━━━━━━━━━━━━━";

/** Safely truncate text at sentence boundary, max maxChars */
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

/** Strip markdown, undefined/null literals, normalize whitespace */
function clean(text: string | null | undefined): string {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/\*\*/g, "")
    .replace(/\bundefined\b|\bnull\b/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
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

const SIGN_SUBLABELS: Record<string, string> = {
  sun: "核心自我・靈魂的本質與主導性格",
  moon: "情感內在・潛意識的日常安全感來源",
  rising: "外在面具・你給世界的第一印象與處事風格",
  venus: "感情吸引力・愛的表達與被吸引的方式",
};

export function buildLineAstroProfileMessage(data: AstroProfileClaimData): string {
  const parts: string[] = [];

  // ── 標題 ─────────────────────────────────────────────────────────────────────
  parts.push("🌌 你的三重星座完整解析");
  parts.push(DIVIDER);
  parts.push("");

  // ── 星座組合概覽 ──────────────────────────────────────────────────────────────
  if (data.sunSign) {
    parts.push(`☀ 太陽｜${data.sunSign}`);
    parts.push(SIGN_SUBLABELS.sun);
    parts.push("");
  }
  if (data.moonSign) {
    parts.push(`🌙 月亮｜${data.moonSign}`);
    parts.push(SIGN_SUBLABELS.moon);
    parts.push("");
  }
  if (data.risingSign) {
    parts.push(`↑ 上升｜${data.risingSign}`);
    parts.push(SIGN_SUBLABELS.rising);
    parts.push("");
  }
  if (data.venusSign) {
    parts.push(`♀ 金星｜${data.venusSign}`);
    parts.push(SIGN_SUBLABELS.venus);
    parts.push("");
  }

  parts.push(DIVIDER);
  parts.push("");

  // ── 整體解析 ─────────────────────────────────────────────────────────────────
  const overall = sliceText(clean(data.overallSummary), 200);
  if (overall) {
    parts.push("✨ 三重星座整體解析");
    parts.push(overall);
    parts.push("");
  }

  // ── 太陽核心 ─────────────────────────────────────────────────────────────────
  const sunCore = sliceText(clean(data.sunCoreText), 140);
  if (sunCore && data.sunSign) {
    parts.push(`☀ 核心本質｜${data.sunSign}`);
    parts.push(sunCore);
    parts.push("");
  }

  // ── 月亮內在 ─────────────────────────────────────────────────────────────────
  const moonInner = sliceText(clean(data.moonInnerText), 120);
  if (moonInner && data.moonSign) {
    parts.push(`🌙 內在情感｜${data.moonSign}`);
    parts.push(moonInner);
    parts.push("");
  }

  // ── 上升外在 ─────────────────────────────────────────────────────────────────
  const risingOuter = sliceText(clean(data.risingOuterText), 120);
  if (risingOuter && data.risingSign) {
    parts.push(`↑ 外在展現｜${data.risingSign}`);
    parts.push(risingOuter);
    parts.push("");
  }

  // ── 金星感情 ─────────────────────────────────────────────────────────────────
  const venusLove = sliceText(clean(data.venusLoveText), 100);
  if (venusLove && data.venusSign) {
    parts.push(`♀ 感情吸引力｜${data.venusSign}`);
    parts.push(venusLove);
    parts.push("");
  }

  // ── 宇宙偷偷話 ───────────────────────────────────────────────────────────────
  const whisperText = sliceText(clean(data.whisper), 120);
  if (whisperText) {
    parts.push("🌙 宇宙偷偷話");
    parts.push(whisperText);
    parts.push("");
  }

  // ── 給你的提醒 ───────────────────────────────────────────────────────────────
  const adviceText = sliceText(clean(data.advice), 100);
  if (adviceText) {
    parts.push("🌿 給你的提醒");
    parts.push(adviceText);
    parts.push("");
  }

  parts.push(DIVIDER);
  parts.push("宇宙偷偷話 Universe Whisper");

  return parts.join("\n").trim();
}
