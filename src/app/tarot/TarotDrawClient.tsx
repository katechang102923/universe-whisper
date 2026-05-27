"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TarotCardBack, TarotCardFace, type TarotCardFaceData } from "@/components/TarotCardFace";

// TODO: replace with official LINE OA add friend URL if changed
const LINE_ADD_FRIEND_URL = process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL ?? "https://line.me/R/ti/p/@453gfmok";

type DrawStatus = "idle" | "drawing" | "revealed";
type FreeReadingStatus = "idle" | "loading" | "done" | "error";
type AdReadingStatus = "idle" | "watching" | "loading" | "done" | "error";
type ReadingTopic = "love" | "career" | "ambiguous" | "general";
type SpreadPosition = "past" | "present" | "future";

const FREE_DRAW_STORAGE_KEY = "cosmic_free_limit";
const LINE_PENDING_ACTION_KEY = "cosmic_pending_line_action";
const DAILY_FREE_DRAWS = 3;
const AD_COUNTDOWN_SECONDS = 15;

const modes = [
  { key: "single_tarot", label: "單張牌", description: "接收此刻最靠近你的訊息" },
  { key: "three_card", label: "三張牌", description: "過去、現在、未來的溫柔流動" }
] as const;

const topics = ["感情", "工作", "曖昧"] as const;
type TarotTopicOption = (typeof topics)[number];
type FreeDrawRecord = { date: string; count: number };
type PendingLineAction = {
  action: "send";
  cards: TarotCardFaceData[];
  topic: TarotTopicOption;
  question: string;
  freeReading: string;
  adReading: string;
};

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
  if (topic === "工作") return "career";
  if (topic === "曖昧") return "ambiguous";
  if (topic === "感情") return "love";
  return "general";
}

function toSpreadPosition(position: TarotCardFaceData["position"]): SpreadPosition | undefined {
  if (position === "過去") return "past";
  if (position === "現在") return "present";
  if (position === "未來") return "future";
  return undefined;
}

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readFreeDrawRecord(): FreeDrawRecord {
  const today = getLocalDateKey();
  try {
    const rawRecord = window.localStorage.getItem(FREE_DRAW_STORAGE_KEY);
    const parsed = rawRecord ? (JSON.parse(rawRecord) as Partial<FreeDrawRecord>) : null;
    if (!parsed || parsed.date !== today || typeof parsed.count !== "number") {
      return { date: today, count: 0 };
    }
    return { date: today, count: Math.max(0, Math.min(parsed.count, DAILY_FREE_DRAWS)) };
  } catch {
    return { date: today, count: 0 };
  }
}

function writeFreeDrawRecord(record: FreeDrawRecord) {
  window.localStorage.setItem(FREE_DRAW_STORAGE_KEY, JSON.stringify(record));
}

