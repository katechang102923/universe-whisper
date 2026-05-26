"use client";

import Image from "next/image";
import { useState } from "react";

export type TarotCardFaceData = {
  id: string;
  name: string;
  image: string;
  keywords: string[];
  orientation: "upright" | "reversed";
  orientationLabel: "正位" | "逆位";
  position?: "過去" | "現在" | "未來";
  cosmicMessage: string;
};

export function TarotCardBack({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`tarot-card-back flex aspect-[2/3] w-full ${compact ? "max-w-[280px]" : "max-w-[420px]"} flex-col items-center justify-center rounded-[28px] p-5 shadow-glow`}>
      <div className="tarot-inner-frame flex h-full w-full flex-col items-center justify-center rounded-[1.1rem]">
        <div className="moon-glow h-24 w-24 rounded-full" />
        <p className="mt-5 text-sm tracking-[0.28em] text-lavender">COSMIC TAROT</p>
      </div>
    </div>
  );
}

export function TarotCardFace({ card, topic }: { card: TarotCardFaceData; topic: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const isUpright = card.orientation !== "reversed";

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
            className="h-full w-full object-cover"
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
        <div className="mt-4 max-h-[220px] overflow-y-auto rounded-2xl border border-white/10 bg-midnight/42 p-4 pr-3">
          <p className="text-sm text-lavender">宇宙訊息</p>
          <p className="mt-2 text-base leading-8 text-moon/84">{card.cosmicMessage}</p>
        </div>
      </div>
    </div>
  );
}
