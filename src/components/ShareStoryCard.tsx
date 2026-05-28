"use client";

import { forwardRef } from "react";

export type ShareStoryCardProps = {
  cardNameZh: string;
  cardNameEn: string;
  cardImageUrl: string;
  resultText: string;
  adviceText: string;
  siteUrl: string;
};

function summarizeText(text: string, minLength = 78, maxLength = 112) {
  const normalized = text
    .replace(/\*\*/g, "")
    .replace(/[🌙🔮🐈✨🌌🕯️💫]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "宇宙正在把訊息慢慢整理成光。先深呼吸，把心放回自己身上，答案會用溫柔的方式靠近你。";
  }

  const sentences = normalized.match(/[^。！？!?]+[。！？!?]?/gu) ?? [normalized];
  let summary = "";

  for (const sentence of sentences) {
    const next = `${summary}${sentence}`.trim();
    if (next.length > maxLength) break;
    summary = next;
    if (summary.length >= minLength) break;
  }

  const source = summary || normalized;
  return source.length > maxLength ? `${source.slice(0, maxLength - 1)}...` : source;
}

function CornerStar({ className = "" }: { className?: string }) {
  return <span className={`absolute text-[#c69b4c] drop-shadow-[0_0_12px_rgba(198,155,76,0.45)] ${className}`}>✦</span>;
}

export const ShareStoryCard = forwardRef<HTMLDivElement, ShareStoryCardProps>(function ShareStoryCard(
  { cardNameZh, cardNameEn, cardImageUrl, resultText, adviceText },
  ref,
) {
  const summaryText = summarizeText(resultText);
  const softAdvice = summarizeText(adviceText, 28, 58);

  return (
    <div
      ref={ref}
      className="relative mx-auto aspect-[9/16] w-full max-w-[390px] overflow-hidden bg-[#05071d] text-[#fff7e6]"
    >
      <img
        src="/reference/story-bg.png"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
        crossOrigin="anonymous"
      />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_33%,rgba(247,217,135,0.16),transparent_28%),linear-gradient(180deg,rgba(5,7,29,0.1)_0%,rgba(5,7,29,0)_42%,rgba(20,10,44,0.16)_100%)]" />

      <header className="absolute left-0 top-0 z-10 flex h-[15%] w-full flex-col items-center justify-center text-center">
        <p className="text-[0.66rem] font-semibold uppercase tracking-[0.38em] text-[#f7d987]/90">Universe Whisper</p>
        <h2 className="mt-3 text-[2.08rem] font-semibold leading-none tracking-[0.16em] text-[#f7d987] drop-shadow-[0_0_18px_rgba(247,217,135,0.36)]">
          宇宙偷偷話
        </h2>
        <p className="mt-3 text-[0.9rem] tracking-[0.22em] text-[#fff7e6]/84">宇宙想對你說...</p>
      </header>

      <section className="absolute left-0 top-[15%] z-10 h-[40%] w-full">
        <div className="absolute left-1/2 top-[2%] w-[43%] -translate-x-1/2 -rotate-[3deg]">
          <div className="absolute -inset-3 rounded-[2rem] bg-[#f7d987]/34 blur-xl" />
          <div className="relative flex aspect-[2/3] items-center justify-center rounded-[1.65rem] border border-[#f7d987]/85 bg-[#130b32]/20 p-2 shadow-[0_0_42px_rgba(247,217,135,0.38),0_26px_72px_rgba(5,7,24,0.44)]">
            {cardImageUrl ? (
              <img
                src={cardImageUrl}
                alt={`${cardNameZh} ${cardNameEn}`}
                className="h-full w-full rounded-[1.2rem] object-contain"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-[1.2rem] bg-[#16103a] text-5xl text-[#f7d987]">☾</div>
            )}
          </div>
        </div>
      </section>

      <section className="absolute left-1/2 top-[49.5%] z-10 w-[78%] -translate-x-1/2 text-center text-[#fff7e6]">
        <p className="text-[2.25rem] font-semibold leading-none tracking-[0.12em] text-[#f7d987] drop-shadow-[0_0_16px_rgba(45,24,20,0.48)]">
          {cardNameZh}
        </p>
        <p className="mt-2 text-[0.92rem] font-semibold tracking-[0.14em] text-[#fff7e6]/86 drop-shadow-[0_0_12px_rgba(7,9,29,0.7)]">
          {cardNameEn}
        </p>
      </section>

      <section className="absolute left-1/2 top-[57%] z-10 max-h-[260px] max-w-[760px] w-[82%] -translate-x-1/2 overflow-hidden rounded-[1.8rem] border border-[#caa85f]/55 bg-[linear-gradient(150deg,rgba(255,247,230,0.94),rgba(248,232,216,0.9)_48%,rgba(246,219,226,0.84))] px-7 py-5 text-center text-[#261936] shadow-[0_24px_70px_rgba(5,7,24,0.26),inset_0_1px_0_rgba(255,255,255,0.65)]">
        <CornerStar className="left-5 top-4 text-sm" />
        <CornerStar className="right-5 top-4 text-sm" />
        <div className="mx-auto mb-4 flex w-[72%] items-center gap-3">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#bd944b]/60" />
          <span className="rounded-full bg-[#caa85f] px-4 py-1 text-[0.78rem] font-semibold tracking-[0.2em] text-white shadow-[0_0_18px_rgba(202,168,95,0.34)]">宇宙訊息</span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#bd944b]/60" />
        </div>
        <p className="line-clamp-5 text-[1rem] leading-[1.7] tracking-[0.06em] text-[#241937]">{summaryText}</p>
        <p className="mt-2 line-clamp-1 text-[0.74rem] leading-[1.5] tracking-[0.05em] text-[#6d5a7d]">{softAdvice}</p>
      </section>
    </div>
  );
});
