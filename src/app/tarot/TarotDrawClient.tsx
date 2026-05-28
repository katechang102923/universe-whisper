"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TarotCardBack, TarotCardFace, type TarotCardFaceData } from "@/components/TarotCardFace";
import { TarotRitualDraw } from "./TarotRitualDraw";

type DrawStatus = "idle" | "drawing" | "selecting" | "revealing" | "revealed";
type ReadingStatus = "idle" | "loading" | "done" | "error";
type ReadingTopic = "love" | "career" | "general";
type SpreadPosition = "past" | "present" | "future";

const AD_COUNTDOWN_SECONDS = 5;
const ANON_ID_STORAGE_KEY = "cosmic_anon_id";
const AD_UNLOCK_STORAGE_KEY = "cosmic_ad_unlock_date";
const REWARDED_AD_TIMEOUT_MS = 3500;
const GOOGLE_REWARDED_AD_CLIENT = process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_CLIENT;
const GOOGLE_REWARDED_AD_SLOT = process.env.NEXT_PUBLIC_GOOGLE_REWARDED_AD_SLOT;
const LINE_ADD_FRIEND_URL = process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL ?? "https://line.me/R/ti/p/@453gfmok";
if (typeof window !== "undefined" && !process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL) {
  console.warn("[LINE] NEXT_PUBLIC_LINE_ADD_FRIEND_URL is not defined, using fallback URL");
}

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
  const blocks = parseReadingSections(text)
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

function ReadingSectionList({ text, limit }: { text: string; limit?: number }) {
  const sections = parseReadingSections(text);
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
  const sections = parseReadingSections(fullReading).slice(0, 3);
  const firstLines = sections.map((section) => section.body).join(" ");
  const fallback = cards.map((card) => card.cosmicMessage).join(" ");
  const source = firstLines || fallback || "宇宙提醒你，把注意力收回自己身上，答案會慢慢變清楚。";

  return {
    message: source.length > 96 ? `${source.slice(0, 96)}...` : source,
    reminder: "提醒：先不要急著做最後決定，今天只需要看見真正的感受。",
  };
}

