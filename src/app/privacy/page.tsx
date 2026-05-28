import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "隱私政策",
  description: "了解宇宙偷偷話可能收集的資料、使用目的、第三方服務與使用者權利。",
  openGraph: {
    title: "隱私政策 | 宇宙偷偷話 Universe Whisper",
    description: "了解宇宙偷偷話的資料收集、使用目的、第三方服務與聯絡方式。",
  },
};

const sections = [
  {
    title: "本網站可能收集的資料",
    items: ["使用者輸入的問題內容", "IP 位址", "anonymousId", "Cookie", "裝置與瀏覽器資訊"],
  },
  {
    title: "資料使用目的",
    items: ["提供塔羅與每日運勢服務", "限制免費使用次數", "防止濫用", "改善網站體驗", "廣告與分析"],
  },
  {
    title: "第三方服務",
    items: ["Google AdSense", "Google Analytics", "OpenAI API", "LINE", "Vercel", "Firebase"],
  },
];

export default function PrivacyPage() {
  return (
    <AppShell>
      <section className="mx-auto w-full max-w-4xl py-8 sm:py-12">
        <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">privacy policy</p>
        <h1 className="mt-3 text-4xl font-semibold text-moon sm:text-5xl">隱私政策</h1>
        <div className="mt-8 space-y-5">
          {sections.map((section) => (
            <article key={section.title} className="cosmic-tool-panel rounded-[1.75rem] p-5">
              <h2 className="text-2xl font-semibold text-moon">{section.title}</h2>
              <ul className="mt-4 space-y-2 leading-7 text-moon/72">
                {section.items.map((item) => <li key={item}>・{item}</li>)}
              </ul>
            </article>
          ))}
          <article className="cosmic-tool-panel rounded-[1.75rem] p-5">
            <h2 className="text-2xl font-semibold text-moon">資料保護與使用者權利</h2>
            <p className="mt-3 leading-8 text-moon/72">
              本網站不販售個人資料。您可就個人資料查詢、更正、刪除或停止使用等需求與我們聯絡；我們會在合理範圍內協助處理。
            </p>
            <p className="mt-3 leading-8 text-moon/72">
              如有任何隱私權問題，請聯絡：
              <a href="mailto:ciut0000@gmail.com" className="text-[#d8bd70] underline decoration-[#d8bd70]/40 underline-offset-4">
                ciut0000@gmail.com
              </a>
            </p>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
