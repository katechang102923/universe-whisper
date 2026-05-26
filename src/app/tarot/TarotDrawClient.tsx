"use client";

import { useMemo, useState } from "react";
import { TarotCardBack, TarotCardFace, type TarotCardFaceData } from "@/components/TarotCardFace";

type DrawStatus = "idle" | "drawing" | "revealed";
type ReadingStatus = "idle" | "loading" | "done" | "error";
type ReadingTopic = "love" | "career" | "general";
type SpreadPosition = "past" | "present" | "future";

const modes = [
  { key: "single_tarot", label: "單張牌", description: "接收此刻最靠近你的訊息" },
  { key: "three_card", label: "三張牌", description: "過去、現在、未來的溫柔流動" }
] as const;

const topics = ["感情", "工作", "曖昧"] as const;

function toReadingTopic(topic: (typeof topics)[number]): ReadingTopic {
  if (topic === "工作") {
    return "career";
  }

  if (topic === "感情" || topic === "曖昧") {
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
  const [topic, setTopic] = useState<(typeof topics)[number]>("感情");
  const [question, setQuestion] = useState("");
  const [cards, setCards] = useState<TarotCardFaceData[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<DrawStatus>("idle");
  const [readingStatus, setReadingStatus] = useState<ReadingStatus>("idle");
  const [reading, setReading] = useState("");
  const [readingError, setReadingError] = useState("");
  const [copied, setCopied] = useState(false);

  const cardCount = mode === "three_card" ? 3 : 1;
  const visibleBacks = useMemo(() => Array.from({ length: cardCount }), [cardCount]);

  function resetReading() {
    setReadingStatus("idle");
    setReading("");
    setReadingError("");
    setCopied(false);
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
        setCards(data.cards ?? []);
        setStatus("revealed");
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
          question: question.trim() || undefined
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

      <label className="mt-6 block text-base font-medium text-lavender" htmlFor="question">
        把想說的話交給宇宙
      </label>
      <textarea
        id="question"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
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

      {status === "revealed" && cards.length ? (
        <section className="mt-9">
          <div className="flex justify-center">
            <button
              type="button"
              onClick={requestReading}
              disabled={readingStatus === "loading"}
              className="w-full rounded-full border border-moon/40 bg-moon px-6 py-4 text-base font-semibold text-midnight shadow-glow transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[260px]"
            >
              {readingStatus === "loading" ? "宇宙正在整理訊息…" : "聽聽宇宙怎麼說"}
            </button>
          </div>

          {readingStatus === "loading" ? (
            <div className="cosmic-reading-card mt-5 rounded-3xl border border-white/10 bg-white/8 p-5 text-center shadow-glow">
              <div className="mx-auto flex w-fit gap-2">
                <span className="cosmic-reading-dot" />
                <span className="cosmic-reading-dot animation-delay-150" />
                <span className="cosmic-reading-dot animation-delay-300" />
              </div>
              <p className="mt-4 text-base text-moon">宇宙正在整理訊息…</p>
            </div>
          ) : null}

          {readingError ? <p className="mt-5 rounded-2xl border border-lavender/30 bg-nebula/20 p-4 text-sm leading-6 text-moon">{readingError}</p> : null}

          {reading ? (
            <div className="cosmic-reading-card mt-5 rounded-[1.75rem] border border-lavender/20 bg-midnight/58 p-4 shadow-glow sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.22em] text-lavender/70">深夜訊息</p>
                  <h3 className="mt-2 text-2xl font-semibold text-moon">宇宙給你的訊息</h3>
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
