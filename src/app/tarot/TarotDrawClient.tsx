"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ShareStoryCard } from "@/components/ShareStoryCard";
import { TarotCardBack, TarotCardFace, TarotCardFaceCompact, type TarotCardFaceData } from "@/components/TarotCardFace";
import { TarotShuffleAnimation } from "./TarotShuffleAnimation";
import { useAuth } from "@/contexts/AuthContext";

type DrawStatus = "idle" | "drawing" | "selecting" | "revealing" | "revealed";
type ReadingStatus = "idle" | "loading" | "done" | "error";
type ReadingTopic = "love" | "career" | "general";
type SpreadPosition = "past" | "present" | "future";

/** 最近一次付費結果，暫存於 localStorage */
type LastPaidResult = {
  question: string;
  mode: string;
  topic: string;
  cards: TarotCardFaceData[];
  fullReading: string;
  createdAt: number;
  /** 顯示用交易參考編號，例如 UW-1X2Y3Z */
  refId: string;
};

const ANON_ID_STORAGE_KEY = "cosmic_anon_id";
const FB_SHARE_UNLOCK_STORAGE_KEY = "cosmic_fb_unlock_date";
const LINE_CONNECT_MESSAGE_KEY = "line-connect-message-payload";
const PAID_RESULT_STORAGE_KEY = "universeWhisper:lastPaidTarotResult";
const LINE_OA_ID = process.env.NEXT_PUBLIC_LINE_OA_ID ?? "453gfmok";
/** oaMessage 預填文字連結前綴（@ 必須 percent-encode 成 %40） */
const LINE_OA_MESSAGE_BASE = `https://line.me/R/oaMessage/%40${LINE_OA_ID}/?`;
/** 加好友連結（@ 必須 percent-encode，避免 Safari 解析問題） */
const LINE_ADD_FRIEND_URL =
  process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL ??
  `https://line.me/R/ti/p/%40${LINE_OA_ID}`;

const modes = [
  { key: "single_tarot", label: "單張牌", description: "接收此刻最靠近你的訊息" },
  { key: "three_card", label: "三張牌", description: "過去、現在、未來的溫柔流動" },
] as const;

const topics = ["愛情", "工作", "生活"] as const;
type TarotTopicOption = (typeof topics)[number];

const spreadQuestionGroups = {
  愛情: {
    title: "愛情專屬牌陣",
    questions: ["他現在怎麼想我？", "這段關係下一步會如何？", "我該主動靠近嗎？", "對方真正沒說出口的是什麼？"],
  },
  工作: {
    title: "工作專屬牌陣",
    questions: ["目前工作方向適合我嗎？", "近期適合轉職嗎？", "我該如何突破卡關？", "這個合作值得投入嗎？"],
  },
  生活: {
    title: "生活專屬牌陣",
    questions: ["今天宇宙想提醒我什麼？", "我現在最需要放下什麼？", "下一步該往哪裡走？", "近期需要注意什麼？"],
  },
} satisfies Record<TarotTopicOption, { title: string; questions: readonly string[] }>;

// 單張牌範例問題（依分類）
const singleCardQuestions = {
  愛情: ["他現在怎麼想？", "這段感情值得繼續嗎？", "我該主動靠近嗎？", "對方真正沒說出口的是什麼？"],
  工作: ["我該不該換工作？", "目前方向適合我嗎？", "面試結果會順利嗎？", "我現在卡住的原因是什麼？"],
  生活: ["今天宇宙想提醒我什麼？", "最近狀態低落的原因？", "我該怎麼調整節奏？", "接下來一週需要注意什麼？"],
} satisfies Record<TarotTopicOption, readonly string[]>;

// textarea placeholder 依分類切換
const textareaPlaceholders = {
  愛情: "例如：他現在怎麼想？這段關係下一步？我該主動靠近嗎？",
  工作: "例如：我該不該換工作？目前方向適合我嗎？卡住的原因是什麼？",
  生活: "例如：今天宇宙想提醒我什麼？最近狀態低落的原因？",
} satisfies Record<TarotTopicOption, string>;

function toReadingTopic(topic: TarotTopicOption): ReadingTopic {
  if (topic === "工作") return "career";
  if (topic === "愛情") return "love";
  return "general";
}

function toMeaningTopic(topic: TarotTopicOption) {
  if (topic === "工作") return "work";
  if (topic === "生活") return "life";
  return "love";
}

function toSpreadPosition(position: TarotCardFaceData["position"]): SpreadPosition | undefined {
  if (position === "過去") return "past";
  if (position === "現在") return "present";
  if (position === "未來") return "future";
  return undefined;
}

function getTodayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

function getOrCreateAnonId(): string {
  try {
    const existing = window.localStorage.getItem(ANON_ID_STORAGE_KEY);
    if (existing) return existing;
    const newId = crypto.randomUUID();
    window.localStorage.setItem(ANON_ID_STORAGE_KEY, newId);
    return newId;
  } catch {
    return "anonymous";
  }
}

function hasUsedFbShareUnlockToday() {
  try {
    return window.localStorage.getItem(FB_SHARE_UNLOCK_STORAGE_KEY) === getTodayKey();
  } catch {
    return false;
  }
}

function markFbShareUnlockLocalStorage() {
  try {
    window.localStorage.setItem(FB_SHARE_UNLOCK_STORAGE_KEY, getTodayKey());
  } catch {
    // localStorage can be unavailable in private modes.
  }
}

// ?????????????????????????????????????????????????????????????????????????????
// Reading parsers
// ?????????????????????????????????????????????????????????????????????????????

type ReadingSection = { title: string; body: string };
const READING_FALLBACK_TEXT = "宇宙正在整理訊息中。";

// 所有可能的 section 標題（支援 emoji 前綴，用裸文字匹配）
const READING_SECTION_TITLES = [
  // 原有
  "宇宙偷偷話",
  "這張牌正在說什麼",
  "你現在的狀態",
  "接下來可以怎麼做",
  "給你的溫柔提醒",
  "7日能量提示",
  "一句專屬祝福",
  // 新增（單張牌）
  "本次問題焦點",
  "一句話結論",
  "針對你的問題",
  "今天可以怎麼做",
  "健康提醒",
  // 新增（三張牌）
  "牌陣總結",
  "第1張牌",
  "第2張牌",
  "第3張牌",
  "三張牌整合訊息",
  "3～7 天行動建議",
];

/** 移除行首 emoji / 符號，取得純文字 */
function stripLeadingSymbols(line: string): string {
  return line.replace(/^[^\p{L}\p{N}\d]+/gu, "").trim();
}

function parseReadingSectionsForDisplay(text: string): ReadingSection[] {
  const cleaned = text.replace(/\*\*/g, "").trim();
  if (!cleaned) return [{ title: "宇宙偷偷話", body: READING_FALLBACK_TEXT }];

  const sections: ReadingSection[] = [];
  let current: ReadingSection | null = null;
  const pushCurrent = () => {
    if (!current) return;
    sections.push({
      title: current.title,
      body: current.body.trim() || READING_FALLBACK_TEXT,
    });
  };

  for (const rawLine of cleaned.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const bare = stripLeadingSymbols(line);

    // 找到匹配的 section 標題（支援 emoji 前綴和冒號後綴）
    const matchedTitle = READING_SECTION_TITLES.find((item) => {
      if (bare === item) return true;
      if (bare.startsWith(`${item}：`) || bare.startsWith(`${item} `)) return true;
      if (bare.startsWith(`${item}:`)) return true;
      return false;
    });

    if (matchedTitle) {
      pushCurrent();
      // 標題後的文字（如「第1張牌：目前狀態」取「目前狀態」部分）
      const afterTitle = bare.slice(matchedTitle.length).replace(/^[：: ]+/, "").trim();
      const displayTitle = afterTitle ? `${matchedTitle}：${afterTitle}` : matchedTitle;
      current = { title: displayTitle, body: "" };
      continue;
    }

    if (!current) {
      current = { title: "宇宙偷偷話", body: line };
      continue;
    }

    current.body = [current.body, line].filter(Boolean).join("\n");
  }

  pushCurrent();

  return sections.length
    ? sections
    : [{ title: "宇宙偷偷話", body: READING_FALLBACK_TEXT }];
}

// ── 三張牌解讀的結構化資料 ────────────────────────────────────────────────────

type ThreeCardParsedSections = {
  category: string;
  questionFocus: string;
  overallSummary: string;
  card1: { subtitle: string; body: string };
  card2: { subtitle: string; body: string };
  card3: { subtitle: string; body: string };
  combined: string;
  actionSteps: string;
  reminder: string;
  blessing: string;
  safetyNote: string;
};

function parseThreeCardSections(text: string): ThreeCardParsedSections {
  const result: ThreeCardParsedSections = {
    category: "", questionFocus: "", overallSummary: "",
    card1: { subtitle: "", body: "" },
    card2: { subtitle: "", body: "" },
    card3: { subtitle: "", body: "" },
    combined: "", actionSteps: "", reminder: "", blessing: "", safetyNote: "",
  };
  if (!text.trim()) return result;

  type Key = "category" | "qfocus" | "summary" | "c1" | "c2" | "c3" | "combined" | "action" | "reminder" | "blessing" | "safety";
  let current: Key | null = null;
  const lines: string[] = [];

  const flush = () => {
    const body = lines.join("\n").trim();
    lines.length = 0;
    if (!current || !body) return;
    if (current === "category")  result.category      = body;
    if (current === "qfocus")    result.questionFocus  = body;
    if (current === "summary")   result.overallSummary = body;
    if (current === "c1")        result.card1.body      = body;
    if (current === "c2")        result.card2.body      = body;
    if (current === "c3")        result.card3.body      = body;
    if (current === "combined")  result.combined        = body;
    if (current === "action")    result.actionSteps     = body;
    if (current === "reminder")  result.reminder        = body;
    if (current === "blessing")  result.blessing        = body;
    if (current === "safety")    result.safetyNote      = body;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const bare = stripLeadingSymbols(line);

    if (bare.startsWith("本次問題焦點"))              { flush(); current = "category"; }
    else if (bare.startsWith("宇宙偷偷話"))           { flush(); current = "qfocus"; }
    else if (bare.startsWith("牌陣總結"))             { flush(); current = "summary"; }
    else if (bare.match(/^第[1一]張牌/))              {
      flush(); current = "c1";
      result.card1.subtitle = bare.replace(/^第[1一]張牌[：:：]?\s*/, "");
    }
    else if (bare.match(/^第[2二]張牌/))              {
      flush(); current = "c2";
      result.card2.subtitle = bare.replace(/^第[2二]張牌[：:：]?\s*/, "");
    }
    else if (bare.match(/^第[3三]張牌/))              {
      flush(); current = "c3";
      result.card3.subtitle = bare.replace(/^第[3三]張牌[：:：]?\s*/, "");
    }
    else if (bare.includes("三張牌整合"))             { flush(); current = "combined"; }
    else if (bare.includes("行動建議") || bare.includes("3～7") || bare.includes("3~7")) { flush(); current = "action"; }
    else if (bare.includes("溫柔提醒"))               { flush(); current = "reminder"; }
    else if (bare.includes("專屬祝福") || bare.includes("一句祝福")) { flush(); current = "blessing"; }
    else if (bare.includes("健康提醒"))               { flush(); current = "safety"; }
    else if (current)                                  { lines.push(line); }
  }
  flush();

  return result;
}

// 單張牌完整版：不顯示「本次問題焦點」（category 已由分類按鈕表示）
const SINGLE_CARD_HIDDEN_TITLES = new Set(["本次問題焦點"]);

function ReadingSectionList({ text, limit }: { text: string; limit?: number }) {
  const sections = parseReadingSectionsForDisplay(text)
    .filter((s) => !SINGLE_CARD_HIDDEN_TITLES.has(s.title));
  const visibleSections = typeof limit === "number" ? sections.slice(0, limit) : sections;

  return (
    <div className="space-y-4">
      {visibleSections.map((section, index) => (
        <article
          key={`${section.title}-${index}`}
          className="reading-fade-in rounded-3xl border border-white/10 bg-white/[0.055] p-4 shadow-[0_18px_54px_rgba(8,10,35,0.2)] sm:p-5"
          style={{ animationDelay: `${index * 0.55}s` }}
        >
          {section.title ? (
            <h4 className="text-lg font-semibold text-moon">{section.title}</h4>
          ) : null}
          <p className="mt-3 whitespace-pre-line text-base leading-8 text-moon/80">
            {section.body}
          </p>
        </article>
      ))}
    </div>
  );
}

