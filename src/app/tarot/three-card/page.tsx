import type { Metadata } from "next";
import { TopicLandingPage } from "@/components/TopicLandingPage";

export const metadata: Metadata = {
  title: "三張牌占卜｜免費線上塔羅抽三張看整體脈絡",
  description:
    "三張牌占卜用過去、現在、未來三個位置，幫你看清一件事情的整體脈絡，是免費的線上塔羅自我探索方式。",
  alternates: { canonical: "/tarot/three-card" },
  openGraph: {
    title: "三張牌占卜｜免費線上塔羅抽三張",
    description: "用過去、現在、未來三張牌，免費線上看清一件事情的整體脈絡。",
  },
};

export default function TarotThreeCardPage() {
  return (
    <TopicLandingPage
      eyebrow="THREE CARD SPREAD"
      title="三張牌占卜"
      intro="當一件事情比較複雜，只抽一張牌可能不夠完整。三張牌占卜用過去、現在、未來三個位置免費幫你抽牌，讓你更有層次地理解事情怎麼走到現在，以及接下來可以留意什麼。"
      sections={[
        {
          heading: "三張牌分別代表什麼",
          body: "第一張對應過去與起因，幫你看見事情的背景；第二張對應現在的狀態與心情；第三張對應接下來的趨勢與可以留意的方向。三張牌放在一起看，比單張更能呈現整體脈絡。",
        },
        {
          heading: "什麼時候適合三張牌占卜",
          body: "想完整理解一段關係、一個決定或一段時期的變化時，三張牌占卜會比單張更合適。它幫你把事情拆成幾個面向，慢慢看清楚，而不是急著要一個是非答案。",
        },
      ]}
      ctaHref="/tarot?spread=three"
      ctaLabel="開始三張牌占卜 🔮"
      note="內容僅供娛樂與自我探索參考，不代表保證結果，也不構成任何專業建議。"
      relatedLinks={[
        { href: "/tarot/love", label: "感情塔羅抽牌" },
        { href: "/tarot/work", label: "工作塔羅抽牌" },
        { href: "/tarot/money", label: "財運塔羅抽牌" },
      ]}
    />
  );
}
