import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { TarotModeClient } from "./TarotModeClient";

export const metadata: Metadata = {
  title: "免費塔羅抽牌｜線上塔羅占卜、三張牌與每日一抽",
  description:
    "免費線上塔羅抽牌，每日可抽一張牌，也可以選擇三張牌占卜，查看感情、工作、財運與生活方向。",
  alternates: { canonical: "/tarot" },
  openGraph: {
    title: "免費塔羅抽牌｜線上塔羅占卜、三張牌與每日一抽",
    description: "免費線上塔羅抽牌，每日可抽一張牌，也可以選擇三張牌占卜，查看感情、工作、財運與生活方向。",
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
        {/* SEO 標題區：穩定的 H1 與說明，給搜尋引擎理解頁面用途 */}
        <header className="mb-6 text-center sm:text-left">
          <h1 className="text-3xl font-semibold leading-tight text-moon sm:text-4xl">
            免費塔羅抽牌
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-moon/72 sm:mx-0 sm:text-base">
            免費線上塔羅占卜，每日可以免費抽一張牌，也可以選擇三張牌占卜，查看感情、工作、財運與生活方向。
          </p>
        </header>

        <TarotModeClient initialSpread={spread} />

        {/* SEO 說明文字（自然描述，低調樣式）*/}
        <section className="mt-12 border-t border-white/10 pt-8">
          <p className="mx-auto max-w-3xl text-xs leading-7 text-moon/45 sm:text-sm">
            「宇宙偷偷話」的免費塔羅抽牌是一種線上塔羅占卜的方式。你可以針對心裡的問題免費抽一張牌，每日都能再回來抽一次；想看得更完整時，也可以選擇三張牌占卜，從過去、現在到未來的脈絡來理解狀況。不論是感情、工作、財運，還是日常生活的方向，都可以抽一張牌幫自己沉澱與整理心情。塔羅內容僅供娛樂與自我探索參考，不代表保證結果。
          </p>
        </section>
      </section>
    </AppShell>
  );
}
