import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { FeatureCard } from "@/components/FeatureCard";

export const metadata: Metadata = {
  title: "宇宙偷偷話 Universe Whisper",
  description: "深夜裡陪你抽一張塔羅牌，查看每日星座運勢，接收溫柔的宇宙訊息。",
  openGraph: {
    title: "宇宙偷偷話 Universe Whisper",
    description: "深夜裡陪你抽一張塔羅牌，查看每日星座運勢，接收溫柔的宇宙訊息。",
  },
};

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
      <section className="relative flex flex-1 items-center py-8 sm:py-12 lg:min-h-[calc(100vh-96px)]">
        {/* Floating star decorations */}
        <span className="floating-star left-[10%] top-[12%]" />
        <span className="floating-star right-[18%] top-[18%] [animation-delay:1.2s]" />
        <span className="floating-star bottom-[18%] left-[28%] [animation-delay:2.4s]" />
        <span className="floating-star right-[8%] bottom-[28%] [animation-delay:3.6s]" />

        <div className="grid w-full items-center gap-8 lg:grid-cols-2 lg:gap-12">
          {/* ── Left: headline + CTAs ─────────────────────────── */}
          <div>
            <p className="text-xs uppercase tracking-[0.36em] text-aurora/80">
              宇宙塔羅 · 每日提醒
            </p>
            <h1 className="mt-4 text-[2.6rem] font-semibold leading-tight text-moon sm:text-5xl lg:text-6xl">
              今晚想聽
              <br className="hidden sm:block" />
              宇宙說什麼？
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-moon/76 sm:text-xl">
              深夜裡，陪你抽一張牌，聽聽宇宙想對你說什麼。
            </p>

            {/* ── Two entry cards ── */}
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {/* 單張入口 */}
              <Link
                href="/tarot?spread=single"
                className="group flex flex-col rounded-3xl border border-[#d8bd70]/30 bg-midnight/50 p-5 transition hover:border-[#d8bd70]/60 hover:bg-white/5 active:scale-[0.98]"
              >
                <span className="text-2xl">✨</span>
                <span className="mt-2 text-base font-semibold text-moon">單張宇宙訊息</span>
                <span className="mt-1 text-sm leading-6 text-moon/55">
                  適合快速獲得一個提醒與方向
                </span>
                <span
                  className="mt-4 self-start rounded-full px-5 py-2.5 text-sm font-semibold text-midnight transition group-hover:brightness-105"
                  style={{
                    background: "linear-gradient(135deg, #d8bd70 0%, #b89adf 60%, #d8bd70 100%)",
                    backgroundSize: "200% 200%",
                  }}
                >
                  抽一張
                </span>
              </Link>

              {/* 三張入口 */}
              <Link
                href="/tarot?spread=three"
                className="group flex flex-col rounded-3xl border border-lavender/30 bg-midnight/50 p-5 transition hover:border-lavender/60 hover:bg-white/5 active:scale-[0.98]"
              >
                <span className="text-2xl">🔮</span>
                <span className="mt-2 text-base font-semibold text-moon">三張宇宙訊息</span>
                <span className="mt-1 text-sm leading-6 text-moon/55">
                  從過去、現在、未來看清整體脈絡
                </span>
                <span className="mt-4 self-start rounded-full border border-lavender/50 bg-lavender/20 px-5 py-2.5 text-sm font-semibold text-lavender transition group-hover:bg-lavender/30">
                  抽三張
                </span>
              </Link>
            </div>

            {/* LINE 輔助文字 */}
            <p className="mt-4 text-xs text-moon/40">
              抽完牌可同步收藏至{" "}
              <a
                href={lineAddFriendUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 transition hover:text-moon/60"
              >
                LINE
              </a>
            </p>
          </div>

          {/* ── Right: cat illustration + today's cosmic message ─── */}
          <div className="flex flex-col items-center gap-4">
            {/* Hero cat photo */}
            <div className="cat-float relative mx-auto w-[min(76vw,280px)] sm:w-[360px] lg:w-[430px] xl:w-[460px]">
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
            {/* Today's cosmic message card */}
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

      {/* ── Feature entry cards（下半部）────────────────────────────────────── */}
      <section className="pb-8 sm:pb-12">
        <p className="mb-5 text-center text-xs uppercase tracking-[0.28em] text-moon/38">
          今日星座 · 每日運勢
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
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
