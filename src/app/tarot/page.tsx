import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { TarotModeClient } from "./TarotModeClient";

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

  return (
    <AppShell>
      <section className="mx-auto w-full max-w-5xl py-8 sm:py-12">
        <TarotModeClient initialSpread={spread} />
      </section>
    </AppShell>
  );
}
