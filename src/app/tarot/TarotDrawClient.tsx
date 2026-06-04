"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ShareStoryCard } from "@/components/ShareStoryCard";
import { TarotCardBack, TarotCardFace, TarotCardFaceCompact, type TarotCardFaceData } from "@/components/TarotCardFace";
import { TarotShuffleAnimation } from "./TarotShuffleAnimation";
import { useAuth } from "@/contexts/AuthContext";
import RedeemCodeBlock from "@/components/RedeemCodeBlock";

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
/** LINE App deep link — 手機有安裝 LINE 時直接跳 App */
const LINE_DEEP_LINK = "line://ti/p/@453gfmok";
/** Web fallback — 桌機或未安裝 LINE 時顯示加好友頁（不跳 QR Code 首頁） */
const LINE_OFFICIAL_ACCOUNT_URL = "https://line.me/R/ti/p/%40453gfmok";
/** @deprecated 用 LINE_OFFICIAL_ACCOUNT_URL */
const LINE_ADD_FRIEND_URL = LINE_OFFICIAL_ACCOUNT_URL;

const PASS_PLANS = [
  { key: "single", label: "宇宙通行碼 單次", price: 49, desc: "原價體驗，可解鎖 1 次" },
  { key: "five",   label: "宇宙通行碼 五次", price: 220, desc: "小資優惠，平均 44 元，約九折，可解鎖 5 次" },
  { key: "ten",    label: "宇宙通行碼 十次", price: 350, desc: "限時最划算，平均 35 元，約七折，可解鎖 10 次" },
] as const;

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


// ── 三張牌限動分享圖（9:16，1080x1920）─────────────────────────────────────────

