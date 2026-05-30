"use client";

import { useEffect, useRef, useState } from "react";
import { TarotCardBack, TarotCardFace, type TarotCardFaceData } from "@/components/TarotCardFace";

type RitualStage = "drawing" | "selecting" | "revealing";

// ─── Fan geometry ──────────────────────────────────────────────────────────────

const FAN_TOTAL = 9;
const FAN_ARC_DEG = 80; // total spread in degrees — safe on mobile (±40° each side)

/** Rotation angle for the i-th card in a fan of `total` cards */
function fanAngle(index: number, total: number): number {
  return -FAN_ARC_DEG / 2 + (index / (total - 1)) * FAN_ARC_DEG;
}

// ─── FanCard ───────────────────────────────────────────────────────────────────

interface FanCardProps {
  index: number;
  total: number;
  isPicked: boolean;
  disabled: boolean;
  onClick: () => void;
}

/**
 * A single card in the fan spread.
 *
 * Layout approach:
 *   • Outer `div` — handles fan rotation via `transform-origin: bottom center`.
 *     Its bottom-center is pinned to the container's bottom-center so all cards
 *     share the same pivot point (like holding a hand of cards).
 *   • Inner `button` — handles the hover lift and pick-lift with Tailwind classes,
 *     independent of the parent rotation.
 */
function FanCard({ index, total, isPicked, disabled, onClick }: FanCardProps) {
  const [arrived, setArrived] = useState(false);
  const angle = fanAngle(index, total);

  // Staggered entrance: cards fan out one by one from the center
  useEffect(() => {
    const t = window.setTimeout(() => setArrived(true), 80 + index * 65);
    return () => window.clearTimeout(t);
  }, [index]);

  return (
    // Outer positioning wrapper — rotation pivot at card's bottom-center
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: "50%",
        width: 82,
        transformOrigin: "bottom center",
        // Start collapsed/below → arrive at fan angle
        transform: arrived
          ? `translateX(-50%) rotate(${angle}deg)`
          : `translateX(-50%) rotate(${angle * 0.15}deg) translateY(80px)`,
        opacity: arrived ? 1 : 0,
        transition: `transform 0.55s cubic-bezier(0.2, 0.82, 0.24, 1) ${index * 0.04}s,
                     opacity 0.35s ease ${index * 0.04}s`,
        zIndex: isPicked ? 20 : index + 1,
      }}
    >
      {/* Inner button — hover / pick lift lives here so it doesn't interfere with rotation */}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={`選擇第 ${index + 1} 張牌`}
        className={[
          "block w-full rounded-[1.1rem] outline-none",
          "transition-[transform,filter,opacity] duration-200",
          "focus-visible:ring-2 focus-visible:ring-[#d8bd70]/70",
          isPicked
            ? "-translate-y-9 drop-shadow-[0_0_22px_rgba(216,189,112,1)]"
            : disabled
            ? "cursor-not-allowed opacity-40"
            : "hover:-translate-y-4 hover:drop-shadow-[0_0_12px_rgba(216,189,112,0.65)] cursor-pointer",
        ].join(" ")}
      >
        {/* Golden ring overlay when picked */}
        <div className="relative">
          {isPicked && (
            <div className="pointer-events-none absolute inset-0 z-10 rounded-[1.1rem] ring-2 ring-[#d8bd70] shadow-[0_0_18px_rgba(216,189,112,0.8)]" />
          )}
          <TarotCardBack compact />
        </div>
      </button>
    </div>
  );
}

// ─── TarotShuffleAnimation ─────────────────────────────────────────────────────

/**
 * Drop-in replacement for `TarotRitualDraw`.
 *
 * Stages:
 *   drawing   — existing `ritual-shuffle-card` CSS (left/right stagger pile)
 *   selecting — fan spread: cards arc out, user taps 1 (single) or 3 (three-card)
 *   revealing — existing `ritual-reveal-card` flip CSS
 *
 * Props are identical to TarotRitualDraw so the swap in TarotDrawClient.tsx
 * requires only changing the import and JSX tag name.
 */
export function TarotShuffleAnimation({
  stage,
  cardCount,
  selectedIndex: _selectedIndex, // kept for API compatibility; not used for display
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
  // Fan pick state ─────────────────────────────────────────────────────────────
  const [pickedFanIndices, setPickedFanIndices] = useState<number[]>([]);
  // Ref guard: prevents calling onSelect more than once even under React StrictMode
  const selectCalledRef = useRef(false);

  // Reset fan state whenever we re-enter the selecting stage (new draw)
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

    // Single mode: 1 pick; three-card mode: 3 picks
    if (next.length >= cardCount) {
      selectCalledRef.current = true;
      // Brief pause so the user sees the last pick light up before transitioning
      window.setTimeout(() => onSelect(0), 680);
    }
  }

  // Derived display ────────────────────────────────────────────────────────────
  const backs = Array.from({ length: Math.max(3, cardCount) });

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

      {/* Floating gold dust particles */}
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

        {/* Drawing: pulsing ritual lines */}
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

        {/* Selecting: short instruction */}
        {subText && (
          <p className="mt-3 text-sm text-moon/56">{subText}</p>
        )}
      </div>

      {/* ── Stage: drawing ── */}
      {stage === "drawing" && (
        <div className="relative z-10 mx-auto mt-8 h-[260px] max-w-[520px] sm:h-[300px]">
          {backs.slice(0, 6).map((_, i) => (
            <div key={i} className={`ritual-shuffle-card ritual-shuffle-card-${i + 1}`}>
              <TarotCardBack compact />
            </div>
          ))}
        </div>
      )}

      {/* ── Stage: selecting (fan spread) ── */}
      {stage === "selecting" && (
        <div
          className="relative z-10 mx-auto mt-8 max-w-[600px]"
          style={{ height: 310 }}
          aria-label="扇形牌面，請選擇一張"
        >
          {Array.from({ length: FAN_TOTAL }).map((_, fanIdx) => (
            <FanCard
              key={fanIdx}
              index={fanIdx}
              total={FAN_TOTAL}
              isPicked={pickedFanIndices.includes(fanIdx)}
              disabled={pickedFanIndices.length >= cardCount}
              onClick={() => handleFanPick(fanIdx)}
            />
          ))}
        </div>
      )}

      {/* ── Stage: revealing ── */}
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
