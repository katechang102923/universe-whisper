"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ShareStoryCard } from "@/components/ShareStoryCard";
import { TarotCardBack, TarotCardFace, type TarotCardFaceData } from "@/components/TarotCardFace";
import { TarotRitualDraw } from "./TarotRitualDraw";
import { useAuth } from "@/contexts/AuthContext";

type DrawStatus = "idle" | "drawing" | "selecting" | "revealing" | "revealed";
type ReadingStatus = "idle" | "loading" | "done" | "error";
type ReadingTopic = "love" | "career" | "general";
type SpreadPosition = "past" | "present" | "future";

const AD_COUNTDOWN_SECONDS = 15;
const ANON_ID_STORAGE_KEY = "cosmic_anon_id";
const AD_UNLOCK_STORAGE_KEY = "cosmic_ad_unlock_date";
const REWARDED_AD_TIMEOUT_MS = 3500;
const GOOGLE_REWARDED_AD_CLIENT = process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_CLIENT;
const GOOGLE_REWARDED_AD_SLOT = process.env.NEXT_PUBLIC_GOOGLE_REWARDED_AD_SLOT;
type RewardedAdInstance = {
  show?: () => void;
};

type AdsByGoogleQueue = {
  push: (payload: {
    params?: Record<string, string>;
    onAdLoaded?: (rewardedAd?: RewardedAdInstance) => void;
    onAdFailedToLoad?: (error?: unknown) => void;
    onAdClosed?: () => void;
    onRewarded?: () => void;
  }) => unknown;
};

declare global {
  interface Window {
    adsbygoogle?: AdsByGoogleQueue | unknown[];
  }
}

const modes = [
  { key: "single_tarot", label: "單張牌", description: "快速接收今天最重要的宇宙訊息" },
  { key: "three_card", label: "三張牌", description: "看見過去、現在與下一步走向" },
] as const;

const topics = ["感情", "工作", "生活"] as const;
type TarotTopicOption = (typeof topics)[number];

const spreadQuestionGroups = {
  感情: {
    title: "感情牌陣問題",
    questions: ["他現在怎麼想我？", "這段關係下一步會如何？", "我該主動靠近嗎？", "對方真正沒說出口的是什麼？"],
  },
  工作: {
    title: "工作牌陣問題",
    questions: ["目前工作方向適合我嗎？", "近期適合轉職嗎？", "我該如何突破卡關？", "這個合作值得投入嗎？"],
  },
  生活: {
    title: "生活牌陣問題",
    questions: ["今天宇宙想提醒我什麼？", "我現在最需要放下什麼？", "下一步該往哪裡走？", "近期需要注意什麼？"],
  },
} satisfies Record<TarotTopicOption, { title: string; questions: readonly string[] }>;

function toReadingTopic(topic: TarotTopicOption): ReadingTopic {
  if (topic === "工作") return "career";
  if (topic === "感情") return "love";
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

function hasUsedAdUnlockToday() {
  try {
    return window.localStorage.getItem(AD_UNLOCK_STORAGE_KEY) === getTodayKey();
  } catch {
    return false;
  }
}

function markAdUnlockUsedToday() {
  try {
    window.localStorage.setItem(AD_UNLOCK_STORAGE_KEY, getTodayKey());
  } catch {
    // localStorage can be unavailable in private modes.
  }
}

function isAdsByGoogleQueue(value: Window["adsbygoogle"]): value is AdsByGoogleQueue {
  return Boolean(value && typeof (value as AdsByGoogleQueue).push === "function");
}

function ReadingContent({ text }: { text: string }) {
  const blocks = parseReadingSectionsForDisplay(text)
    .map((section) => `${section.title}\n${section.body}`)
    .filter(Boolean);

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => (
        <article
          key={`${index}-${block.slice(0, 12)}`}
          className="reading-fade-in rounded-2xl border border-white/10 bg-white/[0.055] p-4 shadow-[0_18px_54px_rgba(8,10,35,0.22)] sm:p-5"
          style={{ animationDelay: `${index * 0.55}s` }}
        >
          <p className="whitespace-pre-line text-left text-base leading-8 text-moon/84">{block}</p>
        </article>
      ))}
    </div>
  );
}

