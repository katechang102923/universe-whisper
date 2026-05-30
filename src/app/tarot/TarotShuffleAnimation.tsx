"use client";

import { useEffect, useRef, useState } from "react";
import { TarotCardBack, TarotCardFace, type TarotCardFaceData } from "@/components/TarotCardFace";

type RitualStage = "drawing" | "selecting" | "revealing";

// ─── Responsive helpers ────────────────────────────────────────────────────────

/**
 * Lightweight hook that tracks whether the viewport is below the `sm` breakpoint
 * (< 640 px).  Used to switch fan parameters between mobile and desktop.
 */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

// ─── Fan geometry ──────────────────────────────────────────────────────────────

const FAN_TOTAL = 7; // fewer cards → less overlap → easier to tap

/** Evenly-spaced rotation angle for the i-th card */
function fanAngle(index: number, total: number, arcDeg: number): number {
  return -arcDeg / 2 + (index / (total - 1)) * arcDeg;
}

// ─── FanCard ───────────────────────────────────────────────────────────────────

interface FanCardProps {
  index: number;
  total: number;
  arcDeg: number;
  cardWidth: number; // px
  isPicked: boolean;
  disabled: boolean;
  onClick: () => void;
}

/**
 * A single card in the fan spread.
 *
 * Outer `div`  → fan rotation, transform-origin: bottom center
 *               (all cards pivot from the same point — like holding a hand)
 * Inner `button` → hover/pick lift, independent of the fan rotation
 */
function FanCard({ index, total, arcDeg, cardWidth, isPicked, disabled, onClick }: FanCardProps) {
  const [arrived, setArrived] = useState(false);
  const angle = fanAngle(index, total, arcDeg);

  // Staggered entrance: cards fan out one-by-one from the centre pile
  useEffect(() => {
    const t = window.setTimeout(() => setArrived(true), 60 + index * 70);
    return () => window.clearTimeout(t);
  }, [index]);

  // Slight initial angle so cards "unfurl" from a pile rather than
  // appearing from below at already-spread angles.
  const initAngle = angle * 0.15;

  return (
    // Outer wrapper — handles the fan rotation
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: "50%",
        width: cardWidth,
        transformOrigin: "bottom center",
        transform: arrived
          ? `translateX(-50%) rotate(${angle}deg)`
          : `translateX(-50%) rotate(${initAngle}deg) translateY(76px)`,
        opacity: arrived ? 1 : 0,
        transition: `transform 0.58s cubic-bezier(0.2, 0.82, 0.24, 1) ${index * 0.05}s,
                     opacity 0.38s ease ${index * 0.05}s`,
        zIndex: isPicked ? 30 : index + 1,
      }}
    >
      {/* Inner button — hover lift / pick lift */}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={`選擇第 ${index + 1} 張牌`}
        className={[
          "block w-full rounded-[1.2rem] outline-none",
          "transition-[transform,filter,opacity] duration-200",
          "focus-visible:ring-2 focus-visible:ring-[#d8bd70]/70",
          isPicked
            ? "-translate-y-10 drop-shadow-[0_0_24px_rgba(216,189,112,1)]"
            : disabled
            ? "cursor-not-allowed opacity-40"
            : "cursor-pointer hover:-translate-y-5 hover:drop-shadow-[0_0_14px_rgba(216,189,112,0.7)]",
        ].join(" ")}
      >
        <div className="relative">
          {/* Golden ring overlay when picked */}
          {isPicked && (
            <div className="pointer-events-none absolute inset-0 z-10 rounded-[1.2rem] ring-2 ring-[#d8bd70] shadow-[0_0_20px_rgba(216,189,112,0.85)]" />
          )}
          <TarotCardBack compact />
        </div>
      </button>
    </div>
  );
}

// ─── TarotShuffleAnimation ─────────────────────────────────────────────────────

