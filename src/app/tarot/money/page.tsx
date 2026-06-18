import type { Metadata } from "next";
import { TopicLandingPage } from "@/components/TopicLandingPage";

export const metadata: Metadata = {
  title: "財運塔羅抽牌｜免費線上抽一張牌看金錢狀態",
  description:
    "對最近的金錢狀態感到不安，或想調整消費與規劃的心態時，可以免費抽一張財運塔羅牌，當作自我整理的參考。",
  alternates: { canonical: "/tarot/money" },
  openGraph: {
    title: "財運塔羅抽牌｜免費線上抽一張牌",
    description: "面對金錢上的煩惱與選擇，免費抽一張財運塔羅牌，幫自己重新看待現在的狀態。",
  },
};

export default function TarotMoneyPage() {
  return (
    <TopicLandingPage
      eyebrow="MONEY TAROT"
      title="財運塔羅抽牌"
      intro="金錢上的焦慮，常常來自看不清自己現在的狀態與習慣。財運塔羅抽牌讓你針對心裡的問題免費抽一張牌，從牌面重新覺察自己和金錢的關係。"
      sections={[
        {
          heading: "什麼時候適合抽財運塔羅",
          body: "想檢視最近的消費與儲蓄習慣、面對一筆較大的支出感到猶豫、或單純想讓自己對金錢更安心時，都可以抽一張財運塔羅牌，幫自己沉澱心情、看清優先順序。",
        },
        {
          heading: "抽完牌你會看到什麼",
          body: "你會看到針對問題的一句話結論、牌面重點，以及最近幾天可以試著怎麼調整的方向建議。內容著重在心態與習慣的覺察，不會預測明牌，也不提供任何投資理財建議。",
        },
      ]}
      ctaHref="/tarot?spread=single"
      ctaLabel="免費抽一張財運塔羅 ✨"
      note="內容僅供娛樂與自我探索參考，不代表保證結果，也不構成投資、理財或任何財務建議。"
      relatedLinks={[
        { href: "/tarot/three-card", label: "三張牌占卜" },
        { href: "/tarot/work", label: "工作塔羅抽牌" },
        { href: "/tarot/love", label: "感情塔羅抽牌" },
      ]}
    />
  );
}
