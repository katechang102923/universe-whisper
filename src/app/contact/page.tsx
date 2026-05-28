import Link from "next/link";
import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "聯絡我們",
  description: "如有合作、隱私權或服務相關需求，歡迎聯絡宇宙偷偷話 Universe Whisper。",
  openGraph: {
    title: "聯絡我們 | 宇宙偷偷話 Universe Whisper",
    description: "宇宙偷偷話 Universe Whisper 聯絡資訊。",
  },
};

export default function ContactPage() {
  return (
    <AppShell>
      <section className="mx-auto flex w-full max-w-3xl flex-1 items-center py-12">
        <div className="cosmic-tool-panel w-full rounded-[2rem] p-6 text-center sm:p-10">
          <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">contact</p>
          <h1 className="mt-3 text-4xl font-semibold text-moon">宇宙偷偷話 Universe Whisper</h1>
          <p className="mx-auto mt-5 max-w-xl leading-8 text-moon/74">
            如有任何問題、合作、隱私權或服務相關需求，請聯絡：
          </p>
          <a href="mailto:ciut0000@gmail.com" className="mt-4 inline-block text-lg font-semibold text-[#d8bd70] underline decoration-[#d8bd70]/40 underline-offset-4">
            ciut0000@gmail.com
          </a>
          <div className="mt-8">
            <Link href="/" className="rounded-full bg-moon px-7 py-3.5 font-semibold text-midnight shadow-glow transition hover:bg-white">
              返回首頁
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