async function generateThreeCardStoryImage(
  questionText: string,
  spreadCards: TarotCardFaceData[],
  _cardInsights: string[],
  overallAnswer: string,
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
  const GOLD  = "#d8bd70";
  const MOON  = "rgba(255,247,230,0.95)";
  const DIM   = "rgba(255,247,230,0.65)";
  const FAINT = "rgba(255,247,230,0.36)";

  // ── 背景 ──────────────────────────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0,    "#05071d");
  bgGrad.addColorStop(0.45, "#0d0b2a");
  bgGrad.addColorStop(1,    "#1a0e2e");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);
  try {
    const bgImg = await loadImage("/reference/story-bg.png");
    ctx.globalAlpha = 0.7;
    ctx.drawImage(bgImg, 0, 0, W, H);
    ctx.globalAlpha = 1;
  } catch { /* gradient fallback */ }

  // ── 星星裝飾 ──────────────────────────────────────────────────────────────
  const starDefs = [
    { x: 88,      y: 88,      sz: 22, a: 0.55 },
    { x: W - 108, y: 118,     sz: 18, a: 0.40 },
    { x: 84,      y: H - 210, sz: 20, a: 0.45 },
    { x: W - 96,  y: H - 240, sz: 16, a: 0.38 },
  ];
  for (const s of starDefs) {
    ctx.font = s.sz + "px serif";
    ctx.fillStyle = "rgba(216,189,112," + s.a + ")";
    ctx.textAlign = "left";
    ctx.fillText("✦", s.x, s.y + s.sz);
  }

  const hLine = (y: number, alpha = 0.20) => {
    ctx.strokeStyle = "rgba(216,189,112," + alpha + ")";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(72, y);
    ctx.lineTo(W - 72, y);
    ctx.stroke();
  };

  // ── 品牌標題 ──────────────────────────────────────────────────────────────
  ctx.textAlign = "center";
  ctx.font = "600 28px " + ff;
  ctx.fillStyle = "rgba(216,189,112,0.78)";
  ctx.fillText("UNIVERSE WHISPER", W / 2, 108);

  ctx.font = "700 62px " + ff;
  ctx.fillStyle = GOLD;
  ctx.shadowBlur = 24;
  ctx.shadowColor = "rgba(216,189,112,0.36)";
  ctx.fillText("我抽到的宇宙訊息", W / 2, 178);
  ctx.shadowBlur = 0;

  hLine(214);

  // ── 問題區（精簡單行）────────────────────────────────────────────────────
  ctx.font = "400 24px " + ff;
  ctx.fillStyle = "rgba(216,189,112,0.65)";
  ctx.fillText("我的問題", W / 2, 250);

  const qRaw  = questionText.length > 28 ? questionText.slice(0, 26) + "…" : questionText;
  const qText = "「" + qRaw + "」";
  ctx.font = "400 30px " + ff;
  ctx.fillStyle = DIM;
  ctx.fillText(qText, W / 2, 292);

  hLine(318, 0.14);

  // ── 預先載入三張牌圖片 ───────────────────────────────────────────────────
  const cardImgs = await Promise.all(
    spreadCards.slice(0, 3).map((c) =>
      loadImage(c.image).catch(() => null)
    )
  );

  // ── 三張牌主視覺 ──────────────────────────────────────────────────────────
  // 側牌 222×333，中牌 254×381（比例 2:3，中間較大較高）
  const SIDE_W = 222, SIDE_H = 333;
  const CTR_W  = 254, CTR_H  = 381;
  const CARD_GAP = 18;
  const TOTAL_CARD_W = SIDE_W + CARD_GAP + CTR_W + CARD_GAP + SIDE_W; // 734
  const CARD_LEFT = Math.round((W - TOTAL_CARD_W) / 2);                // 173

  const cardLayouts = [
    { x: CARD_LEFT,                                       y: 345, w: SIDE_W, h: SIDE_H },
    { x: CARD_LEFT + SIDE_W + CARD_GAP,                   y: 324, w: CTR_W,  h: CTR_H  },
    { x: CARD_LEFT + SIDE_W + CARD_GAP + CTR_W + CARD_GAP, y: 345, w: SIDE_W, h: SIDE_H },
  ];
  const DEFAULT_POS = ["過去", "現在", "未來"];

  for (let i = 0; i < 3; i++) {
    const { x, y, w, h } = cardLayouts[i];
    const card = spreadCards[i];
    const img  = cardImgs[i];

    // 金色光暈
    ctx.save();
    ctx.shadowBlur = 44;
    ctx.shadowColor = "rgba(216,189,112,0.42)";
    ctx.fillStyle   = "rgba(216,189,112,0.12)";
    canvasRoundRect(ctx, x - 12, y - 12, w + 24, h + 24, 28);
    ctx.fill();
    ctx.restore();

    // 牌面（裁切圓角）
    ctx.save();
    canvasRoundRect(ctx, x, y, w, h, 18);
    ctx.clip();
    ctx.fillStyle = "#130b32";
    ctx.fillRect(x, y, w, h);
    if (img) {
      ctx.drawImage(img, x, y, w, h);
    } else {
      ctx.font = "72px serif";
      ctx.fillStyle = "rgba(216,189,112,0.5)";
      ctx.textAlign = "center";
      ctx.fillText("✦", x + w / 2, y + h / 2 + 24);
    }
    ctx.restore();

    // 金色細框
    ctx.save();
    ctx.strokeStyle = "rgba(216,189,112,0.48)";
    ctx.lineWidth = 2;
    canvasRoundRect(ctx, x, y, w, h, 18);
    ctx.stroke();
    ctx.restore();
  }

  // ── 牌名標籤（三欄）─────────────────────────────────────────────────────
  const colCX = [
    cardLayouts[0].x + SIDE_W / 2,
    cardLayouts[1].x + CTR_W  / 2,
    cardLayouts[2].x + SIDE_W / 2,
  ];
  const LABEL_TOP = 345 + SIDE_H + 20; // ~698

  for (let i = 0; i < 3; i++) {
    const card = spreadCards[i];
    const pos  = card.position  ?? DEFAULT_POS[i] ?? "";
    const name = card.nameZh   ?? card.name       ?? "";
    const ori  = card.orientationLabel            ?? "";
    const cx   = colCX[i];

    ctx.textAlign = "center";

    ctx.font      = "600 22px " + ff;
    ctx.fillStyle = "rgba(216,189,112,0.75)";
    ctx.fillText(pos, cx, LABEL_TOP);

    ctx.font      = "700 28px " + ff;
    ctx.fillStyle = MOON;
    ctx.fillText(name, cx, LABEL_TOP + 36);

    ctx.font      = "400 21px " + ff;
    ctx.fillStyle = ori === "逆位"
      ? "rgba(255,176,96,0.80)"
      : "rgba(216,189,112,0.60)";
    ctx.fillText(ori, cx, LABEL_TOP + 66);
  }

  // ── 主金句卡片（霧面玻璃面板，擴展為 2～3 行）───────────────────────────
  const PANEL_X = 88;
  const PANEL_Y = 832;
  const PANEL_W = W - 176;
  const PANEL_H = 340;   // 擴大面板讓文字更完整
  const PANEL_R = 24;

  ctx.save();
  canvasRoundRect(ctx, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, PANEL_R);
  ctx.fillStyle = "rgba(5,7,29,0.76)";
  ctx.fill();
  ctx.strokeStyle = "rgba(216,189,112,0.30)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // ✦ 小裝飾
  ctx.textAlign = "center";
  ctx.font      = "20px serif";
  ctx.fillStyle = "rgba(216,189,112,0.55)";
  ctx.fillText("✦", W / 2, PANEL_Y + 34);

  // 從整體答案組出 2～3 行文字（不重新呼叫 AI，優先取前兩句）
  const rawAnswer = overallAnswer.replace(/\n+/g, " ").trim();
  const sentences = rawAnswer.match(/[^。！？]+[。！？]/g) ?? [];
  let quote: string;
  if (sentences.length >= 2) {
    const s0 = sentences[0]!.trim();
    const s1 = sentences[1]!.trim();
    const combined = s0 + s1;
    quote = combined.length <= 88 ? combined : s0;
  } else if (sentences.length === 1) {
    quote = sentences[0]!.trim();
  } else {
    quote = rawAnswer;
  }
  if (quote.length > 90) quote = quote.slice(0, 88) + "…";

  ctx.font      = "500 38px " + ff;   // 放大一級（34→38px）
  ctx.fillStyle = MOON;
  const quoteLines = wrapCanvasText(ctx, quote, PANEL_W - 96);
  const maxQ      = Math.min(quoteLines.length, 4);
  const LINE_H_Q  = 56;               // 行距一起調整（50→56px）
  const totalQH   = (maxQ - 1) * LINE_H_Q + 38;
  // 留出頂部裝飾空間，然後垂直置中
  const panelInnerTop = PANEL_Y + 52;
  const panelInnerH   = PANEL_H - 62;
  const quoteStartY   = panelInnerTop + Math.round((panelInnerH - totalQH) / 2) + 28;
  quoteLines.slice(0, 4).forEach((line, i) => {
    ctx.fillText(line, W / 2, quoteStartY + i * LINE_H_Q);
  });

  // ── 關鍵字 Chip ───────────────────────────────────────────────────────────
  const CHIPS_Y = PANEL_Y + PANEL_H + 38; // ~1210
  const chips = spreadCards.slice(0, 3).map((card) => {
    const kws = card.orientation === "upright"
      ? card.uprightKeywords
      : card.reversedKeywords;
    const kw = (kws?.[0] ?? card.keywords?.[0] ?? card.position ?? "宇宙") as string;
    return kw.length > 6 ? kw.slice(0, 6) : kw;
  });

  const CHIP_PAD_X = 30;
  const CHIP_H     = 50;
  const CHIP_R     = 25;
  const CHIP_GAP   = 20;
  ctx.font = "500 23px " + ff;
  const chipWidths = chips.map((c) => ctx.measureText(c).width + CHIP_PAD_X * 2);
  const totalChipW = chipWidths.reduce((a, b) => a + b, 0) + CHIP_GAP * (chips.length - 1);
  let chipX = Math.round((W - totalChipW) / 2);

  chips.forEach((chip, i) => {
    const cw = chipWidths[i];
    ctx.save();
    canvasRoundRect(ctx, chipX, CHIPS_Y, cw, CHIP_H, CHIP_R);
    ctx.fillStyle   = "rgba(216,189,112,0.11)";
    ctx.fill();
    ctx.strokeStyle = "rgba(216,189,112,0.44)";
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = "center";
    ctx.font      = "500 23px " + ff;
    ctx.fillStyle = GOLD;
    ctx.fillText(chip, chipX + cw / 2, CHIPS_Y + CHIP_H / 2 + 8);

    chipX += cw + CHIP_GAP;
  });

  // ── 心靈收束短句（標籤列下方，不重新呼叫 AI）────────────────────────────
  const CLOSING_LINES = [
    "先別急著逼自己決定，答案會在你慢下來之後更清楚。",
    "有些路不是不能走，而是要先學會不再勉強自己。",
    "當你願意停下來整理內心，下一步就會比現在更清晰。",
    "不是沒有答案，只是現在還不是最好的時間點。",
    "讓自己呼吸一下，宇宙的訊息會在你準備好時更清楚。",
  ];
  // 根據答案內容決定性地選一句（同樣答案永遠選同一句）
  const closingIdx  = rawAnswer.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % CLOSING_LINES.length;
  const closingLine = CLOSING_LINES[closingIdx]!;

  const CLOSING_Y = CHIPS_Y + CHIP_H + 44; // ~1304
  ctx.textAlign = "center";
  ctx.font      = "400 24px " + ff;
  ctx.fillStyle = "rgba(255,247,230,0.52)";
  ctx.fillText(closingLine, W / 2, CLOSING_Y);

  // ── CTA ───────────────────────────────────────────────────────────────────
  const CTA_Y = 1440;
  hLine(CTA_Y);

  ctx.textAlign = "center";
  ctx.font      = "700 46px " + ff;
  ctx.fillStyle = MOON;
  ctx.shadowBlur = 18;
  ctx.shadowColor = "rgba(216,189,112,0.28)";
  ctx.fillText("來抽你的三張牌 ✨", W / 2, CTA_Y + 78);
  ctx.shadowBlur = 0;

  ctx.font      = "600 28px " + ff;
  ctx.fillStyle = GOLD;
  ctx.fillText("Universe Whisper", W / 2, CTA_Y + 134);

  ctx.font      = "400 22px " + ff;
  ctx.fillStyle = FAINT;
  ctx.fillText(siteUrl.replace(/^https?:\/\//, ""), W / 2, CTA_Y + 180);

  // ── 小型 LINE QR（底部 CTA 右下角，靠近城堡，不壓主文）─────────────────
  const QR_SIZE   = 104;
  const QR_PAD    = 7;
  const QR_BOX    = QR_SIZE + QR_PAD * 2;
  const QR_X      = W - 64 - QR_BOX;      // 右對齊
  const QR_Y      = CTA_Y + 36;           // 與 CTA 區並排，不壓到網址
  const QR_R      = 10;

  try {
    const { default: QRCode } = await import("qrcode");
    const qrDataUrl = await QRCode.toDataURL("https://lin.ee/ObZxFcx", {
      width: QR_SIZE,
      margin: 1,
      color: { dark: "#1a0e2e", light: "#fdf6e8" },
    });
    const qrImg = await loadImage(qrDataUrl);

    // 圓角奶白底座
    ctx.save();
    canvasRoundRect(ctx, QR_X, QR_Y, QR_BOX, QR_BOX, QR_R);
    ctx.fillStyle   = "#fdf6e8";
    ctx.fill();
    ctx.strokeStyle = "rgba(216,189,112,0.36)";
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.restore();

    // QR 圖片
    ctx.drawImage(qrImg, QR_X + QR_PAD, QR_Y + QR_PAD, QR_SIZE, QR_SIZE);

    // QR 下方小字
    ctx.textAlign = "center";
    const qrCX = QR_X + QR_BOX / 2;
    ctx.font      = "600 17px " + ff;
    ctx.fillStyle = "rgba(216,189,112,0.82)";
    ctx.fillText("加入官方 LINE", qrCX, QR_Y + QR_BOX + 22);

    ctx.font      = "400 14px " + ff;
    ctx.fillStyle = "rgba(255,247,230,0.40)";
    ctx.fillText("領取你的宇宙訊息", qrCX, QR_Y + QR_BOX + 42);
  } catch {
    /* QR 產生失敗時靜默跳過 */
  }

  // 底部漸層
  const vg = ctx.createLinearGradient(0, H - 180, 0, H);
  vg.addColorStop(0, "rgba(5,7,29,0)");
  vg.addColorStop(1, "rgba(5,7,29,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, H - 180, W, 180);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Three-card story image generation failed."));
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
  error,
  onOpen,
  onCheck,
  onReset,
}: {
  status: LineClaimStatus;
  claimCode: string;
  error: string;
  onOpen: () => void;
  onCheck: () => void;
  onReset: () => void;
}) {
  // 複製驗證碼到剪貼簿，再用 line:// protocol 叫起 LINE App
  function copyAndOpenLine() {
    // 1. 複製驗證碼
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(claimCode).catch(() => fallbackCopy());
    } else {
      fallbackCopy();
    }

    function fallbackCopy() {
      try {
        const ta = document.createElement("textarea");
        ta.value = claimCode;
        ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch { /* 靜默失敗 */ }
    }

    // 2. 叫起 LINE App（line:// protocol，桌機和手機均支援已安裝 LINE 的情況）
    window.location.href = LINE_DEEP_LINK;
  }

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
          這是 LINE 結果驗證碼，用於將本次抽牌結果傳送至 LINE，1 小時有效。與宇宙通行碼（付費購買）無關。
        </p>

        {/* 驗證碼卡片 */}
        <div className="rounded-2xl border border-[#d8bd70]/30 bg-midnight/70 px-5 py-4 text-center">
          <p className="text-xs tracking-[0.22em] text-moon/45 mb-2">LINE 結果驗證碼（1 小時有效）</p>
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

        {/* 主要按鈕：複製驗證碼 + 開啟官方帳號 */}
        <button
          type="button"
          onClick={copyAndOpenLine}
          className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(6,199,85,0.28)] transition hover:opacity-90 active:scale-95 sm:w-auto sm:min-w-[240px]"
          style={{ background: "#06C755" }}
        >
          複製驗證碼並開啟 LINE
        </button>
        <p className="text-xs leading-6 text-moon/45">
          LINE 開啟後，請貼上驗證碼並送出，系統會自動回覆結果。
        </p>

        {/* Fallback：加好友連結 */}
        <p className="text-xs text-moon/38">
          無法開啟？
          <a
            href={LINE_OFFICIAL_ACCOUNT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 underline underline-offset-2 hover:text-moon/60"
          >
            點此加入 @{LINE_OA_ID}
          </a>
        </p>

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

// ── 三張牌限動圖 Portal Modal ────────────────────────────────────────────────

function ThreeCardStoryPortalModal({
  open,
  blobUrl,
  onClose,
  onDownload,
}: {
  open: boolean;
  blobUrl: string;
  onClose: () => void;
  onDownload: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  // SSR guard：只在 client mount 後才啟用 portal
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // body scroll lock + ESC close
  useEffect(() => {
    if (!open) {
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <>
      <style>{`
        @media (max-width: 640px) {
          .tcm-preview-img { max-height: 56dvh !important; }
        }
      `}</style>

      {/* Overlay — render 到 document.body，不受任何父層 stacking context 影響 */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100dvh",
          zIndex: 2147483647,
          background: "rgba(0,0,0,0.78)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          boxSizing: "border-box",
        }}
      >
        {/* Panel */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "relative",
            zIndex: 1,
            width: "min(92vw, 520px)",
            maxHeight: "92dvh",
            overflowY: "auto",
            borderRadius: "24px",
            border: "1px solid rgba(216,189,112,0.22)",
            background: "#0d0b2a",
            boxShadow: "0 0 60px rgba(0,0,0,0.65)",
            WebkitOverflowScrolling: "touch",
            boxSizing: "border-box",
          }}
        >
          {/* X 關閉 */}
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              zIndex: 10,
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.14)",
              background: "transparent",
              color: "rgba(255,247,230,0.55)",
              cursor: "pointer",
              fontSize: 14,
              padding: 0,
              lineHeight: 1,
            }}
          >
            ✕
          </button>

          {/* 標題 */}
          <p
            style={{
              textAlign: "center",
              fontSize: 13,
              letterSpacing: "0.22em",
              color: "rgba(216,189,112,0.78)",
              paddingTop: 20,
              paddingBottom: 0,
              margin: 0,
            }}
          >
            你的三張牌限動圖
          </p>

          {/* 預覽圖 */}
          <div
            style={{
              margin: "12px 20px 0",
              overflow: "hidden",
              borderRadius: 16,
              background: "rgba(13,11,42,0.6)",
            }}
          >
            {blobUrl ? (
              <img
                src={blobUrl}
                alt="三張牌限動分享圖"
                className="tcm-preview-img"
                style={{
                  display: "block",
                  width: "min(420px, 100%)",
                  maxHeight: "70vh",
                  objectFit: "contain",
                  borderRadius: 16,
                }}
              />
            ) : null}
          </div>

          {/* 操作區 */}
          <div
            style={{
              padding: "16px 20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={onDownload}
              style={{
                width: "100%",
                borderRadius: 9999,
                background: "#d8bd70",
                padding: "12px 0",
                fontSize: 14,
                fontWeight: 600,
                color: "#0d0b2a",
                border: "none",
                cursor: "pointer",
                boxShadow: "0 0 20px rgba(216,189,112,0.24)",
              }}
            >
              下載限動圖
            </button>
            <p
              style={{
                textAlign: "center",
                fontSize: 12,
                color: "rgba(255,247,230,0.38)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              下載後可分享到 IG / FB / Threads 限動。
            </p>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: "100%",
                borderRadius: 9999,
                border: "1px solid rgba(255,247,230,0.20)",
                background: "transparent",
                padding: "10px 0",
                fontSize: 14,
                color: "rgba(255,247,230,0.55)",
                cursor: "pointer",
              }}
            >
              關閉
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
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
  const [selectedPlan, setSelectedPlan] = useState<typeof PASS_PLANS[number] | null>(null);
  const [purchasedCode, setPurchasedCode] = useState<{
    code: string; displayName: string; totalUses: number; expiresAt: string; planName: string;
  } | null>(null);
  // 購買成功後 Email 寄送
  const [codeEmailInput, setCodeEmailInput] = useState("");
  const [codeEmailStatus, setCodeEmailStatus] = useState<"idle" | "sending" | "sent" | "error" | "not_configured">("idle");
  const [codeCopied, setCodeCopied] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  // 抽牌前通行碼輸入
  const [preDrawCode, setPreDrawCode] = useState("");
  const [preDrawCodeChecking, setPreDrawCodeChecking] = useState(false);
  const [preDrawCodeError, setPreDrawCodeError] = useState("");
  // 待扣次數的通行碼（在 draw 成功後扣）
  const [preDrawCodePending, setPreDrawCodePending] = useState("");
  const [codeDeductResult, setCodeDeductResult] = useState<{ remainingUses: number } | null>(null);
  const [codeDeductError, setCodeDeductError] = useState("");
  // LINE delivery state (preserved — kept for openLineConnect compatibility)
  const [lineDeliveryStatus, setLineDeliveryStatus] = useState<
    "idle" | "creating" | "done" | "error"
  >("idle");
  const [lineDeliveryMessage, setLineDeliveryMessage] = useState("");
  const [lineResultId, setLineResultId] = useState("");
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
  // 三張牌限動圖狀態
  const [threeCardStoryStatus, setThreeCardStoryStatus] = useState<
    "idle" | "working" | "done" | "error"
  >("idle");
  const [threeCardStoryError, setThreeCardStoryError] = useState("");
  const [threeCardStoryBlobUrl, setThreeCardStoryBlobUrl] = useState("");
  const [threeCardStoryModalOpen, setThreeCardStoryModalOpen] = useState(false);
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

  // ── 三張牌限動圖用：每張牌精簡提示（最多 36 字）─────────────────────────────
  const threeCardInsights = useMemo(() => {
    if (!fullReading || cards.length < 3) {
      return cards.slice(0, 3).map((c) => {
        const msg = c.cosmicMessage || "";
        const m = msg.match(/^[\s\S]*?[。！？]/);
        const s = (m ? m[0] : msg).trim().replace(/\n+/g, " ");
        return s.length > 36 ? s.slice(0, 34) + "…" : s;
      });
    }
    const s = parseThreeCardSections(fullReading);
    return [s.card1, s.card2, s.card3].map((section, idx) => {
      const sub = parseCardSubsections(section.body);
      const raw = (sub.core || sub.question || sub.rawContent || cards[idx]?.cosmicMessage || "")
        .replace(/\n+/g, " ").trim();
      const m = raw.match(/^[\s\S]*?[。！？]/);
      const sentence = (m ? m[0] : raw).trim();
      return sentence.length > 36 ? sentence.slice(0, 34) + "…" : sentence;
    });
  }, [cards, fullReading]);

  // ── 三張牌限動圖用：整體答案（最多 80 字）───────────────────────────────────
  const threeCardOverallAnswer = useMemo(() => {
    if (!fullReading || cards.length < 3) {
      const msg = freeSummary.message || "";
      return msg.length > 80 ? msg.slice(0, 78) + "…" : msg;
    }
    const s = parseThreeCardSections(fullReading);
    const parsed = parseOverallSummary(s.overallSummary);
    const raw = (parsed.verdict || parsed.raw || freeSummary.message || "")
      .replace(/\n+/g, " ").trim();
    return raw.length > 80 ? raw.slice(0, 78) + "…" : raw;
  }, [cards, fullReading, freeSummary]);

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
    const refId = `PAY-${Date.now().toString(36).toUpperCase()}`;
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

  // 當解讀完成但未解鎖時，預先建立 resultId，讓兌換碼區塊可用
  useEffect(() => {
    if (canShowReadings && !hasFullAccess && readingStatus === "done" && !lineResultId && fullReading) {
      void createOrGetLineResult().catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canShowReadings, hasFullAccess, readingStatus, lineResultId, fullReading]);

  // 抽牌成功後，扣除 preDrawCode 的 1 次（只有 AI 成功 + resultId 建立後才執行）
  useEffect(() => {
    if (
      canShowReadings &&
      readingStatus === "done" &&
      lineResultId &&
      preDrawCodePending
    ) {
      fetch("/api/redeem/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: preDrawCodePending, resultId: lineResultId }),
      })
        .then((r) => r.json() as Promise<{ ok: boolean; remainingUses?: number; errorCode?: string }>)
        .then((data) => {
          if (data.ok) {
            setCodeDeductResult({ remainingUses: data.remainingUses ?? 0 });
            setCodeDeductError("");
          } else {
            // 扣失敗（例如已重複扣過），顯示錯誤但不隱藏解讀
            const msg: Record<string, string> = {
              ALREADY_USED: "此通行碼已解鎖本次結果",
              USED_UP: "此通行碼次數已用完",
              EXPIRED: "此通行碼已過期",
              NOT_FOUND: "查無此通行碼",
            };
            setCodeDeductError(msg[data.errorCode ?? ""] ?? "通行碼扣次數失敗，請聯絡客服");
          }
          setPreDrawCodePending("");
        })
        .catch(() => { setCodeDeductError("網路錯誤，通行碼次數可能未扣除"); setPreDrawCodePending(""); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canShowReadings, readingStatus, lineResultId, preDrawCodePending]);


  // 付費解鎖後自動建立 Firestore 結果記錄（供 LINE claim code 使用）
  useEffect(() => {
    if (paidUnlocked && readingStatus === "done" && !lineResultId) {
      console.log("[lookupCode] Starting createOrGetLineResult...");
      void createOrGetLineResult()
        .then((id) => {
          console.log("[lookupCode] created result record, resultId:", id);
        })
        .catch((err: unknown) => {
          console.error("[lookupCode] Failed to create result:", err instanceof Error ? err.message : err);
        });
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
    setPurchasedCode(null);
    setCodeEmailInput("");
    setCodeEmailStatus("idle");
    setCodeCopied(false);
    setPreDrawCode("");
    setPreDrawCodeChecking(false);
    setPreDrawCodeError("");
    setPreDrawCodePending("");
    setCodeDeductResult(null);
    setCodeDeductError("");
    setLineDeliveryStatus("idle");
    setLineDeliveryMessage("");
    setLineResultId("");
    setLineClaimStatus("idle");
    setLineClaimCode("");
    setLineClaimError("");
    setStoryDownloadStatus("idle");
    setStoryError("");
    // 三張牌限動圖：清除 blob URL 並重置狀態
    setThreeCardStoryBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return ""; });
    setThreeCardStoryStatus("idle");
    setThreeCardStoryError("");
    setThreeCardStoryModalOpen(false);
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
        // 傳入含正/逆位 keywords 的卡片資料，供 LINE formatter 使用
        cards: cards.map((c) => ({
          ...c,
          keywords:
            c.orientation === "reversed"
              ? (c.reversedKeywords ?? c.keywords)
              : (c.uprightKeywords ?? c.keywords),
        })),
        // shortText：永遠只存摘要，供分享頁預覽用
        // fullText：永遠存完整 AI 解讀，供 LINE 建立精簡訊息用
        // unlocked：建立當時是否已解鎖，供分享頁決定是否展示完整版
        shortText: freeSummary.message,
        fullText: fullReading,
        unlocked: hasFullAccess,
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
    // 今日免費次數已用完（anonId 基準，已修正共用 IP 誤判問題）→ 直接開付費視窗
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
    // 清除快取 resultId，讓下次 createOrGetLineResult() 重新建立帶 unlocked:true 的結果
    setLineResultId("");
  }

  // ??? Paid flow ????????????????????????????????????????????????????????????

  function openPaidDrawModal() {
    setPaymentStatus("idle");
    setPaymentModalOpen(true);
  }

  /** 抽牌前驗證通行碼，通過後進入 paid draw；實際扣次數在 draw 成功後才做 */
  async function handlePreDrawCode() {
    const trimmed = preDrawCode.trim().toUpperCase();
    if (!trimmed) { setPreDrawCodeError("請輸入宇宙通行碼"); return; }
    setPreDrawCodeChecking(true);
    setPreDrawCodeError("");
    try {
      const res = await fetch("/api/redeem/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json() as {
        ok: boolean; status?: string; remainingUses?: number; error?: string;
      };
      if (!data.ok || data.status !== "active" || (data.remainingUses ?? 0) <= 0) {
        setPreDrawCodeError(data.error ?? "此通行碼無效或已用完，請確認後再試");
        return;
      }
      // 通過驗證：存入 pending，以 paid mode 開始抽牌（AI 產生完整解讀）
      setPreDrawCodePending(trimmed);
      setPreDrawCode("");
      void draw({ paid: true });
    } catch {
      setPreDrawCodeError("網路錯誤，請稍後再試");
    } finally {
      setPreDrawCodeChecking(false);
    }
  }


  function simulatePayment() {
    if (paymentStatus === "processing") return;
    setPaymentStatus("processing");
    paymentTimerRef.current = window.setTimeout(() => {
      setPaymentStatus("success");
      // 呼叫 purchase API 建立真實宇宙通行碼
      const plan = selectedPlan ?? PASS_PLANS[0];
      const planKey = plan.key === "single" ? "single" : plan.key === "five" ? "five_pack" : "ten_pack";
      fetch("/api/redeem/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planName: planKey }),
      })
        .then((r) => r.json() as Promise<{ ok?: boolean; code?: string; displayName?: string; totalUses?: number; expiresAt?: string }>)
        .then((data) => {
          if (data.ok && data.code) {
            setPurchasedCode({
              code: data.code,
              displayName: data.displayName ?? plan.label,
              totalUses: data.totalUses ?? plan.price,
              expiresAt: data.expiresAt ?? "",
              planName: planKey,
            });
          }
        })
        .catch(() => {});
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

  // -- 三張牌限動圖 handlers -------------------------------------------------

  async function openThreeCardStoryModal() {
    if (threeCardStoryStatus === "working") return;
    setThreeCardStoryError("");

    // 已產生過則直接開 modal
    if (threeCardStoryBlobUrl && threeCardStoryStatus === "done") {
      setThreeCardStoryModalOpen(true);
      return;
    }

    setThreeCardStoryStatus("working");
    try {
      const qText = question.trim() || "你把問題放在心裡，宇宙也有聽見。";
      const blob = await generateThreeCardStoryImage(
        qText,
        cards,
        threeCardInsights,
        threeCardOverallAnswer,
        siteUrl,
      );
      const url = URL.createObjectURL(blob);
      setThreeCardStoryBlobUrl(url);
      setThreeCardStoryStatus("done");
      setThreeCardStoryModalOpen(true);
    } catch (err) {
      console.error("[three-card-story] Canvas generation failed", err);
      setThreeCardStoryError(err instanceof Error ? err.message : String(err));
      setThreeCardStoryStatus("error");
    }
  }

  function closeThreeCardStoryModal() {
    setThreeCardStoryModalOpen(false);
  }

  // body scroll lock + ESC 由 ThreeCardStoryPortalModal 元件負責

  function downloadThreeCardStoryImage() {
    if (!threeCardStoryBlobUrl) return;
    const link = document.createElement("a");
    link.href = threeCardStoryBlobUrl;
    link.download = "universe-whisper-three-card.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
            : "把想問的事寫下來，越具體，宇宙給你的解讀越貼近你。"}
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

      {/* ── Draw CTA / 付費方案區（依免費次數狀態切換位置）── */}
      {isOutOfFreeDraws ? (
        /* ── 狀態 B：免費次數已用完 → 付費方案在選牌區上方 ── */
        <div className="relative z-10 mt-5 space-y-3">
          {/* 免費次數已用完提示 */}
          <div className="rounded-2xl border border-white/10 bg-midnight/50 px-4 py-3.5">
            <p className="text-sm font-semibold text-moon">
              今日免費次數：0 次，明天可再次免費抽牌
            </p>
            <p className="mt-1 text-xs leading-5 text-moon/55">
              你可以明天再回來免費抽牌，或購買通行碼立即繼續抽牌。
            </p>
          </div>

          {/* 想抽更多次？付費方案 */}
          <div className="rounded-2xl border border-[#d8bd70]/22 bg-midnight/50 p-4">
            <p className="text-base font-semibold text-moon">想抽更多次？</p>
            <p className="mt-0.5 text-xs leading-5 text-moon/55">解鎖更多抽牌次數，獲得更多指引</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {PASS_PLANS.map((plan) => (
                <button
                  key={plan.key}
                  type="button"
                  onClick={() => { setSelectedPlan(plan); openPaidDrawModal(); }}
                  className="rounded-2xl border border-[#d8bd70]/35 bg-midnight/50 p-4 text-left transition hover:border-[#d8bd70]/65 hover:bg-white/6 active:scale-[0.98]"
                >
                  <p className="text-xs font-semibold tracking-wide text-[#d8bd70]">{plan.label}</p>
                  <p className="mt-1 text-2xl font-bold text-moon">{plan.price} 元</p>
                  <p className="mt-1.5 text-xs leading-5 text-moon/55">{plan.desc}</p>
                </button>
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-moon/38">
              支付後可立即使用，次數有效期 30 天 ⓘ
            </p>
          </div>

          <p className="text-center text-xs text-moon/38">
            已購買宇宙通行碼？
            <a href="/redeem/check" className="ml-1 underline underline-offset-2 text-moon/55 transition hover:text-moon/80">查詢剩餘次數</a>
          </p>

          {/* 通行碼輸入區 */}
          <div className="rounded-2xl border border-lavender/22 bg-midnight/50 p-4 sm:p-5">
            <p className="text-sm font-semibold text-moon">輸入你的宇宙通行碼</p>
            <p className="mt-1 text-xs leading-6 text-moon/55">
              購買或獲得後，輸入通行碼以啟用次數
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <input
                type="text"
                value={preDrawCode}
                onChange={(e) => { setPreDrawCode(e.target.value.toUpperCase()); setPreDrawCodeError(""); }}
                onKeyDown={(e) => e.key === "Enter" && !preDrawCodeChecking && void handlePreDrawCode()}
                placeholder="輸入通行碼（例如：ABC123）"
                maxLength={12}
                disabled={preDrawCodeChecking}
                className="w-full rounded-xl border border-white/14 bg-white/6 px-4 py-3 font-mono text-sm tracking-[0.12em] text-moon placeholder-moon/30 outline-none transition focus:border-lavender/50"
                aria-label="宇宙通行碼"
              />
              <button
                type="button"
                onClick={() => void handlePreDrawCode()}
                disabled={preDrawCodeChecking || !preDrawCode.trim()}
                className="w-full rounded-xl bg-lavender px-5 py-3 text-sm font-medium text-midnight transition hover:bg-lavender/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {preDrawCodeChecking ? "驗證中…" : "啟用並解鎖抽牌"}
              </button>
            </div>
            {preDrawCodeError && (
              <p className="mt-2 text-xs text-red-300/90" role="alert">✕ {preDrawCodeError}</p>
            )}
            <p className="mt-2 text-xs text-moon/35">
              <a href="/redeem/check" className="underline underline-offset-2 transition hover:text-moon/55">查詢剩餘次數</a>
            </p>
          </div>
        </div>
      ) : (
        /* ── 狀態 A：還有免費次數 → 顯示免費抽牌 CTA，付費方案移到選牌區下方 ── */
        <div className="relative z-10 mt-5 rounded-2xl border border-[#d8bd70]/22 bg-midnight/50 px-5 py-4">
          <p className="text-sm font-semibold text-moon">
            今日免費次數：{drawsRemaining !== null ? `${drawsRemaining} 次` : "…"}
          </p>
          <p className="mt-1 text-xs leading-6 text-moon/60">
            你今天還有 {drawsRemaining ?? 1} 次免費抽牌機會，可以先免費體驗一次。
          </p>
          <button
            type="button"
            onClick={handleDrawButtonClick}
            disabled={
              status === "drawing" ||
              status === "selecting" ||
              status === "revealing" ||
              readingStatus === "loading"
            }
            className="mt-4 w-full rounded-full bg-moon px-6 py-3 font-medium text-midnight shadow-[0_0_24px_rgba(247,241,223,0.28)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "drawing" ? "星光正在流動..." : "✦ 使用今日免費次數抽牌"}
          </button>
        </div>
      )}

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
              今日免費抽牌已使用完畢。你可以購買宇宙通行碼，繼續抽牌並解鎖完整解讀。
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

      {/* ── 狀態 A：免費次數還有時，在選牌區下方才顯示付費加購區 ── */}
      {!isOutOfFreeDraws && !isAdmin && !canShowReadings ? (
        <div className="relative z-10 mt-8 rounded-2xl border border-[#d8bd70]/18 bg-midnight/40 p-5">
          <p className="text-base font-semibold text-moon">想抽更多次？</p>
          <p className="mt-1 text-xs leading-6 text-moon/55">
            免費次數使用完後，可以購買通行碼繼續抽牌。
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {PASS_PLANS.map((plan) => (
              <button
                key={plan.key}
                type="button"
                onClick={() => { setSelectedPlan(plan); openPaidDrawModal(); }}
                className="rounded-2xl border border-[#d8bd70]/30 bg-midnight/50 p-3 text-left transition hover:border-[#d8bd70]/55 hover:bg-white/5 active:scale-[0.98]"
              >
                <p className="text-xs text-[#d8bd70]">{plan.label}</p>
                <p className="mt-0.5 text-xl font-bold text-moon">{plan.price} 元</p>
                <p className="mt-1 text-[11px] leading-4 text-moon/50">{plan.desc}</p>
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-moon/38">支付後可立即使用，次數有效期 30 天</p>
        </div>
      ) : null}

      {/* ????????????????????????????????????????????????????????????????????
          Reading area ??only shown after cards are revealed
          ???????????????????????????????????????????????????????????????????? */}
      {canShowReadings ? (
        <section ref={readingSectionRef} className="relative z-10 mt-9 space-y-5">

          {/* 通行碼扣次成功提示 */}
          {codeDeductResult !== null && (
            <div className="rounded-2xl border border-aurora/30 bg-aurora/8 px-4 py-3 text-sm text-aurora/90">
              ✓ 解鎖成功，本通行碼剩餘 {codeDeductResult.remainingUses} 次。
            </div>
          )}
          {codeDeductError && (
            <div className="rounded-2xl border border-red-300/25 bg-red-300/6 px-4 py-3 text-sm text-red-300/90">
              ⚠ {codeDeductError}
            </div>
          )}


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

          {/* 三張牌限動圖產生按鈕（cards revealed + three-card mode）*/}
          {!isSingleResult && cards.length === 3 ? (
            <div className="cosmic-reading-card rounded-[1.75rem] border border-[#d8bd70]/20 bg-midnight/50 p-5 shadow-glow sm:p-6 text-center">
              <p className="text-sm tracking-[0.22em] text-[#d8bd70]/70 mb-3">你的三張牌限動圖</p>
              <button
                type="button"
                onClick={() => void openThreeCardStoryModal()}
                disabled={threeCardStoryStatus === "working"}
                className="rounded-full bg-[#d8bd70] px-6 py-3 text-sm font-semibold text-midnight shadow-[0_0_20px_rgba(216,189,112,0.24)] transition hover:bg-moon active:scale-95 disabled:cursor-wait disabled:opacity-70"
              >
                {threeCardStoryStatus === "working" ? "正在產生圖片..." : "產生限動圖"}
              </button>
              {threeCardStoryStatus === "error" ? (
                <p className="mt-2 text-xs text-[#ffb4b4]">{threeCardStoryError || "圖片產生失敗，請稍後再試。"}</p>
              ) : null}
              <p className="mt-2 text-xs text-moon/40">9:16 直式圖，適合 IG / FB / Threads 限動分享。</p>
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
                  onClick={() => { setSelectedPlan(PASS_PLANS[0]); openPaidDrawModal(); }}
                  className="w-full rounded-full border border-[#d8bd70]/40 px-6 py-3 text-sm font-semibold text-[#d8bd70] transition hover:border-[#d8bd70]/70 hover:bg-white/6 active:scale-95 sm:w-auto sm:min-w-[280px]"
                >
                  🔓 NT$49 解鎖完整宇宙訊息
                </button>
                <p className="mt-2 text-xs leading-6 text-moon/40">
                  本服務為即時產生之數位內容，付款完成並成功產出、顯示或發送結果後，恕不接受退費。若付款成功但未收到內容，請於 24 小時內聯繫
                  <a href="mailto:ciut0000@gmail.com" className="underline underline-offset-2 hover:text-moon/60">客服信箱</a>。
                </p>
              </div>

              {/* 兌換碼區塊 */}
              {lineResultId ? (
                <div className="mt-5 border-t border-white/8 pt-5">
                  <RedeemCodeBlock
                    resultId={lineResultId}
                    onUnlocked={(fullText, _remaining) => {
                      setFullReading(fullText);
                      setPaidUnlocked(true);
                    }}
                  />
                  <p className="mt-3 text-xs text-moon/38 text-center"><a href="/redeem/check" className="underline underline-offset-2 transition hover:text-moon/60">查詢我的宇宙通行碼剩餘次數</a></p>
                </div>
              ) : null}

              {/* 購買宇宙通行碼方案 */}
              <div className="mt-5 border-t border-white/8 pt-5">
                <p className="text-sm font-semibold text-moon">購買宇宙通行碼</p>
                <p className="mt-1.5 text-xs leading-6 text-moon/55">
                  可自行使用，也可分享給朋友共同使用。每解鎖一次完整版扣除 1 次，購買後 60 天內使用完畢。
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {PASS_PLANS.map((plan) => (
                    <button
                      key={plan.key}
                      type="button"
                      onClick={() => { setSelectedPlan(plan); openPaidDrawModal(); }}
                      className="rounded-2xl border border-[#d8bd70]/30 bg-midnight/40 p-3 text-left transition hover:border-[#d8bd70]/60 hover:bg-white/6 active:scale-[0.98]"
                    >
                      <p className="text-xs text-[#d8bd70]">{plan.label}</p>
                      <p className="mt-0.5 text-lg font-bold text-moon">{plan.price} 元</p>
                      <p className="mt-1 text-[11px] leading-4 text-moon/50">{plan.desc}</p>
                    </button>
                  ))}
                </div>
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
                <p className="mb-1 text-sm font-semibold text-moon/70">將本次結果傳送到 LINE（LINE 結果驗證碼）</p>
                <LineClaimSection
                  status={lineClaimStatus}
                  claimCode={lineClaimCode}
                  error={lineClaimError}
                  onOpen={() => void openLineClaimFlow()}
                  onCheck={() => void checkLineClaimStatus()}
                  onReset={() => { setLineClaimStatus("idle"); setLineClaimError(""); setLineClaimCode(""); }}
                />
              </div>
            </div>
          )}

        </section>
      ) : null}


      {/* Payment modal */}
      {paymentModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
          <div className="cosmic-reading-card w-full max-w-md rounded-[1.75rem] border border-[#d8bd70]/30 bg-midnight p-6 shadow-glow">
            {paymentStatus === "success" && purchasedCode ? (
              /* 購買成功畫面 */
              <div>
                {/* 未保存防呆確認彈窗 */}
                {showUnsavedWarning && (
                  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-5">
                    <div className="w-full max-w-xs rounded-2xl border border-white/15 bg-midnight p-5 shadow-glow">
                      <p className="text-sm font-semibold text-moon">你還沒有保存通行碼</p>
                      <p className="mt-2 text-xs leading-6 text-moon/65">
                        你還沒有複製或寄送通行碼，之後可能會找不到剩餘次數。確定要直接開始抽牌嗎？
                      </p>
                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setShowUnsavedWarning(false)}
                          className="flex-1 rounded-xl border border-[#d8bd70]/50 px-3 py-2.5 text-xs font-semibold text-[#d8bd70] transition hover:border-[#d8bd70]/80 active:scale-95"
                        >
                          先返回保存
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowUnsavedWarning(false);
                            if (purchasedCode) setPreDrawCodePending(purchasedCode.code);
                            setPaymentModalOpen(false);
                            setPaidUnlocked(true);
                            void draw({ paid: true });
                          }}
                          className="flex-1 rounded-xl border border-white/15 px-3 py-2.5 text-xs text-moon/60 transition hover:border-white/30 hover:text-moon/85 active:scale-95"
                        >
                          確定開始抽牌
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 通行碼顯示 */}
                <div className="text-center">
                  <p className="text-sm tracking-[0.22em] text-aurora/80">購買成功！</p>
                  <h3 className="mt-3 text-xl font-semibold text-moon">你的宇宙通行碼</h3>
                  <div className="mt-4 rounded-2xl border border-[#d8bd70]/40 bg-[#d8bd70]/8 px-5 py-4">
                    <p className="font-mono text-2xl font-bold tracking-[0.22em] text-[#d8bd70] select-all">
                      {purchasedCode.code}
                    </p>
                  </div>
                  <div className="mt-4 space-y-1 text-sm text-moon/70 text-left">
                    <p>方案：{purchasedCode.displayName}</p>
                    <p>可解鎖次數：{purchasedCode.totalUses} 次</p>
                    <p>有效期限：購買後 60 天內使用完畢</p>
                  </div>
                </div>

                {/* 保存提醒 + 複製按鈕 + Email 區塊 */}
                <div className="mt-4 rounded-xl border border-[#d8bd70]/25 bg-[#d8bd70]/6 px-4 py-4">
                  <p className="text-xs font-semibold text-[#d8bd70]">先保存你的通行碼</p>
                  <p className="mt-1 mb-3 text-xs leading-5 text-moon/60">
                    通行碼是查詢剩餘次數與再次使用的憑證，建議先複製或寄到 Email 後再開始抽牌。
                  </p>

                  {/* 複製通行碼 */}
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(purchasedCode.code).then(() => {
                        setCodeCopied(true);
                        window.setTimeout(() => setCodeCopied(false), 3000);
                      }).catch(() => {});
                    }}
                    className="mb-3 w-full rounded-xl border border-[#d8bd70]/60 bg-[#d8bd70]/12 px-4 py-2.5 text-sm font-semibold text-[#d8bd70] transition hover:bg-[#d8bd70]/22 hover:border-[#d8bd70]/80 active:scale-95"
                  >
                    {codeCopied ? "✓ 已複製通行碼，請妥善保存。" : "複製通行碼"}
                  </button>

                  {/* Email 保存 */}
                  {codeEmailStatus === "not_configured" ? (
                    <p className="text-xs text-moon/44">📭 Email 服務尚未啟用，請先複製通行碼保存。</p>
                  ) : codeEmailStatus === "sent" ? (
                    <p className="text-xs font-medium text-aurora">✓ 已寄出通行碼，請到信箱確認。</p>
                  ) : (
                    <>
                      <input
                        type="email"
                        value={codeEmailInput}
                        onChange={(e) => { setCodeEmailInput(e.target.value); if (codeEmailStatus === "error") setCodeEmailStatus("idle"); }}
                        placeholder="請輸入你的 Email"
                        disabled={codeEmailStatus === "sending"}
                        className="mb-2 w-full rounded-xl border border-white/14 bg-white/6 px-3 py-2.5 text-xs text-moon placeholder-moon/30 outline-none transition focus:border-[#d8bd70]/40"
                        aria-label="Email"
                      />
                      <button
                        type="button"
                        disabled={codeEmailStatus === "sending" || !codeEmailInput.trim()}
                        onClick={() => {
                          if (!purchasedCode) return;
                          setCodeEmailStatus("sending");
                          fetch("/api/email/send-redeem-code", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              email: codeEmailInput.trim(),
                              code: purchasedCode.code,
                              planName: purchasedCode.planName,
                              displayName: purchasedCode.displayName,
                              totalUses: purchasedCode.totalUses,
                              remainingUses: purchasedCode.totalUses,
                              expiresAt: purchasedCode.expiresAt,
                            }),
                          })
                            .then((r) => r.json() as Promise<{ ok: boolean; error?: string }>)
                            .then((d) => setCodeEmailStatus(d.ok ? "sent" : d.error === "EMAIL_NOT_CONFIGURED" ? "not_configured" : "error"))
                            .catch(() => setCodeEmailStatus("error"));
                        }}
                        className="w-full rounded-xl bg-[#d8bd70]/18 px-4 py-2.5 text-sm font-semibold text-[#d8bd70] transition hover:bg-[#d8bd70]/28 disabled:opacity-50 active:scale-95"
                      >
                        {codeEmailStatus === "sending" ? "寄送中…" : "寄送通行碼到 Email"}
                      </button>
                    </>
                  )}
                  {codeEmailStatus === "error" && (
                    <p className="mt-1.5 text-xs text-red-300/90">
                      寄送失敗，請確認 Email 是否正確，或先複製通行碼保存。
                    </p>
                  )}
                </div>

                {/* 查詢剩餘次數連結 */}
                <div className="mt-2 text-center">
                  <a
                    href={`/redeem/check?code=${encodeURIComponent(purchasedCode.code)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-moon/40 underline underline-offset-2 transition hover:text-moon/65"
                  >
                    查詢剩餘次數
                  </a>
                </div>

                {/* 立即使用（次要按鈕） */}
                <div className="mt-4 border-t border-white/8 pt-4 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      const saved = codeCopied || codeEmailStatus === "sent";
                      if (!saved) {
                        setShowUnsavedWarning(true);
                      } else {
                        if (purchasedCode) setPreDrawCodePending(purchasedCode.code);
                        setPaymentModalOpen(false);
                        setPaidUnlocked(true);
                        void draw({ paid: true });
                      }
                    }}
                    className="w-full rounded-xl border border-white/18 px-5 py-2.5 text-sm text-moon/60 transition hover:border-white/35 hover:text-moon/90 active:scale-95"
                  >
                    我已保存通行碼，立即抽牌
                  </button>
                  <p className="mt-2 text-xs text-moon/38">
                    稍後也可以用此通行碼查詢剩餘次數或再次使用。
                  </p>
                </div>
              </div>
            ) : (
              /* 付款前確認畫面 */
              <div className="text-center">
                <p className="text-sm tracking-[0.22em] text-[#d8bd70]/78">購買宇宙通行碼</p>
                <h3 className="mt-3 text-2xl font-semibold text-moon">
                  {selectedPlan ? selectedPlan.label : "宇宙通行碼 單次"}
                </h3>
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/6 p-4">
                  <p className="text-sm text-moon/58">費用</p>
                  <p className="mt-1 text-3xl font-semibold text-moon">NT$ {selectedPlan ? selectedPlan.price : 49}</p>
                  <p className="mt-1 text-xs text-moon/40">購買後 60 天有效 · 可解鎖 {selectedPlan ? (selectedPlan.key === "single" ? 1 : selectedPlan.key === "five" ? 5 : 10) : 1} 次完整版</p>
                </div>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setPaymentModalOpen(false)}
                    className="rounded-full border border-moon/25 px-5 py-3 text-sm font-semibold text-moon transition hover:bg-white/10"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={simulatePayment}
                    disabled={paymentStatus === "processing"}
                    className="flex-1 rounded-full bg-[#d8bd70] px-5 py-3 text-sm font-semibold text-midnight shadow-[0_0_28px_rgba(216,189,112,0.28)] transition hover:bg-moon disabled:opacity-60"
                  >
                    {paymentStatus === "processing" ? "處理中..." : `NT$${selectedPlan ? selectedPlan.price : 49} 確認購買`}
                  </button>
                </div>
                <p className="mt-4 text-xs leading-6 text-moon/42 text-center px-2">
                  本服務為即時產生之數位內容，付款成功並取得通行碼後恕不退費。
                  若付款成功但未收到通行碼，請於 24 小時內聯繫
                  <a href="mailto:ciut0000@gmail.com" className="underline underline-offset-2 hover:text-moon/70">客服信箱</a>
                  ，確認後協助補發或退款。
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* 三張牌限動圖 Modal — Portal render 到 document.body */}
      <ThreeCardStoryPortalModal
        open={threeCardStoryModalOpen}
        blobUrl={threeCardStoryBlobUrl}
        onClose={closeThreeCardStoryModal}
        onDownload={downloadThreeCardStoryImage}
      />
    </div>
  );
}
