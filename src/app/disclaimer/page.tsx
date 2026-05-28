import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "娛樂與自我探索聲明",
  description: "宇宙偷偷話的塔羅、星座、宇宙訊息與 AI 解析內容僅供娛樂、靈感啟發與自我探索參考。",
  openGraph: {
    title: "娛樂與自我探索聲明 | 宇宙偷偷話 Universe Whisper",
    description: "塔羅、星座與 AI 解析內容僅供娛樂與自我探索參考，不構成專業建議。",
  },
};

const notAdvice = ["醫療建議", "心理治療", "法律建議", "財務或投資建議", "宗教或命理保證", "重大人生決策依據"];

export default function DisclaimerPage() {
  return (
    <AppShell>
      <section className="mx-auto w-full max-w-4xl py-8 sm:py-12">
        <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">disclaimer</p>
        <h1 className="mt-3 text-4xl font-semibold text-moon sm:text-5xl">娛樂與自我探索聲明</h1>
        <div className="cosmic-tool-panel mt-8 rounded-[1.75rem] p-5 sm:p-7">
          <p className="leading-8 text-moon/76">
            本網站提供的塔羅、星座、宇宙訊息與 AI 解析內容，僅供娛樂、靈感啟發與自我探索參考。
          </p>
          <h2 className="mt-7 text-2xl font-semibold text-moon">本網站內容不構成：</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {notAdvice.map((item) => (
              <li key={item} className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-moon/74">
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-7 leading-8 text-moon/76">
            若您正面臨身心健康、法律、財務或安全相關問題，請尋求合格專業人士協助。
          </p>
        </div>
      </section>
    </AppShell>
  );
}
