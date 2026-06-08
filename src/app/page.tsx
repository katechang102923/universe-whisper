import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { FeatureCard } from "@/components/FeatureCard";

export const metadata: Metadata = {
  title: "宇宙偷偷話 Universe Whisper",
  description: "每天免費抽一張塔羅牌，不用登入、不用付款，30 秒看見今天的提醒。感情、工作、財運、生活都可以問。",
  openGraph: {
    title: "宇宙偷偷話 Universe Whisper",
    description: "每天免費抽一張塔羅牌，不用登入、不用付款，30 秒看見今天的提醒。感情、工作、財運、生活都可以問。",
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

export default function Home() {
  const todayMessage = cosmicMessages[new Date().getDate() % cosmicMessages.length];

  return (
    <AppShell>
      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="relative flex items-center py-5 sm:py-8 lg:py-10">
        {/* Floating star decorations */}
        <span className="floating-star left-[10%] top-[12%]" />
        <span className="floating-star right-[18%] top-[18%] [animation-delay:1.2s]" />
        <span className="floating-star bottom-[18%] left-[28%] [animation-delay:2.4s]" />
        <span className="floating-star right-[8%] bottom-[28%] [animation-delay:3.6s]" />

        <div className="grid w-full items-center gap-6 lg:grid-cols-2 lg:gap-10">
          {/* ── Left: headline + CTAs ─────────────────────────── */}
          <div className="text-center lg:text-left">
            {/* 小標籤列 */}
            <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              {["每日免費一次", "可存到 LINE", "想看完整再 NT$49"].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-[#d8bd70]/30 bg-[#d8bd70]/10 px-3 py-1 text-xs font-medium text-aurora/90"
                >
                  {tag}
                </span>
              ))}
            </div>

            <h1 className="mx-auto mt-4 max-w-[14em] text-[2.2rem] font-semibold leading-[1.16] text-moon drop-shadow-[0_0_22px_rgba(203,184,255,0.16)] sm:text-[2.7rem] lg:mx-0 lg:text-[3.2rem]">
              現在最困住你的問題，
              <br className="hidden sm:block" />
              抽一張牌先看方向
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-8 text-moon/78 sm:text-lg lg:mx-0">
              感情、工作、財運、生活都可以問。每天免費一次，不用登入、不用付款，30 秒看見今天的提醒。
            </p>

            {/* ── CTA：主要按鈕（最醒目）+ 次要按鈕 ── */}
            <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap lg:items-start">
              <Link
                href="/tarot?spread=single"
                className="inline-flex min-h-[60px] w-full max-w-[360px] items-center justify-center rounded-full px-8 text-lg font-bold text-midnight shadow-[0_18px_50px_rgba(216,189,112,0.34),0_0_30px_rgba(203,184,255,0.2)] transition hover:brightness-110 active:scale-[0.98] sm:w-auto"
                style={{
                  background: "linear-gradient(135deg, #f7d987 0%, #d8bd70 42%, #cbb8ff 100%)",
                }}
              >
                免費抽一張
              </Link>
              <Link
                href="/tarot?spread=three"
                className="inline-flex min-h-[52px] w-full max-w-[360px] items-center justify-center rounded-full border border-lavender/45 bg-lavender/10 px-6 text-sm font-semibold text-lavender transition hover:bg-lavender/20 active:scale-[0.98] sm:w-auto"
              >
                抽三張看完整脈絡
              </Link>
            </div>

            {/* LINE 輔助文字 */}
            <p className="mt-4 text-xs text-moon/45">
              抽完牌可同步收藏至{" "}
              <a
                href={lineAddFriendUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 transition hover:text-moon/70"
              >
                LINE
              </a>
              ，完整版 NT$49 解鎖更深入的解讀。
            </p>
          </div>

          {/* ── Right: cat illustration + today's cosmic message ─── */}
          <div className="flex flex-col items-center gap-3 sm:gap-4">
            {/* Hero cat photo — 手機版中等尺寸，桌機維持原尺寸 */}
            <div className="cat-float relative mx-auto w-[clamp(170px,52vw,220px)] sm:w-[360px] lg:w-[430px] xl:w-[460px]">
              <div className="pointer-events-none absolute inset-[-8%] rounded-full bg-[radial-gradient(circle,rgba(216,189,112,0.22),rgba(109,77,242,0.18)_38%,transparent_68%)] blur-2xl" />
              <Image
                src="/images/hero/main-cosmic-cat.webp"
                alt="宇宙占卜貓"
                width={460}
                height={307}
                priority
                style={{ width: "100%", height: "auto" }}
                className="relative h-auto w-full object-contain drop-shadow-[0_10px_52px_rgba(109,77,242,0.54)] [filter:drop-shadow(0_0_22px_rgba(216,189,112,0.24))]"
              />
            </div>

            {/* Today's cosmic message — 桌機版完整卡片（手機版隱藏） */}
            <div className="hidden w-full max-w-[340px] rounded-2xl border border-white/10 bg-midnight/48 p-4 backdrop-blur-sm sm:block">
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

          {/* 範例結果卡（靜態展示，不呼叫 AI） */}
          <div>
            <h2 className="text-lg font-semibold text-moon">抽完你會看到</h2>

            {/* 手機版：精簡短卡 */}
            <div className="mt-4 rounded-[1.5rem] border border-lavender/26 bg-gradient-to-br from-white/[0.08] via-midnight/62 to-lavender/[0.06] p-5 shadow-[0_18px_54px_rgba(4,7,26,0.28)] backdrop-blur-sm sm:hidden">
              <p className="text-sm leading-7 text-moon/85">
                一句話結論、牌面重點、針對你的問題、3～7 天建議
              </p>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-midnight/40 px-4 py-2.5">
                <span className="text-base">💚</span>
                <p className="text-xs text-moon/60">可收藏到 LINE，想看完整再 NT$49</p>
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
            { href: "/astro-profile", label: "我的三重星座", icon: "✦" },
            { href: "/tarot-cards", label: "塔羅牌庫", icon: "🃏" },
            { href: "/redeem/check", label: "查詢次數", icon: "🔍" },
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

          {/* 我的三重星座 */}
          <FeatureCard
            gradient="from-[#d8bd70]/38 to-lavender/30"
            title="我的三重星座"
            description="輸入出生資訊，看看你的核心個性、內在情感與外在氣質。延伸查看金星感情吸引力。"
            href="/astro-profile"
            badge="太陽 × 月亮 × 上升"
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
    </AppShell>
  );
}
