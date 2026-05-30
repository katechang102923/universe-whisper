"use client";

import { useEffect, useRef, useState } from "react";
import { TarotCardBack, TarotCardFace, type TarotCardFaceData } from "@/components/TarotCardFace";

type RitualStage = "drawing" | "selecting" | "revealing";

// ─── Responsive hook ───────────────────────────────────────────────────────────

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

/** Evenly-spaced rotation angle for the i-th card in a fan. */
function fanAngle(index: number, total: number, arcDeg: number): number {
  if (total === 1) return 0;
  return -arcDeg / 2 + (index / (total - 1)) * arcDeg;
}

// ─── FanCard ───────────────────────────────────────────────────────────────────

interface FanCardProps {
  index: number;
  total: number;
  arcDeg: number;
  /** Card visual width in px (height = width × 1.5) */
  cardWidth: number;
  /**
   * Invisible "stem" length in px below the card visual.
   * The outer wrapper height = cardHeight + stemLength.
   * transform-origin: bottom center pivots the wrapper at the pivot point
   * (container's bottom), so the effective fan radius =
   * cardHeight + stemLength.  A longer stem → more spread between cards.
   */
  stemLength: number;
  isPicked: boolean;
  disabled: boolean;
  onClick: () => void;
}

/**
 * A single card in the fan spread.
 *
 * Structure:
 *   Outer div (w=cardWidth, h=cardHeight+stemLength)
 *     ├ position: absolute; bottom:0; left:50%  — sits at the container's pivot
 *     ├ transform-origin: bottom center          — rotates around the pivot
 *     └ button (position:absolute; top:0)        — only covers the card visual
 *         └ TarotCardBack                        — the actual visible card
 *
 * The invisible stem (bottom portion of outer div) pushes the effective
 * fan radius beyond the card height, giving visible spacing between cards.
 */
function FanCard({
  index, total, arcDeg, cardWidth, stemLength, isPicked, disabled, onClick,
}: FanCardProps) {
  const [arrived, setArrived] = useState(false);
  const angle  = fanAngle(index, total, arcDeg);
  const cardH  = Math.round(cardWidth * 1.5); // aspect 2:3
  const totalH = cardH + stemLength;

  // Staggered entrance — cards fan out left-to-right
  useEffect(() => {
    const t = window.setTimeout(() => setArrived(true), 55 + index * 48);
    return () => window.clearTimeout(t);
  }, [index]);

  return (
    /* ── Outer rotating wrapper ──────────────────────────────────────────── */
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: "50%",
        width: cardWidth,
        height: totalH,
        transformOrigin: "bottom center",
        // Entrance: start slightly collapsed below pivot, then fan out
        transform: arrived
          ? `translateX(-50%) rotate(${angle}deg)`
          : `translateX(-50%) rotate(${angle * 0.18}deg) scale(0.86)`,
        opacity: arrived ? 1 : 0,
        transition: [
          `transform 0.58s cubic-bezier(0.2, 0.82, 0.22, 1) ${index * 0.048}s`,
          `opacity 0.38s ease ${index * 0.048}s`,
        ].join(", "),
        // Picked cards always on top; otherwise left→right z-order (right = top)
        zIndex: isPicked ? 60 : index + 1,
      }}
    >
      {/* ── Card visual button — TOP of the wrapper only ─────────────────── */}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={`選擇第 ${index + 1} 張牌`}
        style={{ position: "absolute", top: 0, left: 0, right: 0 }}
        className={[
          "rounded-[1.2rem] outline-none",
          "transition-[transform,filter,opacity] duration-200",
          "focus-visible:ring-2 focus-visible:ring-[#d8bd70]/70",
          isPicked
            // Lift the card along its own axis (looks natural in the rotated frame)
            ? "-translate-y-7 drop-shadow-[0_0_26px_rgba(216,189,112,1)]"
            : disabled
            ? "cursor-not-allowed opacity-20"
            : "cursor-pointer hover:-translate-y-4 hover:drop-shadow-[0_0_14px_rgba(216,189,112,0.75)]",
        ].join(" ")}
      >
        <div className="relative">
          {isPicked && (
            <div className="pointer-events-none absolute inset-0 z-10 rounded-[1.2rem] ring-2 ring-[#d8bd70] shadow-[0_0_22px_rgba(216,189,112,0.9)]" />
          )}
          <TarotCardBack compact />
        </div>
      </button>

      {/* ── Invisible stem — bottom portion, no content, no pointer events ── */}
      {/* This empty space is what extends the effective pivot radius.        */}
    </div>
  );
}

