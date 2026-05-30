"use client";

import { useEffect, useRef, useState } from "react";
import { TarotCardBack, TarotCardFace, type TarotCardFaceData } from "@/components/TarotCardFace";

type RitualStage = "drawing" | "selecting" | "revealing";

// ─── Responsive helpers ────────────────────────────────────────────────────────

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

/** Evenly-spaced rotation angle for the i-th card. */
function fanAngle(index: number, total: number, arcDeg: number): number {
  if (total === 1) return 0;
  return -arcDeg / 2 + (index / (total - 1)) * arcDeg;
}

// ─── FanCard ───────────────────────────────────────────────────────────────────

interface FanCardProps {
  index: number;
  total: number;
  arcDeg: number;
  cardWidth: number;
  isPicked: boolean;
  disabled: boolean;
  onClick: () => void;
}

/**
 * A single card in the fan spread.
 *
 * Architecture:
 *   - The parent renders a zero-size "pivot div" at (50%, pivotY%) of the container.
 *   - Each FanCard positions itself with `bottom: 0; left: 0` relative to that pivot.
 *   - `transform-origin: bottom center` + `rotate(angle)` fans the card around the pivot.
 *   - The inner button handles hover/pick lift independently of the rotation.
 */
function FanCard({ index, total, arcDeg, cardWidth, isPicked, disabled, onClick }: FanCardProps) {
  const [arrived, setArrived] = useState(false);
  const angle = fanAngle(index, total, arcDeg);

  useEffect(() => {
    // Stagger: cards fan out left→right, 30 ms apart
    const t = window.setTimeout(() => setArrived(true), 60 + index * 30);
    return () => window.clearTimeout(t);
  }, [index]);

  return (
    // Outer div: fan rotation around the pivot point
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        width: cardWidth,
        transformOrigin: "bottom center",
        // Entrance: start collapsed slightly below the pivot (translateY ≥ 0 → downward)
        // Arrival: full rotation to fan angle
        transform: arrived
          ? `translateX(-50%) rotate(${angle}deg)`
          : `translateX(-50%) rotate(${angle * 0.2}deg) translateY(28px) scale(0.88)`,
        opacity: arrived ? 1 : 0,
        transition: [
          `transform 0.52s cubic-bezier(0.2, 0.82, 0.22, 1) ${index * 0.028}s`,
          `opacity 0.36s ease ${index * 0.028}s`,
        ].join(", "),
        // z-index: rightmost card on top by default; picked cards always on top
        zIndex: isPicked ? 50 : index + 1,
      }}
    >
      {/* Inner button: hover/pick lift — independent of rotation */}
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
            ? "-translate-y-10 drop-shadow-[0_0_26px_rgba(216,189,112,1)] scale-105"
            : disabled
            ? "cursor-not-allowed opacity-25"
            : "cursor-pointer hover:-translate-y-5 hover:scale-105 hover:drop-shadow-[0_0_14px_rgba(216,189,112,0.75)]",
        ].join(" ")}
      >
        <div className="relative">
          {isPicked && (
            <div className="pointer-events-none absolute inset-0 z-10 rounded-[1.2rem] ring-2 ring-[#d8bd70] shadow-[0_0_22px_rgba(216,189,112,0.9)]" />
          )}
          <TarotCardBack compact />
        </div>
      </button>
    </div>
  );
}

// ─── TarotShuffleAnimation ─────────────────────────────────────────────────────

