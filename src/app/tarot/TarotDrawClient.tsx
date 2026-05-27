"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TarotCardBack, TarotCardFace, type TarotCardFaceData } from "@/components/TarotCardFace";

type DrawStatus = "idle" | "drawing" | "revealed";
type FreeReadingStatus = "idle" | "loading" | "done" | "error";
type AdReadingStatus = "idle" | "watching" | "loading" | "done" | "error";
type ReadingTopic = "love" | "career" | "ambiguous" | "general";
type SpreadPosition = "past" | "present" | "future";

const AD_COUNTDOWN_SECONDS = 15;
/** 每個瀏覽器的匿名識別碼，用於伺服器端限流 */
const ANON_ID_STORAGE_KEY = "cosmic_anon_id";

const modes = [
  { key: "single_tarot", label: "單張牌", description: "接收此刻最靠近你的訊息" },
  { key: "three_card", label: "三張牌", description: "過去、現在、未來的溫柔流動" }
] as const;

const topics = ["愛情", "工作", "生活"] as const;
type TarotTopicOption = (typeof topics)[number];

const spreadQuestionGroups = {
  愛情: {
    title: "愛情專屬牌陣",
    questions: ["這段關係接下來會怎樣", "他有喜歡我嗎", "我們之間還有機會嗎", "前任還會回來嗎", "這段關係最該看清什麼"]
  },
  工作: {
    title: "工作專屬牌陣",
    questions: ["我現在的工作適合我嗎", "接下來的職涯方向如何", "我該轉職嗎", "合作或金錢壓力該怎麼看", "這個機會值得把握嗎"]
  },
  生活: {
    title: "生活專屬牌陣",
    questions: ["我現在的感受想提醒我什麼", "這個選擇該往哪裡走", "家庭或人際關係該怎麼面對", "我最近最需要照顧的是什麼", "我該怎麼找回自己的狀態"]
  }
} satisfies Record<TarotTopicOption, { title: string; questions: readonly string[] }>;

function toReadingTopic(topic: TarotTopicOption): ReadingTopic {
  if (topic === "工作") return "career";
  if (topic === "生活") return "general";
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

/** 取得（或初次建立）該瀏覽器的匿名識別碼，存入 localStorage 長期保存 */
function getOrCreateAnonId(): string {
  try {
    const existing = window.localStorage.getItem(ANON_ID_STORAGE_KEY);
    if (existing && existing.length > 0) return existing;
    const newId = crypto.randomUUID();
    window.localStorage.setItem(ANON_ID_STORAGE_KEY, newId);
    return newId;
  } catch {
    return "anonymous";
  }
}

const headingFallbacks: Record<string, string> = {
  宇宙給你的簡短訊息: "✨ 宇宙訊息",
  宇宙完整訊息: "✨ 宇宙訊息",
  情緒分析: "🌙 情緒狀態",
  關係分析: "💞 關係提醒",
  七日走向: "🕯️ 七日走向",
  深夜訊息: "🐾 深夜悄悄話",
  "宇宙深夜訊息 Plus": "✨ 宇宙訊息",
  目前狀況: "🌙 目前狀態",
  一個可能原因: "💞 宇宙提醒",
  接下來建議: "🕯️ 接下來可以做的事",
  溫暖收尾: "☁️ 溫暖收尾",
  "這段關係目前真實的樣子": "💞 關係提醒",
  這段曖昧目前的真實狀態: "💞 曖昧訊息",
  工作目前真實的處境: "💼 工作訊息",
  過去: "🌒 過去",
  現在: "🌕 現在",
  未來: "🌘 未來",
  "過去 / 現在 / 未來整合解讀": "🕯️ 牌陣流動",
  "接下來 7 天完整走向": "🕯️ 七日走向",
  "接下來 7 天能量完整走向": "🕯️ 七日走向",
  "接下來 7 天互動完整走向": "🕯️ 七日走向",
  你最需要聽見的一件事: "🐾 深夜悄悄話",
  今晚陪你的話: "☁️ 溫暖收尾"
};

function isReadingHeading(line: string) {
  if (headingFallbacks[line]) return true;
  return /^(✨|🌙|💞|🕯️|🐾|☁️|💼|🌒|🌕|🌘)\s/.test(line);
}

function parseReadingSections(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\*\*/g, ""))
    .filter(Boolean);

  const sections: { title: string; body: string[] }[] = [];
  let current: { title: string; body: string[] } | null = null;

  for (const line of lines) {
    if (isReadingHeading(line)) {
      current = { title: headingFallbacks[line] ?? line, body: [] };
      sections.push(current);
      continue;
    }

    if (!current) {
      current = { title: "✨ 宇宙訊息", body: [] };
      sections.push(current);
    }

    current.body.push(line);
  }

  return sections.length ? sections : [{ title: "✨ 宇宙訊息", body: [text] }];
}