/**
 * Drop-in replacement for `TarotRitualDraw`.  Same props interface.
 *
 * drawing   → riffle shuffle: deck splits into two piles then merges (CSS anim)
 * selecting → fan spread: cards arc out, user taps 1 (single) or 3 (three-card)
 * revealing → existing flip-reveal CSS
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
  const isMobile = useIsMobile();

  // Responsive fan parameters ─────────────────────────────────────────────────
  // Desktop: ±35 °, card 96 px wide (≈ 96×144 hit area)
  // Mobile : ±28 °, card 72 px wide (≈ 72×108 hit area)
  const fanArc = isMobile ? 56 : 70;   // total arc in degrees (±28° / ±35°)
  const cardW  = isMobile ? 72 : 96;   // card width in px
  const fanH   = isMobile ? 280 : 360; // container height in px

  // Fan pick state ─────────────────────────────────────────────────────────────
  const [pickedFanIndices, setPickedFanIndices] = useState<number[]>([]);
  const selectCalledRef = useRef(false);

  // Reset fan state whenever we re-enter the selecting stage
  useEffect(() => {
    if (stage === "selecting") {
      setPickedFanIndices([]);
      selectCalledRef.current = false;
    }
  }, [stage]);

  function handleFanPick(fanIndex: number) {
    if (selectCalledRef.current) return;
    if (pickedFanIndices.includes(fanIndex)) return;

    const next = [...pickedFanIndices, fanIndex];
    setPickedFanIndices(next);

    // 1 pick for single-card mode, 3 picks for three-card mode
    if (next.length >= cardCount) {
      selectCalledRef.current = true;
      window.setTimeout(() => onSelect(0), 700);
    }
  }

  // Derived display values ─────────────────────────────────────────────────────
  const headingText =
    stage === "drawing"
      ? "星光正在洗牌"
      : stage === "selecting"
      ? cardCount === 1
        ? "請選一張牌"
        : `請選擇三張牌（${pickedFanIndices.length} / 3）`
      : "牌面正在醒來";

  const subText =
    stage === "selecting"
      ? cardCount === 1
        ? "從牌面中感受吸引你的那一張"
        : "依序點選三張，感受宇宙的引導"
      : null;

  const ritualLines = [
    "宇宙正在聽你說話……",
    "請在心裡默念你的問題",
    "當你準備好時，選一張牌",
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────
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
              <p
                key={line}
                className="ritual-line-fade text-base leading-7 text-moon/72"
                style={{ animationDelay: `${i * 0.8}s` }}
              >
                {line}
              </p>
            ))}
          </div>
        )}

        {subText && (
          <p className="mt-3 text-sm text-moon/56">{subText}</p>
        )}
      </div>

      {/* ── Stage: drawing — riffle shuffle ── */}
      {stage === "drawing" && (
        <div className="relative z-10 mx-auto mt-8 h-[260px] max-w-[520px] sm:h-[300px]">
          {/* Always show 6 cards during the shuffle, regardless of draw mode */}
          {Array.from({ length: 6 }).map((_, i) => {
            const cardNum = i + 1;
            // Odd card numbers → left pile, even → right pile
            const isLeft = cardNum % 2 === 1;
            return (
              <div
                key={i}
                className={`riffle-card riffle-card-${cardNum} ${isLeft ? "riffle-card-left" : "riffle-card-right"}`}
              >
                <TarotCardBack compact />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Stage: selecting — fan spread ── */}
      {stage === "selecting" && (
        <div
          className="relative z-10 mx-auto mt-8 w-full max-w-[680px]"
          style={{ height: fanH }}
          aria-label="扇形牌面，請選擇"
        >
          {Array.from({ length: FAN_TOTAL }).map((_, fanIdx) => (
            <FanCard
              key={fanIdx}
              index={fanIdx}
              total={FAN_TOTAL}
              arcDeg={fanArc}
              cardWidth={cardW}
              isPicked={pickedFanIndices.includes(fanIdx)}
              disabled={pickedFanIndices.length >= cardCount}
              onClick={() => handleFanPick(fanIdx)}
            />
          ))}
        </div>
      )}

      {/* ── Stage: revealing — flip reveal ── */}
      {stage === "revealing" && (
        <div className="relative z-10 mt-8 grid grid-cols-1 items-start gap-8 md:grid-cols-2 xl:grid-cols-3">
          {(revealedCards.length ? revealedCards : [null]).map((card, i) => (
            <article
              key={card ? `${card.id}-${i}` : i}
              className="ritual-reveal-card tarot-card-shell mx-auto w-full max-w-[420px]"
            >
              <div className="ritual-stardust" />
              {card ? <TarotCardFace card={card} topic={topic} /> : <TarotCardBack />}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
