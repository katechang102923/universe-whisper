"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ShareStoryCard } from "@/components/ShareStoryCard";
import { TarotCardBack, TarotCardFace, type TarotCardFaceData } from "@/components/TarotCardFace";
import { TarotShuffleAnimation } from "./TarotShuffleAnimation";
import { useAuth } from "@/contexts/AuthContext";

type DrawStatus = "idle" | "drawing" | "selecting" | "revealing" | "revealed";
type ReadingStatus = "idle" | "loading" | "done" | "error";
type ReadingTopic = "love" | "career" | "general";
type SpreadPosition = "past" | "present" | "future";

const ANON_ID_STORAGE_KEY = "cosmic_anon_id";
const FB_SHARE_UNLOCK_STORAGE_KEY = "cosmic_fb_unlock_date";
const LINE_CONNECT_MESSAGE_KEY = "line-connect-message-payload";
const LINE_ADD_FRIEND_URL =
  process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL ?? "https://line.me/R/ti/p/@453gfmok";

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

const READING_SECTION_TITLES = [
  "宇宙偷偷話",
  "這張牌正在說什麼",
  "你現在的狀態",
  "接下來可以怎麼做",
  "給你的溫柔提醒",
  "7日能量提示",
  "一句專屬祝福",
];

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

    const title = READING_SECTION_TITLES.find(
      (item) => line === item || line.startsWith(`${item} `),
    );

    if (title) {
      pushCurrent();
      current = { title, body: line.slice(title.length).trim() };
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

function buildFreeSummary(cards: TarotCardFaceData[], fullReading: string) {
  const sections = fullReading.trim()
    ? parseReadingSectionsForDisplay(fullReading).slice(0, 3)
    : [];
  const firstLines = sections.map((s) => s.body).join(" ");
  const fallback = cards.map((c) => c.cosmicMessage).join(" ");
  const source =
    firstLines || fallback || "宇宙正在整理這次抽牌的核心訊息。";

  return {
    message: source.length > 96 ? `${source.slice(0, 96)}...` : source,
    reminder: "完整解讀請回網站分享 Facebook 解鎖。",
  };
}

function buildStoryCopy(
  card: TarotCardFaceData | undefined,
  fullReading: string,
  freeSummary: { message: string; reminder: string },
) {
  const sections = fullReading.trim() ? parseReadingSectionsForDisplay(fullReading) : [];
  const resultText =
    sections[0]?.body || card?.cosmicMessage || freeSummary.message || READING_FALLBACK_TEXT;
  const adviceText =
    sections[1]?.body ||
    sections[2]?.body ||
    freeSummary.reminder ||
    "請回到心裡最安靜的位置，慢慢看見答案。";

  return {
    resultText: resultText.length > 118 ? `${resultText.slice(0, 116)}...` : resultText,
    adviceText: adviceText.length > 82 ? `${adviceText.slice(0, 80)}...` : adviceText,
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
  // LINE delivery state
  const [lineDeliveryStatus, setLineDeliveryStatus] = useState<
    "idle" | "creating" | "done" | "error"
  >("idle");
  const [lineDeliveryMessage, setLineDeliveryMessage] = useState("");
  const [lineResultId, setLineResultId] = useState("");
  // Misc state
  const [drawsRemaining, setDrawsRemaining] = useState<number | null>(null);
  const [storyDownloadStatus, setStoryDownloadStatus] = useState<
    "idle" | "working" | "done" | "error"
  >("idle");
  const [storyError, setStoryError] = useState("");

  const paymentTimerRef = useRef<number | null>(null);
  const storyCardRef = useRef<HTMLDivElement | null>(null);

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
    () => buildStoryCopy(storyCard, fullReading, freeSummary),
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

      // ── PERF note: 3200 ms fixed animation delay before "selecting" shows ──
      console.log("[perf] A2: waiting 3200 ms shuffle animation…");
      window.setTimeout(() => {
        console.log("[perf] A2: shuffle done → selecting stage");
        setPendingCards(data.cards ?? []);
        setStatus("selecting");
      }, 3200);
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

  function buildLineMessage() {
    const questionText = question.trim() || "你把問題放在心裡，宇宙也有聽見。";
    const readingText = hasFullAccess
      ? fullReading
      : freeSummary.message + "\n\n提醒：完整解讀請回網站分享 Facebook 解鎖。";
    const title = hasFullAccess
      ? "宇宙偷偷話｜本次完整解讀"
      : "宇宙偷偷話｜本次部分解讀";
    const readingLabel = hasFullAccess ? "完整解讀" : "部分解讀";

    return [
      title,
      "",
      "你的問題：",
      questionText,
      "",
      "你抽到的牌：",
      buildLineCardText() || "本次牌面已為你收好。",
      "",
      readingLabel + "：",
      readingText.trim() || freeSummary.message,
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
        placeholder="例如：他現在怎麼想？我該不該換工作？今天宇宙想提醒我什麼？"
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

      {/* ?? Card display ?? */}
      {status === "idle" || status === "revealed" ? (
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
                <div
                  key={`back-${index}`}
                  className="tarot-card-shell mx-auto w-full max-w-[420px]"
                >
                  <TarotCardBack />
                </div>
              ))}
        </div>
      ) : null}

      {/* ????????????????????????????????????????????????????????????????????
          Reading area ??only shown after cards are revealed
          ???????????????????????????????????????????????????????????????????? */}
      {canShowReadings ? (
        <section className="relative z-10 mt-9 space-y-5">

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

          {/* ?? 2a. Partial reading ??shown ONLY when locked (3-card) ?? */}
          {!isSingleResult && !hasFullAccess ? (
            <div className="cosmic-reading-card rounded-[1.75rem] border border-lavender/20 bg-midnight/58 p-5 shadow-glow sm:p-6">
              <p className="text-sm tracking-[0.22em] text-lavender/70">部分解讀</p>
              <h3 className="mt-2 text-2xl font-semibold text-moon">宇宙給你的簡短訊息</h3>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/6 p-4">
                {readingStatus === "loading" ? (
                  <p className="text-base leading-8 text-moon/76">
                    宇宙正在把牌義整理成你的訊息...
                  </p>
                ) : null}
                <div className="reading-fade-in space-y-4">
                  <div>
                    <p className="text-sm tracking-[0.18em] text-lavender/70">抽到的牌</p>
                    <p className="mt-2 text-base leading-7 text-moon/84">
                      {cards
                        .map(
                          (card) =>
                            `${card.position ? `${card.position}｜` : ""}${card.name}（${card.orientationLabel}）`,
                        )
                        .join("、")}
                    </p>
                  </div>
                  {fullReading ? (
                    <ReadingSectionList text={fullReading} limit={3} />
                  ) : (
                    <>
                      <div>
                        <p className="text-sm tracking-[0.18em] text-lavender/70">
                          簡短宇宙訊息
                        </p>
                        <p className="mt-2 text-base leading-8 text-moon/84">
                          {freeSummary.message}
                        </p>
                      </div>
                      <p className="rounded-2xl border border-moon/15 bg-moon/8 p-3 text-base leading-7 text-moon">
                        {freeSummary.reminder}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {/* ?? 2b. Single-card partial reading ??shown ONLY when locked ?? */}
          {isSingleResult && !hasFullAccess && fullReading ? (
            <div className="cosmic-reading-card rounded-[1.75rem] border border-lavender/20 bg-midnight/58 p-5 shadow-glow sm:p-6">
              <p className="text-sm tracking-[0.22em] text-lavender/70">部分解讀</p>
              <ReadingSectionList text={fullReading} limit={3} />
            </div>
          ) : null}

          {/* ?? 3. Unlock / action section (when NOT fully unlocked) ?? */}
          {!hasFullAccess ? (
            <div className="cosmic-reading-card rounded-[1.75rem] border border-[#d8bd70]/24 bg-midnight/58 p-5 shadow-glow sm:p-6">

              {/* ?? Section A: FB unlock ??ALWAYS shown ?? */}
              <p className="text-sm tracking-[0.22em] text-[#d8bd70]/78">分享解鎖</p>
              <h3 className="mt-2 text-2xl font-semibold text-moon">解鎖完整解讀</h3>
              <p className="mx-auto mt-3 max-w-xl text-base leading-8 text-moon/72">
                分享到 Facebook 後，就能解鎖本次完整解讀內容。
              </p>

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
                    分享到 Facebook 解鎖完整版
                  </button>
                )}
              </div>

              {/* ?? Section B: LINE ??ALWAYS shown ?? */}
              <div className="mt-5 border-t border-white/10 pt-5">
                <p className="mb-3 text-sm text-moon/50">把本次結果傳送到 LINE 官方帳號聊天室。</p>
                <button
                  type="button"
                  disabled={
                    lineDeliveryStatus === "creating" || readingStatus === "loading"
                  }
                  onClick={() => void openLineConnect()}
                  className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(6,199,85,0.28)] transition hover:opacity-90 active:scale-95 disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:min-w-[220px]"
                  style={{ background: "#06C755" }}
                >
                  {lineDeliveryStatus === "creating"
                    ? "正在準備 LINE..."
                    : "LINE 看我的結果"}
                </button>
                {lineDeliveryStatus === "error" && lineDeliveryMessage ? (
                  <p className="mt-2 text-sm text-[#ffb4b4]">{lineDeliveryMessage}</p>
                ) : null}
              </div>

              {/* ?? Section C: NT$49 ??ADDITIONAL, shown only when free draws + FB unlock both exhausted ?? */}
              {shouldShowPaidPlan ? (
                <div className="mt-5 border-t border-white/10 pt-5">
                  <p className="text-sm tracking-[0.22em] text-moon/50">付費完整解讀</p>
                  <p className="mt-2 text-base leading-7 text-moon/72">
                    今日免費抽牌與 Facebook 解鎖已使用完畢。可使用 NT$49 再抽一次，直接查看完整內容。
                  </p>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={openPaidDrawModal}
                      className="w-full rounded-full border border-[#d8bd70]/40 px-6 py-3 text-sm font-semibold text-[#d8bd70] transition hover:border-[#d8bd70]/70 hover:bg-white/6 active:scale-95 sm:w-auto sm:min-w-[220px]"
                    >
                      NT$49 再抽一次
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            /* ?? 4. Full reading (when unlocked) ??no duplicate free section above ?? */
            <div className="cosmic-reading-card rounded-[1.75rem] border border-lavender/20 bg-midnight/58 p-5 shadow-glow sm:p-6">
              <p className="text-sm tracking-[0.22em] text-lavender/70">完整解讀</p>
              <h3 className="mt-2 text-2xl font-semibold text-moon">完整宇宙訊息</h3>
              <div className="mt-5">
                {readingStatus === "loading" ? (
                  /* Preview: show freeSummary while AI reading is in-flight.
                     Replaces the old blank "宇宙正在整理…" spinner so the user
                     sees meaningful content immediately.  ReadingSectionList
                     below renders empty until fullReading is populated. */
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
                <ReadingSectionList text={fullReading} />
              </div>

              {/* LINE action button inside full reading */}
              <div className="mt-6 border-t border-white/10 pt-5">
                <p className="mb-3 text-sm text-moon/50">把本次完整結果傳送到 LINE 官方帳號聊天室。</p>
                <button
                  type="button"
                  disabled={
                    lineDeliveryStatus === "creating" || readingStatus === "loading"
                  }
                  onClick={() => void openLineConnect()}
                  className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(6,199,85,0.28)] transition hover:opacity-90 active:scale-95 disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:min-w-[220px]"
                  style={{ background: "#06C755" }}
                >
                  {lineDeliveryStatus === "creating"
                    ? "正在準備 LINE..."
                    : lineDeliveryStatus === "done"
                      ? "已傳送"
                      : "傳送到 LINE"}
                </button>
                {lineDeliveryStatus === "error" && lineDeliveryMessage ? (
                  <p className="mt-2 text-sm text-[#ffb4b4]">{lineDeliveryMessage}</p>
                ) : null}
              </div>
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
