import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { FeatureCard } from "@/components/FeatureCard";

export const metadata: Metadata = {
  title: { absolute: "宇宙偷偷話｜免費塔羅抽牌、每日運勢與四核心星座" },
  description:
    "宇宙偷偷話提供每日免費塔羅抽牌、三張牌占卜、今日星座運勢與四核心星座解析。感情、工作、財運、生活問題，都可以抽一張牌看方向。",
  keywords: [
    "宇宙偷偷話",
    "免費塔羅",
    "塔羅抽牌",
    "每日塔羅",
    "三張牌占卜",
    "今日星座運勢",
    "四核心星座",
    "太陽星座",
    "月亮星座",
    "上升星座",
    "金星星座",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: "宇宙偷偷話｜免費塔羅抽牌、每日運勢與四核心星座",
    description:
      "每日免費抽一張塔羅牌，查看感情、工作、財運與生活方向，也可以查看今日星座運勢與四核心星座解析。",
    url: "https://universe-whisper.vercel.app/",
  },
  twitter: {
    title: "宇宙偷偷話｜免費塔羅抽牌、每日運勢與四核心星座",
    description: "每日免費塔羅抽牌、三張牌占卜、今日星座運勢與四核心星座解析。",
  },
};

const quickQuestions = [
  "他還會回我嗎？",
  "這段感情該繼續嗎？",
  "最近工作會順嗎？",
  "最近財運要注意什麼？",
  "今天我該注意什麼？",
];

const cosmicMessages = [
  "你已經在等一個答案很久了，今晚先讓心靜下來。",
  "有些感受不需要被解釋，只需要被好好接住。",
  "你不是太敏感，你只是太認真在乎了。",
  "今晚，宇宙想偷偷告訴你一句話——你已經夠了。",
  "讓答案慢慢靠近，不必用力追。",
];

const lineAddFriendUrl = "https://liff.line.me/2010215499-WrEJvUzE";

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "宇宙偷偷話 Universe Whisper",
  url: "https://universe-whisper.vercel.app/",
  description: "免費塔羅抽牌、每日運勢與四核心星座解析網站。",
  inLanguage: "zh-Hant",
};