export function TarotDrawClient() {
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
  const [adModalOpen, setAdModalOpen] = useState(false);
  const [adCountdown, setAdCountdown] = useState(AD_COUNTDOWN_SECONDS);
  const [adNotice, setAdNotice] = useState("");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "processing" | "success">("idle");
  const [lineDeliveryStatus, setLineDeliveryStatus] = useState<"idle" | "sending" | "softPause">("idle");
  const [lineDeliveryMessage, setLineDeliveryMessage] = useState("");
  const [lineResultId, setLineResultId] = useState("");
  const adTimerRef = useRef<number | null>(null);
  const paymentTimerRef = useRef<number | null>(null);

  const cardCount = mode === "three_card" ? 3 : 1;
  const visibleBacks = useMemo(() => Array.from({ length: cardCount }), [cardCount]);
  const canShowReadings = status === "revealed" && cards.length > 0;
  const currentSpreadGroup = spreadQuestionGroups[topic];
  const freeSummary = useMemo(() => buildFreeSummary(cards, fullReading), [cards, fullReading]);

  useEffect(() => {
    return () => {
      if (adTimerRef.current) clearInterval(adTimerRef.current);
      if (paymentTimerRef.current) clearTimeout(paymentTimerRef.current);
    };
  }, []);

  // Detect return from LINE Login and auto-send saved payload
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const lineLogin = params.get("lineLogin");
    if (!lineLogin) return;

    window.history.replaceState({}, "", window.location.pathname);

    if (lineLogin === "failed") {
      setLineDeliveryMessage("LINE 登入失敗，請稍後再試。");
      return;
    }

    if (lineLogin !== "success") return;

    let savedPayload: Record<string, unknown> | null = null;
    try {
      const raw = sessionStorage.getItem("line-pending-send-payload");
      if (raw) {
        savedPayload = JSON.parse(raw) as Record<string, unknown>;
        sessionStorage.removeItem("line-pending-send-payload");
      }
    } catch { /* ignore */ }

    if (!savedPayload) {
      setLineDeliveryMessage("LINE 登入成功！請再點一次「傳送到 LINE」。");
      return;
    }

    setLineDeliveryStatus("sending");
    void fetch("/api/line/send-tarot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(savedPayload),
    })
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (d.ok) {
          setLineDeliveryStatus("idle");
          setLineDeliveryMessage("已傳送到 LINE，請回到 LINE 查看宇宙訊息 ✨");
        } else {
          setLineDeliveryStatus("softPause");
          setLineDeliveryMessage(d.error || "LINE 傳送失敗，請稍後再試。");
        }
      })
      .catch(() => {
        setLineDeliveryStatus("softPause");
        setLineDeliveryMessage("LINE 傳送暫時失敗，請稍後再試。");
      });
  }, []);

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
    setAdUnlocked(false);
    setAdModalOpen(false);
    setAdCountdown(AD_COUNTDOWN_SECONDS);
    setAdNotice("");
    setPaymentModalOpen(false);
    setPaymentStatus("idle");
    setLineDeliveryStatus("idle");
    setLineDeliveryMessage("");
    setLineResultId("");
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
    };
  }

  async function requestFullReading(targetCards: TarotCardFaceData[]) {
    setReadingStatus("loading");
    setFullReading("");

    const response = await fetch("/api/tarot-reading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildReadingPayload(targetCards)),
    });
    const data = (await response.json().catch(() => ({}))) as { reading?: string; error?: string };

    if (response.status === 429) {
      throw new Error(data.error || "宇宙訊息正在排隊中，請稍後再試");
    }

    if (!response.ok || !data.reading) {
      throw new Error(data.error || "宇宙訊號有點微弱，請稍後再試一次。");
    }

    setFullReading(data.reading);
    setReadingStatus("done");
  }

  async function draw() {
    if (status === "drawing" || readingStatus === "loading") return;

    setStatus("drawing");
    setCards([]);
    resetReading();

    try {
      const response = await fetch("/api/tarot/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, topic, question }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "抽牌失敗，請稍後再試。");
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
      setAdNotice("今日免費廣告解鎖已使用完畢 ✨");
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
    setAdUnlocked(true);
    setAdModalOpen(false);
    setAdNotice("");
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

  async function createLineResult() {
    if (lineResultId) return lineResultId;

    const response = await fetch("/api/results/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "tarot",
        question,
        cards,
        shortText: freeSummary.message,
        fullText: fullReading,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; resultId?: string; error?: string };

    if (!response.ok || !data.ok || !data.resultId) {
      throw new Error(data.error || "暫時無法建立 LINE 保存內容。");
    }

    setLineResultId(data.resultId);
    return data.resultId;
  }

  async function sendLineResult() {
    if (!cards.length || lineDeliveryStatus === "sending") return;

    const payload = {
      cards,
      topic: toReadingTopic(topic),
      question: question.trim() || undefined,
      freeReading: freeSummary.message,
      // Use fullReading when available; fall back to freeSummary so 429 never blocks this
      premiumReading: fullReading || freeSummary.message,
    };

    try {
      setLineDeliveryStatus("sending");
      setLineDeliveryMessage("");

      const response = await fetch("/api/line/send-tarot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        loginRequired?: boolean;
        error?: string;
      };

      if (response.status === 401 || data.loginRequired) {
        // Save the payload so we can auto-send after login redirect returns
        try {
          sessionStorage.setItem("line-pending-send-payload", JSON.stringify(payload));
        } catch { /* ignore */ }
        setLineDeliveryStatus("idle");
        window.location.href = `/api/line/login/start?returnTo=${encodeURIComponent("/tarot")}`;
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "LINE 傳送失敗，請稍後再試。");
      }

      setLineDeliveryStatus("idle");
      setLineDeliveryMessage("已傳送到 LINE，請回到 LINE 查看宇宙訊息 ✨");
      try { sessionStorage.removeItem("line-pending-send-payload"); } catch { /* ignore */ }
    } catch (err) {
      setLineDeliveryStatus("softPause");
      setLineDeliveryMessage(err instanceof Error ? err.message : "LINE 傳送暫時失敗，請稍後再試。");
    }
  }

  function openPaymentModal() {
    if (!adUnlocked) {
      setLineDeliveryStatus("softPause");
      setLineDeliveryMessage("請先觀看廣告解鎖完整版，再選擇是否傳送到 LINE 永久保存。");
      return;
    }
    setPaymentStatus("idle");
    setPaymentModalOpen(true);
  }

  function simulatePayment() {
    if (paymentStatus === "processing") return;
    setPaymentStatus("processing");
    paymentTimerRef.current = window.setTimeout(() => {
      setPaymentStatus("success");
      void sendPaidLineResult();
    }, 1000);
  }

  async function sendPaidLineResult() {
    if (!cards.length || !fullReading || lineDeliveryStatus === "sending") return;

    try {
      setLineDeliveryStatus("sending");
      setLineDeliveryMessage("付款成功，正在準備 LINE 永久保存...");
      const resultId = await createLineResult();
      window.location.href = `/line/connect?resultId=${encodeURIComponent(resultId)}`;
    } catch (err) {
      setPaymentModalOpen(false);
      setLineDeliveryStatus("softPause");
      const message = err instanceof Error ? err.message : "LINE 保存流程暫時失敗。";
      setLineDeliveryMessage(message);
    }
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
        <p className="mt-1 text-sm text-moon/52">免費抽牌每日 1 次，觀看廣告可免費解鎖完整版一次。</p>
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
        onClick={draw}
        disabled={status === "drawing" || status === "selecting" || status === "revealing" || readingStatus === "loading"}
        className="relative z-10 mt-5 w-full rounded-full bg-moon px-6 py-3 font-medium text-midnight shadow-[0_0_24px_rgba(247,241,223,0.28)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {status === "drawing" ? "星光正在洗牌..." : "開始抽牌"}
      </button>

      {error ? <p className="relative z-10 mt-4 rounded-2xl border border-lavender/30 bg-nebula/20 p-4 text-sm text-moon">{error}</p> : null}

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

          {!adUnlocked ? (
            <div className="cosmic-reading-card rounded-[1.75rem] border border-[#d8bd70]/24 bg-midnight/58 p-5 text-center shadow-glow sm:p-6">
              <p className="text-sm tracking-[0.22em] text-[#d8bd70]/78">Rewarded Ad</p>
              <h3 className="mt-2 text-2xl font-semibold text-moon">解鎖完整解讀</h3>
              <p className="mx-auto mt-3 max-w-xl text-base leading-8 text-moon/72">
                完整版會顯示接下來可以怎麼做、溫柔提醒、7日能量提示與一句專屬祝福。
              </p>
              <button
                type="button"
                onClick={startAdUnlock}
                className="mt-5 w-full rounded-full bg-[#d8bd70] px-6 py-4 text-base font-semibold text-midnight shadow-[0_0_28px_rgba(216,189,112,0.28)] transition hover:bg-moon active:scale-95 sm:w-auto sm:min-w-[280px]"
              >
                觀看廣告解鎖完整版
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

          <div
            className="cosmic-reading-card rounded-[1.75rem] border p-5 text-center shadow-glow sm:p-6"
            style={{
              borderColor: "rgba(6, 199, 85, 0.24)",
              background: "linear-gradient(135deg, rgba(10,16,40,0.82) 0%, rgba(10,28,20,0.88) 100%)",
              boxShadow: "0 0 48px rgba(6, 199, 85, 0.12)",
            }}
          >
            <p className="text-sm tracking-[0.22em]" style={{ color: "rgba(6, 199, 85, 0.82)" }}>LINE 傳送</p>
            <h3 className="mt-2 text-2xl font-semibold text-moon">傳送到 LINE 接收完整宇宙訊息</h3>
            <p className="mx-auto mt-3 max-w-xl text-base leading-8 text-moon/72">
              把本次塔羅抽牌結果傳送到你的 LINE，隨時回顧宇宙訊息。
            </p>
            <button
              type="button"
              onClick={sendLineResult}
              disabled={lineDeliveryStatus === "sending"}
              className="pointer-events-auto relative z-10 mt-5 w-full touch-manipulation rounded-full px-6 py-4 text-base font-semibold text-white transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[280px]"
              style={{ background: "#06C755", boxShadow: "0 0 34px rgba(6,199,85,0.34)" }}
            >
              {lineDeliveryStatus === "sending" ? "正在傳送到 LINE..." : "傳送到 LINE 接收完整宇宙訊息"}
            </button>
            {lineDeliveryMessage ? <p className="mt-4 text-sm leading-6 text-moon/70">{lineDeliveryMessage}</p> : null}
          </div>
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
            <h3 className="mt-3 text-2xl font-semibold text-moon">LINE 永久保存</h3>
            <p className="mt-3 text-base leading-7 text-moon/72">先使用模擬付款流程，之後可串接綠界正式金流。</p>
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/6 p-4">
              <p className="text-sm text-moon/58">保存費用</p>
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
                {paymentStatus === "processing" ? "付款確認中..." : paymentStatus === "success" ? "付款成功" : "模擬付款成功"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
