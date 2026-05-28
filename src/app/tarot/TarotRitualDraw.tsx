"use client";

import { TarotCardBack, TarotCardFace, type TarotCardFaceData } from "@/components/TarotCardFace";

type RitualStage = "drawing" | "selecting" | "revealing";

export function TarotRitualDraw({
  stage,
  cardCount,
  selectedIndex,
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
  const backs = Array.from({ length: Math.max(3, cardCount) });
  const ritualLines = [
    "宇宙正在聽你說話……",
    "請在心裡默念你的問題",
    "當你準備好時，選一張牌",
  ];

  return (
    <section className="relative z-10 mt-7 overflow-hidden rounded-[2rem] border border-[#d8bd70]/24 bg-midnight/54 p-5 text-center shadow-glow sm:p-7">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <span className="ritual-dust left-[12%] top-[18%]" />
        <span className="ritual-dust left-[82%] top-[24%] [animation-delay:0.8s]" />
        <span className="ritual-dust left-[48%] top-[78%] [animation-delay:1.4s]" />
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="absolute right-4 top-4 z-10 rounded-full border border-white/12 bg-white/8 px-4 py-2 text-xs font-medium text-moon/72 transition hover:bg-white/12 hover:text-moon"
      >
        略過動畫
      </button>

      <div className="relative z-10 mx-auto max-w-2xl pt-8 sm:pt-4">
        <p className="text-xs uppercase tracking-[0.3em] text-[#d8bd70]/78">cosmic ritual</p>
        <h3 className="mt-3 text-2xl font-semibold text-moon sm:text-3xl">
          {stage === "drawing" ? "星光正在洗牌" : stage === "selecting" ? "請選一張牌" : "牌面正在醒來"}
        </h3>
        <div className="mt-4 space-y-2">
          {ritualLines.map((line, index) => (
            <p
              key={line}
              className={`text-base leading-7 text-moon/72 ${stage === "drawing" ? "ritual-line-fade" : ""}`}
              style={{ animationDelay: `${index * 0.8}s` }}
            >
              {line}
            </p>
          ))}
        </div>
      </div>

      {stage === "drawing" ? (
        <div className="relative z-10 mx-auto mt-8 h-[260px] max-w-[520px] sm:h-[300px]">
          {backs.slice(0, 6).map((_, index) => (
            <div key={index} className={`ritual-shuffle-card ritual-shuffle-card-${index + 1}`}>
              <TarotCardBack compact />
            </div>
          ))}
        </div>
      ) : null}

      {stage === "selecting" ? (
        <div className="relative z-10 mt-8 grid grid-cols-3 gap-3 sm:mx-auto sm:max-w-2xl sm:gap-5">
          {backs.slice(0, 3).map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => onSelect(index)}
              className={`ritual-choice-card rounded-[1.4rem] transition hover:-translate-y-2 focus:outline-none focus:ring-2 focus:ring-[#d8bd70]/70 ${
                selectedIndex === index ? "ring-2 ring-[#d8bd70]/80" : ""
              }`}
              aria-label={`選擇第 ${index + 1} 張牌`}
            >
              <TarotCardBack compact />
            </button>
          ))}
        </div>
      ) : null}

      {stage === "revealing" ? (
        <div className="relative z-10 mt-8 grid grid-cols-1 items-start gap-8 md:grid-cols-2 xl:grid-cols-3">
          {(revealedCards.length ? revealedCards : [null]).map((card, index) => (
            <article key={card ? `${card.id}-${index}` : index} className="ritual-reveal-card tarot-card-shell mx-auto w-full max-w-[420px]">
              <div className="ritual-stardust" />
              {card ? <TarotCardFace card={card} topic={topic} /> : <TarotCardBack />}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