export default function Home() {
  const todayMessage = cosmicMessages[new Date().getDate() % cosmicMessages.length];

  return (
    <AppShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="relative flex items-center py-5 sm:py-8 lg:py-10">
        {/* Floating star decorations */}
        <span className="floating-star left-[10%] top-[12%]" />
        <span className="floating-star right-[18%] top-[18%] [animation-delay:1.2s]" />
        <span className="floating-star bottom-[18%] left-[28%] [animation-delay:2.4s]" />
        <span className="floating-star right-[8%] bottom-[28%] [animation-delay:3.6s]" />

        <div className="grid w-full items-center gap-6 lg:grid-cols-2 lg:gap-10">
          {/* ── Left: 品牌名稱 + 標語 + 簡短說明 ─────────────── */}
          <div className="text-center lg:text-left">
            {/* 小標籤列 */}
            <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              {["每天免費一次", "可存到 LINE", "免費也能看完整版"].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-[#d8bd70]/30 bg-[#d8bd70]/10 px-3 py-1 text-xs font-medium text-aurora/90"
                >
                  {tag}
                </span>
              ))}
            </div>

            <h1 className="mt-4 text-[2.4rem] font-semibold leading-[1.12] tracking-[0.04em] text-moon drop-shadow-[0_0_22px_rgba(203,184,255,0.16)] sm:text-[2.9rem] lg:text-[3.3rem]">
              宇宙偷偷話
            </h1>
            <p className="mt-3 text-lg font-medium text-lavender/90 sm:text-xl">
              免費塔羅占卜 × 四核心星座解析
            </p>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-moon/72 sm:text-base lg:mx-0">
              每天免費一次，可以選擇單張塔羅或三張塔羅。不用登入、不用付款，30 秒看見今天的提醒。
            </p>

            {/* LINE 輔助文字 — 桌機版顯示，手機版第一屏保持精簡 */}
            <p className="mt-4 hidden text-xs text-moon/45 sm:block">
              抽完牌可同步收藏至{" "}
              <a
                href={lineAddFriendUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 transition hover:text-moon/70"
              >
                LINE
              </a>
              ；每天免費也能看完整訊息，想再問更多問題可選擇加抽。也可以免費查看你的太陽、月亮、上升與金星四核心星座輪廓。
            </p>
          </div>

          {/* ── Right: cat illustration + today's cosmic message（手機版第一屏隱藏）─── */}
          <div className="hidden flex-col items-center gap-3 sm:flex sm:gap-4">
            {/* Hero cat photo */}
            <div className="cat-float relative mx-auto w-[360px] lg:w-[430px] xl:w-[460px]">
              <div className="pointer-events-none absolute inset-[-8%] rounded-full bg-[radial-gradient(circle,rgba(216,189,112,0.22),rgba(109,77,242,0.18)_38%,transparent_68%)] blur-2xl" />
              <Image
                src="/images/hero/main-cosmic-cat.webp"
                alt="宇宙占卜貓"
                width={460}
                height={307}
                priority
                style={{ width: "100%", height: "auto" }}
                className="relative h-auto w-full origin-center object-contain drop-shadow-[0_10px_52px_rgba(109,77,242,0.54)] [filter:drop-shadow(0_0_22px_rgba(216,189,112,0.24))]"
              />
            </div>

            {/* Today's cosmic message */}
            <div className="w-full max-w-[340px] rounded-2xl border border-white/10 bg-midnight/48 p-4 backdrop-blur-sm">
              <p className="text-xs text-lavender/70">
                <span className="mr-1 text-[#d8bd70]/70">✦</span>
                今日宇宙訊息
              </p>
              <p className="mt-2 text-base font-medium leading-7 text-moon">
                {todayMessage}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 兩大主要入口卡片（手機版第一屏聚焦於此）──────────────────── */}
      <section className="pb-9 pt-1 sm:pb-12">
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
          {/* 卡片一：免費抽牌 → 現有塔羅抽牌頁 /tarot */}
          <Link
            href="/tarot"
            className="group flex flex-col overflow-hidden rounded-[1.75rem] border border-[#d8bd70]/30 bg-midnight/54 shadow-[0_18px_54px_rgba(4,7,26,0.24)] backdrop-blur-sm transition hover:-translate-y-1 hover:border-[#d8bd70]/55 hover:shadow-[0_12px_48px_rgba(216,189,112,0.26)] active:scale-[0.99]"
          >
            <div className="h-1 bg-gradient-to-r from-[#f7d987] to-[#d8bd70]" />
            <div className="flex flex-1 flex-col p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#d8bd70]/25 bg-[#d8bd70]/10 text-xl">
                  🃏
                </span>
                <div>
                  <h2 className="text-xl font-semibold text-moon">免費抽牌</h2>
                  <p className="mt-0.5 text-xs font-medium text-[#d8bd70]/85">
                    單張塔羅、三張塔羅，每天免費一次
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm leading-6 text-moon/72">
                <p>
                  <span className="font-medium text-moon/88">單張：</span>適合快速看方向
                </p>
                <p>
                  <span className="font-medium text-moon/88">三張：</span>適合看完整脈絡
                </p>
              </div>
              <span
                className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-full px-6 text-base font-bold text-midnight transition group-hover:brightness-110 sm:mt-auto"
                style={{
                  background: "linear-gradient(135deg, #f7d987 0%, #d8bd70 50%, #cbb8ff 100%)",
                }}
              >
                開始抽牌
              </span>
            </div>
          </Link>

          {/* 卡片二：四核心星座 → 現有四核心星座頁 /astro-profile */}
          <Link
            href="/astro-profile"
            className="group flex flex-col overflow-hidden rounded-[1.75rem] border border-lavender/30 bg-midnight/54 shadow-[0_18px_54px_rgba(4,7,26,0.24)] backdrop-blur-sm transition hover:-translate-y-1 hover:border-lavender/55 hover:shadow-[0_12px_48px_rgba(203,184,255,0.28)] active:scale-[0.99]"
          >
            <div className="h-1 bg-gradient-to-r from-lavender to-nebula" />
            <div className="flex flex-1 flex-col p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-lavender/25 bg-lavender/10 text-xl">
                  ✦
                </span>
                <div>
                  <h2 className="text-xl font-semibold text-moon">四核心星座</h2>
                  <p className="mt-0.5 text-xs font-medium text-lavender/85">
                    太陽、月亮、上升、金星
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm leading-6 text-moon/72">
                <p>看懂你的個性、感情模式與人際盲點。</p>
                <p className="text-moon/55">輸入出生資訊，立即查看完整四核心輪廓。</p>
              </div>
              <span className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-full border border-lavender/50 bg-lavender/15 px-6 text-base font-bold text-lavender transition group-hover:bg-lavender/25 sm:mt-auto">
                免費查看
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* ── 單張塔羅 vs 三張塔羅（桌機版顯示）──────────────────────────── */}
      <section className="hidden pb-10 sm:block sm:pb-14">
        <h2 className="mb-5 text-lg font-semibold text-moon">單張塔羅 vs 三張塔羅</h2>
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
          {/* 單張塔羅 */}
          <div className="rounded-2xl border border-[#d8bd70]/24 bg-midnight/40 p-6 backdrop-blur-sm">
            <h3 className="text-base font-semibold text-moon">單張塔羅</h3>
            <dl className="mt-4 space-y-3 text-sm leading-7">
              <div>
                <dt className="text-xs font-semibold text-[#d8bd70]/80">適合</dt>
                <dd className="mt-0.5 text-moon/78">簡單問題、快速決定、今天方向</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-[#d8bd70]/80">特色</dt>
                <dd className="mt-0.5 text-moon/78">答案直接、速度快，適合第一次使用</dd>
              </div>
            </dl>
          </div>

          {/* 三張塔羅 */}
          <div className="rounded-2xl border border-lavender/24 bg-midnight/40 p-6 backdrop-blur-sm">
            <h3 className="text-base font-semibold text-moon">三張塔羅</h3>
            <dl className="mt-4 space-y-3 text-sm leading-7">
              <div>
                <dt className="text-xs font-semibold text-lavender/80">適合</dt>
                <dd className="mt-0.5 text-moon/78">感情發展、工作選擇、搬家／轉職等重大選擇</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-lavender/80">特色</dt>
                <dd className="mt-0.5 text-moon/78">看過去／現在／未來，脈絡更完整，建議更具體</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* ── 快捷問題 + 範例結果卡 ───────────────────────────────────── */}
      <section className="pt-2 pb-10 sm:pb-14">
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
          {/* 不知道問什麼 — 手機版隱藏（抽牌頁已有推薦問題），桌機版保留 */}
          <div className="hidden sm:block">
            <h2 className="text-lg font-semibold text-moon">
              不知道問什麼？可以從這些開始
            </h2>
            <div className="mt-4 flex flex-col gap-2.5 sm:gap-3">
              {/* 前 3 個：手機與桌機皆顯示 */}
              {quickQuestions.slice(0, 3).map((q) => (
                <Link
                  key={q}
                  href="/tarot?spread=single"
                  className="group flex items-center justify-between rounded-2xl border border-[#d8bd70]/24 bg-midnight/40 px-5 py-3 text-left transition hover:-translate-y-0.5 hover:border-[#d8bd70]/50 hover:bg-white/5 active:scale-[0.98] sm:py-3.5"
                >
                  <span className="text-sm font-medium text-moon/88">{q}</span>
                  <span className="ml-3 shrink-0 text-xs text-aurora/70 transition-transform group-hover:translate-x-1">
                    抽一張 →
                  </span>
                </Link>
              ))}

              {/* 其餘問題：桌機直接顯示 */}
              {quickQuestions.slice(3).map((q) => (
                <Link
                  key={q}
                  href="/tarot?spread=single"
                  className="group hidden items-center justify-between rounded-2xl border border-[#d8bd70]/24 bg-midnight/40 px-5 py-3.5 text-left transition hover:-translate-y-0.5 hover:border-[#d8bd70]/50 hover:bg-white/5 active:scale-[0.98] sm:flex"
                >
                  <span className="text-sm font-medium text-moon/88">{q}</span>
                  <span className="ml-3 shrink-0 text-xs text-aurora/70 transition-transform group-hover:translate-x-1">
                    抽一張 →
                  </span>
                </Link>
              ))}

              {/* 手機版：其餘問題收合在「查看更多問題」內 */}
              <details className="group sm:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-center rounded-2xl border border-white/10 bg-midnight/30 px-5 py-2.5 text-xs font-medium text-moon/60 transition hover:bg-white/5">
                  查看更多問題
                  <span className="ml-1 transition-transform group-open:rotate-180">▾</span>
                </summary>
                <div className="mt-2.5 flex flex-col gap-2.5">
                  {quickQuestions.slice(3).map((q) => (
                    <Link
                      key={q}
                      href="/tarot?spread=single"
                      className="group/item flex items-center justify-between rounded-2xl border border-[#d8bd70]/24 bg-midnight/40 px-5 py-3 text-left transition hover:border-[#d8bd70]/50 hover:bg-white/5 active:scale-[0.98]"
                    >
                      <span className="text-sm font-medium text-moon/88">{q}</span>
                      <span className="ml-3 shrink-0 text-xs text-aurora/70">抽一張 →</span>
                    </Link>
                  ))}
                </div>
              </details>
            </div>
          </div>

          {/* 範例結果卡（靜態展示，不呼叫 AI）— 手機版隱藏，桌機版保留 */}
          <div className="hidden sm:block">
            <h2 className="text-lg font-semibold text-moon">抽完你會看到</h2>

            {/* 手機版：精簡短卡 */}
            <div className="mt-4 rounded-[1.5rem] border border-lavender/26 bg-gradient-to-br from-white/[0.08] via-midnight/62 to-lavender/[0.06] p-5 shadow-[0_18px_54px_rgba(4,7,26,0.28)] backdrop-blur-sm sm:hidden">
              <p className="text-sm leading-7 text-moon/85">
                一句話結論、牌面重點、針對你的問題、3～7 天建議
              </p>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-midnight/40 px-4 py-2.5">
                <span className="text-base">💚</span>
                <p className="text-xs text-moon/60">可收藏到 LINE，免費也能看完整訊息</p>
              </div>
            </div>

            {/* 桌機版：完整卡片 */}
            <div className="mt-4 hidden rounded-[2rem] border border-lavender/26 bg-gradient-to-br from-white/[0.08] via-midnight/62 to-lavender/[0.06] p-6 shadow-[0_18px_54px_rgba(4,7,26,0.28)] backdrop-blur-sm sm:block">
              <p className="text-xs uppercase tracking-[0.24em] text-aurora/70">
                範例 · 僅供參考
              </p>
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-[#d8bd70]/80">一句話結論</p>
                  <p className="mt-1 text-sm leading-7 text-moon/85">
                    先別急著要答案，這幾天適合慢慢觀察，方向會自己浮現。
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#d8bd70]/80">牌面重點</p>
                  <p className="mt-1 text-sm leading-7 text-moon/75">
                    抽到的牌提醒你：現在的猶豫，是因為你還在等一個更確定的訊號。
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#d8bd70]/80">針對你的問題</p>
                  <p className="mt-1 text-sm leading-7 text-moon/75">
                    對方不是不在乎，而是也在觀望，與其追問，不如先穩住自己的節奏。
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#d8bd70]/80">3～7 天建議</p>
                  <p className="mt-1 text-sm leading-7 text-moon/75">
                    這週試著主動釋出一次善意，但不施壓，把空間留給彼此。
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-midnight/40 px-4 py-3">
                  <span className="text-base">💚</span>
                  <p className="text-xs text-moon/60">可收藏到 LINE，隨時回來看這次的提醒</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature entry cards（下半部，次要入口）──────────────────────────── */}
      <section className="pb-8 sm:pb-12">
        <p className="mb-5 text-center text-xs uppercase tracking-[0.28em] text-moon/38">
          今日星座 · 每日運勢
        </p>

        {/* 手機版：2 欄精簡入口（不刪除任何功能） */}
        <div className="grid grid-cols-2 gap-3 sm:hidden">
          {[
            { href: "/daily", label: "今日運勢", icon: "🌙" },
            { href: "/astro-profile", label: "我的四核心星座", icon: "✦" },
            { href: "/tarot-cards", label: "塔羅牌庫", icon: "🃏" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-midnight/54 px-4 py-3.5 transition active:scale-[0.98]"
            >
              <span className="text-base">{item.icon}</span>
              <span className="text-sm font-medium text-moon/85">{item.label}</span>
            </Link>
          ))}
        </div>

        {/* 桌機版：完整功能卡片 */}
        <div className="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-3">
          {/* 今日運勢 */}
          <FeatureCard
            gradient="from-lavender/40 to-nebula/24"
            title="今日星座運勢"
            description="查看你的星座今日愛情、工作、生活與心情提醒，讓宇宙幫你整理今天。"
            href="/daily"
            icon={
              <svg
                viewBox="0 0 22 22"
                className="h-5 w-5"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
                  stroke="#cbb8ff"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />

          {/* 我的四核心星座 */}
          <FeatureCard
            gradient="from-[#d8bd70]/38 to-lavender/30"
            title="我的四核心星座"
            description="輸入出生資訊，看看你的核心個性、內在情感、外在氣質與感情吸引力。"
            href="/astro-profile"
            badge="太陽 × 月亮 × 上升 × 金星"
            icon={
              <svg
                viewBox="0 0 22 22"
                className="h-5 w-5"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="4" stroke="#d8bd70" strokeWidth="1.6" />
                <path
                  d="M11 2v2M11 18v2M2 11h2M18 11h2M4.93 4.93l1.41 1.41M15.66 15.66l1.41 1.41M4.93 17.07l1.41-1.41M15.66 6.34l1.41-1.41"
                  stroke="#d8bd70"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            }
          />

          {/* 塔羅牌庫 */}
          <FeatureCard
            gradient="from-aurora/36 to-nebula/22"
            title="塔羅牌庫"
            description="瀏覽 78 張塔羅牌的牌義、關鍵字與宇宙解讀，作為學習與參考。"
            href="/tarot-cards"
            icon={
              <svg
                viewBox="0 0 22 22"
                className="h-5 w-5"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <rect
                  x="4"
                  y="2"
                  width="14"
                  height="18"
                  rx="2.5"
                  stroke="#d8bd70"
                  strokeWidth="1.6"
                />
                <path
                  d="M8 7h6M8 11h6M8 15h3"
                  stroke="#d8bd70"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            }
          />
        </div>
      </section>

      {/* ── 內部連結區塊：你可以從這裡開始 ─────────────────────────────── */}
      <section className="pb-10 sm:pb-14">
        <h2 className="mb-5 text-center text-lg font-semibold text-moon sm:text-left">
          你可以從這裡開始
        </h2>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { href: "/tarot", label: "免費塔羅抽牌", desc: "每日免費抽一張牌看方向" },
            { href: "/tarot/love", label: "感情塔羅抽牌", desc: "為一段感情整理心情" },
            { href: "/tarot/work", label: "工作塔羅抽牌", desc: "面對職場選擇與卡關" },
            { href: "/tarot/money", label: "財運塔羅抽牌", desc: "覺察自己與金錢的關係" },
            { href: "/tarot/three-card", label: "三張牌占卜", desc: "用三張牌看整體脈絡" },
            { href: "/astro-profile", label: "四核心星座查詢", desc: "免費算太陽、月亮、上升與金星" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center justify-between rounded-2xl border border-[#d8bd70]/24 bg-midnight/40 px-5 py-3.5 text-left transition hover:-translate-y-0.5 hover:border-[#d8bd70]/50 hover:bg-white/5 active:scale-[0.98]"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-moon/88">{item.label}</span>
                <span className="mt-0.5 block text-xs text-moon/50">{item.desc}</span>
              </span>
              <span className="ml-3 shrink-0 text-xs text-aurora/70 transition-transform group-hover:translate-x-1">
                前往 →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── SEO 說明文字（給搜尋引擎理解網站用途，樣式低調）─────────────── */}
      <section className="pb-12">
        <p className="mx-auto max-w-3xl text-center text-xs leading-7 text-moon/45">
          宇宙偷偷話是一個免費塔羅抽牌與星座解析網站。你可以每天免費抽一張塔羅牌，查看感情、工作、財運、生活方向，也可以查看今日星座運勢與四核心星座解析。
        </p>
      </section>
    </AppShell>
  );
}
