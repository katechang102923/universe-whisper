"use client";

import { useEffect, useRef, useState } from "react";
import { TarotCardBack, TarotCardFace, type TarotCardFaceData } from "@/components/TarotCardFace";

type RitualStage = "drawing" | "selecting" | "revealing";

// ─── TarotShuffleAnimation ─────────────────────────────────────────────────────

/**
 * drawing   → riffle shuffle (CSS keyframes in globals.css)
 * selecting → 3×3 grid; user picks 1 or 3 cards
 * revealing → existing ritual-reveal-card flip CSS
 *
 * Grid parameters:
 *   Desktop: card width ~140px, gap 16px, container max 460px
 *   Mobile:  card width ~95px,  gap 12px, container max 320px
 *   Touch area: card itself (≥ 88×132 px) — no invisible overlapping stems
 */
export function TarotShuffleAnimation({
  stage,
  cardCount,
  selectedIndex: _selectedIndex,
  revealedCards,
  topic,
  onSelect,
  onSkip,
}: {
  stage: RitualStage;
  cardCount: number;
  selectedIndex: number | null;
  revealedCards: TarotCardFaceData[];
  topic: string;
  onSelect: (index: number) => void;
  onSkip: () => void;
}) {
  // ─── Grid pick state ─────────────────────────────────────────────────────
  const [pickedIndices, setPickedIndices] = useState<number[]>([]);
  const selectCalledRef = useRef(false);

  useEffect(() => {
    if (stage !== "selecting") return;
    selectCalledRef.current = false;
    // 延後到 microtask 再清空已選牌，避免在 effect body 內同步 setState（行為不變）
    queueMicrotask(() => setPickedIndices([]));
  }, [stage]);

  function handleGridPick(idx: number) {
    if (selectCalledRef.current) return;
    if (pickedIndices.includes(idx)) return;
    const next = [...pickedIndices, idx];
    setPickedIndices(next);
    if (next.length >= cardCount) {
      selectCalledRef.current = true;
      window.setTimeout(() => onSelect(0), 600);
    }
  }

  // ─── Derived text ────────────────────────────────────────────────────────
  const headingText =
    stage === "drawing"    ? "星光正在洗牌"
    : stage === "selecting"
      ? cardCount === 1    ? "請選一張牌"
                           : `請選擇三張牌（${pickedIndices.length} / 3）`
    : "牌面正在醒來";

  const subText =
    stage === "selecting"
      ? cardCount === 1 ? "從牌面中感受吸引你的那一張"
                        : "依序點選三張，感受宇宙的引導"
      : null;

  const ritualLines = [
    "宇宙正在聽你說話……",
    "請在心裡默念你的問題",
    "當你準備好時，選一張牌",
  ];

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <section className="relative z-10 mt-7 overflow-hidden rounded-[2rem] border border-[#d8bd70]/24 bg-midnight/54 p-5 text-center shadow-glow sm:p-7">

      {/* Gold dust particles */}
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <span className="ritual-dust left-[12%] top-[18%]" />
        <span className="ritual-dust left-[82%] top-[24%] [animation-delay:0.8s]" />
        <span className="ritual-dust left-[48%] top-[78%] [animation-delay:1.4s]" />
      </div>

      {/* Skip button */}
      <button
        type="button"
        onClick={onSkip}
        className="absolute right-4 top-4 z-10 rounded-full border border-white/12 bg-white/8 px-4 py-2 text-xs font-medium text-moon/72 transition hover:bg-white/12 hover:text-moon"
      >
        略過動畫
      </button>

      {/* Header */}
      <div className="relative z-10 mx-auto max-w-2xl pt-8 sm:pt-4">
        <p className="text-xs uppercase tracking-[0.3em] text-[#d8bd70]/78">cosmic ritual</p>
        <h3 className="mt-3 text-2xl font-semibold text-moon sm:text-3xl">{headingText}</h3>
        {stage === "drawing" && (
          <div className="mt-4 space-y-2">
            {ritualLines.map((line, i) => (
              <p key={line} className="ritual-line-fade text-base leading-7 text-moon/72"
                style={{ animationDelay: `${i * 0.8}s` }}>
                {line}
              </p>
            ))}
          </div>
        )}
        {subText && <p className="mt-3 text-sm text-moon/56">{subText}</p>}
      </div>

      {/* ── Stage: drawing — riffle shuffle ─────────────────────────────── */}
      {stage === "drawing" && (
        <div className="relative z-10 mx-auto mt-8 h-[260px] max-w-[520px] sm:h-[300px]">
          {Array.from({ length: 6 }).map((_, i) => {
            const n = i + 1;
            const isLeft = n % 2 === 1;
            return (
              <div key={i} className={`riffle-card riffle-card-${n} ${isLeft ? "riffle-card-left" : "riffle-card-right"}`}>
                <TarotCardBack compact />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Stage: selecting — 3×3 grid ─────────────────────────────────── */}
      {stage === "selecting" && (
        <div className="relative z-10 mx-auto mt-6 w-full max-w-[320px] sm:max-w-[460px]">
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {Array.from({ length: 9 }).map((_, idx) => {
              const isPicked = pickedIndices.includes(idx);
              const isExhausted = pickedIndices.length >= cardCount && !isPicked;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleGridPick(idx)}
                  disabled={isExhausted}
                  aria-label={`選擇第 ${idx + 1} 張牌`}
                  className={[
                    "relative rounded-[1.2rem] outline-none",
                    "transition-all duration-200",
                    "focus-visible:ring-2 focus-visible:ring-[#d8bd70]/70",
                    isPicked
                      ? "scale-[1.08] drop-shadow-[0_0_24px_rgba(216,189,112,1)] ring-2 ring-[#d8bd70]"
                      : isExhausted
                      ? "cursor-not-allowed opacity-30"
                      : "cursor-pointer hover:scale-105 hover:drop-shadow-[0_0_14px_rgba(216,189,112,0.75)] active:scale-[1.08]",
                  ].join(" ")}
                  style={{ minHeight: 132 }}
                >
                  {isPicked && (
                    <div className="pointer-events-none absolute inset-0 z-10 rounded-[1.2rem] shadow-[0_0_22px_rgba(216,189,112,0.9)]" />
                  )}
                  <TarotCardBack compact />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Stage: revealing — flip reveal ──────────────────────────────── */}
      {stage === "revealing" && (
        <div className="relative z-10 mt-8 grid grid-cols-1 items-start gap-8 md:grid-cols-2 xl:grid-cols-3">
          {(revealedCards.length ? revealedCards : [null]).map((card, i) => (
            <article key={card ? `${card.id}-${i}` : i}
              className="ritual-reveal-card tarot-card-shell mx-auto w-full max-w-[420px]">
              <div className="ritual-stardust" />
              {card ? <TarotCardFace card={card} topic={topic} /> : <TarotCardBack />}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
