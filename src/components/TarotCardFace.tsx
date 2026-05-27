"use client";

import Image from "next/image";
import { useState } from "react";
import type { TarotCardTopicMeaning, TarotSuit, TarotTopicKey } from "@/data/tarotCards";

export type TarotCardFaceData = {
  id: string;
  suit?: TarotSuit;
  nameEn?: string;
  nameZh?: string;
  name: string;
  image: string;
  keywords: string[];
  uprightKeywords?: string[];
  reversedKeywords?: string[];
  uprightMeaning?: string;
  reversedMeaning?: string;
  meanings?: Partial<Record<TarotTopicKey, TarotCardTopicMeaning>>;
  orientation: "upright" | "reversed";
  orientationLabel: "正位" | "逆位";
  position?: "過去" | "現在" | "未來";
  cosmicMessage: string;
};

const positionDescriptions: Record<NonNullable<TarotCardFaceData["position"]>, string> = {
  過去: "代表最近影響你的背景、情緒或原因。",
  現在: "代表你目前的狀態與正在面對的事。",
  未來: "代表接下來可能的走向與提醒。"
};

export function TarotCardBack({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`tarot-card-back flex aspect-[2/3] w-full ${
        compact ? "max-w-[280px]" : "max-w-[420px]"
      } flex-col items-center justify-center rounded-[28px] p-5 shadow-glow`}
    >
      <div className="tarot-inner-frame flex h-full w-full flex-col items-center justify-center rounded-[1.1rem]">
        {/* Q版貓咪臉 – solid-colour version so duplicate IDs never conflict */}
        <svg
          viewBox="0 0 80 92"
          xmlns="http://www.w3.org/2000/svg"
          className={compact ? "h-20 w-20" : "h-24 w-24"}
          aria-hidden="true"
        >
          {/* Head */}
          <circle cx="40" cy="48" r="28" fill="#16103a" />

          {/* Left ear outer / inner */}
          <polygon points="14,36 20,10 34,30" fill="#16103a" />
          <polygon points="18,32 21,15 31,28" fill="#3d1a5c" />

          {/* Right ear outer / inner */}
          <polygon points="66,36 60,10 46,30" fill="#16103a" />
          <polygon points="62,32 59,15 49,28" fill="#3d1a5c" />

          {/* Forehead crescent moon mark */}
          <path
            d="M36 30 Q40 23 45 25 Q39 29 38 36 Q33 33 36 30Z"
            fill="#d8bd70"
            opacity="0.92"
          />

          {/* Left eye – solid amber + pupil + shine */}
          <ellipse cx="30" cy="48" rx="8.5" ry="7"   fill="#d4960a" />
          <ellipse cx="30" cy="49" rx="4"   ry="5.5" fill="#050814" />
          <circle  cx="33" cy="44" r="2"             fill="white" opacity="0.85" />

          {/* Right eye */}
          <ellipse cx="50" cy="48" rx="8.5" ry="7"   fill="#d4960a" />
          <ellipse cx="50" cy="49" rx="4"   ry="5.5" fill="#050814" />
          <circle  cx="53" cy="44" r="2"             fill="white" opacity="0.85" />

          {/* Nose */}
          <path d="M37 58 L40 62 L43 58 Q40 55 37 58Z" fill="#cbb8ff" opacity="0.85" />

          {/* Mouth */}
          <path
            d="M35 62 Q40 66 45 62"
            fill="none"
            stroke="#cbb8ff"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.65"
          />

          {/* Whiskers */}
          <line x1="8"  y1="55" x2="28" y2="56" stroke="#cbb8ff" strokeWidth="1" opacity="0.48" />
          <line x1="7"  y1="60" x2="28" y2="60" stroke="#cbb8ff" strokeWidth="1" opacity="0.38" />
          <line x1="72" y1="55" x2="52" y2="56" stroke="#cbb8ff" strokeWidth="1" opacity="0.48" />
          <line x1="73" y1="60" x2="52" y2="60" stroke="#cbb8ff" strokeWidth="1" opacity="0.38" />

          {/* Corner sparkles */}
          <text x="0"  y="16" fill="#d8bd70" fontSize="9" opacity="0.72">✦</text>
          <text x="66" y="18" fill="#cbb8ff" fontSize="7" opacity="0.60">✦</text>
        </svg>

        <p className="mt-3 text-sm tracking-[0.28em] text-lavender/82">
          <span className="mr-1 text-[#d8bd70]/65">✦</span>
          COSMIC TAROT
          <span className="ml-1 text-[#d8bd70]/65">✦</span>
        </p>
      </div>
    </div>
  );
}

export function TarotCardFace({ card, topic }: { card: TarotCardFaceData; topic: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const isUpright = card.orientation !== "reversed";
  const isReversed = card.orientation === "reversed";

  if (imageFailed || !card.image) {
    return <TarotCardBack />;
  }

  return (
    <div className={`tarot-image-card ${isUpright ? "tarot-card-face-upright" : "tarot-card-face-reversed"}`}>
      <div className="tarot-image-stage">
        <div className="tarot-image-shell">
          <Image
            src={card.image}
            alt={`${card.name} 塔羅牌`}
            width={960}
            height={1440}
            unoptimized
            priority={false}
            className={`h-full w-full object-contain transition-transform duration-500 ${isReversed ? "rotate-180" : ""}`}
            sizes="(max-width: 768px) 86vw, 420px"
            onError={() => setImageFailed(true)}
          />
        </div>
        <div className="pointer-events-none absolute inset-0 rounded-[28px] ring-1 ring-[#d8bd70]/45" />
        <p className="absolute left-4 top-4 rounded-full border border-[#d8bd70]/35 bg-midnight/72 px-3 py-1 text-xs uppercase tracking-[0.22em] text-moon backdrop-blur">
          {card.position ?? topic}
        </p>
      </div>

      <div className="border-t border-white/10 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-3xl font-semibold text-moon">{card.name}</h3>
          <span
            className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
              isUpright ? "border-aurora/40 bg-aurora/12 text-aurora" : "border-lavender/44 bg-lavender/14 text-lavender"
            }`}
          >
            {card.orientationLabel}
          </span>
        </div>
        <p className="mt-3 text-base leading-7 text-lavender">{card.keywords.join(" / ")}</p>
        <div className="mt-4 rounded-2xl border border-white/10 bg-midnight/42 p-4 pr-3">
          <p className="text-sm text-lavender">宇宙訊息</p>
          {card.position ? <p className="mt-2 text-base leading-7 text-moon">{card.position}：{positionDescriptions[card.position]}</p> : null}
          <p className="mt-2 text-base leading-8 text-moon/84">{card.cosmicMessage}</p>
        </div>
      </div>
    </div>
  );
}
