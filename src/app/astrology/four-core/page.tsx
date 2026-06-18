import type { Metadata } from "next";
import { TopicLandingPage } from "@/components/TopicLandingPage";

export const metadata: Metadata = {
  title: "四核心星座是什麼｜太陽、月亮、上升與金星星座解析",
  description:
    "四核心星座指的是太陽、月亮、上升與金星星座。這篇用白話說明它們分別代表什麼，幫你不只看太陽星座，更完整地了解自己。",
  alternates: { canonical: "/astrology/four-core" },
  openGraph: {
    title: "四核心星座是什麼｜太陽、月亮、上升、金星",
    description: "用白話說明太陽、月亮、上升與金星四核心星座分別代表什麼。",
  },
};

export default function FourCorePage() {
  return (
    <TopicLandingPage
      eyebrow="FOUR CORE SIGNS"
      title="四核心星座是什麼"
      intro="很多人只知道自己的太陽星座，但其實影響一個人的，還有月亮、上升與金星。我們把這四個放在一起，稱為「四核心星座」。把它們一起看，會比只看太陽星座更貼近真實的你。"
      sections={[
        {
          heading: "太陽星座：你想成為的樣子",
          body: "太陽星座是大家最熟悉的星座，代表你的核心個性，以及你希望活出來的方向。它就像你給自己設定的主旋律。",
        },
        {
          heading: "月亮星座：你私底下的情感需求",
          body: "月亮星座代表你在放鬆、脆弱或獨處時真正的感受，也反映你需要什麼樣的安全感。很多和情緒、習慣有關的部分，都和月亮星座有關。",
        },
        {
          heading: "上升星座：別人第一眼看見的你",
          body: "上升星座是你給人的第一印象與外在氣質，也影響你面對新環境時自然展現的樣子。它需要出生時間才能準確算出。",
        },
        {
          heading: "金星星座：你在感情裡的樣子",
          body: "金星星座透露你在感情與喜歡的事物上會被什麼吸引、又會怎麼表達好感。它幫你更了解自己的相處與審美習慣。",
        },
      ]}
      ctaHref="/astro-profile"
      ctaLabel="免費查詢我的四核心星座 ✨"
      note="內容僅供娛樂與自我探索參考，星座解析不代表絕對命定，也不構成任何專業建議。"
      relatedLinks={[
        { href: "/astro-profile", label: "四核心星座查詢" },
        { href: "/daily", label: "今日星座運勢" },
      ]}
    />
  );
}
