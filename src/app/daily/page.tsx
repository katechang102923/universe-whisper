import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { PageNavActions } from "@/components/PageNavActions";
import { DailyFortuneClient } from "./DailyFortuneClient";

export const metadata: Metadata = {
  title: "今日星座運勢",
  description: "選擇你的星座，查看今日愛情、工作、財運、人際運勢，每天一組全新預測。",
  openGraph: {
    title: "今日星座運勢 | 宇宙偷偷話 Universe Whisper",
    description: "選擇你的星座，查看今日愛情、工作、財運、人際運勢，每天一組全新預測。",
  },
};

/**
 * DailyFortuneClient owns all layout (title + selector on left,
 * fortune detail on right). This server component just provides the
 * AppShell wrapper and the max-width section.
 */
export default function DailyPage() {
  return (
    <AppShell>
      <section className="mx-auto w-full max-w-5xl py-8 sm:py-12">
        <PageNavActions className="mb-6" />
        <DailyFortuneClient />
      </section>
    </AppShell>
  );
}