// ─── TarotShuffleAnimation ─────────────────────────────────────────────────────

/**
 * Drop-in replacement for TarotRitualDraw.  Same props.
 *
 * drawing   → riffle shuffle (CSS keyframes in globals.css)
 * selecting → fan spread with stem-extended radius so cards are clearly
 *             separated as individual click targets
 * revealing → existing ritual-reveal-card flip CSS
 *
 * Fan parameters (desktop / mobile):
 *   Cards : 9   / 7
 *   Arc   : ±42° / ±30°
 *   Width : 88px / 64px
 *   Stem  : 130px / 80px
 *   Radius: 262px / 176px  (cardH + stem)
 *   Spacing between card centres: ≈ 24px / 15px at the card tip
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

  // ─── Responsive fan parameters ───────────────────────────────────────────
  const fanTotal = isMobile ? 7  : 9;    // card count
  const fanArc   = isMobile ? 60 : 84;   // total arc °  (±30 / ±42)
  const cardW    = isMobile ? 64 : 88;   // card width px
  const stemH    = isMobile ? 80 : 130;  // stem px  → radius = cardH + stem
  // Container height: must hold the tallest card (at 0°) above pivot.
  // tallest wrapper = cardW×1.5 + stem.  Add ~30px top breathing room.
  const fanH     = isMobile
    ? Math.round(64 * 1.5) + 80  + 50   // 96+80+50 = 226 → 280px
    : Math.round(88 * 1.5) + 130 + 50;  // 132+130+50 = 312 → 360px

  // ─── Fan pick state ──────────────────────────────────────────────────────
  const [pickedFanIndices, setPickedFanIndices] = useState<number[]>([]);
  const selectCalledRef = useRef(false);

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
    if (next.length >= cardCount) {
      selectCalledRef.current = true;
      window.setTimeout(() => onSelect(0), 720);
    }
  }

  // ─── Derived text ────────────────────────────────────────────────────────
  const headingText =
    stage === "drawing"   ? "星光正在洗牌"
    : stage === "selecting"
      ? cardCount === 1   ? "請選一張牌"
                          : `請選擇三張牌（${pickedFanIndices.length} / 3）`
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
            const isLeft = n % 2 === 1; // 1,3,5 → left; 2,4,6 → right
            return (
              <div key={i} className={`riffle-card riffle-card-${n} ${isLeft ? "riffle-card-left" : "riffle-card-right"}`}>
                <TarotCardBack compact />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Stage: selecting — fan spread ───────────────────────────────── */}
      {stage === "selecting" && (
        /*
         * The fan container sits relative to itself; all cards use
         * `bottom:0; left:50%` so their invisible-stem bottom (= pivot)
         * is pinned to the container's bottom-center.
         * Cards fan upward from this pivot via rotate(angle).
         * Container is wide enough so the section's overflow:hidden
         * never clips the outermost cards.
         */
        <div
          className="relative z-10 mx-auto mt-8"
          style={{
            width: "100%",
            maxWidth: isMobile ? 380 : 920,
            height: fanH,
          }}
          aria-label="扇形牌面，請選擇"
        >
          {Array.from({ length: fanTotal }).map((_, fanIdx) => (
            <FanCard
              key={fanIdx}
              index={fanIdx}
              total={fanTotal}
              arcDeg={fanArc}
              cardWidth={cardW}
              stemLength={stemH}
              isPicked={pickedFanIndices.includes(fanIdx)}
              disabled={pickedFanIndices.length >= cardCount}
              onClick={() => handleFanPick(fanIdx)}
            />
          ))}
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
