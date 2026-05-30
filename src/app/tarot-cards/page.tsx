import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { PageNavActions } from "@/components/PageNavActions";
import { tarotCards } from "@/data/tarotCards";
import { TarotCardsClient } from "./TarotCardsClient";

export const metadata: Metadata = {
  title: "塔羅牌介紹",
  description: "認識大阿爾克那、小阿爾克那、四元素牌組、正位逆位與三張牌解讀方式。",
  openGraph: {
    title: "塔羅牌介紹 | 宇宙偷偷話 Universe Whisper",
    description: "認識塔羅牌結構、四元素牌組、常見牌義與娛樂自我探索聲明。",
  },
};

const suits = [
  { name: "權杖", key: "wands", element: "火元素", text: "象徵行動、熱情、創造力與生命動能。" },
  { name: "聖杯", key: "cups", element: "水元素", text: "象徵情感、關係、直覺與內在流動。" },
  { name: "寶劍", key: "swords", element: "風元素", text: "象徵思想、溝通、判斷與需要看清的真相。" },
  { name: "錢幣", key: "pentacles", element: "土元素", text: "象徵金錢、工作、身體、資源與現實穩定。" },
];

const meanings = [
  "愚者：新的開始、自由、未知旅程。",
  "魔術師：創造力、意志、把想法落地。",
  "女祭司：直覺、秘密、等待內在答案浮現。",
  "戀人：選擇、連結、價值觀是否一致。",
  "力量：溫柔的勇氣、耐心與自我安撫。",
  "星星：希望、療癒、重新相信未來。",
];

export default function TarotCardsPage() {
  return (
    <AppShell>
      <section className="mx-auto w-full max-w-5xl py-8 sm:py-12">
        <PageNavActions className="mb-6" />
        <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">tarot guide · 宇宙牌義筆記</p>
        <h1 className="mt-3 text-4xl font-semibold text-moon sm:text-5xl">塔羅牌介紹</h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-moon/74 sm:text-lg">
          塔羅是一套象徵語言，透過圖像、元素與牌陣，幫助我們整理情緒、看見選擇，並以更溫柔的方式靠近內在答案。
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <article className="cosmic-tool-panel rounded-[1.75rem] p-5">
            <h2 className="text-2xl font-semibold text-moon">大阿爾克那</h2>
            <p className="mt-3 leading-8 text-moon/72">
              大阿爾克那共有 22 張，描述人生旅程中的重要課題，例如開始、選擇、轉化、療癒與完成。抽到大牌時，通常代表事件背後有更深層的生命主題。
            </p>
          </article>
          <article className="cosmic-tool-panel rounded-[1.75rem] p-5">
            <h2 className="text-2xl font-semibold text-moon">小阿爾克那</h2>
            <p className="mt-3 leading-8 text-moon/72">
              小阿爾克那共有 56 張，更貼近日常生活，包含情感、人際、工作、金錢與行動細節。它們能協助我們看見當下正在發生的能量流動。
            </p>
          </article>
        </div>

        <section className="mt-10">
          <h2 className="text-2xl font-semibold text-moon">四元素牌組</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {suits.map((suit) => (
              <article key={suit.key} className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-glow">
                <p className="text-sm tracking-[0.22em] text-[#d8bd70]/78">{suit.element}</p>
                <h3 className="mt-2 text-xl font-semibold text-moon">{suit.name}</h3>
                <p className="mt-3 leading-7 text-moon/70">{suit.text}</p>
              </article>
            ))}
          </div>
        </section>

        <TarotCardsClient cards={tarotCards} />

        <section className="mt-10 grid gap-4 lg:grid-cols-3">
          <article className="rounded-3xl border border-lavender/18 bg-midnight/54 p-5">
            <h2 className="text-xl font-semibold text-moon">常見牌義簡介</h2>
            <ul className="mt-3 space-y-2 text-sm leading-7 text-moon/72">
              {meanings.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </article>
          <article className="rounded-3xl border border-lavender/18 bg-midnight/54 p-5">
            <h2 className="text-xl font-semibold text-moon">正位 / 逆位</h2>
            <p className="mt-3 leading-8 text-moon/72">
              正位通常代表能量較自然流動，逆位則可能表示阻塞、延遲、過度或需要回到內在調整。逆位不是壞牌，而是一種提醒。
            </p>
          </article>
          <article className="rounded-3xl border border-lavender/18 bg-midnight/54 p-5">
            <h2 className="text-xl font-semibold text-moon">三張牌解讀方式</h2>
            <p className="mt-3 leading-8 text-moon/72">
              三張牌常用於「過去、現在、未來」或「狀況、原因、建議」。重點不是預言，而是看見事件中的情緒脈絡與下一步方向。
            </p>
          </article>
        </section>

        <section className="mt-10 rounded-[1.75rem] border border-[#d8bd70]/24 bg-[#d8bd70]/8 p-5">
          <h2 className="text-2xl font-semibold text-moon">娛樂與自我探索聲明</h2>
          <p className="mt-3 leading-8 text-moon/74">
            本網站提供的塔羅、星座與宇宙訊息，僅供娛樂、靈感啟發與自我探索參考，不構成醫療、法律、財務、投資或其他專業建議。
          </p>
        </section>
      </section>
    </AppShell>
  );
}