// ── 三張牌解讀：內容解析 helper ──────────────────────────────────────────────

/**
 * 解析每張牌的 body，嘗試拆成三個子段落：
 * 牌面重點 / 對你的問題代表 / 這張牌提醒你
 */
type CardSubsections = {
  core?: string;
  question?: string;
  reminder?: string;
  rawContent: string;
};

// ── 前端：取第一句，最多 maxChars 字 ─────────────────────────────────────────
function clientFirstSentence(text: string, maxChars: number): string {
  if (!text) return text;
  const m = text.match(/^[\s\S]*?[。！？]/);
  const s = (m ? m[0] : text).trim();
  if (s.length <= maxChars) return s;
  const sub = s.slice(0, maxChars);
  const lastPunct = Math.max(sub.lastIndexOf("。"), sub.lastIndexOf("！"), sub.lastIndexOf("？"), sub.lastIndexOf("，"));
  return lastPunct > maxChars / 2 ? sub.slice(0, lastPunct + 1) : sub + "…";
}

// ── 前端：位置偵測提取段落（容許行內混合格式）────────────────────────────────
function clientExtractSection(text: string, sectionName: string, stopNames: string[]): string {
  const markerRe = new RegExp(`${sectionName}[：:]\\s*`);
  const markerM  = text.match(markerRe);
  if (!markerM || markerM.index == null) return "";
  const start = markerM.index + markerM[0].length;
  let end = text.length;
  for (const stop of stopNames) {
    const stopM = text.slice(start).match(new RegExp(`${stop}[：:]`));
    if (stopM?.index != null) end = Math.min(end, start + stopM.index);
  }
  return text.slice(start, end).trim();
}

function parseCardSubsections(body: string): CardSubsections {
  if (!body) return { rawContent: "" };

  // 位置偵測提取（容許行內混合格式，不需強制換行分隔）
  const coreRaw     = clientExtractSection(body, "牌面重點",     ["對你的問題代表", "這張牌提醒你"]);
  const questionRaw = clientExtractSection(body, "對你的問題代表", ["這張牌提醒你"]);
  const reminderRaw = clientExtractSection(body, "這張牌提醒你",  []);

  // 若位置偵測找不到，退回舊版 regex
  const useFallbackRegex = !coreRaw && !questionRaw && !reminderRaw;
  const coreM     = useFallbackRegex ? body.match(/牌面重點[：:]\s*\n?([\s\S]*?)(?=\n\n對你的問題代表[：:]|\n對你的問題代表[：:]|$)/) : null;
  const questionM = useFallbackRegex ? body.match(/對你的問題代表[：:]\s*\n?([\s\S]*?)(?=\n\n這張牌提醒你[：:]|\n這張牌提醒你[：:]|$)/) : null;
  const reminderM = useFallbackRegex ? body.match(/這張牌提醒你[：:]\s*\n?([\s\S]*)$/) : null;

  let core     = (coreRaw     || coreM?.[1])?.trim();
  let question = (questionRaw || questionM?.[1])?.trim();
  const reminder = (reminderRaw || reminderM?.[1])?.trim();

  // ── 硬性長度限制 ─────────────────────────────────────────────────────────────
  // 牌面重點：只取第一句，移除牌名/正逆位前綴，最多 60 字
  if (core) {
    core = core
      .replace(/^[^\n]*（(?:正位|逆位)）[^\n]*/gm, "")
      .replace(/^關鍵字[：:][^\n]*/gm, "")
      .replace(/^這張牌代表[：:]\s*/, "")
      .trim();
    core = clientFirstSentence(core, 60);
  }
  // 對你的問題代表：切斷在「這張牌提醒你」之前
  if (question) {
    const reminderInQ = question.indexOf("這張牌提醒你");
    if (reminderInQ !== -1) question = question.slice(0, reminderInQ).trim();
  }

  if (core || question || reminder) {
    return { core, question, reminder, rawContent: body };
  }

  // 沒有三小段格式 → 移除 header 行（牌名、摘要行），保留訊息本體
  const rawContent = body
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      if (!t) return false;
      if (t.match(/^[\S]+（(?:正位|逆位)）/)) return false;
      if (t.startsWith("摘要：")) return false;
      return true;
    })
    .join("\n")
    .trim();

  return { rawContent: rawContent || body };
}

/**
 * 解析 overallSummary：嘗試拆成「核心判斷」和「為什麼會這樣」兩段
 */
type OverallSummaryParsed = {
  verdict?: string;   // 整體答案
  reason?: string;    // 為什麼會這樣
  direction?: string; // 接下來的方向（新段落）
  raw: string;
};

function parseOverallSummary(text: string): OverallSummaryParsed {
  if (!text) return { raw: "" };
  // 支援「整體答案」（新）和「核心判斷」（舊）兩種標籤
  const verdictM   = text.match(/(?:整體答案|核心判斷)[：:]\s*\n?([\s\S]*?)(?=\n\n?為什麼會這樣[：:]|$)/);
  const reasonM    = text.match(/為什麼會這樣[：:]\s*\n?([\s\S]*?)(?=\n\n?接下來的方向[：:]|$)/);
  const directionM = text.match(/接下來的方向[：:]\s*\n?([\s\S]*)$/);
  const verdict    = verdictM?.[1]?.trim();
  const reason     = reasonM?.[1]?.trim();
  const direction  = directionM?.[1]?.trim();
  if (verdict && reason) return { verdict, reason, direction, raw: text };
  return { raw: text };
}

/**
 * 將 actionSteps 文字分組，每個 "Day X～Y｜" 開頭算一組
 */
function groupActionSteps(text: string): Array<{ dayLabel?: string; actionLabel?: string; content: string }> {
  if (!text) return [];

  // 先嘗試用 \n\n 分隔（新格式）
  const byDouble = text.split("\n\n").map((s) => s.trim()).filter(Boolean);
  const groups = byDouble.length > 1 ? byDouble : text.split("\n").filter(Boolean).reduce<string[]>((acc, line) => {
    if (line.match(/^Day\s*\d/)) { acc.push(line); }
    else if (acc.length) { acc[acc.length - 1] += "\n" + line; }
    else { acc.push(line); }
    return acc;
  }, []);

  return groups.map((step) => {
    // Match "Day 1～2｜動詞短語\n内容"
    const m1 = step.match(/^(Day\s*[\d]+[～~–-]+[\d]*)\s*[｜|]\s*([^\n]+)\n([\s\S]+)$/);
    if (m1) return { dayLabel: m1[1].trim(), actionLabel: m1[2].trim(), content: m1[3].trim() };
    // Match "Day 1–2：内容"
    const m2 = step.match(/^(Day\s*[\d]+[～~–-]+[\d]*)[：:\s]+([\s\S]+)$/);
    if (m2) return { dayLabel: m2[1].trim(), content: m2[2].trim() };
    return { content: step };
  });
}

// ── 三張牌完整解讀顯示元件 ───────────────────────────────────────────────────

