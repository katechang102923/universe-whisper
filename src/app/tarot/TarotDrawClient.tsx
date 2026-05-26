"use client";

import { useEffect, useMemo, useState } from "react";
import { TarotCardBack, TarotCardFace, type TarotCardFaceData } from "@/components/TarotCardFace";

type DrawStatus = "idle" | "drawing" | "revealed";
type ReadingStatus = "idle" | "loading" | "done" | "error";
type FreeReadingStatus = "idle" | "loading" | "done" | "error";
type ReadingTopic = "love" | "career" | "ambiguous" | "general";
type SpreadPosition = "past" | "present" | "future";

const modes = [
  { key: "single_tarot", label: "單張牌", description: "接收此刻最靠近你的訊息" },
  { key: "three_card", label: "三張牌", description: "過去、現在、未來的溫柔流動" }
] as const;

const topics = ["感情", "工作", "曖昧"] as const;
type TarotTopicOption = (typeof topics)[number];
const zodiacSigns = ["牡羊座", "金牛座", "雙子座", "巨蟹座", "獅子座", "處女座", "天秤座", "天蠍座", "射手座", "摩羯座", "水瓶座", "雙魚座"] as const;
type ZodiacSign = (typeof zodiacSigns)[number];

const spreadQuestionGroups = {
  感情: {
    title: "感情專屬牌陣",
    questions: ["這段關係接下來會怎樣", "我該繼續投入嗎", "這段感情真正的問題是什麼", "我們之間還有機會嗎", "我現在最該看清什麼"]
  },
  工作: {
    title: "工作專屬牌陣",
    questions: ["我現在的工作適合我嗎", "接下來的工作運勢如何", "我該轉職嗎", "目前卡住的原因是什麼", "這個機會值得把握嗎"]
  },
  曖昧: {
    title: "曖昧專屬牌陣",
    questions: ["他有喜歡我嗎", "曖昧對象怎麼想", "他會主動靠近我嗎", "我該主動一點嗎", "這段曖昧會有結果嗎"]
  }
} satisfies Record<TarotTopicOption, { title: string; questions: readonly string[] }>;

function toReadingTopic(topic: TarotTopicOption): ReadingTopic {
  if (topic === "工作") {
    return "career";
  }

  if (topic === "曖昧") {
    return "ambiguous";
  }

  if (topic === "感情") {
    return "love";
  }

  return "general";
}

function toSpreadPosition(position: TarotCardFaceData["position"]): SpreadPosition | undefined {
  if (position === "過去") {
    return "past";
  }

  if (position === "現在") {
    return "present";
  }

  if (position === "未來") {
    return "future";
  }

  return undefined;
}