function ReadingContent({ text, compact = false }: { text: string; compact?: boolean }) {
  const sections = parseReadingSections(text);

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {sections.map((section, index) => (
        <article
          key={`${section.title}-${index}`}
          className="rounded-2xl border border-white/10 bg-white/[0.055] p-4 shadow-[0_18px_54px_rgba(8,10,35,0.22)] sm:p-5"
        >
          <h4 className="text-base font-semibold tracking-wide text-moon sm:text-lg">{section.title}</h4>
          <div className="mt-3 space-y-3 text-left text-[0.98rem] leading-8 text-moon/82 sm:text-base sm:leading-8">
            {section.body.map((paragraph, paragraphIndex) => (
              <p key={`${section.title}-${paragraphIndex}`}>{paragraph}</p>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

export function TarotDrawClient() {
  const [mode, setMode] = useState<(typeof modes)[number]["key"]>("single_tarot");
  const [topic, setTopic] = useState<TarotTopicOption>("愛情");
  const [question, setQuestion] = useState("");
  const [selectedSpreadQuestion, setSelectedSpreadQuestion] = useState("");
  const [cards, setCards] = useState<TarotCardFaceData[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<DrawStatus>("idle");

  // 免費版
  const [freeReadingStatus, setFreeReadingStatus] = useState<FreeReadingStatus>("idle");
  const [freeReading, setFreeReading] = useState("");
  const [freeReadingNotice, setFreeReadingNotice] = useState("");

  // 廣告解鎖版
  const [adReadingStatus, setAdReadingStatus] = useState<AdReadingStatus>("idle");
  const [adReading, setAdReading] = useState("");
  const [adCountdown, setAdCountdown] = useState(AD_COUNTDOWN_SECONDS);
  const [adCopied, setAdCopied] = useState(false);
  const adTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // LINE
  const [lineDeliveryStatus, setLineDeliveryStatus] = useState<"idle" | "sending" | "done" | "softPause">("idle");
  const [lineDeliveryMessage, setLineDeliveryMessage] = useState("");
  const [lineResultId, setLineResultId] = useState("");

  const cardCount = mode === "three_card" ? 3 : 1;
  const visibleBacks = useMemo(() => Array.from({ length: cardCount }), [cardCount]);
  const canShowReadings = status === "revealed" && cards.length > 0;
  const currentSpreadGroup = spreadQuestionGroups[topic];

  useEffect(() => {
    return () => {
      if (adTimerRef.current) clearInterval(adTimerRef.current);
    };
  }, []);

  function resetReading() {
    if (adTimerRef.current) {
      clearInterval(adTimerRef.current);
      adTimerRef.current = null;
    }
    setFreeReadingStatus("idle");
    setFreeReading("");
    setFreeReadingNotice("");
    setAdReadingStatus("idle");
    setAdReading("");
    setAdCountdown(AD_COUNTDOWN_SECONDS);
    setAdCopied(false);
    setLineDeliveryStatus("idle");
    setLineDeliveryMessage("");
    setLineResultId("");
  }

  function buildReadingPayload(
    targetCards: TarotCardFaceData[],
    readingMode: "free" | "ad" | "premium",
    payloadTopic = topic,
    payloadQuestion = question
  ) {
    const meaningTopic = toMeaningTopic(payloadTopic);

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
            ? card.reversedKeywords ?? card.keywords
            : card.uprightKeywords ?? card.keywords,
        baseMeaning: card.orientation === "reversed" ? card.reversedMeaning : card.uprightMeaning,
        topicMeaning: card.meanings?.[meaningTopic]?.[card.orientation],
        meaning: card.cosmicMessage
      })),
      topic: toReadingTopic(payloadTopic),
      readingMode,
      question: payloadQuestion.trim() || undefined,
      // 匿名識別碼，供伺服器端限流使用
      anonymousId: getOrCreateAnonId()
    };
  }

  async function requestFreeReading(targetCards: TarotCardFaceData[]) {
    if (!targetCards.length) return;
    setFreeReadingStatus("loading");
    setFreeReading("");

    try {
      const response = await fetch("/api/tarot-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildReadingPayload(targetCards, "free"))
      });
      const data = await response.json();

      if (response.status === 429) {
        setFreeReadingNotice(
          data.error ?? "今天的免費宇宙訊息已用完，加入 LINE 可獲得每日 3 次免費訊息。"
        );
        setFreeReadingStatus("error");
        return;
      }
      if (!response.ok) {
        setFreeReadingNotice(data.error ?? "宇宙訊號有點微弱，請稍後再試一次。");
        setFreeReadingStatus("error");
        return;
      }

      setFreeReading(data.reading ?? "");
      setFreeReadingStatus("done");
    } catch {
      setFreeReadingStatus("error");
    }
  }

  async function draw() {
    if (status === "drawing") return;

    setStatus("drawing");
    setError("");
    setCards([]);
    resetReading();

    try {
      const response = await fetch("/api/tarot/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, topic, question })
      });
      const data = await response.json();

      if (!response.ok) {
        setStatus("idle");
        setError(data.error ?? "宇宙訊號有點微弱，請稍後再試。");
        return;
      }

      window.setTimeout(() => {
        const revealedCards = data.cards ?? [];
        setCards(revealedCards);
        setStatus("revealed");
        void requestFreeReading(revealedCards);
      }, 1500);
    } catch {
      setStatus("idle");
      setError("宇宙訊號有點微弱，請確認網路後再試。");
    }
  }

  // ── 廣告解鎖 ────────────────────────────────────────────────────────────

  function watchAdAndUnlock() {
    if (adReadingStatus !== "idle" || !cards.length) return;

    setAdReadingStatus("watching");
    setAdCountdown(AD_COUNTDOWN_SECONDS);

    const capturedCards = cards;
    const capturedTopic = topic;
    const capturedQuestion = question;
    let remaining = AD_COUNTDOWN_SECONDS;

    adTimerRef.current = setInterval(() => {
      remaining -= 1;
      setAdCountdown(remaining);

      if (remaining <= 0) {
        if (adTimerRef.current) {
          clearInterval(adTimerRef.current);
          adTimerRef.current = null;
        }

        setAdReadingStatus("loading");

        fetch("/api/tarot-reading", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildReadingPayload(capturedCards, "ad", capturedTopic, capturedQuestion))
        })
          .then((r) => r.json())
          .then((data: { reading?: string }) => {
            setAdReading(data.reading ?? "");
            setAdReadingStatus("done");
          })
          .catch(() => {
            setAdReadingStatus("error");
          });
      }
    }, 1000);
  }

  async function copyAdReading() {
    if (!adReading) return;
    try {
      await navigator.clipboard.writeText(adReading);
      setAdCopied(true);
      window.setTimeout(() => setAdCopied(false), 1800);
    } catch {
      // clipboard not available
    }
  }

  // ── LINE ──────────────────────────────────────────────────────────────────

  function getFallbackShortText(targetCards = cards) {
    return (
      freeReading ||
      targetCards
        .map((card) => `${card.position ? `${card.position}｜` : ""}${card.name}：${card.cosmicMessage}`)
        .join("\n\n")
    );
  }

  async function ensureFullReadingForLine() {
    if (adReading.trim()) return adReading.trim();

    setLineDeliveryMessage("宇宙正在整理完整版訊息，等等就送去 LINE...");
    console.info("[tarot-line] Requesting premium reading for LINE", {
      cardCount: cards.length,
      topic,
      hasQuestion: Boolean(question.trim()),
    });

    const response = await fetch("/api/tarot-reading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildReadingPayload(cards, "premium")),
    });
    const data = (await response.json().catch(() => ({}))) as { reading?: string; error?: string };
    console.info("[tarot-line] Premium reading response", { status: response.status, hasReading: Boolean(data.reading) });

    if (!response.ok || !data.reading) {
      throw new Error(data.error || "完整訊息暫時沒有成形。");
    }

    setAdReading(data.reading);
    return data.reading;
  }

  async function createLineResult(fullText: string) {
    if (lineResultId) return lineResultId;

    console.info("[tarot-line] Creating line result", {
      cardCount: cards.length,
      shortTextLength: getFallbackShortText().length,
      fullTextLength: fullText.length,
    });

    const response = await fetch("/api/results/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "tarot",
        question,
        cards,
        shortText: getFallbackShortText(),
        fullText,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; resultId?: string; error?: string };
    console.info("[tarot-line] Create result response", { status: response.status, ok: data.ok, resultId: data.resultId });

    if (!response.ok || !data.ok || !data.resultId) {
      throw new Error(data.error || "宇宙訊息暫時存不起來。");
    }

    setLineResultId(data.resultId);
    return data.resultId;
  }

  async function connectLineWithResult() {
    if (!cards.length || lineDeliveryStatus === "sending") return;

    try {
      console.info("[tarot-line] LINE CTA clicked", { cardCount: cards.length, topic, hasFreeReading: Boolean(freeReading), hasAdReading: Boolean(adReading) });
      setLineDeliveryStatus("sending");
      setLineDeliveryMessage("正在把今晚的訊息收好，準備送往 LINE...");

      const fullText = await ensureFullReadingForLine();
      const resultId = await createLineResult(fullText);

      window.location.href = `/line/connect?resultId=${encodeURIComponent(resultId)}`;
    } catch (error) {
      console.error("[tarot] Failed to prepare LINE result:", error);
      setLineDeliveryStatus("softPause");
      const message = error instanceof Error ? error.message : "宇宙訊號有點微弱，請稍後再試一次。";
      setLineDeliveryMessage(`送出前卡住了：${message}`);
    }
  }

  function selectSpreadQuestion(spreadQuestion: string) {
    setSelectedSpreadQuestion(spreadQuestion);
    setMode("three_card");
    setQuestion(spreadQuestion);
    setStatus("idle");
    setCards([]);
    resetReading();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="glass-card mt-8 rounded-[1.75rem] p-4 sm:p-7">
      {/* 模式選擇 */}
      <div className="grid gap-3 sm:grid-cols-2">
        {modes.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              const nextMode = item.key;
              setMode(item.key);
              setStatus("idle");
              setCards([]);
              if (nextMode === "single_tarot") {
                setQuestion((current) => current === selectedSpreadQuestion ? "" : current);
                setSelectedSpreadQuestion("");
              }
              resetReading();
            }}
            className={`rounded-3xl border p-4 text-left transition ${
              mode === item.key ? "border-moon bg-moon text-midnight" : "border-white/12 bg-midnight/45 text-moon hover:bg-white/10"
            }`}
          >
            <span className="block text-lg font-semibold">{item.label}</span>
            <span className={`mt-1 block text-sm ${mode === item.key ? "text-midnight/70" : "text-moon/58"}`}>{item.description}</span>
          </button>
        ))}
      </div>

      {/* 主題選擇 */}
      <div className="mt-5 grid grid-cols-3 gap-2">
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

      {/* 牌陣問題 */}
      {mode === "three_card" ? (
        <div className="mt-6 rounded-3xl border border-lavender/18 bg-midnight/38 p-4">
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

      {/* 自訂問題 */}
      <div className="mt-6">
        <p className="text-base font-medium text-moon">在心裡默想一個問題，或輸入你想問宇宙的事。</p>
        <p className="mt-1 text-sm text-moon/52">不輸入也可以直接抽牌，宇宙一樣聽得見。</p>
      </div>
      <textarea
        id="question"
        value={question}
        onChange={(event) => {
          setQuestion(event.target.value);
          setSelectedSpreadQuestion("");
        }}
        className="mt-3 min-h-32 w-full resize-none rounded-3xl border border-white/12 bg-midnight/58 p-4 text-base leading-7 text-moon outline-none transition placeholder:text-moon/40 focus:border-lavender"
        placeholder="例如：他現在怎麼想？我該不該換工作？今天要注意什麼？"
      />

      {/* 抽牌按鈕 */}
      <button
        type="button"
        onClick={draw}
        disabled={status === "drawing"}
        className="mt-5 w-full rounded-full bg-moon px-6 py-3 font-medium text-midnight transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {status === "drawing" ? "星光正在流動..." : "開始抽牌"}
      </button>
      <p className="mt-3 text-sm leading-6 text-moon/58">
        每日免費抽牌，加入 LINE 可獲得每日 3 次完整解讀額度。
      </p>

      {error ? <p className="mt-4 rounded-2xl border border-lavender/30 bg-nebula/20 p-4 text-sm text-moon">{error}</p> : null}

      {/* 抽牌動畫 */}
      {status === "drawing" ? (
        <div className="mt-7 rounded-3xl border border-lavender/20 bg-midnight/42 p-5 text-center shadow-glow">
          <div className="mx-auto moon-glow h-16 w-16 rounded-full" />
          <p className="mt-4 text-lg font-medium text-moon">宇宙正在替你整理訊息…</p>
          <p className="mt-2 text-sm text-moon/58">讓心安靜一下，牌面很快就會出現。</p>
        </div>
      ) : null}

      {/* 牌面 */}
      <div className="mt-8 grid grid-cols-1 items-start gap-8 md:grid-cols-2 xl:grid-cols-3">
        {status === "revealed" && cards.length
          ? cards.map((card, index) => (
              <article key={`${card.id}-${index}`} className="tarot-card-shell mx-auto w-full max-w-[420px]">
                {card.position ? (
                  <p className="mb-3 rounded-full border border-moon/20 bg-midnight/54 px-4 py-2 text-center text-base font-medium text-moon shadow-glow">
                    第{index + 1}張：{card.position}
                  </p>
                ) : null}
                <TarotCardFace card={card} topic={topic} />
              </article>
            ))
          : visibleBacks.map((_, index) => (
              <div key={`back-${index}`} className={`tarot-card-shell mx-auto w-full max-w-[420px] ${status === "drawing" ? "tarot-shuffling" : ""}`}>
                <TarotCardBack />
              </div>
            ))}
      </div>

      {/* ── 解讀區塊（三層）────────────────────────────────────────────── */}
      {canShowReadings ? (
        <section className="mt-9 space-y-5">

          {/* ── 1. 免費版：今夜短訊 ─────────────────────────────────── */}
          <div className="cosmic-reading-card rounded-[1.75rem] border border-lavender/20 bg-midnight/58 p-5 shadow-glow sm:p-6">
            <p className="text-sm tracking-[0.22em] text-lavender/70">今夜短訊・免費</p>
            <h3 className="mt-2 text-2xl font-semibold text-moon">宇宙給你的簡短訊息</h3>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/6 p-4">
              {freeReadingStatus === "loading" ? <p className="text-base leading-8 text-moon/76">宇宙正在整理簡短訊息…</p> : null}
              {freeReading ? <ReadingContent text={freeReading} compact /> : null}
              {freeReadingStatus === "error" ? <p className="text-base leading-8 text-moon/76">{freeReadingNotice || "宇宙訊號有點微弱，請稍後再試一次。"}</p> : null}
            </div>
          </div>

          {/* ── 2. LINE CTA：加入 LINE 看完整結果 ────────────────────── */}
          <div
            className="cosmic-reading-card rounded-[1.75rem] border p-5 shadow-glow sm:p-7"
            style={{
              borderColor: "rgba(6, 199, 85, 0.22)",
              background: "linear-gradient(135deg, rgba(10,16,40,0.82) 0%, rgba(10,28,20,0.88) 100%)",
              boxShadow: "0 0 48px rgba(6, 199, 85, 0.10)"
            }}
          >
            <p className="text-sm tracking-[0.22em]" style={{ color: "rgba(6, 199, 85, 0.80)" }}>
              完整解讀 · LINE 限定
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-moon">想看完整解讀？</h3>
            <p className="mt-3 max-w-xl text-base leading-8 text-moon/70">
              加入 LINE，宇宙把完整版訊息直接送進你的對話框。
            </p>

            <ul className="mt-4 space-y-2 text-sm leading-7 text-moon/60">
              <li>✦ 對方真正沒說出口的話</li>
              <li>✦ 更細的內心分析</li>
              <li>✦ 完整七日走向</li>
              <li>✦ 每日宇宙提醒推播</li>
            </ul>

            <button
              type="button"
              onClick={() => void connectLineWithResult()}
              disabled={lineDeliveryStatus === "sending"}
              className="mt-6 block w-full rounded-full px-6 py-4 text-center text-base font-semibold text-white transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 sm:inline-block sm:w-auto sm:min-w-[268px]"
              style={{ background: "#06C755", boxShadow: "0 0 32px rgba(6,199,85,0.28)" }}
            >
              {lineDeliveryStatus === "sending" ? "正在準備 LINE 訊息…" : "加入 LINE 看完整結果"}
            </button>
            {lineDeliveryMessage ? (
              <p className="mt-4 rounded-2xl border border-white/10 bg-white/8 p-3 text-sm leading-6 text-moon/74">
                {lineDeliveryMessage}
              </p>
            ) : null}
          </div>

          {/* ── LINE 傳送 ─────────────────────────────────────────────── */}
          <div className="cosmic-reading-card rounded-[1.75rem] border border-lavender/20 bg-midnight/54 p-5 text-center shadow-glow sm:p-6">
            <h3 className="text-2xl font-semibold text-moon">把今晚的訊息留在 LINE</h3>
            <p className="mx-auto mt-3 max-w-xl text-base leading-8 text-moon/72">把牌面和核心提醒送到 LINE，想回來慢慢看時就不怕找不到。</p>
            <button
              type="button"
              onClick={() => void connectLineWithResult()}
              disabled={lineDeliveryStatus === "sending"}
              className="mt-5 w-full rounded-full border border-lavender/40 bg-lavender px-6 py-4 text-base font-semibold text-midnight shadow-glow transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[260px]"
            >
              {lineDeliveryStatus === "sending" ? "正在送往 LINE…" : "把宇宙訊息傳到 LINE"}
            </button>
            {lineDeliveryMessage ? <p className="mt-4 text-sm leading-6 text-moon/68">{lineDeliveryMessage}</p> : null}
          </div>

        </section>
      ) : null}
    </div>
  );
}