/**
 * Drop-in replacement for `TarotRitualDraw`.  Identical props.
 *
 * drawing   → riffle shuffle CSS (two-pile split + merge)
 * selecting → fan spread: 21 desktop / 15 mobile cards arc out from a centered
 *             pivot; user taps 1 (single) or 3 (three-card mode)
 * revealing → existing ritual-reveal-card flip CSS
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

  // ─── Responsive fan parameters ───────────────────────────────────────────────
  //
  // Desktop (≥ 640 px):
  //   21 cards  •  ±42° arc (84° total)  •  88 px wide  •  300 px container
  //   Hit area ≈ 88 × 132 px per card
  //
  // Mobile (< 640 px):
  //   15 cards  •  ±32° arc (64° total)  •  62 px wide  •  260 px container
  //   Hit area ≈ 62 × 93 px per card
  //
  const fanTotal = isMobile ? 15 : 21;
  const fanArc   = isMobile ? 64 : 84;   // total degrees (±32° / ±42°)
  const cardW    = isMobile ? 62 : 88;   // card width px
  const fanH     = isMobile ? 260 : 300; // outer container height px
  //
  // Pivot Y: how far down from the container top the fan pivot sits.
  // 68% → the pivot is roughly 2/3 down, leaving ~1/3 of the container
  // above it for the cards to fan into (visually centred in upper area).
  //
  const pivotPct = 68; // %

  // ─── Fan pick state ──────────────────────────────────────────────────────────
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
      window.setTimeout(() => onSelect(0), 700);
    }
  }

  // ─── Heading & sub-text ──────────────────────────────────────────────────────
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

  // ─── Render ──────────────────────────────────────────────────────────────────
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
              <p key={line} className="ritual-line-fade text-base leading-7 text-moon/72" style={{ animationDelay: `${i * 0.8}s` }}>
                {line}
              </p>
            ))}
          </div>
        )}

        {subText && <p className="mt-3 text-sm text-moon/56">{subText}</p>}
      </div>

      {/* ── Stage: drawing — riffle shuffle ─────────────────────────────────── */}
      {stage === "drawing" && (
        <div className="relative z-10 mx-auto mt-8 h-[260px] max-w-[520px] sm:h-[300px]">
          {Array.from({ length: 6 }).map((_, i) => {
            const cardNum = i + 1;
            const isLeft = cardNum % 2 === 1; // 1,3,5 → left pile; 2,4,6 → right
            return (
              <div key={i} className={`riffle-card riffle-card-${cardNum} ${isLeft ? "riffle-card-left" : "riffle-card-right"}`}>
                <TarotCardBack compact />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Stage: selecting — fan spread ───────────────────────────────────── */}
      {stage === "selecting" && (
        /*
          Outer container: sets the visible bounds and overall height.
          max-w-[920px] on desktop gives the fan enough horizontal room for ±42°.
        */
        <div
          className="relative z-10 mx-auto mt-6 w-full max-w-[380px] sm:max-w-[920px]"
          style={{ height: fanH }}
          aria-label="扇形牌面，請選擇"
        >
          {/*
            Zero-size pivot div: positioned at (50%, pivotPct%) of the container.
            All FanCards use bottom:0/left:0 relative to THIS div, so their
            bottom-center sits exactly on the pivot point.
            Cards fan upward and outward from here via rotate(angle).
          */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: `${pivotPct}%`,
              width: 0,
              height: 0,
            }}
          >
            {Array.from({ length: fanTotal }).map((_, fanIdx) => (
              <FanCard
                key={fanIdx}
                index={fanIdx}
                total={fanTotal}
                arcDeg={fanArc}
                cardWidth={cardW}
                isPicked={pickedFanIndices.includes(fanIdx)}
                disabled={pickedFanIndices.length >= cardCount}
                onClick={() => handleFanPick(fanIdx)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Stage: revealing — flip reveal ──────────────────────────────────── */}
      {stage === "revealing" && (
        <div className="relative z-10 mt-8 grid grid-cols-1 items-start gap-8 md:grid-cols-2 xl:grid-cols-3">
          {(revealedCards.length ? revealedCards : [null]).map((card, i) => (
            <article key={card ? `${card.id}-${i}` : i} className="ritual-reveal-card tarot-card-shell mx-auto w-full max-w-[420px]">
              <div className="ritual-stardust" />
              {card ? <TarotCardFace card={card} topic={topic} /> : <TarotCardBack />}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