function parseReadingSections(text: string) {
  const knownTitles = [
    "🌙 宇宙偷偷話",
    "🔮 這張牌正在說什麼",
    "🐈 你現在的狀態",
    "✨ 接下來可以怎麼做",
    "🌌 給你的溫柔提醒",
    "🕯️ 7日能量提示",
    "💫 一句專屬祝福",
  ];
  const lines = text
    .split(/\n{2,}/)
    .map((block) => block.trim().replace(/\*\*/g, ""))
    .filter(Boolean);
  const sections: { title: string; body: string }[] = [];

  for (const block of lines) {
    const title = knownTitles.find((item) => block.startsWith(item));
    if (title) {
      sections.push({ title, body: block.slice(title.length).trim() });
    }
  }

  return sections.length ? sections : lines.map((block, index) => ({ title: index === 0 ? "🌙 宇宙偷偷話" : "", body: block }));
}

type ReadingSection = { title: string; body: string };

const READING_FALLBACK_TEXT = "宇宙正在整理訊息中 ✨";

const READING_SECTION_TITLES = [
  "🌙 宇宙偷偷話",
  "🔮 這張牌正在說什麼",
  "🐈 你現在的狀態",
  "✨ 接下來可以怎麼做",
  "🌌 給你的溫柔提醒",
  "🕯️ 7日能量提示",
  "💫 一句專屬祝福",
];

function parseReadingSectionsForDisplay(text: string): ReadingSection[] {
  const cleaned = text.replace(/\*\*/g, "").trim();
  if (!cleaned) return [{ title: "🌙 宇宙偷偷話", body: READING_FALLBACK_TEXT }];

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

    const title = READING_SECTION_TITLES.find((item) => line === item || line.startsWith(`${item} `));

    if (title) {
      pushCurrent();
      current = { title, body: line.slice(title.length).trim() };
      continue;
    }

    if (!current) {
      current = { title: "🌙 宇宙偷偷話", body: line };
      continue;
    }

    current.body = [current.body, line].filter(Boolean).join("\n");
  }

  pushCurrent();

  return sections.length ? sections : [{ title: "🌙 宇宙偷偷話", body: READING_FALLBACK_TEXT }];
}

function ReadingSectionList({ text, limit }: { text: string; limit?: number }) {
  const sections = parseReadingSectionsForDisplay(text);
  const visibleSections = typeof limit === "number" ? sections.slice(0, limit) : sections;

  return (
    <div className="space-y-4">
      {visibleSections.map((section, index) => (
        <article
          key={`${section.title}-${index}`}
          className="reading-fade-in rounded-3xl border border-white/10 bg-white/[0.055] p-4 shadow-[0_18px_54px_rgba(8,10,35,0.2)] sm:p-5"
          style={{ animationDelay: `${index * 0.55}s` }}
        >
          {section.title ? <h4 className="text-lg font-semibold text-moon">{section.title}</h4> : null}
          <p className="mt-3 whitespace-pre-line text-base leading-8 text-moon/80">{section.body}</p>
        </article>
      ))}
    </div>
  );
}

function buildFreeSummary(cards: TarotCardFaceData[], fullReading: string) {
  const sections = fullReading.trim() ? parseReadingSectionsForDisplay(fullReading).slice(0, 3) : [];
  const firstLines = sections.map((section) => section.body).join(" ");
  const fallback = cards.map((card) => card.cosmicMessage).join(" ");
  const source = firstLines || fallback || "宇宙提醒你，把注意力收回自己身上，答案會慢慢變清楚。";

  return {
    message: source.length > 96 ? `${source.slice(0, 96)}...` : source,
    reminder: "提醒：先不要急著做最後決定，今天只需要看見真正的感受。",
  };
}

function buildStoryCopy(card: TarotCardFaceData | undefined, fullReading: string, freeSummary: { message: string; reminder: string }) {
  const sections = fullReading.trim() ? parseReadingSectionsForDisplay(fullReading) : [];
  const resultText = sections[0]?.body || card?.cosmicMessage || freeSummary.message || READING_FALLBACK_TEXT;
  const adviceText = sections[1]?.body || sections[2]?.body || freeSummary.reminder || "把今天留一點空白給自己，答案會在安靜的地方慢慢浮出來。";

  return {
    resultText: resultText.length > 118 ? `${resultText.slice(0, 116)}...` : resultText,
    adviceText: adviceText.length > 82 ? `${adviceText.slice(0, 80)}...` : adviceText,
  };
}

