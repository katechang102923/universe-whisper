import { AppShell } from "@/components/AppShell";
import { DailyFortuneClient } from "./DailyFortuneClient";

export default function DailyPage() {
  return (
    <AppShell>
      <section className="mx-auto w-full max-w-5xl py-8 sm:py-12">
        <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">daily cosmic note</p>
        <h1 className="mt-3 text-4xl font-semibold text-moon sm:text-5xl">每日運勢</h1>
        <p className="mt-4 max-w-2xl leading-8 text-moon/72">
          今天先把心放慢一點，讓愛情、工作、財運與心情各自被溫柔整理。
        </p>

        <DailyFortuneClient />
      </section>
    </AppShell>
  );
}
