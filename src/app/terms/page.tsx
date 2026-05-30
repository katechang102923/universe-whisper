import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { PageNavActions } from "@/components/PageNavActions";

export const metadata: Metadata = {
  title: "服務條款",
  description: "使用宇宙偷偷話前，請閱讀服務範圍、責任限制、禁止行為與付費功能說明。",
  openGraph: {
    title: "服務條款 | 宇宙偷偷話 Universe Whisper",
    description: "宇宙偷偷話服務範圍、責任限制、禁止行為與條款修改權利。",
  },
};

const terms = [
  "使用本網站即代表您同意本服務條款。",
  "本網站提供塔羅、星座與自我探索內容。",
  "內容僅供娛樂與心理療癒參考，不保證結果準確。",
  "本網站內容不可用於醫療、法律、投資或重大人生決策。",
  "使用者需自行承擔使用本網站內容與服務後的判斷與結果。",
  "禁止濫用、攻擊、爬蟲、惡意重複請求或以任何方式干擾服務。",
  "付費功能未來將依實際金流規則、付款頁說明與交易紀錄處理。",
  "本站保留修改服務內容與條款之權利。",
];

export default function TermsPage() {
  return (
    <AppShell>
      <section className="mx-auto w-full max-w-4xl py-8 sm:py-12">
        <PageNavActions className="mb-6" />
        <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">terms of service</p>
        <h1 className="mt-3 text-4xl font-semibold text-moon sm:text-5xl">服務條款</h1>
        <div className="cosmic-tool-panel mt-8 rounded-[1.75rem] p-5 sm:p-7">
          <ul className="space-y-4 leading-8 text-moon/74">
            {terms.map((item) => <li key={item}>・{item}</li>)}
          </ul>
        </div>
      </section>
    </AppShell>
  );
}