export function TarotDrawClient() {
  const [mode, setMode] = useState<(typeof modes)[number]["key"]>("single_tarot");
  const [topic, setTopic] = useState<TarotTopicOption>("感情");
  const [question, setQuestion] = useState("");
  const [selectedSpreadQuestion, setSelectedSpreadQuestion] = useState("");
  const [selectedZodiac, setSelectedZodiac] = useState<ZodiacSign | "">("");
  const [cards, setCards] = useState<TarotCardFaceData[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<DrawStatus>("idle");
  const [freeReadingStatus, setFreeReadingStatus] = useState<FreeReadingStatus>("idle");
  const [freeReading, setFreeReading] = useState("");
  const [readingStatus, setReadingStatus] = useState<ReadingStatus>("idle");
  const [reading, setReading] = useState("");
  const [readingError, setReadingError] = useState("");
  const [copied, setCopied] = useState(false);

  const cardCount = mode === "three_card" ? 3 : 1;
  const visibleBacks = useMemo(() => Array.from({ length: cardCount }), [cardCount]);
  const canShowReadings = status === "revealed" && cards.length > 0;
  const currentSpreadGroup = spreadQuestionGroups[topic];

  useEffect(() => {
    const savedZodiac = window.localStorage.getItem("universe-whisper-zodiac");

    if (zodiacSigns.includes(savedZodiac as ZodiacSign)) {
      setSelectedZodiac(savedZodiac as ZodiacSign);
    }
  }, []);

  function resetReading() {
    setFreeReadingStatus("idle");
    setFreeReading("");
    setReadingStatus("idle");
    setReading("");
    setReadingError("");
    setCopied(false);
  }

  function buildReadingPayload(targetCards: TarotCardFaceData[], readingMode: "free" | "premium", zodiac = selectedZodiac) {
    return {
      cards: targetCards.map((card) => ({
        name: card.name,
        position: card.orientation,
        spreadPosition: toSpreadPosition(card.position)
      })),
      topic: toReadingTopic(topic),
      readingMode,
      question: question.trim() || undefined,
      zodiac: zodiac || undefined
    };
  }

  async function requestFreeReading(targetCards: TarotCardFaceData[], zodiac = selectedZodiac) {
    if (!targetCards.length) {
      return;
    }

    setFreeReadingStatus("loading");
    setFreeReading("");

    try {
      const response = await fetch("/api/tarot-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildReadingPayload(targetCards, "free", zodiac))
      });
      const data = await response.json();

      if (!response.ok) {
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
    if (status === "drawing") {
      return;
    }

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

  async function requestReading() {
    if (readingStatus === "loading" || status !== "revealed" || cards.length === 0) {
      return;
    }

    setReadingStatus("loading");
    setReadingError("");
    setCopied(false);

    try {
      const response = await fetch("/api/tarot-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: cards.map((card) => ({
            name: card.name,
            position: card.orientation,
            spreadPosition: toSpreadPosition(card.position)
          })),
          topic: toReadingTopic(topic),
          readingMode: "premium",
          question: question.trim() || undefined,
          zodiac: selectedZodiac || undefined
        })
      });
      const data = await response.json();

      if (!response.ok) {
        setReadingStatus("error");
        setReadingError("宇宙訊號有點微弱，請稍後再試一次。");
        return;
      }

      setReading(data.reading ?? "");
      setReadingStatus("done");
    } catch {
      setReadingStatus("error");
      setReadingError("宇宙訊號有點微弱，請稍後再試一次。");
    }
  }

  async function copyReading() {
    if (!reading) {
      return;
    }

    try {
      await navigator.clipboard.writeText(reading);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setReadingError("目前無法複製內容，請稍後再試。");
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

  function selectZodiac(sign: ZodiacSign) {
    setSelectedZodiac(sign);
    window.localStorage.setItem("universe-whisper-zodiac", sign);
    resetReading();

    if (status === "revealed" && cards.length > 0) {
      void requestFreeReading(cards, sign);
    }
  }

  function unlockPremiumReading() {
    if (readingStatus === "loading") {
      return;
    }

    window.alert("付款功能即將開放，現在先為你展示完整版測試內容。");
    void requestReading();
  }

  return (
    <div className="glass-card mt-8 rounded-[1.75rem] p-4 sm:p-7">
      <div className="grid gap-3 sm:grid-cols-2">
        {modes.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setMode(item.key);
              setStatus("idle");
              setCards([]);
              setSelectedSpreadQuestion("");
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

      <div className="mt-6 rounded-3xl border border-lavender/18 bg-midnight/38 p-4">
        <h3 className="text-xl font-semibold text-moon">宇宙想更靠近你一點</h3>
        <p className="mt-2 text-sm leading-6 text-moon/60">選擇你的星座，今晚的訊息會更貼近你。</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {zodiacSigns.map((sign) => (
            <button
              key={sign}
              type="button"
              onClick={() => selectZodiac(sign)}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                selectedZodiac === sign ? "border-moon bg-moon text-midnight" : "border-white/12 bg-white/8 text-moon/76 hover:bg-white/12"
              }`}
            >
              {sign}
            </button>
          ))}
        </div>
      </div>

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

      <label className="mt-6 block text-base font-medium text-lavender" htmlFor="question">
        把想說的話交給宇宙
      </label>
      <textarea
        id="question"
        value={question}
        onChange={(event) => {
          setQuestion(event.target.value);
          setSelectedSpreadQuestion("");
        }}
        className="mt-2 min-h-32 w-full resize-none rounded-3xl border border-white/12 bg-midnight/58 p-4 text-base leading-7 text-moon outline-none transition placeholder:text-moon/40 focus:border-lavender"
        placeholder="可以在心裡默想，也可以輕輕寫下現在最在意的事…"
      />
      <p className="mt-2 text-sm leading-6 text-moon/56">不一定要說出口，宇宙也會聽見。</p>

      <button
        type="button"
        onClick={draw}
        disabled={status === "drawing"}
        className="mt-5 w-full rounded-full bg-moon px-6 py-3 font-medium text-midnight transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {status === "drawing" ? "星光正在流動..." : "開始抽牌"}
      </button>

      {error ? <p className="mt-4 rounded-2xl border border-lavender/30 bg-nebula/20 p-4 text-sm text-moon">{error}</p> : null}

      {status === "drawing" ? (
        <div className="mt-7 rounded-3xl border border-lavender/20 bg-midnight/42 p-5 text-center shadow-glow">
          <div className="mx-auto moon-glow h-16 w-16 rounded-full" />
          <p className="mt-4 text-lg font-medium text-moon">宇宙正在替你整理訊息…</p>
          <p className="mt-2 text-sm text-moon/58">讓心安靜一下，牌面很快就會出現。</p>
        </div>
      ) : null}

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

      {canShowReadings ? (
        <section className="mt-9 space-y-5">
          <div className="cosmic-reading-card rounded-[1.75rem] border border-lavender/20 bg-midnight/58 p-5 shadow-glow sm:p-6">
            <p className="text-sm tracking-[0.22em] text-lavender/70">今夜短訊</p>
            <h3 className="mt-2 text-2xl font-semibold text-moon">宇宙給你的簡短訊息</h3>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/6 p-4">
              {freeReadingStatus === "loading" ? <p className="text-base leading-8 text-moon/76">宇宙正在整理簡短訊息…</p> : null}
              {freeReading ? <p className="whitespace-pre-wrap text-base leading-8 text-moon/84">{freeReading}</p> : null}
              {freeReadingStatus === "error" ? <p className="text-base leading-8 text-moon/76">宇宙訊號有點微弱，請稍後再試一次。</p> : null}
            </div>
          </div>

          <div className="cosmic-reading-card rounded-[1.75rem] border border-moon/24 bg-midnight/54 p-5 text-center shadow-glow sm:p-7">
            <p className="text-sm tracking-[0.22em] text-lavender/70">完整訊息</p>
            <h3 className="mt-2 text-2xl font-semibold text-moon">宇宙還有一些沒說完的話</h3>
            <p className="mx-auto mt-3 max-w-xl text-base leading-8 text-moon/72">有些答案，不是不出現，只是需要你再靠近一點。</p>
            <button
              type="button"
              onClick={unlockPremiumReading}
              disabled={readingStatus === "loading"}
              className="mt-5 w-full rounded-full border border-moon/40 bg-moon px-6 py-4 text-base font-semibold text-midnight shadow-glow transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[260px]"
            >
              {readingStatus === "loading" ? "宇宙正在整理訊息…" : "解鎖完整訊息 NT$29"}
            </button>
          </div>

          {readingStatus === "loading" ? (
            <div className="cosmic-reading-card rounded-3xl border border-white/10 bg-white/8 p-5 text-center shadow-glow">
              <div className="mx-auto flex w-fit gap-2">
                <span className="cosmic-reading-dot" />
                <span className="cosmic-reading-dot animation-delay-150" />
                <span className="cosmic-reading-dot animation-delay-300" />
              </div>
              <p className="mt-4 text-base text-moon">宇宙正在整理訊息…</p>
            </div>
          ) : null}

          {readingError ? <p className="rounded-2xl border border-lavender/30 bg-nebula/20 p-4 text-sm leading-6 text-moon">{readingError}</p> : null}

          {reading ? (
            <div className="cosmic-reading-card rounded-[1.75rem] border border-lavender/20 bg-midnight/58 p-4 shadow-glow sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.22em] text-lavender/70">深夜訊息</p>
                  <h3 className="mt-2 text-2xl font-semibold text-moon">宇宙深夜訊息</h3>
                </div>
                <button
                  type="button"
                  onClick={copyReading}
                  className="rounded-full border border-white/14 px-4 py-2 text-sm text-moon transition hover:border-moon/50 hover:bg-white/10"
                >
                  {copied ? "已複製" : "複製內容"}
                </button>
              </div>
              <div className="mt-4 max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-white/6 p-4 text-base leading-8 text-moon/86 sm:text-lg sm:leading-9">
                {reading}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