// ──────────────────────────────────────────────────────────
// Client-side Canvas image generation — 1080 × 1920 PNG
// ──────────────────────────────────────────────────────────

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
  x: number, y: number, w: number, h: number, r: number,
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

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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
  if (!ctx) throw new Error("無法建立 Canvas 環境，請嘗試重新整理頁面。");

  const ff = "'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', sans-serif";

  // ── Background gradient ──
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, "#05071d");
  bgGrad.addColorStop(0.55, "#0d0b2a");
  bgGrad.addColorStop(1, "#1a0e2e");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Try to overlay background image
  try {
    const bgImg = await loadImage("/reference/story-bg.png");
    ctx.drawImage(bgImg, 0, 0, W, H);
  } catch {
    /* gradient fallback already drawn */
  }

  // ── Decorative stars ──
  const stars = [
    { x: 120, y: 88, size: 28, alpha: 0.55 },
    { x: W - 148, y: 130, size: 20, alpha: 0.38 },
    { x: 96, y: H - 240, size: 22, alpha: 0.45 },
    { x: W - 116, y: H - 268, size: 18, alpha: 0.38 },
  ];
  ctx.textAlign = "left";
  for (const s of stars) {
    ctx.font = `${s.size}px serif`;
    ctx.fillStyle = `rgba(247,217,135,${s.alpha})`;
    ctx.fillText("✦", s.x, s.y + s.size);
  }

  // ── Header ──
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
  ctx.fillText("宇宙想對你說...", W / 2, curY + 34);
  curY += 64;

  // ── Card image ──
  const CARD_W = 290;
  const CARD_H = 440;
  const cardCX = W / 2;
  const cardCY = curY + 64 + CARD_H / 2;

  // Glow behind card
  ctx.save();
  ctx.shadowBlur = 64;
  ctx.shadowColor = "rgba(247,217,135,0.38)";
  ctx.fillStyle = "rgba(247,217,135,0.18)";
  canvasRoundRect(ctx, cardCX - CARD_W / 2 - 22, cardCY - CARD_H / 2 - 22, CARD_W + 44, CARD_H + 44, 44);
  ctx.fill();
  ctx.restore();

  // Card face (rotated -3°)
  ctx.save();
  ctx.translate(cardCX, cardCY);
  ctx.rotate(-3 * Math.PI / 180);
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
    ctx.fillText("☾", 0, 28);
  }
  ctx.restore();

  // Card border
  ctx.save();
  ctx.translate(cardCX, cardCY);
  ctx.rotate(-3 * Math.PI / 180);
  canvasRoundRect(ctx, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 30);
  ctx.strokeStyle = "rgba(247,217,135,0.82)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  curY = cardCY + CARD_H / 2 + 56;

  // ── Card name ──
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

  // ── Result text box ──
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
    cleanResult || "宇宙正在整理訊息，靜靜感受當下。",
    BOX_W - BPAD_X * 2,
  );
  const lineH = 34 * 1.8;
  const badgeRowH = 52;
  const BOX_H = BPAD_Y * 2 + badgeRowH + 32 + msgLines.length * lineH;

  // Box fill
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

  // Box border + shadow
  ctx.save();
  ctx.shadowBlur = 80;
  ctx.shadowColor = "rgba(5,7,24,0.3)";
  canvasRoundRect(ctx, BOX_X, BOX_Y, BOX_W, BOX_H, 52);
  ctx.strokeStyle = "rgba(202,168,95,0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // Badge
  const badgeText = "宇宙訊息";
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

  // Separator lines
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

  // Message text
  ctx.font = `400 34px ${ff}`;
  ctx.fillStyle = "#241937";
  ctx.textAlign = "center";
  const msgStartY = badgeBY + badgeRowH + 32;
  for (let i = 0; i < msgLines.length; i++) {
    ctx.fillText(msgLines[i], W / 2, msgStartY + i * lineH + 34);
  }

  // ── Footer ──
  ctx.font = `400 24px ${ff}`;
  ctx.fillStyle = "rgba(255,247,230,0.42)";
  ctx.textAlign = "center";
  ctx.fillText(`✦  ${siteUrl}  ✦`, W / 2, H - 72);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas 圖片轉換失敗，請嘗試重新整理頁面後再試。"));
      },
      "image/png",
    );
  });
}

