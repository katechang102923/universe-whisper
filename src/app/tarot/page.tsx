import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { PageNavActions } from "@/components/PageNavActions";
import { TarotDrawClient } from "./TarotDrawClient";

export const metadata: Metadata = {
  title: "塔羅抽牌",
  description: "抽一張或三張塔羅牌，讓宇宙給你溫柔而直接的回應，作為娛樂與自我探索參考。",
  openGraph: {
    title: "塔羅抽牌 | 宇宙偷偷話 Universe Whisper",
    description: "抽一張或三張塔羅牌，讓宇宙透過牌面給你一個溫柔的提醒。",
  },
};

export default async function TarotPage({
  searchParams,
}: {
  searchParams: Promise<{ spread?: string }>;
}) {
  const params = await searchParams;
  const spread = params.spread === "three" ? "three" : "single";

  const title = spread === "three" ? "三張宇宙訊息" : "單張宇宙訊息";
  const subtitle =
    spread === "three"
      ? "從過去、現在、未來看清整體脈絡。"
      : "適合快速獲得一個提醒與方向。";

  return (
    <AppShell>
      <section className="mx-auto w-full max-w-5xl py-8 sm:py-12">
        <PageNavActions className="mb-6" />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">
            cosmic tarot · 星夜牌陣
          </p>
          <h1 className="mt-3 text-4xl font-semibold text-moon sm:text-5xl">{title}</h1>
          <div className="mt-1.5 h-px w-24 bg-gradient-to-r from-aurora/60 to-transparent" />
          <p className="mt-4 max-w-2xl text-base leading-8 text-moon/72 sm:text-lg">
            {subtitle}
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

        <TarotDrawClient initialSpread={spread} />
      </section>
    </AppShell>
  );
}