function ThreeCardReadingDisplay({
  text,
  cards: spreadCards,
}: {
  text: string;
  cards: TarotCardFaceData[];
}) {
  const s = parseThreeCardSections(text);

  const cardSections = [
    { data: s.card1, card: spreadCards[0], idx: 0 },
    { data: s.card2, card: spreadCards[1], idx: 1 },
    { data: s.card3, card: spreadCards[2], idx: 2 },
  ];

  const baseCard =
    "reading-fade-in rounded-2xl border border-white/10 bg-white/[0.055] p-4 shadow-[0_12px_36px_rgba(8,10,35,0.18)] sm:p-5";
  const baseTitle = "mb-3 text-xs tracking-[0.22em] text-lavender/70 uppercase";
  const baseBody  = "whitespace-pre-line text-base leading-8 text-moon/80";

  return (
    <div className="space-y-4">

      {/* ── 逐張牌解讀：每張分三小段（牌陣總結已移到行動建議之後）── */}
      {cardSections.map(({ data, card, idx }) => {
        if (!data.body) return null;
        const sub = parseCardSubsections(data.body);
        const hasSubs = !!(sub.core || sub.question || sub.reminder);

        return (
          <article
            key={idx}
            className={baseCard}
            style={{ animationDelay: `${(idx + 1) * 0.2}s` }}
          >
            {/* 卡片 header：第N張 + 位置 + 牌名 */}
            <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-white/8 pb-3">
              <span className="rounded-full border border-[#d8bd70]/35 bg-midnight/60 px-2.5 py-0.5 text-xs font-medium tracking-wide text-[#d8bd70]">
                第 {idx + 1} 張
              </span>
              {(data.subtitle || card?.position) && (
                <span className="text-sm text-moon/65">{data.subtitle || card?.position}</span>
              )}
              {card?.name && (
                <span className="ml-auto text-sm font-semibold text-moon">
                  {card.name}
                  <span
                    className={`ml-1.5 rounded-full border px-2 py-0.5 text-xs font-normal ${
                      card.orientation === "upright"
                        ? "border-aurora/40 text-aurora"
                        : "border-lavender/44 text-lavender"
                    }`}
                  >
                    {card.orientationLabel}
                  </span>
                </span>
              )}
            </div>

            {hasSubs ? (
              /* 三小段格式 */
              <div className="space-y-4">
                {sub.core && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold tracking-wide text-[#d8bd70]/75 uppercase">牌面重點</p>
                    <p className="text-base leading-[1.85] text-moon/82">{sub.core}</p>
                  </div>
                )}
                {sub.question && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold tracking-wide text-lavender/70 uppercase">對你的問題代表</p>
                    <p className="text-base leading-[1.85] text-moon/82">{sub.question}</p>
                  </div>
                )}
                {sub.reminder && (
                  <div className="rounded-xl border border-white/8 bg-midnight/30 p-3">
                    <p className="mb-1.5 text-xs font-semibold tracking-wide text-aurora/70 uppercase">這張牌提醒你</p>
                    <p className="text-base leading-[1.85] text-moon/85">{sub.reminder}</p>
                  </div>
                )}
              </div>
            ) : (
              /* fallback：純文字 */
              <p className="whitespace-pre-line text-base leading-[1.85] text-moon/80">{sub.rawContent || data.body}</p>
            )}
          </article>
        );
      })}

      {/* 「三張牌整合訊息」已移除 — 內容已整合入牌陣總結 */}

      {/* 3～7 天行動建議：Day 1～2｜動詞 + 說明 */}
      {s.actionSteps ? (
        <article className={baseCard} style={{ animationDelay: "0.9s" }}>
          <p className={baseTitle}>3～7 天行動建議</p>
          <ul className="mt-3 space-y-4">
            {groupActionSteps(s.actionSteps).map((step, i) => (
              <li key={i} className="border-l-2 border-[#d8bd70]/30 pl-3">
                {(step.dayLabel || step.actionLabel) && (
                  <p className="mb-1 text-xs font-semibold text-[#d8bd70]/80">
                    {step.dayLabel}{step.actionLabel ? `｜${step.actionLabel}` : ""}
                  </p>
                )}
                <p className="text-base leading-[1.85] text-moon/80">{step.content}</p>
              </li>
            ))}
          </ul>
        </article>
      ) : null}

      {/* 牌陣總結：移到行動建議之後，閱讀完三張牌再看整體答案更自然 */}
      {s.overallSummary ? (() => {
        const parsed = parseOverallSummary(s.overallSummary);
        return (
          <article
            className="reading-fade-in rounded-2xl border border-[#d8bd70]/30 bg-gradient-to-br from-[#d8bd70]/10 to-midnight/60 p-5 shadow-[0_0_28px_rgba(216,189,112,0.10)]"
            style={{ animationDelay: "1.1s" }}
          >
            <p className="mb-3 text-xs tracking-[0.22em] text-[#d8bd70]/75 uppercase">牌陣總結</p>
            {parsed.verdict && parsed.reason ? (
              <div className="space-y-4">
                <div>
                  <p className="mb-1 text-xs font-semibold tracking-wide text-[#d8bd70]/65">整體答案</p>
                  <p className="text-lg font-semibold leading-8 text-moon">{parsed.verdict}</p>
                </div>
                <div className="border-t border-white/10 pt-3">
                  <p className="mb-1 text-xs font-semibold tracking-wide text-[#d8bd70]/65">為什麼會這樣</p>
                  <p className="text-base leading-[1.85] text-moon/78">{parsed.reason}</p>
                </div>
                {parsed.direction && (
                  <div className="border-t border-white/10 pt-3">
                    <p className="mb-1 text-xs font-semibold tracking-wide text-[#d8bd70]/65">接下來的方向</p>
                    <p className="text-base leading-[1.85] text-moon/82">{parsed.direction}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-lg font-medium leading-[1.85] text-moon">{parsed.raw}</p>
            )}
          </article>
        );
      })() : null}

      {/* 心靈收束 / 宇宙給你的最後一句話 — 合併溫柔提醒 + 專屬祝福 */}
      {(s.reminder || s.blessing) ? (
        <article
          className="reading-fade-in rounded-2xl border border-lavender/25 bg-gradient-to-br from-lavender/8 to-midnight/70 p-5"
          style={{ animationDelay: "1.3s" }}
        >
          <p className="mb-3 text-xs tracking-[0.22em] text-lavender/65 uppercase">心靈收束</p>
          {s.reminder ? (
            <p className="text-base leading-[1.85] text-moon/82">{s.reminder}</p>
          ) : null}
          {s.blessing ? (
            <p className={`text-base italic leading-8 text-moon/70 text-center ${s.reminder ? "mt-4 border-t border-white/8 pt-4" : ""}`}>
              {s.blessing}
            </p>
          ) : null}
        </article>
      ) : null}

      {/* 健康提醒 */}
      {s.safetyNote ? (
        <article
          className="reading-fade-in rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4"
          style={{ animationDelay: "1.5s" }}
        >
          <p className="text-xs tracking-wide text-amber-400/70 uppercase mb-2">健康提醒</p>
          <p className="text-sm leading-7 text-moon/70">{s.safetyNote}</p>
        </article>
      ) : null}

    </div>
  );
}

function buildFreeSummary(cards: TarotCardFaceData[], fullReading: string) {
  // 免費版只取第一個有意義的段落（不洩漏完整結論）
  // 跳過「本次問題焦點」「一句話結論」「總結」等可能直接給出完整答案的段落
  const SKIP_TITLES = new Set(["本次問題焦點", "一句話結論", "總結", "核心判斷", "行動建議"]);
  const sections = fullReading.trim()
    ? parseReadingSectionsForDisplay(fullReading)
        .filter((s) => !SKIP_TITLES.has(s.title) && s.body.length > 10)
        .slice(0, 1)   // 只取第一段，保留懸念
    : [];
  const firstLines = sections.map((s) => s.body).join(" ");
  const fallback = cards.map((c) => c.cosmicMessage).filter(Boolean).join(" ");
  const source = firstLines || fallback || "宇宙正在整理這次抽牌的核心訊息。";

  // 上限 120 字，給方向感但不講完整結論
  return {
    message: source.length > 120 ? `${source.slice(0, 118)}…` : source,
    reminder: "解鎖完整版，看見這張牌真正想提醒你的事。",
  };
}

/** 分類標籤，用於分享圖 */
function getTopicShareLabel(topic: TarotTopicOption): string {
  if (topic === "愛情") return "愛情訊息";
  if (topic === "工作") return "工作訊息";
  return "生活訊息";
}

/** 分類對應的分享圖吸引力標題 */
function getShareTitle(topic: TarotTopicOption, card: TarotCardFaceData | undefined): string {
  const cardDesc = card ? `${card.name}（${card.orientationLabel}）` : "";
  if (topic === "愛情") {
    const titles = [
      "這張牌看見了你對這段關係真正的感受。",
      "不是沒有感覺，而是有些話還沒說清楚。",
      "關鍵不是誰主動，而是這段關係是否值得繼續消耗。",
      "你不是放不下，而是還沒看清楚對方真正的態度。",
    ];
    return (cardDesc ? `${cardDesc}出現，提示你—— ` : "") +
      (card ? titles[card.name.length % titles.length] : titles[0]);
  }
  if (topic === "工作") {
    const titles = [
      "你不是沒有能力，而是方向需要重新確認。",
      "現在不是硬衝的時候，先看清真正卡住你的點。",
      "機會有出現，但你需要先整理自己的籌碼。",
      "這張牌提示你：停下來看清方向，比繼續衝更重要。",
    ];
    return (cardDesc ? `${cardDesc}出現，提示你—— ` : "") +
      (card ? titles[card.name.length % titles.length] : titles[0]);
  }
  // 生活
  const titles = [
    "你正在轉變，只是還沒完全看清下一步。",
    "現在的混亂，正在逼你看見真正重要的事。",
    "這不是停滯，而是宇宙要你重新整理內在秩序。",
    "這張牌提示你：最需要的不是答案，而是先停下來聽自己。",
  ];
  return (cardDesc ? `${cardDesc}出現，提示你—— ` : "") +
    (card ? titles[card.name.length % titles.length] : titles[0]);
}

function buildStoryCopy(
  card: TarotCardFaceData | undefined,
  fullReading: string,
  freeSummary: { message: string; reminder: string },
  topic?: TarotTopicOption,
) {
  const SKIP_TITLES = new Set(["本次問題焦點", "一句話結論"]);
  const sections = fullReading.trim()
    ? parseReadingSectionsForDisplay(fullReading).filter((s) => !SKIP_TITLES.has(s.title))
    : [];

  // 取「宇宙偷偷話」或「這張牌正在說什麼」段落作為分享主文
  const mainSection = sections.find((s) =>
    s.title.includes("宇宙偷偷話") || s.title.includes("這張牌正在說") || s.title.includes("牌陣總結")
  );
  const mainText = mainSection?.body || card?.cosmicMessage || freeSummary.message || READING_FALLBACK_TEXT;

  // 使用分類標題 + 吸引力文案作為 resultText（分享圖主標）
  const categoryLabel = topic ? getTopicShareLabel(topic) : "宇宙訊息";
  const shareTitle    = getShareTitle(topic ?? "生活", card);
  const resultText    = `${categoryLabel}\n${shareTitle}`;

  // adviceText 用一句話結論或解鎖引導
  const conclusionSection = sections.find((s) => s.title.includes("一句話結論"));
  const teaser = "分享後解鎖完整訊息，看見這張牌真正想提醒你的事。";
  const adviceText = conclusionSection?.body || mainText.slice(0, 60) + (mainText.length > 60 ? "…" : "") || teaser;

  return {
    resultText: resultText.length > 130 ? `${resultText.slice(0, 128)}...` : resultText,
    adviceText: adviceText.length > 85 ? `${adviceText.slice(0, 83)}...` : adviceText,
  };
}

// ?????????????????????????????????????????????????????????????????????????????
// Canvas story image (client-side 1080?1920 PNG)
// ?????????????????????????????????????????????????????????????????????????????

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`圖片載入失敗：${src}`));
    img.src = src;
  });
}

function canvasRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (!text) return [];
  const lines: string[] = [];
  let current = "";
  for (const char of text) {
    const test = current + char;
    if (ctx.measureText(test).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = char;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function generateStoryImage(
  cardNameZh: string,
  cardNameEn: string,
  cardImageSrc: string,
  resultText: string,
  siteUrl: string,
): Promise<Blob> {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");

  const ff = "'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', sans-serif";

  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, "#05071d");
  bgGrad.addColorStop(0.55, "#0d0b2a");
  bgGrad.addColorStop(1, "#1a0e2e");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  try {
    const bgImg = await loadImage("/reference/story-bg.png");
    ctx.drawImage(bgImg, 0, 0, W, H);
  } catch {
    /* gradient fallback */
  }

  const starDefs = [
    { x: 120, y: 88, size: 28, alpha: 0.55 },
    { x: W - 148, y: 130, size: 20, alpha: 0.38 },
    { x: 96, y: H - 240, size: 22, alpha: 0.45 },
    { x: W - 116, y: H - 268, size: 18, alpha: 0.38 },
  ];
  ctx.textAlign = "left";
  for (const s of starDefs) {
    ctx.font = `${s.size}px serif`;
    ctx.fillStyle = `rgba(247,217,135,${s.alpha})`;
    ctx.fillText("✦", s.x, s.y + s.size);
  }

  let curY = 100;
  ctx.textAlign = "center";

  ctx.font = `600 30px ${ff}`;
  ctx.fillStyle = "rgba(247,217,135,0.88)";
  ctx.fillText("UNIVERSE WHISPER", W / 2, curY + 36);
  curY += 80;

  ctx.font = `700 84px ${ff}`;
  ctx.fillStyle = "#f7d987";
  ctx.shadowBlur = 20;
  ctx.shadowColor = "rgba(247,217,135,0.36)";
  ctx.fillText("宇宙偷偷話", W / 2, curY + 84);
  ctx.shadowBlur = 0;
  curY += 106;

  ctx.font = `400 30px ${ff}`;
  ctx.fillStyle = "rgba(255,247,230,0.76)";
  ctx.fillText("今晚宇宙給你的訊息...", W / 2, curY + 34);
  curY += 64;

  const CARD_W = 290;
  const CARD_H = 440;
  const cardCX = W / 2;
  const cardCY = curY + 64 + CARD_H / 2;

  ctx.save();
  ctx.shadowBlur = 64;
  ctx.shadowColor = "rgba(247,217,135,0.38)";
  ctx.fillStyle = "rgba(247,217,135,0.18)";
  canvasRoundRect(ctx, cardCX - CARD_W / 2 - 22, cardCY - CARD_H / 2 - 22, CARD_W + 44, CARD_H + 44, 44);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cardCX, cardCY);
  ctx.rotate((-3 * Math.PI) / 180);
  canvasRoundRect(ctx, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 30);
  ctx.clip();
  ctx.fillStyle = "#130b32";
  ctx.fillRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H);
  try {
    const cardImg = await loadImage(cardImageSrc);
    ctx.drawImage(cardImg, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H);
  } catch {
    ctx.fillStyle = "#f7d987";
    ctx.font = "80px serif";
    ctx.textAlign = "center";
    ctx.fillText("✦", 0, 28);
  }
  ctx.restore();

  ctx.save();
  ctx.translate(cardCX, cardCY);
  ctx.rotate((-3 * Math.PI) / 180);
  canvasRoundRect(ctx, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 30);
  ctx.strokeStyle = "rgba(247,217,135,0.82)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  curY = cardCY + CARD_H / 2 + 56;

  ctx.textAlign = "center";
  ctx.font = `700 72px ${ff}`;
  ctx.fillStyle = "#f7d987";
  ctx.shadowBlur = 16;
  ctx.shadowColor = "rgba(45,24,20,0.48)";
  ctx.fillText(cardNameZh.slice(0, 12), W / 2, curY + 72);
  ctx.shadowBlur = 0;
  curY += 88;

  ctx.font = `600 30px ${ff}`;
  ctx.fillStyle = "rgba(255,247,230,0.80)";
  ctx.fillText(cardNameEn.slice(0, 36), W / 2, curY + 32);
  curY += 54;

  const BPAD_X = 64;
  const BPAD_Y = 46;
  const BOX_W = 920;
  const BOX_X = (W - BOX_W) / 2;
  const BOX_Y = curY + 54;

  const cleanResult = resultText
    .replace(/\*\*/g, "")
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96);

  ctx.font = `400 34px ${ff}`;
  const msgLines = wrapCanvasText(
    ctx,
    cleanResult || "宇宙正在整理這次抽牌的核心訊息。",
    BOX_W - BPAD_X * 2,
  );
  const lineH = 34 * 1.8;
  const badgeRowH = 52;
  const BOX_H = BPAD_Y * 2 + badgeRowH + 32 + msgLines.length * lineH;

  ctx.save();
  canvasRoundRect(ctx, BOX_X, BOX_Y, BOX_W, BOX_H, 52);
  ctx.clip();
  const boxGrad = ctx.createLinearGradient(BOX_X, BOX_Y, BOX_X + BOX_W * 0.5, BOX_Y + BOX_H);
  boxGrad.addColorStop(0, "rgba(255,247,230,0.95)");
  boxGrad.addColorStop(0.48, "rgba(248,232,216,0.91)");
  boxGrad.addColorStop(1, "rgba(246,219,226,0.87)");
  ctx.fillStyle = boxGrad;
  ctx.fillRect(BOX_X, BOX_Y, BOX_W, BOX_H);
  ctx.restore();

  ctx.save();
  ctx.shadowBlur = 80;
  ctx.shadowColor = "rgba(5,7,24,0.3)";
  canvasRoundRect(ctx, BOX_X, BOX_Y, BOX_W, BOX_H, 52);
  ctx.strokeStyle = "rgba(202,168,95,0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  const badgeText = "抽牌結果";
  ctx.font = `700 26px ${ff}`;
  const badgeTW = ctx.measureText(badgeText).width;
  const badgePX = 28;
  const badgeFW = badgeTW + badgePX * 2;
  const badgeBX = (W - badgeFW) / 2;
  const badgeBY = BOX_Y + BPAD_Y;

  ctx.save();
  ctx.shadowBlur = 24;
  ctx.shadowColor = "rgba(202,168,95,0.42)";
  canvasRoundRect(ctx, badgeBX, badgeBY, badgeFW, badgeRowH, 28);
  ctx.fillStyle = "#caa85f";
  ctx.fill();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.font = `700 26px ${ff}`;
  ctx.fillStyle = "white";
  ctx.fillText(badgeText, W / 2, badgeBY + 34);

  const sepY = badgeBY + badgeRowH / 2;
  ctx.strokeStyle = "rgba(189,148,75,0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(BOX_X + BPAD_X, sepY);
  ctx.lineTo(badgeBX - 18, sepY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(badgeBX + badgeFW + 18, sepY);
  ctx.lineTo(BOX_X + BOX_W - BPAD_X, sepY);
  ctx.stroke();

  ctx.font = `400 34px ${ff}`;
  ctx.fillStyle = "#241937";
  ctx.textAlign = "center";
  const msgStartY = badgeBY + badgeRowH + 32;
  for (let i = 0; i < msgLines.length; i++) {
    ctx.fillText(msgLines[i], W / 2, msgStartY + i * lineH + 34);
  }

  ctx.font = `400 24px ${ff}`;
  ctx.fillStyle = "rgba(255,247,230,0.42)";
  ctx.textAlign = "center";
  ctx.fillText(siteUrl, W / 2, H - 72);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas image generation failed."));
      },
      "image/png",
    );
  });
}

