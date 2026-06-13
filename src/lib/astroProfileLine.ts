/**
 * LINE message formatter for Astro-Profile (三重星座) results.
 * Completely separate from the tarot formatter in lineResults.ts.
 * Do NOT import this from any tarot-related file.
 */

import { LINE_WEBSITE_FOOTER, SITE_HOME_URL } from "@/lib/lineSite";

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
  /** 延伸深度解析四章節（已解鎖時傳入） */
  careerWealthText?: string | null;
  loveRelationshipText?: string | null;
  yearlyFortuneText?: string | null;
  soulLessonText?: string | null;
}

/** astro-profile 解析頁網址（讓使用者回網站查看完整版） */
const ASTRO_PROFILE_URL = `${SITE_HOME_URL}astro-profile`;

/** 把太陽 / 月亮 / 上升摘要成一段「重點輪廓」短句；缺哪顆就略過該顆 */
function buildOutlineLead(data: AstroProfileClaimData, includeVenus: boolean): string {
  const seg: string[] = [];
  if (data.sunSign) seg.push(`太陽${data.sunSign}是你的核心`);
  if (data.moonSign) seg.push(`月亮${data.moonSign}是你私下真正的情緒需求`);
  if (data.risingSign) seg.push(`上升${data.risingSign}是別人對你的第一印象`);
  if (includeVenus && data.venusSign) seg.push(`金星${data.venusSign}則牽動你的感情吸引力`);
  return seg.length ? `${seg.join("，")}。` : "";
}

/**
 * LINE 保存版（短摘要）。
 * - 不再塞完整長文、不顯示完整 11 顆星體資料表、不重貼整封 Email。
 * - 完整內容引導回網站 / Email 完整報告。
 * - 付費 / 免費依是否帶有付費延伸內容（事業 / 人際 / 流年 / 靈魂）判斷。
 *
 * 註：目前 astro-profile 沒有「可重複查閱」的查閱碼或 lookup 頁面
 *     （現有 claimCode 為一次性領取碼，領取後即失效），故這裡以「回網站 / Email」
 *     作為查閱方式，不輸出無法運作的查閱碼以免誤導。
 */
export function buildLineAstroProfileMessage(data: AstroProfileClaimData): string {
  const isPaid = !!(
    data.careerWealthText || data.loveRelationshipText ||
    data.yearlyFortuneText || data.soulLessonText
  );
  const parts: string[] = [];

  if (isPaid) {
    parts.push("✨ 你的完整星盤深度解析已保存");
    parts.push("Universe Whisper");
    parts.push(DIVIDER);
    parts.push("");

    parts.push("【星盤摘要】");
    if (data.sunSign) parts.push(`☀ 太陽：${data.sunSign}`);
    if (data.moonSign) parts.push(`🌙 月亮：${data.moonSign}`);
    if (data.risingSign) parts.push(`⬆ 上升：${data.risingSign}`);
    if (data.venusSign) parts.push(`♀ 金星：${data.venusSign}`);
    parts.push("");

    const highlightLead = buildOutlineLead(data, true);
    const overall = sliceText(clean(data.overallSummary), 110);
    const highlight = sliceText([highlightLead, overall].filter(Boolean).join(" ").trim(), 180);
    if (highlight) {
      parts.push("【你的星盤重點】");
      parts.push(highlight);
      parts.push("");
    }

    parts.push("【完整內容】");
    parts.push("完整星盤資料表、宮位解析、金星感情模式、水星到冥王星深度解析、職涯天賦、人際盲點與行動建議，請回網站或 Email 完整報告查看。");
    parts.push("");

    parts.push("【查看完整解析】");
    parts.push(ASTRO_PROFILE_URL);
    parts.push("Email 版完整報告可長期保存。");
    parts.push("");

    parts.push("【保存提醒】");
    parts.push("這則 LINE 為精簡保存版；NT$149 完整星盤深度解析的完整內容，請回網站或查收 Email 完整報告。");
  } else {
    parts.push("🌙 你的免費三重星座解析已保存");
    parts.push("Universe Whisper");
    parts.push(DIVIDER);
    parts.push("");

    parts.push("【三重星座】");
    if (data.sunSign) parts.push(`☀ 太陽：${data.sunSign}`);
    if (data.moonSign) parts.push(`🌙 月亮：${data.moonSign}`);
    if (data.risingSign) parts.push(`⬆ 上升：${data.risingSign}`);
    parts.push("");

    const outlineLead = buildOutlineLead(data, false);
    const overall = sliceText(clean(data.overallSummary || data.shortSummary), 100);
    const outline = sliceText([outlineLead, overall].filter(Boolean).join(" ").trim(), 160);
    if (outline) {
      parts.push("【你的三重星座輪廓】");
      parts.push(outline);
      parts.push("");
    }

    if (data.venusSign) {
      parts.push("【金星延伸參考】");
      parts.push(`♀ 金星：${data.venusSign}`);
      parts.push("完整感情模式會在 NT$149 完整星盤深度解析中展開。");
      parts.push("");
    }

    parts.push("【查看完整解析】");
    parts.push(ASTRO_PROFILE_URL);
  }

  parts.push("");
  parts.push(DIVIDER);
  parts.push("宇宙偷偷話 Universe Whisper");
  parts.push("");
  parts.push(LINE_WEBSITE_FOOTER);

  return parts.join("\n").trim();
}
