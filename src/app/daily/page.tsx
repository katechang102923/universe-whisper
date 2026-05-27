import { AppShell } from "@/components/AppShell";
import { DailyFortuneClient } from "./DailyFortuneClient";

export default function DailyPage() {
  return (
    <AppShell>
      <section className="mx-auto w-full max-w-5xl py-8 sm:py-12">
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">
            daily cosmic note · 每日星語
          </p>
          <h1 className="mt-3 text-4xl font-semibold text-moon sm:text-5xl">每日運勢</h1>
          <div className="mt-1.5 h-px w-24 bg-gradient-to-r from-lavender/60 to-transparent" />
          <p className="mt-4 max-w-2xl leading-8 text-moon/72">
            選擇你的星座，讓宇宙輕聲告訴你今天的愛情、工作與生活。
          </p>

          {/* Decorative star accents */}
          <span
            className="absolute right-0 top-0 hidden text-2xl text-lavender/38 sm:block"
            aria-hidden="true"
          >
            ✦
          </span>
          <span
            className="absolute right-8 top-7 hidden text-base text-aurora/28 sm:block"
            aria-hidden="true"
          >
            ✦
          </span>
        </div>

        <DailyFortuneClient />
      </section>
    </AppShell>
  );
}