export function TarotDrawClient() {
  const { isAdmin, getIdToken } = useAuth();
  const [mode, setMode] = useState<(typeof modes)[number]["key"]>("single_tarot");
  const [topic, setTopic] = useState<TarotTopicOption>("感情");
  const [question, setQuestion] = useState("");
  const [selectedSpreadQuestion, setSelectedSpreadQuestion] = useState("");
  const [cards, setCards] = useState<TarotCardFaceData[]>([]);
  const [pendingCards, setPendingCards] = useState<TarotCardFaceData[]>([]);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const [status, setStatus] = useState<DrawStatus>("idle");
  const [readingStatus, setReadingStatus] = useState<ReadingStatus>("idle");
  const [fullReading, setFullReading] = useState("");
  const [error, setError] = useState("");
  const [adUnlocked, setAdUnlocked] = useState(false);
  const [adUnlockUsedToday, setAdUnlockUsedToday] = useState(false);
  const [paidUnlocked, setPaidUnlocked] = useState(false);
  const [paidDrawMode, setPaidDrawMode] = useState(false);
  const [adModalOpen, setAdModalOpen] = useState(false);
  const [adCountdown, setAdCountdown] = useState(AD_COUNTDOWN_SECONDS);
  const [adNotice, setAdNotice] = useState("");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "processing" | "success">("idle");
  const [drawsRemaining, setDrawsRemaining] = useState<number | null>(null);
  const [storyDownloadStatus, setStoryDownloadStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [storyError, setStoryError] = useState("");
  const adTimerRef = useRef<number | null>(null);
  const paymentTimerRef = useRef<number | null>(null);
  const storyCardRef = useRef<HTMLDivElement | null>(null);

  const cardCount = mode === "three_card" ? 3 : 1;
  const visibleBacks = useMemo(() => Array.from({ length: cardCount }), [cardCount]);
  const canShowReadings = status === "revealed" && cards.length > 0;
  const hasFullAccess = isAdmin || adUnlocked || paidUnlocked;
  const isOutOfFreeDraws = !isAdmin && drawsRemaining === 0;
  const shouldShowPaidPlan = isOutOfFreeDraws && adUnlockUsedToday && !hasFullAccess;
  const currentSpreadGroup = spreadQuestionGroups[topic];
  const freeSummary = useMemo(() => buildFreeSummary(cards, fullReading), [cards, fullReading]);
  const isSingleResult = mode === "single_tarot" && cards.length === 1;
  const storyCard = isSingleResult ? cards[0] : undefined;
  const storyCopy = useMemo(() => buildStoryCopy(storyCard, fullReading, freeSummary), [storyCard, fullReading, freeSummary]);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://universe-whisper.vercel.app";

  useEffect(() => {
    return () => {
      if (adTimerRef.current) clearInterval(adTimerRef.current);
      if (paymentTimerRef.current) clearTimeout(paymentTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setAdUnlocked((current) => current || isAdmin);
    setAdUnlockUsedToday(hasUsedAdUnlockToday());
  }, [isAdmin]);

  // Fetch remaining draw quota on mount and whenever auth state changes.
  // Passes the Firebase ID token so the server can grant unlimited draws for admins.
  useEffect(() => {
    const anonId = getOrCreateAnonId();
    void (async () => {
      try {
        const token = await getIdToken();
        const headers: Record<string, string> = {};
        if (token) headers["x-firebase-id-token"] = token;
        const r = await fetch(
          `/api/tarot/usage?anonymousId=${encodeURIComponent(anonId)}`,
          { headers },
        );
        const data = (await r.json().catch(() => ({}))) as { remaining?: number };
        if (typeof data.remaining === "number") setDrawsRemaining(data.remaining);
      } catch {
        /* fail open */
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getIdToken]);

  function resetReading() {
    if (adTimerRef.current) clearInterval(adTimerRef.current);
    if (paymentTimerRef.current) clearTimeout(paymentTimerRef.current);
    adTimerRef.current = null;
    paymentTimerRef.current = null;
    setReadingStatus("idle");
    setFullReading("");
    setError("");
    setPendingCards([]);
    setSelectedCardIndex(null);
    setAdUnlocked(isAdmin);
    setAdUnlockUsedToday(hasUsedAdUnlockToday());
    setPaidUnlocked(false);
    setPaidDrawMode(false);
    setAdModalOpen(false);
    setAdCountdown(AD_COUNTDOWN_SECONDS);
    setAdNotice("");
    setPaymentModalOpen(false);
    setPaymentStatus("idle");
    setStoryDownloadStatus("idle");
    setStoryError("");
  }

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
        keywords: card.orientation === "reversed" ? card.reversedKeywords ?? card.keywords : card.uprightKeywords ?? card.keywords,
        baseMeaning: card.orientation === "reversed" ? card.reversedMeaning : card.uprightMeaning,
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

  async function requestFullReading(targetCards: TarotCardFaceData[]) {
    setReadingStatus("loading");
    setFullReading("");

    const token = await getIdToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["x-firebase-id-token"] = token;

    const response = await fetch("/api/tarot-reading", {
      method: "POST",
      headers,
      body: JSON.stringify(buildReadingPayload(targetCards)),
    });
    const data = (await response.json().catch(() => ({}))) as { reading?: string; error?: string };
    console.log("[tarot-reading] result", data);

    if (response.status === 429) {
      throw new Error(data.error || "宇宙訊息正在排隊中，請稍後再試");
    }

    if (!response.ok) {
      throw new Error(data.error || "宇宙訊號有點微弱，請稍後再試一次。");
    }

    setFullReading(data.reading?.trim() || `🌙 宇宙偷偷話\n${READING_FALLBACK_TEXT}`);
    setReadingStatus("done");
  }

  async function draw(options: { paid?: boolean } = {}) {
    if (status === "drawing" || readingStatus === "loading") return;
    const isPaidDraw = Boolean(options.paid);

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
        body: JSON.stringify({ mode, topic, question, anonymousId: getOrCreateAnonId(), paidMode: isPaidDraw }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        cards?: TarotCardFaceData[];
        error?: string;
        code?: string;
        message?: string;
        remaining?: number;
        resetAt?: string;
      };

      if (response.status === 429 || data.code === "DAILY_LIMIT_REACHED") {
        setStatus("idle");
        setDrawsRemaining(0);
        setError(data.message || "今天的免費抽牌次數已用完，明天再來聽宇宙說話。");
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "抽牌失敗，請稍後再試。");
      }

      if (!isAdmin && !isPaidDraw) {
        setDrawsRemaining((prev) => (typeof prev === "number" && prev > 0 ? prev - 1 : prev));
      }

      window.setTimeout(() => {
        const revealedCards = data.cards ?? [];
        setPendingCards(revealedCards);
        setStatus("selecting");
      }, 3200);
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "宇宙訊號有點微弱，請稍後再試一次。");
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
    setSelectedCardIndex(choiceIndex);
    setCards(pendingCards);
    setStatus("revealing");
    window.setTimeout(() => {
      setStatus("revealed");
      void requestFullReading(pendingCards).catch((err) => {
        setReadingStatus("error");
        setError(err instanceof Error ? err.message : "宇宙訊號有點微弱，請稍後再試一次。");
      });
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
          setError(err instanceof Error ? err.message : "宇宙訊號有點微弱，請稍後再試一次。");
        });
      }
      return;
    }
    setStatus("idle");
  }

  function startAdUnlock() {
    if (adUnlocked) return;
    if (hasUsedAdUnlockToday()) {
      setAdNotice("今日免費廣告解鎖已使用完畢 ✨ 可使用 NT$49 再抽一次，直接查看完整訊息。");
      return;
    }

    setAdNotice("");
    setAdCountdown(AD_COUNTDOWN_SECONDS);
    setAdNotice("正在確認 Google Rewarded Ad...");
    void tryGoogleRewardedAd().then((playedGoogleAd) => {
      if (!playedGoogleAd) startFallbackRewardedAd();
    });
  }

  function completeRewardedAd(source: "google" | "fallback") {
    console.info("[rewarded-ad] Reward completed", { source });
    markAdUnlockUsedToday();
    setAdUnlockUsedToday(true);
    setAdUnlocked(true);
    setAdModalOpen(false);
    setAdNotice("");
  }

  function openPaidDrawModal() {
    setPaymentStatus("idle");
    setPaymentModalOpen(true);
  }

  function startFallbackRewardedAd(reason?: unknown) {
    console.info("[rewarded-ad] Fallback fake rewarded", { reason });
    if (adTimerRef.current) clearInterval(adTimerRef.current);
    setAdCountdown(AD_COUNTDOWN_SECONDS);
    setAdNotice("");
    setAdModalOpen(true);
    let remaining = AD_COUNTDOWN_SECONDS;
    adTimerRef.current = window.setInterval(() => {
      remaining -= 1;
      setAdCountdown(remaining);

      if (remaining <= 0) {
        if (adTimerRef.current) clearInterval(adTimerRef.current);
        adTimerRef.current = null;
        completeRewardedAd("fallback");
      }
    }, 1000);
  }

  async function tryGoogleRewardedAd() {
    if (typeof window === "undefined") return false;

    const adsbygoogle = window.adsbygoogle;
    if (!isAdsByGoogleQueue(adsbygoogle)) {
      console.info("[rewarded-ad] Reward failed", { reason: "adsbygoogle unavailable" });
      return false;
    }

    if (!GOOGLE_REWARDED_AD_CLIENT || !GOOGLE_REWARDED_AD_SLOT) {
      console.info("[rewarded-ad] Reward failed", { reason: "rewarded ad env missing" });
      return false;
    }

    return new Promise<boolean>((resolve) => {
      let settled = false;
      let rewarded = false;
      let timeoutId: number | null = null;
      const finish = (played: boolean, error?: unknown) => {
        if (settled) return;
        settled = true;
        if (timeoutId) window.clearTimeout(timeoutId);
        if (!played) console.info("[rewarded-ad] Reward failed", { error });
        resolve(played);
      };
      timeoutId = window.setTimeout(() => {
        finish(false, "rewarded ad timeout or no inventory");
      }, REWARDED_AD_TIMEOUT_MS);

      try {
        adsbygoogle.push({
          params: {
            google_ad_client: GOOGLE_REWARDED_AD_CLIENT,
            google_ad_slot: GOOGLE_REWARDED_AD_SLOT,
            google_ad_format: "rewarded",
          },
          onAdLoaded: (rewardedAd) => {
            console.info("[rewarded-ad] Google Rewarded available");
            if (typeof rewardedAd?.show !== "function") {
              finish(false, "rewarded ad show unavailable");
              return;
            }
            try {
              rewardedAd.show();
            } catch (error) {
              finish(false, error);
            }
          },
          onRewarded: () => {
            rewarded = true;
            completeRewardedAd("google");
            finish(true);
          },
          onAdClosed: () => {
            if (!rewarded) finish(false, "rewarded ad closed before reward");
          },
          onAdFailedToLoad: (error) => {
            finish(false, error ?? "rewarded ad failed to load");
          },
        });
      } catch (error) {
        finish(false, error);
      }
    });
  }

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

  function handleModeChange(nextMode: (typeof modes)[number]["key"]) {
    setMode(nextMode);
    setStatus("idle");
    setCards([]);
    if (nextMode === "single_tarot") {
      setQuestion((current) => (current === selectedSpreadQuestion ? "" : current));
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

  return (
    <div className="cosmic-tool-panel relative mt-8 overflow-hidden rounded-[1.75rem] p-4 sm:p-7">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <span className="floating-star left-[7%] top-[8%]" />
        <span className="floating-star left-[88%] top-[20%] animation-delay-150" />
        <span className="floating-star left-[74%] top-[82%] animation-delay-300" />
      </div>

      <div className="relative z-10 grid gap-3 sm:grid-cols-2">
        {modes.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => handleModeChange(item.key)}
            className={`rounded-3xl border p-4 text-left transition ${
              mode === item.key ? "border-moon bg-moon text-midnight" : "border-white/12 bg-midnight/45 text-moon hover:bg-white/10"
            }`}
          >
            <span className="block text-lg font-semibold">{item.label}</span>
            <span className={`mt-1 block text-sm ${mode === item.key ? "text-midnight/70" : "text-moon/58"}`}>{item.description}</span>
          </button>
        ))}
      </div>

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
              topic === item ? "border-lavender bg-lavender text-midnight" : "border-white/12 bg-white/8 text-moon/76 hover:bg-white/12"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {mode === "three_card" ? (
        <div className="relative z-10 mt-6 rounded-3xl border border-lavender/18 bg-midnight/38 p-4">
          <p className="text-sm tracking-[0.22em] text-lavender/70">{currentSpreadGroup.title}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {currentSpreadGroup.questions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => selectSpreadQuestion(item)}
                className={`rounded-2xl border px-4 py-3 text-left text-base leading-6 transition ${
                  selectedSpreadQuestion === item ? "border-moon bg-moon text-midnight" : "border-white/12 bg-white/8 text-moon/78 hover:bg-white/12"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="relative z-10 mt-6">
        <p className="text-base font-medium text-moon">在心裡默想一個問題，或輸入你想問宇宙的事。</p>
        <p className="mt-1 text-sm text-moon/52">
          {isAdmin
            ? "管理員模式：無限制抽牌"
            : drawsRemaining === null
              ? "免費抽牌每日 1 次，觀看廣告可免費解鎖完整版一次。"
              : drawsRemaining === 0
                ? "今天的免費抽牌次數已用完，可使用 NT$49 再抽一次完整訊息。"
                : `今日剩餘抽牌次數：${drawsRemaining} 次`}
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
        placeholder="例如：他現在怎麼想？我該不該換工作？今天要注意什麼？"
      />

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
        {status === "drawing" ? "星光正在洗牌..." : isOutOfFreeDraws ? "NT$49 再抽一次" : "開始抽牌"}
      </button>

      {error ? (
        <div className="relative z-10 mt-4 rounded-2xl border border-lavender/30 bg-nebula/20 p-4 text-sm text-moon">
          <p>{error}</p>
          {!isAdmin && drawsRemaining === 0 ? (
            <p className="mt-2 text-moon/72">今日免費額度已用完，仍可使用 NT$49 再抽一次完整訊息。</p>
          ) : null}
        </div>
      ) : null}

      {status === "drawing" || status === "selecting" || status === "revealing" ? (
        <TarotRitualDraw
          stage={status}
          cardCount={cardCount}
          selectedIndex={selectedCardIndex}
          revealedCards={cards}
          topic={topic}
          onSelect={revealCards}
          onSkip={skipRitual}
        />
      ) : null}

      {status === "idle" || status === "revealed" ? (
        <div className="relative z-10 mt-8 grid grid-cols-1 items-start gap-8 md:grid-cols-2 xl:grid-cols-3">
          {status === "revealed" && cards.length
          ? cards.map((card, index) => (
              <article key={`${card.id}-${index}`} className="reading-fade-in tarot-card-shell mx-auto w-full max-w-[420px]">
                {card.position ? (
                  <p className="mb-3 rounded-full border border-moon/20 bg-midnight/54 px-4 py-2 text-center text-base font-medium text-moon shadow-glow">
                    第{index + 1}張：{card.position}
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
      ) : null}

      {canShowReadings ? (
        <section className="relative z-10 mt-9 space-y-5">
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
                  {storyDownloadStatus === "working" ? "正在產生圖片..." : "⬇ 下載限動圖片"}
                </button>
                {storyDownloadStatus === "done" ? (
                  <p className="text-sm text-moon/72">圖片已下載，可以發到 IG 限動囉 ✨</p>
                ) : null}
                {storyDownloadStatus === "error" ? (
                  <p className="text-sm text-[#ffb4b4]">{storyError || "圖片產生失敗，請稍後再試。"}</p>
                ) : null}
              </div>
            </div>
          ) : (
          <div className="cosmic-reading-card rounded-[1.75rem] border border-lavender/20 bg-midnight/58 p-5 shadow-glow sm:p-6">
            <p className="text-sm tracking-[0.22em] text-lavender/70">免費版・部分結果</p>
            <h3 className="mt-2 text-2xl font-semibold text-moon">宇宙給你的簡短訊息</h3>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/6 p-4">
              {readingStatus === "loading" ? <p className="text-base leading-8 text-moon/76">宇宙正在把牌義整理成你的深夜訊息...</p> : null}
              <div className="reading-fade-in space-y-4">
                <div>
                  <p className="text-sm tracking-[0.18em] text-lavender/70">抽到的牌</p>
                  <p className="mt-2 text-base leading-7 text-moon/84">
                    {cards.map((card) => `${card.position ? `${card.position}・` : ""}${card.name}（${card.orientationLabel}）`).join("、")}
                  </p>
                </div>
                {fullReading ? <ReadingSectionList text={fullReading} limit={3} /> : (
                  <>
                    <div>
                      <p className="text-sm tracking-[0.18em] text-lavender/70">簡短宇宙訊息</p>
                      <p className="mt-2 text-base leading-8 text-moon/84">{freeSummary.message}</p>
                    </div>
                    <p className="rounded-2xl border border-moon/15 bg-moon/8 p-3 text-base leading-7 text-moon">{freeSummary.reminder}</p>
                  </>
                )}
              </div>
            </div>
          </div>
          )}

          {!hasFullAccess ? (
            <div className="cosmic-reading-card rounded-[1.75rem] border border-[#d8bd70]/24 bg-midnight/58 p-5 text-center shadow-glow sm:p-6">
              <p className="text-sm tracking-[0.22em] text-[#d8bd70]/78">{shouldShowPaidPlan ? "Paid Tarot" : "Rewarded Ad"}</p>
              <h3 className="mt-2 text-2xl font-semibold text-moon">{shouldShowPaidPlan ? "NT$49 / 次完整抽牌" : "解鎖完整解讀"}</h3>
              <p className="mx-auto mt-3 max-w-xl text-base leading-8 text-moon/72">
                {shouldShowPaidPlan
                  ? "今日免費抽牌與廣告解鎖已使用完畢。可用 NT$49 再抽一次，直接查看完整內容並傳送到 LINE。"
                  : "完整版會顯示接下來可以怎麼做、溫柔提醒、7日能量提示與一句專屬祝福。"}
              </p>
              <button
                type="button"
                onClick={shouldShowPaidPlan ? openPaidDrawModal : startAdUnlock}
                className="mt-5 w-full rounded-full bg-[#d8bd70] px-6 py-4 text-base font-semibold text-midnight shadow-[0_0_28px_rgba(216,189,112,0.28)] transition hover:bg-moon active:scale-95 sm:w-auto sm:min-w-[280px]"
              >
                {shouldShowPaidPlan ? "NT$49 再抽一次" : "觀看廣告解鎖"}
              </button>
              {adNotice ? <p className="mt-4 text-sm leading-6 text-lavender/82">{adNotice}</p> : null}
            </div>
          ) : (
            <div className="cosmic-reading-card rounded-[1.75rem] border border-lavender/20 bg-midnight/58 p-5 shadow-glow sm:p-6">
              <p className="text-sm tracking-[0.22em] text-lavender/70">完整版・已解鎖</p>
              <h3 className="mt-2 text-2xl font-semibold text-moon">完整宇宙訊息</h3>
              <div className="mt-5">
                <ReadingSectionList text={fullReading} />
              </div>
            </div>
          )}

        </section>
      ) : null}

      {adModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
          <div className="cosmic-reading-card w-full max-w-md rounded-[1.75rem] border border-lavender/24 bg-midnight p-6 text-center shadow-glow">
            <div className="cosmic-loader mx-auto" />
            <h3 className="mt-5 text-2xl font-semibold text-moon">宇宙能量正在凝聚中 ✨</h3>
            <p className="mt-3 text-base leading-7 text-moon/72">模擬廣告播放中，倒數完成後會自動解鎖完整版。</p>
            <p className="mt-5 text-5xl font-semibold text-[#d8bd70]">{adCountdown}</p>
          </div>
        </div>
      ) : null}

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
                {paymentStatus === "processing" ? "付款確認中..." : paymentStatus === "success" ? "付款成功 ✓" : "NT$49 再抽一次"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

