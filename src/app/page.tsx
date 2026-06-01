import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { FeatureCard } from "@/components/FeatureCard";
import { LineCtaBanner } from "@/components/LineCtaBanner";

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

const lineAddFriendUrl =
  process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL ?? "https://line.me/R/ti/p/@453gfmok";

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
              今晚，宇宙想偷偷
              <br className="hidden sm:block" />
              告訴你一句話
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-moon/76 sm:text-xl">
              深夜裡，陪你抽一張牌，聽聽宇宙想對你說什麼。
            </p>

            <div className="mt-7 flex flex-col gap-3">
              <Link
                href="/tarot"
                className="cosmic-cta-primary w-full rounded-full px-7 py-4 text-center text-lg font-semibold text-midnight transition hover:brightness-105 active:scale-[0.98] sm:w-auto sm:self-start"
                style={{
                  background: "linear-gradient(135deg, #d8bd70 0%, #b89adf 60%, #d8bd70 100%)",
                  backgroundSize: "200% 200%",
                }}
              >
                ✨ 抽一張宇宙訊息
              </Link>
              <a
                href={lineAddFriendUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full rounded-full border border-white/15 px-5 py-2.5 text-center text-sm font-medium text-moon/60 transition hover:border-white/30 hover:text-moon/85 active:scale-95 sm:w-auto sm:self-start"
              >
                抽完牌可同步收藏至 LINE
              </a>
            </div>
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

      {/* ── Feature entry cards ────────────────────────────────────── */}
      <section className="pb-8 sm:pb-12">
        <p className="mb-5 text-center text-xs uppercase tracking-[0.28em] text-moon/38">
          選擇你的探索方式
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {/* 今日運勢 */}
          <FeatureCard
            gradient="from-lavender/40 to-nebula/24"
            title="今日運勢"
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

          {/* 單張塔羅 */}
          <FeatureCard
            gradient="from-aurora/36 to-nebula/22"
            title="單張塔羅牌"
            description="默想一個問題，讓宇宙為你抽一張牌，給你溫柔而直接的回應。"
            href="/tarot"
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

          {/* 三張牌訊息 */}
          <FeatureCard
            gradient="from-moon/22 to-lavender/20"
            title="三張牌訊息"
            description="過去、現在、未來——完整牌陣帶你看見整體走向與宇宙提醒。"
            href="/tarot"
            icon={
              <svg
                viewBox="0 0 26 22"
                className="h-5 w-5"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <rect
                  x="1"
                  y="3"
                  width="9"
                  height="14"
                  rx="2"
                  stroke="#f7f1df"
                  strokeWidth="1.4"
                  strokeOpacity="0.55"
                  transform="rotate(-8 1 3)"
                />
                <rect
                  x="8.5"
                  y="2"
                  width="9"
                  height="14"
                  rx="2"
                  stroke="#f7f1df"
                  strokeWidth="1.4"
                  strokeOpacity="0.90"
                />
                <rect
                  x="16"
                  y="3"
                  width="9"
                  height="14"
                  rx="2"
                  stroke="#f7f1df"
                  strokeWidth="1.4"
                  strokeOpacity="0.55"
                  transform="rotate(8 16 3)"
                />
              </svg>
            }
          />
        </div>
      </section>

      {/* ── LINE add-friend banner ─────────────────────────────────── */}
      <LineCtaBanner />
    </AppShell>
  );
}
