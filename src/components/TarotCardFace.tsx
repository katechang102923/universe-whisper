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
      className={`tarot-card-back aspect-[2/3] w-full ${
        compact ? "max-w-[280px]" : "max-w-[420px]"
      } rounded-[28px] shadow-glow`}
    >
      <Image
        src="/images/hero/main-cosmic-cat.webp"
        alt="宇宙偷偷話"
        fill
        sizes={compact ? "280px" : "(max-width: 768px) 86vw, 420px"}
        className="rounded-[28px] object-cover object-center"
        priority={false}
      />
      <div className="absolute inset-0 rounded-[28px] bg-gradient-to-b from-midnight/10 via-transparent to-midnight/55" />
      <p className="absolute bottom-4 left-0 right-0 z-10 text-center text-sm tracking-[0.28em] text-lavender/82 drop-shadow-md">
        <span className="mr-1 text-[#d8bd70]/75">✦</span>
        COSMIC TAROT
        <span className="ml-1 text-[#d8bd70]/75">✦</span>
      </p>
    </div>
  );
}

// ── 單張牌完整版 ──────────────────────────────────────────────────────────────

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

// ── 三張牌 compact 版（移除宇宙訊息長文，只顯示關鍵資訊）───────────────────────
// 設計目標：使用者快速掃過三張牌，不在上方閱讀大量內容

export function TarotCardFaceCompact({
  card,
  topic,
  cardIndex,
}: {
  card: TarotCardFaceData;
  topic: string;
  cardIndex: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const isUpright  = card.orientation !== "reversed";
  const isReversed = card.orientation === "reversed";

  // 一句話摘要：截取 cosmicMessage 前 45 字
  const shortMsg = card.cosmicMessage
    ? card.cosmicMessage.length > 48
      ? `${card.cosmicMessage.slice(0, 45)}…`
      : card.cosmicMessage
    : "";

  // 只取前 3 個關鍵字
  const kw = card.keywords.slice(0, 3);

  if (imageFailed || !card.image) {
    return <TarotCardBack compact />;
  }

  return (
    <div
      className={`tarot-image-card ${
        isUpright ? "tarot-card-face-upright" : "tarot-card-face-reversed"
      }`}
    >
      {/* 牌圖區（與完整版相同，保持比例） */}
      <div className="tarot-image-stage">
        <div className="tarot-image-shell">
          <Image
            src={card.image}
            alt={`${card.name} 塔羅牌`}
            width={960}
            height={1440}
            unoptimized
            priority={false}
            className={`h-full w-full object-contain transition-transform duration-500 ${
              isReversed ? "rotate-180" : ""
            }`}
            sizes="(max-width: 640px) 72vw, 33vw"
            onError={() => setImageFailed(true)}
          />
        </div>
        <div className="pointer-events-none absolute inset-0 rounded-[28px] ring-1 ring-[#d8bd70]/45" />
        {/* 位置標籤：放大、明顯 */}
        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          <span className="rounded-full border border-[#d8bd70]/50 bg-midnight/80 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-[#d8bd70] backdrop-blur">
            第 {cardIndex + 1} 張
          </span>
          {card.position && (
            <span className="rounded-full border border-white/25 bg-midnight/80 px-2.5 py-0.5 text-xs tracking-wide text-moon/90 backdrop-blur">
              {card.position}
            </span>
          )}
        </div>
      </div>

      {/* 資訊區（精簡）*/}
      <div className="border-t border-white/10 p-3 sm:p-4">
        {/* 牌名 + 正逆位 */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xl font-semibold leading-tight text-moon sm:text-2xl">
            {card.name}
          </h3>
          <span
            className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              isUpright
                ? "border-aurora/40 bg-aurora/12 text-aurora"
                : "border-lavender/44 bg-lavender/14 text-lavender"
            }`}
          >
            {card.orientationLabel}
          </span>
        </div>

        {/* 3 個關鍵字 */}
        {kw.length > 0 && (
          <p className="mt-2 text-sm leading-5 text-lavender/80">
            {kw.join("・")}
          </p>
        )}

        {/* 一句話摘要（取代長宇宙訊息） */}
        {shortMsg && (
          <p className="mt-2.5 rounded-xl border border-white/8 bg-midnight/40 px-3 py-2 text-sm leading-6 text-moon/76">
            {shortMsg}
          </p>
        )}
      </div>
    </div>
  );
}
