import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { TarotCardFace, type TarotCardFaceData } from "@/components/TarotCardFace";
import { tarotCards } from "@/data/tarotCards";

export default async function ResultPage({
  searchParams
}: {
  searchParams: Promise<{ cards?: string; topic?: string }>;
}) {
  const params = await searchParams;
  const cards = (params.cards ?? "")
    .split(",")
    .filter(Boolean)
    .map((id, index) => {
      const card = tarotCards.find((item) => item.id === id);
      if (!card) {
        return null;
      }

      return {
        ...card,
        orientation: "upright",
        orientationLabel: "正位",
        position: index === 0 ? undefined : (["過去", "現在", "未來"][index] as TarotCardFaceData["position"]),
        cosmicMessage: card.uprightMeaning
      } satisfies TarotCardFaceData;
    })
    .filter(Boolean) as TarotCardFaceData[];

  return (
    <AppShell>
      <section className="mx-auto w-full max-w-5xl py-8 sm:py-12">
        <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">reading result</p>
        <h1 className="mt-3 text-4xl font-semibold text-moon sm:text-5xl">宇宙給你的訊息</h1>

        <div className="mt-8 grid justify-items-center gap-8 lg:grid-cols-3">
          {cards.length ? (
            cards.map((card, index) => (
              <article key={`${card.id}-${index}`} className="tarot-card-shell w-full max-w-[360px]">
                <TarotCardFace card={card} topic={params.topic ?? "塔羅"} />
              </article>
            ))
          ) : (
            <article className="glass-card rounded-[1.5rem] p-6 text-moon/76">
              這裡還沒有訊息。回到塔羅房間抽一張牌吧。
            </article>
          )}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/daily" className="rounded-full border border-lavender/40 px-5 py-3 text-moon transition hover:bg-white/10">
            看每日運勢
          </Link>
          <Link href="/tarot" className="rounded-full bg-moon px-5 py-3 font-medium text-midnight transition hover:bg-white">
            再抽一次
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
