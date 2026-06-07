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

const positionDisplayLabels: Record<NonNullable<TarotCardFaceData["position"]>, string> = {
  過去: "過去背景",
  現在: "現在狀態",
  未來: "接下來方向",
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
    <div className={`tarot-image-card overflow-hidden rounded-[2rem] border border-[#d8bd70]/28 shadow-[0_24px_70px_rgba(4,7,26,0.34),0_0_34px_rgba(216,189,112,0.12)] ${isUpright ? "tarot-card-face-upright" : "tarot-card-face-reversed"}`}>
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
        <p className="absolute left-4 top-4 rounded-full border border-[#d8bd70]/40 bg-midnight/78 px-3 py-1 text-xs uppercase tracking-[0.22em] text-moon shadow-[0_10px_24px_rgba(0,0,0,0.22)] backdrop-blur">
          {card.position ? positionDisplayLabels[card.position] : topic}
        </p>
      </div>

      <div className="border-t border-white/10 bg-gradient-to-b from-white/[0.035] to-transparent p-5">
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
        <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-midnight/48 p-4 pr-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <p className="text-sm text-lavender">宇宙訊息</p>
          {card.position ? <p className="mt-2 text-base leading-7 text-moon">{positionDisplayLabels[card.position]}：{positionDescriptions[card.position]}</p> : null}
          <p className="mt-2 text-base leading-8 text-moon/84">{card.cosmicMessage}</p>
        </div>
      </div>
    </div>
  );
}

// ── 三張牌 compact 版（結構：圖片 → 位置/牌名/正逆位/關鍵字/摘要）────────────
// 設計原則：牌圖在上、資訊在下、無任何頂部 header bar

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
      className={`tarot-image-card overflow-hidden rounded-[1.75rem] border border-white/10 shadow-[0_18px_54px_rgba(4,7,26,0.26)] ${
        isUpright ? "tarot-card-face-upright" : "tarot-card-face-reversed"
      }`}
    >
      {card.position ? (
        <div className="border-b border-white/10 bg-gradient-to-r from-[#d8bd70]/12 via-white/[0.04] to-lavender/10 px-4 py-3">
          <p className="text-center text-xs font-semibold tracking-[0.18em] text-[#d8bd70]/78">
            {positionDisplayLabels[card.position]}
          </p>
        </div>
      ) : null}
      {/* ══ 1. 牌圖：最頂層，乾淨無任何文字 ══════════════════════════════════ */}
      <div className="tarot-image-stage" style={{ padding: "16px 16px 14px" }}>
        <div className="tarot-image-shell" style={{ width: "min(100%, 240px)" }}>
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
        <div className="pointer-events-none absolute inset-0 rounded-[28px] ring-1 ring-[#d8bd70]/35" />
      </div>

      {/* ══ 2. 牌圖下方資訊：位置 → 牌名 → 正逆位 → 關鍵字 → 摘要 ══════════ */}
      <div className="px-4 pb-5 pt-3.5">

        {/* 第 N 張｜位置 — 淡金色小字，在牌名之上 */}
        <p
          style={{
            fontSize: 11,
            letterSpacing: "0.16em",
            color: "rgba(216,189,112,0.70)",
            marginBottom: 6,
            marginTop: 0,
          }}
        >
          {card.position ? `第 ${cardIndex + 1} 張｜${positionDisplayLabels[card.position]}` : `第 ${cardIndex + 1} 張`}
        </p>

        {/* 牌名（大字） + 正逆位 badge（右側） */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h3
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "rgba(255,247,230,0.96)",
              lineHeight: 1.2,
              margin: 0,
            }}
          >
            {card.name}
          </h3>
          <span
            style={{
              flexShrink: 0,
              borderRadius: 9999,
              border: isUpright
                ? "1px solid rgba(142,240,221,0.40)"
                : "1px solid rgba(203,184,255,0.44)",
              background: isUpright
                ? "rgba(142,240,221,0.10)"
                : "rgba(203,184,255,0.10)",
              color: isUpright ? "rgb(142,240,221)" : "rgb(203,184,255)",
              fontSize: 11,
              fontWeight: 500,
              padding: "2px 10px",
            }}
          >
            {card.orientationLabel}
          </span>
        </div>

        {/* 關鍵字 */}
        {kw.length > 0 && (
          <p
            style={{
              marginTop: 8,
              fontSize: 13,
              lineHeight: 1.5,
              color: "rgba(203,184,255,0.70)",
              letterSpacing: "0.04em",
            }}
          >
            {kw.join("・")}
          </p>
        )}

        {/* 一句話摘要 */}
        {shortMsg && (
          <p
            style={{
              marginTop: 10,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(7,11,30,0.50)",
              padding: "8px 12px",
              fontSize: 13,
              lineHeight: 1.7,
              color: "rgba(255,247,230,0.70)",
            }}
          >
            {shortMsg}
          </p>
        )}
      </div>
    </div>
  );
}