// ?????????????????????????????????????????????????????????????????????????????
// Main component
// ?????????????????????????????????????????????????????????????????????????????

// ── 共用複製按鈕元件 ──────────────────────────────────────────────────────────

function CopyCodeButton({
  text,
  label,
  copiedLabel,
  feedbackText,
  className,
}: {
  text: string;
  label: string;
  copiedLabel?: string;
  feedbackText?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  function doCopy() {
    if (!text) return;
    const finish = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    };
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(finish).catch(fallback);
    } else {
      fallback();
    }
    function fallback() {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        finish();
      } catch { /* 靜默失敗 */ }
    }
  }

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={doCopy}
        className={className ?? `inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition active:scale-95 ${
          copied
            ? "border-aurora/40 text-aurora/80"
            : "border-[#d8bd70]/35 text-[#d8bd70]/80 hover:border-[#d8bd70]/60 hover:text-[#d8bd70]"
        }`}
      >
        {copied ? <>✓ {copiedLabel ?? "已複製"}</> : <>{label}</>}
      </button>
      {copied && feedbackText ? (
        <span className="text-xs text-aurora/70">{feedbackText}</span>
      ) : null}
    </span>
  );
}

// ── LINE 驗證碼 UI 元件（純展示，不含任何 LINE API 邏輯）────────────────────

type LineClaimStatus = "idle" | "loading" | "ready" | "checking" | "claimed" | "error";

