import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { TarotDrawClient } from "./TarotDrawClient";

export const metadata: Metadata = {
  title: "塔羅抽牌",
  description: "免費抽一張或三張塔羅牌，觀看廣告解鎖完整宇宙訊息，作為娛樂與自我探索參考。",
  openGraph: {
    title: "塔羅抽牌 | 宇宙偷偷話 Universe Whisper",
    description: "免費抽一張或三張塔羅牌，觀看廣告解鎖完整宇宙訊息。",
  },
};

export default function TarotPage() {
  return (
    <AppShell>
      <section className="mx-auto w-full max-w-5xl py-8 sm:py-12">
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">
            cosmic tarot · 星夜牌陣
          </p>
          <h1 className="mt-3 text-4xl font-semibold text-moon sm:text-5xl">塔羅抽牌</h1>
          <div className="mt-1.5 h-px w-24 bg-gradient-to-r from-aurora/60 to-transparent" />
          <p className="mt-4 max-w-2xl text-base leading-8 text-moon/72 sm:text-lg">
            在心裡默想一個問題，讓宇宙透過牌面給你一個溫柔的提醒。
          </p>

          {/* Decorative star accents */}
          <span
            className="absolute right-0 top-0 hidden text-2xl text-[#d8bd70]/38 sm:block"
            aria-hidden="true"
          >
            ✦
          </span>
          <span
            className="absolute right-8 top-7 hidden text-base text-lavender/28 sm:block"
            aria-hidden="true"
          >
            ✦
          </span>
        </div>

        <TarotDrawClient />
      </section>
    </AppShell>
  );
}
