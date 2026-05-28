"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { TarotCard } from "@/data/tarotCards";

const suitOrder = ["major", "wands", "cups", "swords", "pentacles"] as const;

const groupLabels: Record<(typeof suitOrder)[number], string> = {
  major: "大阿爾克那",
  wands: "權杖",
  cups: "聖杯",
  swords: "寶劍",
  pentacles: "錢幣",
};

function classification(card: TarotCard) {
  return card.suit === "major" ? card.arcana : `${card.arcana}・${card.suitLabel}`;
}

function PlaceholderCard() {
  return (
    <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_50%_32%,rgba(247,241,223,0.28),rgba(216,189,112,0.16)_28%,rgba(109,77,242,0.18)_58%,transparent)] text-4xl text-moon/78">
      ✦
    </div>
  );
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.055] p-4">
      <h3 className="text-sm font-semibold tracking-[0.18em] text-[#d8bd70]/86">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-moon/76">{children}</p>
    </article>
  );
}

export function TarotCardsClient({ cards }: { cards: TarotCard[] }) {
  const [selectedCard, setSelectedCard] = useState<TarotCard | null>(null);

  const groupedCards = useMemo(
    () =>
      suitOrder.map((suit) => ({
        suit,
        label: groupLabels[suit],
        cards: cards.filter((card) => card.suit === suit),
      })),
    [cards],
  );

  useEffect(() => {
    if (!selectedCard) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedCard(null);
    };

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedCard]);

  return (
    <>
      <section className="mt-10 space-y-12">
        {groupedCards.map((group) => (
          <div key={group.suit}>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[#d8bd70]/70">{group.suit}</p>
                <h2 className="mt-2 text-2xl font-semibold text-moon">{group.label}卡牌</h2>
              </div>
              <p className="text-sm text-moon/48">{group.cards.length} 張</p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {group.cards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setSelectedCard(card)}
                  className="group rounded-3xl border border-[#d8bd70]/20 bg-midnight/58 p-3 text-left shadow-[0_18px_54px_rgba(0,0,0,0.22)] transition duration-300 hover:-translate-y-1 hover:border-[#d8bd70]/58 hover:shadow-[0_0_38px_rgba(216,189,112,0.22)] active:scale-[0.98]"
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-white/10 bg-white/6">
                    {card.image ? (
                      <Image
                        src={card.image}
                        alt={`${card.nameZh} ${card.nameEn}`}
                        fill
                        sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
                        className="object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <PlaceholderCard />
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(247,241,223,0.22),transparent_34%)] opacity-0 transition group-hover:opacity-100" />
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-moon">{card.nameZh}</h3>
                  <p className="mt-1 text-xs text-moon/52">{card.nameEn}</p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      {selectedCard ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/72 backdrop-blur-sm sm:items-center sm:px-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedCard(null);
          }}
        >
          <section className="relative max-h-[100svh] w-full overflow-y-auto border border-[#d8bd70]/36 bg-midnight shadow-[0_0_70px_rgba(216,189,112,0.22)] sm:max-h-[92vh] sm:max-w-5xl sm:rounded-[2rem]">
            <div className="pointer-events-none absolute inset-0 star-field opacity-30" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(216,189,112,0.18),transparent_28%),radial-gradient(circle_at_90%_22%,rgba(203,184,255,0.18),transparent_28%)]" />

            <button
              type="button"
              aria-label="關閉塔羅牌介紹"
              onClick={() => setSelectedCard(null)}
              className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-black/30 text-xl text-moon transition hover:bg-white/12"
            >
              ×
            </button>

            <div className="relative z-10 grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(260px,340px)_1fr]">
              <div>
                <div className="relative mx-auto aspect-[2/3] w-full max-w-[320px] overflow-hidden rounded-[1.5rem] border border-[#d8bd70]/46 bg-white/6 shadow-[0_0_46px_rgba(216,189,112,0.18)]">
                  {selectedCard.image ? (
                    <Image
                      src={selectedCard.image}
                      alt={`${selectedCard.nameZh} ${selectedCard.nameEn}`}
                      fill
                      sizes="320px"
                      className="object-cover"
                      priority
                    />
                  ) : (
                    <PlaceholderCard />
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#d8bd70]/78">{classification(selectedCard)}</p>
                <h2 className="mt-3 text-4xl font-semibold text-moon">{selectedCard.nameZh}</h2>
                <p className="mt-1 text-lg text-lavender/76">{selectedCard.nameEn}</p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {selectedCard.keywords.map((keyword) => (
                    <span key={keyword} className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-sm text-moon/76">
                      {keyword}
                    </span>
                  ))}
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <DetailBlock title="正位意思">{selectedCard.upright}</DetailBlock>
                  <DetailBlock title="逆位意思">{selectedCard.reversed}</DetailBlock>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <DetailBlock title="感情解讀">{selectedCard.love}</DetailBlock>
                  <DetailBlock title="工作解讀">{selectedCard.career}</DetailBlock>
                  <DetailBlock title="財運解讀">{selectedCard.money}</DetailBlock>
                </div>

                <div className="mt-4 rounded-3xl border border-[#d8bd70]/30 bg-[#d8bd70]/10 p-4">
                  <h3 className="text-sm font-semibold tracking-[0.18em] text-[#d8bd70]/86">宇宙提醒</h3>
                  <p className="mt-3 leading-8 text-moon/80">{selectedCard.advice}</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