function LineClaimSection({
  status,
  claimCode,
  lookupCode,
  error,
  onOpen,
  onCheck,
  onReset,
}: {
  status: LineClaimStatus;
  claimCode: string;
  lookupCode: string;
  error: string;
  onOpen: () => void;
  onCheck: () => void;
  onReset: () => void;
}) {
  // oaMessage URL：幫使用者開啟聊天室並預填驗證碼（@ 已 encode 成 %40）
  const oaMessageUrl = claimCode
    ? LINE_OA_MESSAGE_BASE + encodeURIComponent(claimCode)
    : LINE_ADD_FRIEND_URL;

  // ── 已成功兌換 ─────────────────────────────────────────────────────────────
  if (status === "claimed") {
    return (
      <p className="mt-2 flex items-center gap-2 text-sm text-aurora/80">
        <span>✅</span> 已成功傳送到 LINE！
      </p>
    );
  }

  // ── 錯誤 ───────────────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div className="mt-2 space-y-2">
        <p className="text-sm text-[#ffb4b4]">{error}</p>
        <button
          type="button"
          onClick={onReset}
          className="text-sm text-moon/50 underline underline-offset-2 transition hover:text-moon/80"
        >
          重新申請驗證碼
        </button>
      </div>
    );
  }

  // ── 已產生驗證碼（ready / checking）────────────────────────────────────────
  if (status === "ready" || status === "checking") {
    return (
      <div className="mt-2 space-y-3">
        <p className="text-sm leading-7 text-moon/55">
          請加入官方帳號 @{LINE_OA_ID}，並將下方驗證碼傳到聊天室，系統會自動回覆本次結果。
        </p>

        {/* 驗證碼卡片 */}
        <div className="rounded-2xl border border-[#d8bd70]/30 bg-midnight/70 px-5 py-4 text-center">
          <p className="text-xs tracking-[0.22em] text-moon/45 mb-2">驗證碼（1 小時有效）</p>
          <p className="text-3xl font-bold tracking-[0.28em] text-[#d8bd70] select-all">
            {claimCode}
          </p>
          <p className="mt-1 text-xs text-moon/35">開啟 LINE 後，請按送出。</p>
          <div className="mt-3 flex justify-center">
            <CopyCodeButton
              text={claimCode}
              label="⎘ 複製驗證碼"
              copiedLabel={`已複製（@${LINE_OA_ID}）`}
              feedbackText={`已複製驗證碼，請貼到 @${LINE_OA_ID} 聊天室。`}
            />
          </div>
        </div>

        {/* 主要按鈕：開啟 LINE 預填驗證碼 */}
        <a
          href={oaMessageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(6,199,85,0.28)] transition hover:opacity-90 active:scale-95 sm:w-auto sm:min-w-[240px]"
          style={{ background: "#06C755" }}
        >
          開啟 LINE 並送出驗證碼
        </a>
        <p className="text-xs leading-6 text-moon/45">
          開啟 LINE 後，請按「送出」，系統才會回覆結果。
        </p>

        {/* Fallback：加好友連結 */}
        <p className="text-xs text-moon/38">
          無法開啟？
          <a
            href={LINE_ADD_FRIEND_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 underline underline-offset-2 hover:text-moon/60"
          >
            點此加入 @{LINE_OA_ID}
          </a>
        </p>

        {/* 永久結果查詢碼 */}
        {lookupCode ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <p className="text-xs tracking-[0.18em] text-moon/40 mb-1">結果查詢碼（永久有效）</p>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-semibold text-moon/70 select-all">{lookupCode}</span>
              <CopyCodeButton
                text={lookupCode}
                label="複製"
                copiedLabel="已複製"
                feedbackText={`可傳到 @${LINE_OA_ID} 或到 /tarot/lookup 查詢`}
                className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-xs text-moon/50 transition hover:border-white/30 hover:text-moon/70 active:scale-95"
              />
            </div>
            <p className="mt-1 text-xs text-moon/35">
              請截圖或複製，之後可在網站或傳到 @{LINE_OA_ID} 查詢本次結果。
            </p>
          </div>
        ) : null}

        {/* 確認狀態按鈕 */}
        <button
          type="button"
          onClick={onCheck}
          disabled={status === "checking"}
          className="text-sm text-moon/50 underline underline-offset-2 transition hover:text-moon/80 disabled:cursor-wait disabled:opacity-60"
        >
          {status === "checking" ? "確認中..." : "我已傳送驗證碼，重新檢查狀態"}
        </button>
        {status === "checking" ? null : (
          <p className="text-xs text-moon/35">
            若仍 pending，請確認你已傳到 @{LINE_OA_ID}，且已在 LINE 聊天室按送出。
          </p>
        )}
      </div>
    );
  }

  // ── idle / loading：尚未產生驗證碼 ─────────────────────────────────────────
  return (
    <div className="mt-2 space-y-2">
      <p className="text-sm leading-7 text-moon/55">
        請加入官方帳號 @{LINE_OA_ID}，並將驗證碼傳到聊天室，系統會自動回覆本次結果。
      </p>
      <button
        type="button"
        onClick={onOpen}
        disabled={status === "loading"}
        className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(6,199,85,0.28)] transition hover:opacity-90 active:scale-95 disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:min-w-[220px]"
        style={{ background: "#06C755" }}
      >
        {status === "loading" ? "正在產生驗證碼..." : "加入 LINE 並領取結果"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function TarotDrawClient() {
  const { isAdmin, getIdToken } = useAuth();
  const [mode, setMode] = useState<(typeof modes)[number]["key"]>("single_tarot");
  const [topic, setTopic] = useState<TarotTopicOption>("愛情");
  const [question, setQuestion] = useState("");
  const [selectedSpreadQuestion, setSelectedSpreadQuestion] = useState("");
  const [cards, setCards] = useState<TarotCardFaceData[]>([]);
  const [pendingCards, setPendingCards] = useState<TarotCardFaceData[]>([]);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const [status, setStatus] = useState<DrawStatus>("idle");
  const [readingStatus, setReadingStatus] = useState<ReadingStatus>("idle");
  const [fullReading, setFullReading] = useState("");
  const [error, setError] = useState("");
  // FB share unlock state
  const [fbShareUnlocked, setFbShareUnlocked] = useState(false);
  const [fbShareUnlockUsedToday, setFbShareUnlockUsedToday] = useState(false);
  const [fbSharePending, setFbSharePending] = useState(false);
  // Paid unlock state
  const [paidUnlocked, setPaidUnlocked] = useState(false);
  const [paidDrawMode, setPaidDrawMode] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "processing" | "success">("idle");
  // LINE delivery state (preserved — kept for openLineConnect compatibility)
  const [lineDeliveryStatus, setLineDeliveryStatus] = useState<
    "idle" | "creating" | "done" | "error"
  >("idle");
  const [lineDeliveryMessage, setLineDeliveryMessage] = useState("");
  const [lineResultId, setLineResultId] = useState("");
  const [lineResultLookupCode, setLineResultLookupCode] = useState("");
  // LINE claim-code flow state
  const [lineClaimStatus, setLineClaimStatus] = useState<
    "idle" | "loading" | "ready" | "checking" | "claimed" | "error"
  >("idle");
  const [lineClaimCode, setLineClaimCode] = useState("");
  const [lineClaimError, setLineClaimError] = useState("");
  // Misc state
  const [drawsRemaining, setDrawsRemaining] = useState<number | null>(null);
  const [storyDownloadStatus, setStoryDownloadStatus] = useState<
    "idle" | "working" | "done" | "error"
  >("idle");
  const [storyError, setStoryError] = useState("");
  // 最近一次付費結果（從 localStorage 載入；付費完成後存入）
  const [lastPaidResult, setLastPaidResult] = useState<LastPaidResult | null>(null);
  const [isRestoredResult, setIsRestoredResult] = useState(false);

  const paymentTimerRef = useRef<number | null>(null);
  const storyCardRef = useRef<HTMLDivElement | null>(null);
  const readingSectionRef = useRef<HTMLElement | null>(null);
  const savedPaidResultKeyRef = useRef("");
  const [restoredToastVisible, setRestoredToastVisible] = useState(false);

  const cardCount = mode === "three_card" ? 3 : 1;
  const visibleBacks = useMemo(() => Array.from({ length: cardCount }), [cardCount]);
  const canShowReadings = status === "revealed" && cards.length > 0;
  const hasFullAccess = isAdmin || fbShareUnlocked || paidUnlocked;
  const isOutOfFreeDraws = !isAdmin && drawsRemaining === 0;
  const shouldShowPaidPlan = isOutOfFreeDraws && fbShareUnlockUsedToday && !hasFullAccess;
  const currentSpreadGroup = spreadQuestionGroups[topic];
  const freeSummary = useMemo(() => buildFreeSummary(cards, fullReading), [cards, fullReading]);
  const isSingleResult = mode === "single_tarot" && cards.length === 1;
  const storyCard = isSingleResult ? cards[0] : undefined;
  const storyCopy = useMemo(
    () => buildStoryCopy(storyCard, fullReading, freeSummary, topic),
    [storyCard, fullReading, freeSummary],
  );
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://universe-whisper.vercel.app";

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (paymentTimerRef.current) clearTimeout(paymentTimerRef.current);
    };
  }, []);

  // Sync admin / FB unlock state
  useEffect(() => {
    setFbShareUnlocked((cur) => cur || isAdmin);
    setFbShareUnlockUsedToday(hasUsedFbShareUnlockToday());
  }, [isAdmin]);

  // Fetch remaining quota + server-side FB unlock status on mount
  useEffect(() => {
    const anonId = getOrCreateAnonId();
    void (async () => {
      try {
        const token = await getIdToken();
        const headers: Record<string, string> = {};
        if (token) headers["x-firebase-id-token"] = token;
        const r = await fetch(
          "/api/tarot/usage?anonymousId=" + encodeURIComponent(anonId),
          { headers },
        );
        const data = (await r.json().catch(() => ({}))) as {
          remaining?: number;
          fbShareUnlockUsed?: boolean;
        };
        if (typeof data.remaining === "number") setDrawsRemaining(data.remaining);
        if (data.fbShareUnlockUsed) {
          // Mark that today's quota is used (affects UI hint), but do NOT auto-unlock
          // the current draw; user must explicitly confirm the share to unlock.
          setFbShareUnlockUsedToday(true);
        }
      } catch {
        /* fail open */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getIdToken]);

  // ??? Reset ????????????????????????????????????????????????????????????????

  // 載入最近一次付費結果（mount 時）
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PAID_RESULT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as LastPaidResult;
      if (parsed.cards?.length && parsed.fullReading) {
        setLastPaidResult(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  // 付費完成且解讀完成後，自動儲存至 localStorage
  useEffect(() => {
    if (!paidUnlocked || readingStatus !== "done" || !fullReading || !cards.length) return;
    const resultKey = cards.map((c) => (c.id ?? c.name ?? "")).join(",");
    if (savedPaidResultKeyRef.current === resultKey) return;
    savedPaidResultKeyRef.current = resultKey;
    const refId = `UW-${Date.now().toString(36).toUpperCase()}`;
    const result: LastPaidResult = {
      question, mode, topic, cards, fullReading,
      createdAt: Date.now(),
      refId,
    };
    try {
      window.localStorage.setItem(PAID_RESULT_STORAGE_KEY, JSON.stringify(result));
      setLastPaidResult(result);
    } catch { /* localStorage 滿了或私密模式，靜默跳過 */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidUnlocked, readingStatus, fullReading, cards]);

  // 付費解鎖後自動建立 Firestore 結果記錄，取得永久「結果查詢碼」
  useEffect(() => {
    if (paidUnlocked && readingStatus === "done" && !lineResultId) {
      void createOrGetLineResult().catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidUnlocked, readingStatus, lineResultId]);

  function resetReading() {
    if (paymentTimerRef.current) clearTimeout(paymentTimerRef.current);
    paymentTimerRef.current = null;
    setReadingStatus("idle");
    setFullReading("");
    setError("");
    setPendingCards([]);
    setSelectedCardIndex(null);
    setFbShareUnlocked(isAdmin); // Each new draw starts locked; only isAdmin auto-unlocks
    setFbShareUnlockUsedToday(hasUsedFbShareUnlockToday());
    setFbSharePending(false);
    setPaidUnlocked(false);
    setPaidDrawMode(false);
    setPaymentModalOpen(false);
    setPaymentStatus("idle");
    setLineDeliveryStatus("idle");
    setLineDeliveryMessage("");
    setLineResultId("");
    setLineResultLookupCode("");
    setLineClaimStatus("idle");
    setLineClaimCode("");
    setLineClaimError("");
    setStoryDownloadStatus("idle");
    setStoryError("");
  }

  // ??? API helpers ??????????????????????????????????????????????????????????

  function buildReadingPayload(targetCards: TarotCardFaceData[]) {
    const meaningTopic = toMeaningTopic(topic);
    return {
      cards: targetCards.map((card) => ({
        name: card.name,
        nameEn: card.nameEn,
        nameZh: card.nameZh ?? card.name,
        suit: card.suit,
        position: card.orientation,
        spreadPosition: toSpreadPosition(card.position),
        keywords:
          card.orientation === "reversed"
            ? (card.reversedKeywords ?? card.keywords)
            : (card.uprightKeywords ?? card.keywords),
        baseMeaning:
          card.orientation === "reversed" ? card.reversedMeaning : card.uprightMeaning,
        topicMeaning: card.meanings?.[meaningTopic]?.[card.orientation],
        meaning: card.cosmicMessage,
      })),
      topic: toReadingTopic(topic),
      readingMode: "premium",
      question: question.trim() || undefined,
      anonymousId: getOrCreateAnonId(),
      paidMode: paidDrawMode || paidUnlocked || isAdmin,
    };
  }

  /**
   * Build a stable cache key for a given draw so we can skip the AI call
   * when the user repeats the same question + cards + mode + topic.
   */
  function buildReadingCacheKey(targetCards: TarotCardFaceData[]): string {
    const cardPart = targetCards
      .map((c) => `${c.id}|${c.orientation ?? ""}`)
      .join(",");
    return [
      "cosmic-reading-v1",
      mode,
      toReadingTopic(topic),
      question.trim(),
      cardPart,
    ].join("::");
  }

  async function requestFullReading(targetCards: TarotCardFaceData[]) {
    // ── Session cache: skip AI if same draw was already done this session ─────
    const cacheKey = buildReadingCacheKey(targetCards);
    try {
      const cached = window.sessionStorage.getItem(cacheKey);
      if (cached) {
        console.log("[perf] C0: sessionStorage cache HIT — skipping AI call");
        setFullReading(cached);
        setReadingStatus("done");
        return; // ← no network request needed
      }
    } catch {
      /* sessionStorage unavailable (private mode, etc.) — proceed normally */
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── PERF-C: AI reading API ────────────────────────────────────────────────
    console.time("[perf] C3: tarot-reading API (total)");
    setReadingStatus("loading");
    setFullReading("");

    const token = await getIdToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["x-firebase-id-token"] = token;

    console.time("[perf] C3a: fetch /api/tarot-reading (network+AI)");
    const response = await fetch("/api/tarot-reading", {
      method: "POST",
      headers,
      body: JSON.stringify(buildReadingPayload(targetCards)),
    });
    console.timeEnd("[perf] C3a: fetch /api/tarot-reading (network+AI)");

    const data = (await response.json().catch(() => ({}))) as {
      reading?: string;
      error?: string;
    };
    console.log("[tarot-reading] result", data);

    if (response.status === 429) {
      console.timeEnd("[perf] C3: tarot-reading API (total)");
      throw new Error(data.error || "解讀暫時無法產生，請稍後再試。");
    }
    if (!response.ok) {
      console.timeEnd("[perf] C3: tarot-reading API (total)");
      throw new Error(data.error || "解讀暫時失敗，請稍後再試。");
    }

    const reading = data.reading?.trim() || READING_FALLBACK_TEXT;
    setFullReading(reading);
    setReadingStatus("done");

    // ── Store in session cache so re-draw of the same cards is instant ────────
    try {
      window.sessionStorage.setItem(cacheKey, reading);
    } catch {
      /* sessionStorage full — silently skip caching */
    }

    console.timeEnd("[perf] C3: tarot-reading API (total)");
    // ── End PERF-C ────────────────────────────────────────────────────────────
  }

  // Creates (or returns cached) a Firestore result record for LINE/FB sharing
  async function createOrGetLineResult(): Promise<string> {
    if (lineResultId) return lineResultId;

    const response = await fetch("/api/results/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "tarot",
        question,
        cards,
        // Only send full reading when user has unlocked; otherwise send free summary with unlock hint
        shortText: hasFullAccess
          ? freeSummary.message
          : freeSummary.message + "\n\n完整解讀請回網站分享 Facebook 解鎖。",
        fullText: hasFullAccess ? fullReading : "",
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      resultId?: string;
      lookupCode?: string;
      error?: string;
    };

    if (!response.ok || !data.ok || !data.resultId) {
      throw new Error(data.error || "結果暫時無法建立。");
    }

    setLineResultId(data.resultId);
    if (data.lookupCode) setLineResultLookupCode(data.lookupCode);
    return data.resultId;
  }

  // ??? Draw flow ????????????????????????????????????????????????????????????

  async function draw(options: { paid?: boolean } = {}) {
    if (status === "drawing" || readingStatus === "loading") return;
    const isPaidDraw = Boolean(options.paid);

    // ── PERF-A: full draw-to-result timeline ─────────────────────────────────
    console.time("[perf] A0: total draw-to-result");
    console.time("[perf] A1: draw API (/api/tarot/draw)");
    // ─────────────────────────────────────────────────────────────────────────

    setStatus("drawing");
    setCards([]);
    resetReading();
    if (isPaidDraw) {
      setPaidDrawMode(true);
      setPaidUnlocked(true);
    }

    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["x-firebase-id-token"] = token;

      const response = await fetch("/api/tarot/draw", {
        method: "POST",
        headers,
        body: JSON.stringify({
          mode,
          topic,
          question,
          anonymousId: getOrCreateAnonId(),
          paidMode: isPaidDraw,
        }),
      });
      console.timeEnd("[perf] A1: draw API (/api/tarot/draw)");

      const data = (await response.json().catch(() => ({}))) as {
        cards?: TarotCardFaceData[];
        error?: string;
        code?: string;
        message?: string;
      };

      if (response.status === 429 || data.code === "DAILY_LIMIT_REACHED") {
        setStatus("idle");
        setDrawsRemaining(0);
        setError(data.message || "今日免費抽牌已使用完畢。");
        console.timeEnd("[perf] A0: total draw-to-result");
        return;
      }

      if (!response.ok) {
        console.timeEnd("[perf] A0: total draw-to-result");
        throw new Error(data.error || "抽牌失敗，請稍後再試。");
      }

      if (!isAdmin && !isPaidDraw) {
        setDrawsRemaining((prev) => (typeof prev === "number" && prev > 0 ? prev - 1 : prev));
      }

      // ── PERF note: 1500 ms fixed animation delay before "selecting" shows ──
      console.log("[perf] A2: waiting 1500 ms shuffle animation…");
      window.setTimeout(() => {
        console.log("[perf] A2: shuffle done → selecting stage");
        setPendingCards(data.cards ?? []);
        setStatus("selecting");
      }, 1500);
    } catch (err) {
      console.timeEnd("[perf] A0: total draw-to-result");
      setStatus("idle");
      setError(
        err instanceof Error ? err.message : "解讀暫時失敗，請稍後再試。",
      );
    }
  }

  function handleDrawButtonClick() {
    if (isOutOfFreeDraws) {
      openPaidDrawModal();
      return;
    }
    void draw();
  }

  function revealCards(choiceIndex: number) {
    if (!pendingCards.length) return;

    // Capture the current pending cards synchronously before any state update
    const capturedCards = pendingCards;

    // ── PERF-B ────────────────────────────────────────────────────────────────
    console.time("[perf] B0: card-pick → reading displayed");
    console.time("[perf] B1: flip animation (running in parallel with AI)");

    setSelectedCardIndex(choiceIndex);
    setCards(capturedCards);
    setStatus("revealing");

    // ── 立即開始 AI 解讀，與翻牌動畫並行 ────────────────────────────────────
    // Previously called AFTER the 1500 ms setTimeout — now called immediately.
    // This saves ~1.5 s off the total wait for the reading to appear.
    // skipRitual() already guards against duplicate calls via readingStatus.
    void requestFullReading(capturedCards)
      .then(() => {
        console.timeEnd("[perf] B0: card-pick → reading displayed");
        console.timeEnd("[perf] A0: total draw-to-result");
      })
      .catch((err) => {
        console.timeEnd("[perf] B0: card-pick → reading displayed");
        console.timeEnd("[perf] A0: total draw-to-result");
        setReadingStatus("error");
        setError(
          err instanceof Error ? err.message : "解讀暫時失敗，請稍後再試。",
        );
      });

    // Flip animation: runs concurrently with the AI call above
    window.setTimeout(() => {
      console.timeEnd("[perf] B1: flip animation (running in parallel with AI)");
      console.log("[perf] B2: status=revealed — cards visible; reading may already be ready");
      setStatus("revealed");
    }, 1500);
  }

  function skipRitual() {
    const targetCards = pendingCards.length ? pendingCards : cards;
    if (targetCards.length) {
      setSelectedCardIndex(0);
      setCards(targetCards);
      setStatus("revealed");
      if (!fullReading && readingStatus !== "loading") {
        void requestFullReading(targetCards).catch((err) => {
          setReadingStatus("error");
          setError(
            err instanceof Error ? err.message : "解讀暫時失敗，請稍後再試。",
          );
        });
      }
      return;
    }
    setStatus("idle");
  }

  // ??? LINE flow ????????????????????????????????????????????????????????????

  function buildLineCardText() {
    return cards
      .map((card, index) => {
        const position = card.position ? card.position + "｜" : "";
        const orientation = card.orientationLabel ? "（" + card.orientationLabel + "）" : "";
        return String(index + 1) + ". " + position + (card.nameZh ?? card.name) + orientation;
      })
      .join("\n");
  }

  // ── LINE 訊息用的摘要提取工具 ────────────────────────────────────────────────

  function lineExtractSection(text: string, emoji: string): string {
    const pattern = new RegExp(`${emoji}[^\n]+\n+([\\s\\S]*?)(?=\n\n[🎯🌙🌟🃏🕯️🌌💫⚠️]|$)`);
    return text.match(pattern)?.[1]?.trim() ?? "";
  }

  function lineExtractOverallAnswer(text: string): string {
    const m = text.match(/整體答案[：:]\s*\n?([\s\S]*?)(?:\n\n為什麼|$)/);
    if (m?.[1]) return m[1].trim().slice(0, 130);
    return lineExtractSection(text, "🌟").slice(0, 130);
  }

  function lineExtractCardOneLiner(text: string, cardIndex: number): string {
    // 優先取「牌面重點」第一行（新格式）
    const mCore = text.match(new RegExp(`🃏 第${cardIndex + 1}張牌[\\s\\S]*?牌面重點[：:]\\s*\\n?([^\n]+)`));
    if (mCore?.[1]) {
      const raw = mCore[1].trim();
      if (!/（(?:正位|逆位)）/.test(raw)) return raw.slice(0, 55);
    }
    // 再試 shortSummary
    const mSummary = text.match(new RegExp(`🃏 第${cardIndex + 1}張牌[\\s\\S]*?摘要：([^\n]+)`));
    if (mSummary?.[1]) return mSummary[1].trim().slice(0, 55);
    return "";
  }

  function lineExtractAction(text: string): string {
    // 取「接下來的方向」或「3-7 天行動建議」第一行
    const mDir = text.match(/接下來的方向[：:]\s*\n?([\s\S]*?)(?:\n\n🃏|🕯|$)/);
    if (mDir?.[1]) return mDir[1].trim().slice(0, 80);
    const mAct = text.match(/🕯️[^\n]+\n+([\s\S]*?)(?:\n\n🌌|$)/);
    if (!mAct?.[1]) return "";
    const first = mAct[1].trim().split(/\n\n/)[0] ?? "";
    return first.split("\n")[0]?.trim().slice(0, 80) ?? "";
  }

  function lineExtractBlessing(text: string): string {
    const m = text.match(/💫 一句專屬祝福\s*\n+([\s\S]*?)(?:\n\n|$)/);
    return m?.[1]?.trim().slice(0, 50) ?? "";
  }

  // ── buildLineMessage：緊湊格式（三張牌≤750字，單張牌≤500字）─────────────────

  function buildLineMessage(): string {
    const questionText = question.trim() || "你把問題放在心裡，宇宙也有聽見。";
    const cardList = buildLineCardText() || "本次牌面已為你收好。";
    const resultSiteUrl = siteUrl;

    // 未解鎖：只傳簡短提示
    if (!hasFullAccess) {
      return [
        "宇宙偷偷話｜塔羅訊息", "",
        `你的問題：\n${questionText}`, "",
        `你抽到的牌：\n${cardList}`, "",
        `宇宙提示：\n${freeSummary.message.slice(0, 100)}`, "",
        `完整解讀請回網站分享 Facebook 解鎖。\n${resultSiteUrl}`,
      ].join("\n");
    }

    // 已解鎖 — 三張牌緊湊版
    if (mode === "three_card" && fullReading) {
      const overallAnswer = lineExtractOverallAnswer(fullReading);
      const cardLines = cards.map((card, i) => {
        const pos  = card.position ?? `第${i + 1}張`;
        const name = card.nameZh ?? card.name ?? "";
        const ori  = card.orientationLabel ? `（${card.orientationLabel}）` : "";
        const tip  = lineExtractCardOneLiner(fullReading, i) || "這張牌的提示在完整解讀裡。";
        return `${pos}｜${name}${ori}：\n${tip}`;
      });
      const action  = lineExtractAction(fullReading);
      const blessing = lineExtractBlessing(fullReading);

      const parts: string[] = [
        "🌙 宇宙偷偷話｜塔羅訊息", "",
        `你的問題：\n${questionText}`, "",
        `你抽到的牌：\n${cardList}`,
      ];
      if (overallAnswer) parts.push("", `✨ 整體答案\n${overallAnswer}`);
      if (cardLines.length > 0) parts.push("", `🃏 三張牌提醒你\n${cardLines.join("\n\n")}`);
      if (action) parts.push("", `🕯️ 接下來 3～7 天\n${action}`);
      if (blessing) parts.push("", `💫 給你的祝福\n${blessing}`);
      parts.push("", `🔮 完整解讀請回網站查看：\n${resultSiteUrl}`);

      return parts.join("\n");
    }

    // 已解鎖 — 單張牌緊湊版
    if (mode === "single_tarot" && fullReading) {
      const cosmic   = lineExtractSection(fullReading, "🌙").slice(0, 100);
      const action   = fullReading.match(/🐾[^\n]+\n+([\s\S]*?)(?:\n\n[🌌💫]|$)/)?.[1]?.trim().slice(0, 120) ?? "";
      const blessing = lineExtractBlessing(fullReading);

      const parts: string[] = [
        "🌙 宇宙偷偷話｜塔羅訊息", "",
        `你的問題：\n${questionText}`, "",
        `你抽到的牌：\n${cardList}`,
      ];
      if (cosmic) parts.push("", `✨ 宇宙說\n${cosmic}`);
      if (action) parts.push("", `🐾 今天可以\n${action}`);
      if (blessing) parts.push("", `💫 給你的祝福\n${blessing}`);
      parts.push("", `🔮 完整解讀請回網站查看：\n${resultSiteUrl}`);

      return parts.join("\n");
    }

    // fallback
    return [
      "宇宙偷偷話｜塔羅訊息", "",
      `你的問題：\n${questionText}`, "",
      `你抽到的牌：\n${cardList}`, "",
      freeSummary.message.slice(0, 150),
      "", `完整解讀：${resultSiteUrl}`,
    ].join("\n");
  }

  // Redirect to /line/connect; that page logs in with LINE and pushes this draw text.
  async function openLineConnect() {
    if (lineDeliveryStatus === "creating") return;
    setLineDeliveryStatus("creating");
    setLineDeliveryMessage("");

    const message = buildLineMessage();
    const linePayload = JSON.stringify({ message, createdAt: Date.now() });

    // 1. Save locally — fast path for same-browser redirects (desktop, Android Chrome)
    try { sessionStorage.setItem(LINE_CONNECT_MESSAGE_KEY, linePayload); } catch { /* ignore */ }
    try { localStorage.setItem(LINE_CONNECT_MESSAGE_KEY, linePayload); } catch { /* ignore */ }

    // 2. Save server-side — required for iOS cross-browser redirects
    //    (Chrome → LINE app → Safari callback: localStorage is in a different browser)
    let pendingId = "";
    try {
      const r = await fetch("/api/line/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (r.ok) {
        const data = (await r.json()) as { pendingId?: string };
        pendingId = typeof data.pendingId === "string" ? data.pendingId : "";
      }
    } catch {
      // Non-fatal: localStorage will be the fallback on desktop / Android
      console.warn("[line-connect] pendingId creation failed; using local-only fallback");
    }

    // Navigate to /line/connect; include pendingId so it survives cross-app OAuth
    const connectUrl = pendingId
      ? `/line/connect?pendingId=${encodeURIComponent(pendingId)}`
      : "/line/connect";
    window.location.href = connectUrl;
  }

  // ??? FB Share Unlock flow ?????????????????????????????????????????????????

  // ── LINE claim-code flow（新流程；openLineConnect 保持完全不動）────────────

  async function openLineClaimFlow() {
    if (lineClaimStatus === "loading") return;
    setLineClaimStatus("loading");
    setLineClaimError("");
    try {
      const resultId = await createOrGetLineResult();
      const r = await fetch("/api/line/claim/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultId, visitorId: getOrCreateAnonId() }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        claimCode?: string;
        error?: string;
      };
      if (!r.ok || !data.ok || !data.claimCode) {
        throw new Error(data.error || "無法產生驗證碼，請稍後再試。");
      }
      setLineClaimCode(data.claimCode);
      setLineClaimStatus("ready");
    } catch (err) {
      setLineClaimError(err instanceof Error ? err.message : "無法產生驗證碼，請稍後再試。");
      setLineClaimStatus("error");
    }
  }

  async function checkLineClaimStatus() {
    if (!lineClaimCode || lineClaimStatus === "checking") return;
    setLineClaimStatus("checking");
    try {
      const r = await fetch(
        `/api/line/claim/status?claimCode=${encodeURIComponent(lineClaimCode)}`,
      );
      const data = (await r.json().catch(() => ({}))) as { ok?: boolean; status?: string };
      if (data.status === "claimed") {
        setLineClaimStatus("claimed");
      } else if (data.status === "expired" || data.status === "not_found") {
        setLineClaimError("驗證碼已過期，請點擊「重新申請」取得新的驗證碼。");
        setLineClaimStatus("error");
      } else {
        setLineClaimStatus("ready");
      }
    } catch {
      setLineClaimStatus("ready");
    }
  }

  async function openFbShare() {
    // Build a result-specific share URL (with OG meta) when possible
    let shareUrl = siteUrl;
    try {
      const resultId = await createOrGetLineResult();
      shareUrl = siteUrl + "/share/" + resultId;
    } catch {
      // fallback to homepage
    }
    window.open(
      "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(shareUrl),
      "_blank",
      "noopener,noreferrer",
    );
    setFbSharePending(true);
  }

  async function confirmFbShareUnlock() {
    const anonId = getOrCreateAnonId();
    try {
      await fetch("/api/tarot/mark-fb-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonymousId: anonId }),
      });
    } catch (err) {
      // Network error ??still unlock (fail open)
      console.error("[fb-unlock] API call failed:", err);
    }
    // Fail open: always unlock locally regardless of server response
    markFbShareUnlockLocalStorage();
    setFbShareUnlocked(true);
    setFbShareUnlockUsedToday(true);
    setFbSharePending(false);
  }

  // ??? Paid flow ????????????????????????????????????????????????????????????

  function openPaidDrawModal() {
    setPaymentStatus("idle");
    setPaymentModalOpen(true);
  }

  function simulatePayment() {
    if (paymentStatus === "processing") return;
    setPaymentStatus("processing");
    paymentTimerRef.current = window.setTimeout(() => {
      setPaymentStatus("success");
      setPaymentModalOpen(false);
      setPaidUnlocked(true);
      void draw({ paid: true });
    }, 1000);
  }

  /** 恢復上次付費結果（從 localStorage 重新載入） */
  function restoreLastPaidResult() {
    if (!lastPaidResult) return;
    setQuestion(lastPaidResult.question);
    setCards(lastPaidResult.cards);
    setFullReading(lastPaidResult.fullReading);
    setPaidUnlocked(true);
    setPaidDrawMode(true);
    setStatus("revealed");
    setReadingStatus("done");
    setIsRestoredResult(true);
    setError("");
    setFbSharePending(false);
    // Scroll to reading section after state settles
    window.setTimeout(() => {
      if (readingSectionRef.current) {
        readingSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      setRestoredToastVisible(true);
      window.setTimeout(() => setRestoredToastVisible(false), 3000);
    }, 80);
  }

  // ??? Story download ???????????????????????????????????????????????????????

  async function downloadStoryImage() {
    if (storyDownloadStatus === "working") return;
    setStoryError("");
    try {
      setStoryDownloadStatus("working");
      const blob = await generateStoryImage(
        storyCard?.nameZh ?? storyCard?.name ?? "",
        storyCard?.nameEn ?? storyCard?.name ?? "",
        storyCard?.image ?? "",
        storyCopy.resultText,
        siteUrl,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "universe-whisper-story.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setStoryDownloadStatus("done");
      window.setTimeout(() => setStoryDownloadStatus("idle"), 3500);
    } catch (err) {
      console.error("[share-story] Canvas image generation failed", err);
      setStoryError(err instanceof Error ? err.message : String(err));
      setStoryDownloadStatus("error");
    }
  }

  // ??? Mode / topic helpers ?????????????????????????????????????????????????

  function handleModeChange(nextMode: (typeof modes)[number]["key"]) {
    setMode(nextMode);
    setStatus("idle");
    setCards([]);
    if (nextMode === "single_tarot") {
      setQuestion((cur) => (cur === selectedSpreadQuestion ? "" : cur));
      setSelectedSpreadQuestion("");
    }
    resetReading();
  }

  function selectSpreadQuestion(spreadQuestion: string) {
    setSelectedSpreadQuestion(spreadQuestion);
    setMode("three_card");
    setQuestion(spreadQuestion);
    setStatus("idle");
    setCards([]);
    resetReading();
  }

  // ?????????????????????????????????????????????????????????????????????????
  // Render
  // ?????????????????????????????????????????????????????????????????????????

  return (
    <div className="cosmic-tool-panel relative mt-8 overflow-hidden rounded-[1.75rem] p-4 sm:p-7">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <span className="floating-star left-[7%] top-[8%]" />
        <span className="floating-star left-[88%] top-[20%] animation-delay-150" />
        <span className="floating-star left-[74%] top-[82%] animation-delay-300" />
      </div>

      {/* ✨ Operation guide ✨ */}
      <div className="relative z-10 mb-6 rounded-2xl border border-white/8 bg-midnight/30 px-4 py-4">
        <p className="mb-3 text-xs tracking-[0.2em] text-moon/45 uppercase">怎麼使用</p>
        <ol className="space-y-2.5">
          <li className="flex gap-3 text-sm text-moon/70">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-lavender/40 text-xs text-lavender">1</span>
            <span><span className="font-medium text-moon/90">選擇抽牌方式</span>　單張牌接收一句宇宙提醒；三張牌從過去、現在、未來看完整流動。</span>
          </li>
          <li className="flex gap-3 text-sm text-moon/70">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-lavender/40 text-xs text-lavender">2</span>
            <span><span className="font-medium text-moon/90">選擇想問的方向</span>　愛情、工作或生活，宇宙會依照你選的方向解讀。</span>
          </li>
          <li className="flex gap-3 text-sm text-moon/70">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-lavender/40 text-xs text-lavender">3</span>
            <span><span className="font-medium text-moon/90">輸入你的問題</span>　把想問的事寫下來，越具體，解讀越貼近你。</span>
          </li>
        </ol>
      </div>

      {/* ?? Mode selector ?? */}
      <div className="relative z-10 grid gap-3 sm:grid-cols-2">
        {modes.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => handleModeChange(item.key)}
            className={`rounded-3xl border p-4 text-left transition ${
              mode === item.key
                ? "border-moon bg-moon text-midnight"
                : "border-white/12 bg-midnight/45 text-moon hover:bg-white/10"
            }`}
          >
            <span className="block text-lg font-semibold">{item.label}</span>
            <span
              className={`mt-1 block text-sm ${mode === item.key ? "text-midnight/70" : "text-moon/58"}`}
            >
              {item.description}
            </span>
          </button>
        ))}
      </div>

      {/* ?? Topic selector ?? */}
      <div className="relative z-10 mt-5 grid grid-cols-3 gap-2">
        {topics.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setTopic(item);
              setSelectedSpreadQuestion("");
              setQuestion("");
              setStatus("idle");
              setCards([]);
              resetReading();
            }}
            className={`min-h-11 rounded-full border px-3 text-sm transition ${
              topic === item
                ? "border-lavender bg-lavender text-midnight"
                : "border-white/12 bg-white/8 text-moon/76 hover:bg-white/12"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {/* ?? Three-card spread questions ?? */}
      {mode === "three_card" ? (
        <div className="relative z-10 mt-6 rounded-3xl border border-lavender/18 bg-midnight/38 p-4">
          <p className="text-sm tracking-[0.22em] text-lavender/70">
            {currentSpreadGroup.title}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {currentSpreadGroup.questions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => selectSpreadQuestion(item)}
                className={`rounded-2xl border px-4 py-3 text-left text-base leading-6 transition ${
                  selectedSpreadQuestion === item
                    ? "border-moon bg-moon text-midnight"
                    : "border-white/12 bg-white/8 text-moon/78 hover:bg-white/12"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* ✨ Single-card example questions ✨ */}
      {mode === "single_tarot" ? (
        <div className="relative z-10 mt-6 rounded-3xl border border-lavender/18 bg-midnight/38 p-4">
          <p className="text-sm tracking-[0.22em] text-lavender/70">範例問題</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {singleCardQuestions[topic].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setQuestion(item)}
                className={`rounded-2xl border px-3 py-2 text-left text-sm leading-6 transition ${
                  question === item
                    ? "border-moon bg-moon text-midnight"
                    : "border-white/12 bg-white/8 text-moon/78 hover:bg-white/12"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* ?? Question input ?? */}
      <div className="relative z-10 mt-6">
        <p className="text-base font-medium text-moon">把想問的事交給宇宙</p>
        <p className="mt-1 text-sm text-moon/52">
          {isAdmin
            ? "管理員模式：不限抽牌次數"
            : drawsRemaining === null
              ? "今天可免費抽牌 1 次，也可分享 Facebook 解鎖完整解讀。"
              : drawsRemaining === 0
                ? "今日免費抽牌已使用完畢，可使用 NT$49 再抽一次完整解讀。"
                : "今日剩餘免費抽牌：" + drawsRemaining + " 次"}
        </p>
      </div>
      <textarea
        id="question"
        value={question}
        onChange={(event) => {
          setQuestion(event.target.value);
          setSelectedSpreadQuestion("");
        }}
        className="relative z-10 mt-3 min-h-32 w-full resize-none rounded-3xl border border-white/12 bg-midnight/58 p-4 text-base leading-7 text-moon outline-none transition placeholder:text-moon/40 focus:border-lavender"
        placeholder={textareaPlaceholders[topic]}
      />

      {/* ?? Draw button ?? */}
      <button
        type="button"
        onClick={handleDrawButtonClick}
        disabled={
          status === "drawing" ||
          status === "selecting" ||
          status === "revealing" ||
          readingStatus === "loading"
        }
        className="relative z-10 mt-5 w-full rounded-full bg-moon px-6 py-3 font-medium text-midnight shadow-[0_0_24px_rgba(247,241,223,0.28)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {status === "drawing"
          ? "星光正在流動..."
          : isOutOfFreeDraws
            ? "NT$49 再抽一次"
            : "開始抽牌"}
      </button>

      {/* ?? Error notice ?? */}
      {/* 恢復上次付費結果（僅在 idle 且 localStorage 有資料時顯示） */}
      {status === "idle" && lastPaidResult && !isRestoredResult ? (
        <div className="relative z-10 mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={restoreLastPaidResult}
            className="rounded-full border border-moon/22 bg-white/5 px-4 py-2 text-xs text-moon/60 transition hover:bg-white/10 hover:text-moon/85"
          >
            ↩ 恢復上次結果
          </button>
          <span className="text-xs text-moon/38">
            {new Date(lastPaidResult.createdAt).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      ) : null}

      {/* Toast：恢復成功提示 */}
      {restoredToastVisible ? (
        <div className="relative z-10 mt-3 flex items-center gap-2 rounded-2xl border border-aurora/30 bg-aurora/10 px-4 py-2.5 text-sm text-aurora/90 reading-fade-in">
          <span>✓</span>
          <span>已恢復上次抽牌結果</span>
        </div>
      ) : null}

      {error ? (
        <div className="relative z-10 mt-4 rounded-2xl border border-lavender/30 bg-nebula/20 p-4 text-sm text-moon">
          <p>{error}</p>
          {!isAdmin && drawsRemaining === 0 ? (
            <p className="mt-2 text-moon/72">
              今日免費抽牌已使用完畢，可使用 NT$49 再抽一次完整解讀。
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ?? Ritual animation ?? */}
      {status === "drawing" ||
      status === "selecting" ||
      status === "revealing" ? (
        <TarotShuffleAnimation
          stage={status}
          cardCount={cardCount}
          selectedIndex={selectedCardIndex}
          revealedCards={cards}
          topic={topic}
          onSelect={revealCards}
          onSkip={skipRitual}
        />
      ) : null}

      {/* Card display */}
      {status === "idle" || status === "revealed" ? (
        <>
          {/* Single-card: original layout unchanged */}
          {isSingleResult ? (
            <div className="relative z-10 mt-8 grid grid-cols-1 items-start gap-8 md:grid-cols-2 xl:grid-cols-3">
              {status === "revealed" && cards.length
                ? cards.map((card, index) => (
                    <article
                      key={`${card.id}-${index}`}
                      className="reading-fade-in tarot-card-shell mx-auto w-full max-w-[420px]"
                    >
                      {card.position ? (
                        <p className="mb-3 rounded-full border border-moon/20 bg-midnight/54 px-4 py-2 text-center text-base font-medium text-moon shadow-glow">
                          第 {index + 1} 張｜{card.position}
                        </p>
                      ) : null}
                      <TarotCardFace card={card} topic={topic} />
                    </article>
                  ))
                : visibleBacks.map((_, index) => (
                    <div key={`back-${index}`} className="tarot-card-shell mx-auto w-full max-w-[420px]">
                      <TarotCardBack />
                    </div>
                  ))}
            </div>
          ) : (
            /* Three-card: compact cards, horizontal scroll on mobile, 3-col on desktop */
            <div className="relative z-10 mt-8">
              <p className="mb-2 text-center text-xs text-moon/38 sm:hidden">← 左右滑動查看三張牌 →</p>
              <div className="flex gap-3 overflow-x-auto scroll-smooth pb-3 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:pb-0">
                {status === "revealed" && cards.length
                  ? cards.map((card, index) => (
                      <article
                        key={`${card.id}-${index}`}
                        className="reading-fade-in min-w-[72vw] flex-shrink-0 sm:min-w-0"
                      >
                        <TarotCardFaceCompact card={card} topic={topic} cardIndex={index} />
                      </article>
                    ))
                  : visibleBacks.map((_, index) => (
                      <div key={`back-${index}`} className="min-w-[72vw] flex-shrink-0 sm:min-w-0">
                        <TarotCardBack compact />
                      </div>
                    ))}
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* ????????????????????????????????????????????????????????????????????
          Reading area ??only shown after cards are revealed
          ???????????????????????????????????????????????????????????????????? */}
      {canShowReadings ? (
        <section ref={readingSectionRef} className="relative z-10 mt-9 space-y-5">

          {/* ?? 1. Single-card story image (always shown for download/share) ?? */}
          {isSingleResult && storyCard ? (
            <div className="cosmic-reading-card mx-auto max-w-[460px] rounded-[2rem] border border-[#d8bd70]/24 bg-midnight/58 p-4 text-center shadow-glow sm:p-6">
              <ShareStoryCard
                ref={storyCardRef}
                cardNameZh={storyCard.nameZh ?? storyCard.name}
                cardNameEn={storyCard.nameEn ?? storyCard.name}
                cardImageUrl={storyCard.image}
                resultText={storyCopy.resultText}
                adviceText={storyCopy.adviceText}
                siteUrl={siteUrl}
              />
              <div className="mt-5 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={downloadStoryImage}
                  disabled={storyDownloadStatus === "working"}
                  className="rounded-full border border-[#d8bd70]/35 bg-[#d8bd70] px-5 py-3 text-sm font-semibold text-midnight shadow-[0_0_24px_rgba(216,189,112,0.24)] transition hover:bg-moon active:scale-95 disabled:cursor-wait disabled:opacity-70"
                >
                  {storyDownloadStatus === "working" ? "正在產生圖片..." : "下載限動圖片"}
                </button>
                {storyDownloadStatus === "done" ? (
                  <p className="text-sm text-moon/72">圖片已下載，可以分享限動。</p>
                ) : null}
                {storyDownloadStatus === "error" ? (
                  <p className="text-sm text-[#ffb4b4]">
                    {storyError || "圖片產生失敗，請稍後再試。"}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* 2a. Three-card locked: 每張牌名 + 短解 + freeSummary — NO fullReading content */}
          {!isSingleResult && !hasFullAccess ? (
            <div className="cosmic-reading-card rounded-[1.75rem] border border-lavender/20 bg-midnight/58 p-5 shadow-glow sm:p-6">
              <p className="text-sm tracking-[0.22em] text-lavender/70">宇宙先給你的提示</p>
              <h3 className="mt-2 text-2xl font-semibold text-moon">你這次抽到的三張牌</h3>

              {/* 每張牌：位置 + 牌名 + 正逆位 + 短解（45~80字） */}
              <ul className="mt-4 space-y-3">
                {cards.map((card, idx) => {
                  // 短解：取 cosmicMessage 前 75 字，或 keywords 組合
                  const shortMsg = card.cosmicMessage
                    ? (card.cosmicMessage.length > 78 ? `${card.cosmicMessage.slice(0, 75)}…` : card.cosmicMessage)
                    : (card.keywords?.slice(0, 3).join("、") || "");
                  return (
                    <li
                      key={card.id}
                      className="rounded-2xl border border-white/8 bg-white/[0.04] p-4"
                    >
                      {/* 牌 header */}
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 rounded-full border border-[#d8bd70]/35 bg-midnight/60 px-2.5 py-0.5 text-xs font-medium text-[#d8bd70]">
                          {card.position ?? `第 ${idx + 1} 張`}
                        </span>
                        <span className="font-semibold text-moon">{card.name}</span>
                        <span
                          className={`ml-auto shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${
                            card.orientation === "upright"
                              ? "border-aurora/40 text-aurora"
                              : "border-lavender/44 text-lavender"
                          }`}
                        >
                          {card.orientationLabel}
                        </span>
                      </div>
                      {/* 短解 */}
                      {shortMsg ? (
                        <p className="mt-2 text-sm leading-[1.75] text-moon/72">{shortMsg}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              {/* 免費版總結 80~120 字 — 只讀 cosmicMessage，不洩漏 AI fullReading */}
              <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                {readingStatus === "loading" ? (
                  <p className="text-sm text-moon/50">宇宙正在把牌義整理成你的訊息...</p>
                ) : (
                  <>
                    <p className="text-xs tracking-[0.18em] text-lavender/60 mb-2">宇宙給你的提示</p>
                    <p className="text-base leading-[1.85] text-moon/84">{freeSummary.message}</p>
                  </>
                )}
              </div>

              <p className="mt-4 text-sm leading-7 text-moon/55">
                完整解讀將帶你看見三張牌真正指向的原因、你目前最該避開的風險，以及接下來 3～7 天的具體建議。
              </p>
            </div>
          ) : null}

          {/* 2b. Single-card locked: show freeSummary only — no fullReading leaked */}
          {isSingleResult && !hasFullAccess ? (
            <div className="cosmic-reading-card rounded-[1.75rem] border border-lavender/20 bg-midnight/58 p-5 shadow-glow sm:p-6">
              <p className="text-sm tracking-[0.22em] text-lavender/70">宇宙先給你的提示</p>
              <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                {readingStatus === "loading" ? (
                  <p className="text-base leading-8 text-moon/76">宇宙正在把牌義整理成你的訊息...</p>
                ) : (
                  <>
                    <p className="text-base leading-8 text-moon/84">{freeSummary.message}</p>
                    <p className="mt-3 rounded-xl border border-moon/12 bg-moon/6 px-3 py-2 text-sm leading-7 text-moon/70">
                      {freeSummary.reminder}
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : null}

          {/* 3. Unlock CTA — shown when NOT fully unlocked, mode-aware copy */}
          {!hasFullAccess ? (
            <div className="cosmic-reading-card rounded-[1.75rem] border border-[#d8bd70]/24 bg-midnight/58 p-5 shadow-glow sm:p-6">

              {/* 標題 */}
              <p className="text-sm tracking-[0.22em] text-[#d8bd70]/78">解鎖完整解讀</p>
              <h3 className="mt-2 text-2xl font-semibold text-moon">
                {isSingleResult ? "解鎖完整解讀" : "解鎖完整牌陣解讀"}
              </h3>

              {/* 完整解讀包含內容條列 */}
              <p className="mt-4 text-sm font-semibold text-moon/80">完整解讀將包含：</p>
              <ul className="mt-2 space-y-2">
                {(isSingleResult
                  ? [
                      "這張牌真正指向的核心訊息",
                      "你目前最該避開的風險",
                      "是否適合立刻行動",
                      "接下來 3～7 天的具體建議",
                      "宇宙給你的收束祝福",
                    ]
                  : [
                      "這三張牌真正指向的原因",
                      "你目前最該避開的風險",
                      "是否適合立刻行動",
                      "接下來 3～7 天的具體建議",
                      "宇宙給你的收束祝福",
                    ]
                ).map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm leading-[1.8] text-moon/72">
                    <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-[#d8bd70]/55" />
                    {item}
                  </li>
                ))}
              </ul>

              {/* 每日免費一次說明 */}
              <p className="mt-5 rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm leading-7 text-moon/60">
                每日可免費查看一次基礎內容；若想查看完整解讀，可分享 Facebook 免費解鎖，或直接付費 NT$49 解鎖。
              </p>

              {/* 主要按鈕：FB 分享免費解鎖 */}
              <div className="mt-5">
                {fbSharePending ? (
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm text-moon/72">
                      完成 Facebook 分享後，請回到這裡確認解鎖。
                    </p>
                    <button
                      type="button"
                      onClick={() => void confirmFbShareUnlock()}
                      className="w-full rounded-full bg-[#d8bd70] px-6 py-4 text-base font-semibold text-midnight shadow-[0_0_28px_rgba(216,189,112,0.28)] transition hover:bg-moon active:scale-95 sm:w-auto sm:min-w-[280px]"
                    >
                      我已分享到 Facebook，解鎖完整版
                    </button>
                    <button
                      type="button"
                      onClick={() => void openFbShare()}
                      className="text-sm text-moon/50 underline underline-offset-2 transition hover:text-moon/80"
                    >
                      重新開啟 Facebook 分享
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void openFbShare()}
                    className="w-full rounded-full bg-[#d8bd70] px-6 py-4 text-base font-semibold text-midnight shadow-[0_0_28px_rgba(216,189,112,0.28)] transition hover:bg-moon active:scale-95 sm:w-auto sm:min-w-[280px]"
                  >
                    分享 Facebook 免費解鎖
                  </button>
                )}
              </div>

              {/* 次要按鈕：NT$49 直接付費解鎖（不需分享，始終顯示） */}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={openPaidDrawModal}
                  className="w-full rounded-full border border-[#d8bd70]/40 px-6 py-3 text-sm font-semibold text-[#d8bd70] transition hover:border-[#d8bd70]/70 hover:bg-white/6 active:scale-95 sm:w-auto sm:min-w-[280px]"
                >
                  🔓 NT$49 解鎖完整宇宙訊息
                </button>
                <p className="mt-2 text-xs leading-6 text-moon/40">
                  本服務為即時產生之數位內容，付款完成並成功產出、顯示或發送結果後，恕不接受退費。若付款成功但未收到內容，請於 24 小時內聯繫
                  <a href="mailto:ciut0000@gmail.com" className="underline underline-offset-2 hover:text-moon/60">客服信箱</a>。
                </p>
              </div>

              {/* LINE 驗證碼領取區 */}
              <div className="mt-5 border-t border-white/10 pt-5">
                <p className="mb-1 text-sm font-semibold text-moon/70">將本次結果傳送到 LINE</p>
                <LineClaimSection
                  status={lineClaimStatus}
                  claimCode={lineClaimCode}
                  lookupCode={lineResultLookupCode}
                  error={lineClaimError}
                  onOpen={() => void openLineClaimFlow()}
                  onCheck={() => void checkLineClaimStatus()}
                  onReset={() => { setLineClaimStatus("idle"); setLineClaimError(""); setLineClaimCode(""); }}
                />
              </div>
            </div>
          ) : (
            /* 4. Full reading (when unlocked) */
            <div className="cosmic-reading-card rounded-[1.75rem] border border-lavender/20 bg-midnight/58 p-5 shadow-glow sm:p-6">
              <p className="text-sm tracking-[0.22em] text-lavender/70">完整解讀</p>
              <h3 className="mt-2 text-2xl font-semibold text-moon">完整宇宙訊息</h3>
              {/* 三張牌版專屬副標題 */}
              {!isSingleResult && (
                <p className="mt-1.5 text-sm leading-6 text-moon/50">
                  三張牌會從背景、現在狀態與接下來的方向，替你整理出更完整的訊息。
                </p>
              )}
              <div className="mt-5">
                {/* Loading 預覽：僅在 AI 還沒回來（fullReading 為空）時才顯示 */}
                {readingStatus === "loading" && !fullReading ? (
                  <div className="mb-5">
                    <p className="mb-2 text-xs tracking-[0.18em] text-lavender/58">
                      完整版整理中…
                    </p>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                      <p className="text-base leading-8 text-moon/68">
                        {freeSummary.message || "宇宙正在整理這次抽牌的核心訊息。"}
                      </p>
                    </div>
                  </div>
                ) : null}
                {/* 三張牌用專屬元件，單張牌用通用元件 */}
                {!isSingleResult
                  ? <ThreeCardReadingDisplay text={fullReading} cards={cards} />
                  : <ReadingSectionList text={fullReading} />
                }
              </div>
              {/* LINE 驗證碼領取區（完整解讀已解鎖版） */}
              <div className="mt-6 border-t border-white/10 pt-5">
                <p className="mb-1 text-sm font-semibold text-moon/70">將本次結果傳送到 LINE</p>
                <LineClaimSection
                  status={lineClaimStatus}
                  claimCode={lineClaimCode}
                  lookupCode={lineResultLookupCode}
                  error={lineClaimError}
                  onOpen={() => void openLineClaimFlow()}
                  onCheck={() => void checkLineClaimStatus()}
                  onReset={() => { setLineClaimStatus("idle"); setLineClaimError(""); setLineClaimCode(""); }}
                />
              </div>

              {/* 客服提示 + 結果查詢碼：付費後顯示 */}
              {paidUnlocked ? (
                <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-2">
                  <p className="text-xs leading-6 text-moon/48">
                    若付款成功但內容未正常顯示，請截圖此頁並聯繫客服：
                    <a href="mailto:ciut0000@gmail.com" className="underline underline-offset-2 hover:text-moon/70">
                      ciut0000@gmail.com
                    </a>
                  </p>
                  {/* 付款參考碼（僅供客服對帳） */}
                  {lastPaidResult?.refId ? (
                    <p className="text-xs text-moon/32">付款參考碼：{lastPaidResult.refId}</p>
                  ) : null}
                  {/* 結果查詢碼（已儲存至 Firestore，可查詢） */}
                  {lineResultLookupCode ? (
                    <div className="pt-1">
                      <p className="text-xs tracking-[0.18em] text-moon/40 mb-1">結果查詢碼</p>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-semibold text-moon/72 select-all">
                          {lineResultLookupCode}
                        </span>
                        <CopyCodeButton
                          text={lineResultLookupCode}
                          label="複製查詢碼"
                          copiedLabel="已複製"
                          feedbackText={`已複製查詢碼，可回網站或傳到 @${LINE_OA_ID} 查詢結果。`}
                          className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-xs text-moon/50 transition hover:border-white/30 hover:text-moon/70 active:scale-95"
                        />
                      </div>
                      <p className="mt-1 text-xs text-moon/32">
                        請截圖或複製，之後可在網站或傳到 @{LINE_OA_ID} 查詢本次結果。
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

        </section>
      ) : null}

      {/* ?? Payment modal ?? */}
      {paymentModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
          <div className="cosmic-reading-card w-full max-w-md rounded-[1.75rem] border border-[#06C755]/24 bg-midnight p-6 text-center shadow-glow">
            <p className="text-sm tracking-[0.22em] text-[#06C755]/78">Fake Payment Mode</p>
            <h3 className="mt-3 text-2xl font-semibold text-moon">再抽一次完整訊息</h3>
            <p className="mt-3 text-base leading-7 text-moon/72">
              模擬付款成功後，會重新進入抽牌流程，並直接顯示完整內容。
            </p>
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/6 p-4">
              <p className="text-sm text-moon/58">完整抽牌費用</p>
              <p className="mt-1 text-3xl font-semibold text-moon">NT$ 49</p>
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="rounded-full border border-moon/25 px-5 py-3 text-sm font-semibold text-moon transition hover:bg-white/10"
              >
                先不要
              </button>
              <button
                type="button"
                onClick={simulatePayment}
                disabled={paymentStatus === "processing"}
                className="flex-1 rounded-full bg-[#06C755] px-5 py-3 text-sm font-semibold text-white shadow-[0_0_28px_rgba(6,199,85,0.32)] transition hover:opacity-90 disabled:opacity-60"
              >
                {paymentStatus === "processing"
                  ? "付款確認中..."
                  : paymentStatus === "success"
                    ? "付款成功"
                    : "NT$49 再抽一次"}
              </button>
            </div>
            {/* 退款說明小字 */}
            <p className="mt-4 text-xs leading-6 text-moon/42 text-center px-2">
              本服務為即時產生之數位內容，付款成功並成功顯示結果後恕不退費。
              若付款成功但未收到內容，請於 24 小時內聯繫
              <a href="mailto:ciut0000@gmail.com" className="underline underline-offset-2 hover:text-moon/70">客服信箱</a>
              ，確認後協助補發或退款。
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
