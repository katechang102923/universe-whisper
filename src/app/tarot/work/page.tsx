import type { Metadata } from "next";
import { TopicLandingPage } from "@/components/TopicLandingPage";

export const metadata: Metadata = {
  title: "工作塔羅抽牌｜免費線上抽一張牌看職場方向",
  description:
    "在工作上遇到選擇、卡關或想轉換跑道時，可以免費抽一張工作塔羅牌，當作整理思緒與自我探索的參考。",
  alternates: { canonical: "/tarot/work" },
  openGraph: {
    title: "工作塔羅抽牌｜免費線上抽一張牌",
    description: "面對工作上的選擇與卡關，免費抽一張工作塔羅牌，幫自己看清現在的方向。",
  },
};

export default function TarotWorkPage() {
  return (
    <TopicLandingPage
      eyebrow="WORK TAROT"
      title="工作塔羅抽牌"
      intro="工作上的煩惱常常不是不夠努力，而是一時看不清方向。工作塔羅抽牌讓你針對職場上的問題免費抽一張牌，從牌面重新整理眼前的選擇與心情。"
      sections={[
        {
          heading: "什麼時候適合抽工作塔羅",
          body: "猶豫要不要接下一個任務、和同事或主管相處感到疲憊、考慮轉職或調整步調時，都可以抽一張工作塔羅牌，幫自己把模糊的想法理出頭緒。",
        },
        {
          heading: "抽完牌你會看到什麼",
          body: "你會看到針對問題的一句話結論、牌面重點，以及最近幾天可以試著怎麼做的方向建議。內容著重在幫你照顧自己的節奏與心態，而不是保證升遷或特定結果。",
        },
      ]}
      ctaHref="/tarot?spread=single"
      ctaLabel="免費抽一張工作塔羅 ✨"
      note="內容僅供娛樂與自我探索參考，不代表保證結果，也不構成職涯、法律或其他專業建議。"
      relatedLinks={[
        { href: "/tarot/three-card", label: "三張牌占卜" },
        { href: "/tarot/money", label: "財運塔羅抽牌" },
        { href: "/tarot/love", label: "感情塔羅抽牌" },
      ]}
    />
  );
}
