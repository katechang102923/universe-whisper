import type { Metadata } from "next";
import { TopicLandingPage } from "@/components/TopicLandingPage";

export const metadata: Metadata = {
  title: "感情塔羅抽牌｜免費線上抽一張牌看這段感情",
  description:
    "在意一段感情、想知道對方的想法或這段關係的方向時，可以免費抽一張感情塔羅牌，作為梳理心情與自我探索的參考。",
  alternates: { canonical: "/tarot/love" },
  openGraph: {
    title: "感情塔羅抽牌｜免費線上抽一張牌",
    description: "為一段感情感到困惑時，免費抽一張感情塔羅牌，幫自己重新整理現在的心情與方向。",
  },
};

export default function TarotLovePage() {
  return (
    <TopicLandingPage
      eyebrow="LOVE TAROT"
      title="感情塔羅抽牌"
      intro="當你為一段感情感到困惑，有時候需要的不是標準答案，而是一個能幫你看清自己心情的提醒。感情塔羅抽牌讓你針對心裡的問題免費抽一張牌，從牌面的意象重新整理現在的關係與感受。"
      sections={[
        {
          heading: "什麼時候適合抽感情塔羅",
          body: "想知道對方最近的狀態、不確定這段關係要不要繼續、或是剛經歷一段變化想沉澱心情時，都可以抽一張感情塔羅牌。牌面不會替你做決定，而是陪你把模糊的感受說清楚。",
        },
        {
          heading: "抽完牌你會看到什麼",
          body: "你會看到針對問題的一句話結論、牌面重點，以及最近幾天可以試著怎麼做的方向建議。內容著重在幫你照顧自己的心情與步調，而不是預測一定會發生的結果。",
        },
      ]}
      ctaHref="/tarot?spread=single"
      ctaLabel="免費抽一張感情塔羅 ✨"
      note="內容僅供娛樂與自我探索參考，不代表保證結果，也不構成復合、挽回或任何感情承諾。"
      relatedLinks={[
        { href: "/tarot/three-card", label: "三張牌占卜" },
        { href: "/tarot/work", label: "工作塔羅抽牌" },
        { href: "/astrology/four-core", label: "四核心星座是什麼" },
      ]}
    />
  );
}