export function TarotDrawClient() {
  const [mode, setMode] = useState<(typeof modes)[number]["key"]>("single_tarot");
  const [topic, setTopic] = useState<TarotTopicOption>("感情");
  const [question, setQuestion] = useState("");
  const [selectedSpreadQuestion, setSelectedSpreadQuestion] = useState("");
  const [cards, setCards] = useState<TarotCardFaceData[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<DrawStatus>("idle");

  // 免費版
  const [freeReadingStatus, setFreeReadingStatus] = useState<FreeReadingStatus>("idle");
  const [freeReading, setFreeReading] = useState("");
  const [freeReadingNotice, setFreeReadingNotice] = useState("");
  const [todayFreeDrawCount, setTodayFreeDrawCount] = useState(0);

  // 廣告解鎖版
  const [adReadingStatus, setAdReadingStatus] = useState<AdReadingStatus>("idle");
  const [adReading, setAdReading] = useState("");
  const [adCountdown, setAdCountdown] = useState(AD_COUNTDOWN_SECONDS);
  const [adCopied, setAdCopied] = useState(false);
  const adTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // LINE
  const [lineDeliveryStatus, setLineDeliveryStatus] = useState<"idle" | "sending" | "done" | "needsLogin" | "softPause">("idle");
  const [lineDeliveryMessage, setLineDeliveryMessage] = useState("");

  const cardCount = mode === "three_card" ? 3 : 1;
  const visibleBacks = useMemo(() => Array.from({ length: cardCount }), [cardCount]);
  const canShowReadings = status === "revealed" && cards.length > 0;
  const currentSpreadGroup = spreadQuestionGroups[topic];
  const remainingFreeDraws = Math.max(DAILY_FREE_DRAWS - todayFreeDrawCount, 0);

  useEffect(() => {
    const freeDrawRecord = readFreeDrawRecord();
    writeFreeDrawRecord(freeDrawRecord);
    setTodayFreeDrawCount(freeDrawRecord.count);

    const params = new URL(window.location.href).searchParams;
    if (params.get("lineAction") === "send") {
      void resumeLineSend();
    }

    return () => {
      if (adTimerRef.current) clearInterval(adTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }

  function buildReadingPayload(
    targetCards: TarotCardFaceData[],
    readingMode: "free" | "ad" | "premium",
    payloadTopic = topic,
    payloadQuestion = question
  ) {
    return {
      cards: targetCards.map((card) => ({
        name: card.name,
        position: card.orientation,
        spreadPosition: toSpreadPosition(card.position)
      })),
      topic: toReadingTopic(payloadTopic),
      readingMode,
      question: payloadQuestion.trim() || undefined
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

      if (!response.ok) {
        setFreeReadingNotice(data.error ?? "宇宙今晚想先休息一下，明天再來找我好嗎？");
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

    const freeDrawRecord = readFreeDrawRecord();
    setTodayFreeDrawCount(freeDrawRecord.count);

    if (freeDrawRecord.count >= DAILY_FREE_DRAWS) {
      setError("宇宙今晚想先休息一下，明天再來找我好嗎？");
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

      const nextFreeDrawRecord = { date: freeDrawRecord.date, count: Math.min(freeDrawRecord.count + 1, DAILY_FREE_DRAWS) };
      writeFreeDrawRecord(nextFreeDrawRecord);
      setTodayFreeDrawCount(nextFreeDrawRecord.count);

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

  function createPendingLineSend(): PendingLineAction {
    return { action: "send", cards, topic, question, freeReading, adReading };
  }

  async function hasLineSession() {
    const response = await fetch("/api/line/me");
    const data = await response.json();
    return Boolean(data.loggedIn);
  }

  async function resumeLineSend() {
    const rawPending = window.localStorage.getItem(LINE_PENDING_ACTION_KEY);
    if (!rawPending) return;

    const pending = JSON.parse(rawPending) as PendingLineAction;
    if (!pending.cards?.length || pending.action !== "send" || !topics.includes(pending.topic)) {
      window.localStorage.removeItem(LINE_PENDING_ACTION_KEY);
      return;
    }

    setTopic(pending.topic);
    setQuestion(pending.question);
    setCards(pending.cards);
    setMode(pending.cards.length === 3 ? "three_card" : "single_tarot");
    setStatus("revealed");
    setFreeReading(pending.freeReading);
    setFreeReadingStatus(pending.freeReading ? "done" : "idle");
    setAdReading(pending.adReading);
    setAdReadingStatus(pending.adReading ? "done" : "idle");

    await sendLineMessage(pending);
  }

  async function sendLineMessage(pending = createPendingLineSend()) {
    if (!pending.cards.length || lineDeliveryStatus === "sending") return;

    if (!(await hasLineSession())) {
      window.localStorage.setItem(LINE_PENDING_ACTION_KEY, JSON.stringify(pending));
      setLineDeliveryStatus("needsLogin");
      setLineDeliveryMessage("先讓宇宙在 LINE 認得你，回來後我會接著把訊息送過去。");
      window.location.href = `/api/line/login/start?returnTo=${encodeURIComponent("/tarot?lineAction=send")}`;
      return;
    }

    setLineDeliveryStatus("sending");
    setLineDeliveryMessage("正在把今晚的訊息收進 LINE 裡…");

    const response = await fetch("/api/line/send-tarot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cards: pending.cards,
        topic: pending.topic,
        question: pending.question,
        freeReading: pending.freeReading,
        premiumReading: pending.adReading,
        resultUrl: `${window.location.origin}/tarot`
      })
    });
    const data = await response.json();

    if (response.status === 401 && data.loginRequired) {
      window.localStorage.setItem(LINE_PENDING_ACTION_KEY, JSON.stringify(pending));
      setLineDeliveryStatus("needsLogin");
      setLineDeliveryMessage("先讓宇宙在 LINE 認得你，回來後我會接著把訊息送過去。");
      window.location.href = data.loginUrl;
      return;
    }

    if (!response.ok) {
      setLineDeliveryStatus("softPause");
      setLineDeliveryMessage("今晚的訊息已經收好，只是 LINE 那邊暫時有點安靜，等等再試一次。");
      return;
    }

    window.localStorage.removeItem(LINE_PENDING_ACTION_KEY);
    setLineDeliveryStatus("done");
    setLineDeliveryMessage(data.deliveryStatus === "sent" ? "已把今晚的宇宙訊息送到 LINE。" : "已完成測試送出流程，正式憑證接上後就會送到 LINE。");
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
        {status === "drawing" ? "星光正在流動..." : remainingFreeDraws > 0 ? "開始抽牌" : "明天再抽一張"}
      </button>
      <p className="mt-3 text-sm leading-6 text-moon/58">
        {remainingFreeDraws > 0 ? `今晚還有 ${remainingFreeDraws} 次免費抽牌的星光。` : "宇宙今晚想先休息一下，明天再來找我好嗎？"}
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
              {freeReading ? <p className="whitespace-pre-wrap text-base leading-8 text-moon/84">{freeReading}</p> : null}
              {freeReadingStatus === "error" ? <p className="text-base leading-8 text-moon/76">{freeReadingNotice || "宇宙訊號有點微弱，請稍後再試一次。"}</p> : null}
            </div>
          </div>

          {/* ── 2. 廣告解鎖版 ───────────────────────────────────────── */}
          {adReadingStatus === "idle" ? (
            <div className="cosmic-reading-card rounded-[1.75rem] border border-moon/24 bg-midnight/54 p-5 shadow-glow sm:p-7">
              <p className="text-sm tracking-[0.22em] text-moon/60">完整訊息・星光解鎖</p>
              <h3 className="mt-2 text-2xl font-semibold text-moon">宇宙還有更多想對你說</h3>
              <ul className="mx-auto mt-4 max-w-xs space-y-2 text-left text-sm leading-7 text-moon/64">
                <li>✦ 情緒分析 — 你此刻真正的感受</li>
                <li>✦ 關係分析 — 這段{topic}裡正在發生什麼</li>
                <li>✦ 七日走向 — 接下來 7 天的能量提醒</li>
                <li>✦ 深夜訊息 — 一句只對你說的話</li>
              </ul>
              <button
                type="button"
                onClick={watchAdAndUnlock}
                className="mt-6 w-full rounded-full border border-moon/40 bg-moon px-6 py-4 text-base font-semibold text-midnight shadow-glow transition hover:bg-white sm:w-auto sm:min-w-[268px]"
              >
                觀看星光 15 秒，解鎖完整版
              </button>
              <p className="mt-3 text-xs text-moon/44">免費解鎖，無需付費</p>
            </div>
          ) : null}

          {adReadingStatus === "watching" ? (
            <div className="cosmic-reading-card rounded-[1.75rem] border border-moon/30 bg-midnight/58 p-8 text-center shadow-glow">
              <div className="mx-auto moon-glow h-20 w-20 rounded-full animate-pulse" />
              <p className="mt-5 text-lg font-medium text-moon">星光流動中…</p>
              <p className="mt-3 tabular-nums text-6xl font-bold text-moon">{adCountdown}</p>
              <p className="mt-3 text-sm text-moon/58">秒後解鎖完整訊息</p>
            </div>
          ) : null}

          {adReadingStatus === "loading" ? (
            <div className="cosmic-reading-card rounded-3xl border border-white/10 bg-white/8 p-5 text-center shadow-glow">
              <div className="mx-auto flex w-fit gap-2">
                <span className="cosmic-reading-dot" />
                <span className="cosmic-reading-dot animation-delay-150" />
                <span className="cosmic-reading-dot animation-delay-300" />
              </div>
              <p className="mt-4 text-base text-moon">宇宙正在整理完整訊息…</p>
            </div>
          ) : null}

          {adReadingStatus === "error" ? (
            <p className="rounded-2xl border border-lavender/30 bg-nebula/20 p-4 text-sm leading-6 text-moon">宇宙訊號有點微弱，請稍後再試一次。</p>
          ) : null}

          {adReadingStatus === "done" && adReading ? (
            <div className="cosmic-reading-card rounded-[1.75rem] border border-moon/24 bg-midnight/58 p-4 shadow-glow sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm tracking-[0.22em] text-moon/60">完整訊息・已解鎖</p>
                  <h3 className="mt-2 text-2xl font-semibold text-moon">宇宙完整訊息</h3>
                </div>
                <button
                  type="button"
                  onClick={copyAdReading}
                  className="rounded-full border border-white/14 px-4 py-2 text-sm text-moon transition hover:border-moon/50 hover:bg-white/10"
                >
                  {adCopied ? "已複製" : "複製內容"}
                </button>
              </div>
              <div className="mt-4 max-h-[480px] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-white/6 p-4 text-base leading-8 text-moon/86 sm:text-lg sm:leading-9">
                {adReading}
              </div>
            </div>
          ) : null}

          {/* ── 3. LINE CTA：加入 LINE 看完整結果 ────────────────────── */}
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

            <a
              href={LINE_ADD_FRIEND_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-6 block w-full rounded-full px-6 py-4 text-center text-base font-semibold text-white transition hover:opacity-90 active:scale-95 sm:inline-block sm:w-auto sm:min-w-[268px]"
              style={{ background: "#06C755", boxShadow: "0 0 32px rgba(6,199,85,0.28)" }}
            >
              加入 LINE 看完整結果
            </a>
          </div>

          {/* ── LINE 傳送 ─────────────────────────────────────────────── */}
          <div className="cosmic-reading-card rounded-[1.75rem] border border-lavender/20 bg-midnight/54 p-5 text-center shadow-glow sm:p-6">
            <h3 className="text-2xl font-semibold text-moon">把今晚的訊息留在 LINE</h3>
            <p className="mx-auto mt-3 max-w-xl text-base leading-8 text-moon/72">把牌面和核心提醒送到 LINE，想回來慢慢看時就不怕找不到。</p>
            <button
              type="button"
              onClick={() => void sendLineMessage()}
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
