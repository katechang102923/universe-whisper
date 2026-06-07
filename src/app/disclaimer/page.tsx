import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { PageNavActions } from "@/components/PageNavActions";

export const metadata: Metadata = {
  title: "娛樂與自我探索聲明",
  description: "宇宙偷偷話的塔羅、星座與宇宙訊息僅供娛樂、靈感啟發與自我探索參考。",
  openGraph: {
    title: "娛樂與自我探索聲明 | 宇宙偷偷話 Universe Whisper",
    description: "塔羅、星座與宇宙訊息僅供娛樂與自我探索參考，不構成專業建議。",
  },
};

const notAdvice = [
  "醫療診斷或治療建議",
  "心理諮商或心理治療",
  "法律意見",
  "財務、投資或保險建議",
  "宗教、命理或結果保證",
  "替你做出人生重大決定",
];

export default function DisclaimerPage() {
  return (
    <AppShell>
      <section className="disclaimer-page mx-auto w-full max-w-5xl py-8 sm:py-12">
        <PageNavActions className="mb-6" />
        <div className="disclaimer-card overflow-hidden rounded-[2rem] border border-white/12 bg-white/[0.07] px-5 py-7 shadow-[0_24px_80px_rgba(9,10,35,0.34)] backdrop-blur-2xl sm:px-8 sm:py-10 lg:px-12">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.36em] text-aurora/80">DISCLAIMER</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight text-moon sm:text-5xl">
              使用聲明｜娛樂與自我探索
            </h1>
          </div>

          <p className="mt-7 max-w-3xl text-base leading-8 text-moon/78 sm:text-lg sm:leading-9">
            宇宙偷偷話提供的塔羅、星座與宇宙訊息，僅供娛樂、靈感啟發與自我探索參考。
            這些內容可以陪你整理心情與想法，但不應取代專業建議或現實判斷。
          </p>

          <div className="mt-9 border-t border-white/10 pt-7">
            <h2 className="text-2xl font-semibold text-moon">本網站內容不構成以下專業建議</h2>
          </div>

          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {notAdvice.map((item) => (
              <li
                key={item}
                className="disclaimer-chip rounded-full border border-lavender/18 bg-white/[0.08] px-5 py-3 text-sm leading-6 text-moon/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:text-base"
              >
                {item}
              </li>
            ))}
          </ul>

          <p className="mt-9 rounded-[1.5rem] border border-aurora/14 bg-midnight/28 px-5 py-5 leading-8 text-moon/78 sm:px-6">
            如果你正面臨身心健康、法律、財務、安全或其他重大問題，請優先尋求合格專業人士協助。
            願這裡的訊息成為一段溫柔提醒，陪你整理想法，而不是替你決定人生答案。
          </p>
        </div>
      </section>
    </AppShell>
  );
}
