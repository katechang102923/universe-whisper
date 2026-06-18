import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AstroProfileClient } from "./AstroProfileClient";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "四核心星座查詢｜免費算太陽、月亮、上升與金星星座",
  description:
    "輸入出生日期、時間與城市，免費查詢你的太陽星座、月亮星座、上升星座與金星星座，了解核心個性、情感需求與外在氣質。",
  alternates: { canonical: "/astro-profile" },
  openGraph: {
    title: "四核心星座查詢｜免費算太陽、月亮、上升與金星星座",
    description: "輸入出生日期、時間與城市，免費查詢你的太陽、月亮、上升與金星四核心星座。",
  },
};

export default function AstroProfilePage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="min-h-screen" />}>
        <AstroProfileClient />
      </Suspense>

      {/* SEO 說明文字：用白話解釋四核心星座，讓一般使用者看得懂 */}
      <section className="mx-auto w-full max-w-3xl px-1 pb-12">
        <div className="border-t border-white/10 pt-8">
          <h2 className="text-lg font-semibold text-moon sm:text-xl">四核心星座是什麼？</h2>
          <p className="mt-3 text-sm leading-7 text-moon/65 sm:text-base">
            四核心星座指的是太陽、月亮、上升與金星這四個星座。太陽星座是大家最熟悉的星座，代表你的核心個性；月亮星座是你私底下真正的情感需求；上升星座是別人第一眼看見的你，也就是你的外在氣質；金星星座則和你在感情裡會被什麼吸引、又怎麼表達喜歡有關。
          </p>
          <p className="mt-3 text-sm leading-7 text-moon/65 sm:text-base">
            只看太陽星座，常常無法解釋自己身上的各種矛盾。把這四個核心放在一起看，會更貼近真實的你。輸入出生日期、時間與城市就能免費查詢，其中上升與金星星座需要較準確的出生時間才能算得準。內容僅供娛樂與自我探索參考，不代表絕對命定。想先了解概念，也可以閱讀
            {" "}
            <Link
              href="/astrology/four-core"
              className="text-lavender/80 underline underline-offset-4 transition hover:text-moon"
            >
              四核心星座是什麼
            </Link>
            。
          </p>
        </div>
      </section>
    </AppShell>
  );
}
