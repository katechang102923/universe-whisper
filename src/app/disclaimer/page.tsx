import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { PageNavActions } from "@/components/PageNavActions";

export const metadata: Metadata = {
  title: "娛樂聲明",
  description: "宇宙偷偷話內容僅供娛樂、自我探索與心靈陪伴參考，不構成專業建議。",
  openGraph: {
    title: "娛樂聲明 | 宇宙偷偷話 Universe Whisper",
    description: "宇宙偷偷話內容僅供娛樂、自我探索與心靈陪伴參考，不構成專業建議。",
  },
};

const statements = [
  "本網站內容僅供娛樂、自我探索與心靈陪伴參考。",
  "本網站內容不構成醫療、法律、投資、財務、心理治療或其他專業建議。",
  "若涉及健康、法律、財務、投資、心理狀態或其他重大決策，請尋求合格專業人士協助。",
  "本站不保證塔羅、星座或其他解讀結果準確、完整或一定發生。",
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
              娛樂聲明
            </h1>
          </div>

          <p className="mt-7 max-w-3xl text-base leading-8 text-moon/78 sm:text-lg sm:leading-9">
            Universe Whisper 宇宙偷偷話希望提供溫柔、有趣的文字陪伴。請將網站內容視為自我探索與娛樂參考，而不是替代專業判斷。
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {statements.map((item) => (
              <li
                key={item}
                className="disclaimer-chip rounded-[1.25rem] border border-lavender/18 bg-white/[0.08] px-5 py-4 text-sm leading-7 text-moon/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:text-base"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </AppShell>
  );
}
