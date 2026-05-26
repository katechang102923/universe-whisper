import { AppShell } from "@/components/AppShell";
import { TarotDrawClient } from "./TarotDrawClient";

export default function TarotPage() {
  return (
    <AppShell>
      <section className="mx-auto w-full max-w-5xl py-8 sm:py-12">
        <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">星夜塔羅</p>
        <h1 className="mt-3 text-4xl font-semibold text-moon sm:text-5xl">塔羅抽牌</h1>
        <p className="mt-4 max-w-2xl text-base leading-8 text-moon/72 sm:text-lg">
          選擇單張或三張牌，再把感情、工作或曖昧的心事交給宇宙。
        </p>
        <TarotDrawClient />
      </section>
    </AppShell>
  );
}
