import Link from "next/link";
import { AppShell } from "@/components/AppShell";

const cosmicMessages = [
  "你已經在等一個答案很久了，今晚先讓心靜下來。",
  "有些感受不需要被解釋，只需要被好好接住。",
  "你不是太敏感，你只是太認真在乎了。",
  "今晚，宇宙想偷偷告訴你一句話——你已經夠了。",
  "讓答案慢慢靠近，不必用力追。"
];

// TODO: replace with official LINE OA add friend URL if changed
const lineAddFriendUrl = process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL ?? "https://line.me/R/ti/p/@453gfmok";

export default function Home() {
  const todayMessage = cosmicMessages[new Date().getDate() % cosmicMessages.length];

  return (
    <AppShell>
      {/* ── Hero 主視覺 ─────────────────────────────────────────────── */}
      <section className="relative flex flex-1 items-center py-8 sm:py-12 lg:min-h-[calc(100vh-96px)]">
        <span className="floating-star left-[10%] top-[12%]" />
        <span className="floating-star right-[18%] top-[18%] [animation-delay:1.2s]" />
        <span className="floating-star bottom-[18%] left-[28%] [animation-delay:2.4s]" />
        <span className="floating-star right-[8%] bottom-[28%] [animation-delay:3.6s]" />

        <div className="grid w-full items-center gap-6 lg:grid-cols-[1fr_0.88fr] lg:gap-10">
          {/* 左：主 CTA */}
          <div className="relative">
            <p className="text-xs uppercase tracking-[0.36em] text-aurora/80">宇宙塔羅 · 每日提醒</p>
            <h1 className="mt-4 text-[2.6rem] font-semibold leading-tight text-moon sm:text-5xl lg:text-6xl">
              今晚，宇宙想偷偷
              <br className="hidden sm:block" />
              告訴你一句話
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-moon/76 sm:text-xl">
              默想一個問題，抽一張牌；或看看今天星座給你的提醒。
            </p>

            <div className="mt-7 grid gap-3 sm:flex sm:flex-wrap">
              <Link
                href="/tarot"
                className="rounded-full bg-moon px-7 py-3.5 text-center font-semibold text-midnight shadow-glow transition hover:bg-white"
              >
                抽一張塔羅
              </Link>
              <Link
                href="/daily"
                className="rounded-full border border-lavender/40 bg-white/8 px-7 py-3.5 text-center font-medium text-moon transition hover:bg-white/12"
              >
                看今日星座運勢
              </Link>
            </div>
          </div>

          {/* 右：今日宇宙卡片 */}
          <div className="glass-card relative min-h-[460px] overflow-hidden rounded-[2rem] p-5 sm:p-7">
            <div className="moon-glow absolute right-4 top-5 h-36 w-36 rounded-full sm:right-8 sm:h-44 sm:w-44" />
            <div className="absolute inset-x-8 top-28 h-px bg-gradient-to-r from-transparent via-moon/40 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-nebula/30 to-transparent" />

            <div className="relative z-10 flex min-h-[410px] flex-col justify-between">
              <div className="rounded-3xl border border-white/10 bg-midnight/45 p-5">
                <p className="text-sm text-lavender">今日宇宙訊息</p>
                <p className="mt-4 text-xl font-semibold leading-9 text-moon sm:text-2xl">{todayMessage}</p>
              </div>

              <div className="grid gap-3">
                <Link
                  href="/daily"
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-moon/80 transition hover:bg-white/12"
                >
                  <span>每日星座運勢</span>
                  <span className="h-2 w-2 rounded-full bg-aurora shadow-[0_0_16px_rgba(142,240,221,0.8)]" />
                </Link>
                <Link
                  href="/tarot"
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-moon/80 transition hover:bg-white/12"
                >
                  <span>單張塔羅抽牌</span>
                  <span className="h-2 w-2 rounded-full bg-lavender shadow-[0_0_16px_rgba(203,184,255,0.8)]" />
                </Link>
                <Link
                  href="/tarot"
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-moon/80 transition hover:bg-white/12"
                >
                  <span>三張牌完整牌陣</span>
                  <span className="h-2 w-2 rounded-full bg-moon/60" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── LINE 加好友區塊 ─────────────────────────────────────────── */}
      <section className="pb-12 sm:pb-16">
        <div
          className="overflow-hidden rounded-[1.75rem]"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)",
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 0 48px rgba(6,199,85,0.10), 0 24px 64px rgba(0,0,0,0.24)",
            backdropFilter: "blur(18px)"
          }}
        >
          <div className="flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="flex-1">
              <p className="text-xs uppercase tracking-[0.28em] text-lavender/80">LINE 深夜陪伴</p>
              <h2 className="mt-2 text-2xl font-semibold text-moon sm:text-3xl">
                加入 LINE，領取完整宇宙訊息
              </h2>
              <p className="mt-2 max-w-sm text-base leading-7 text-moon/68">
                抽牌後可在 LINE 查看完整版解讀與每日提醒。
              </p>
            </div>
            <div className="w-full shrink-0 sm:w-auto">
              <a
                href={lineAddFriendUrl}
                target="_blank"
                rel="noreferrer"
                className="block w-full rounded-full px-8 py-3.5 text-center text-base font-semibold text-white transition hover:opacity-90 active:scale-95 sm:w-auto"
                style={{ background: "#06C755", boxShadow: "0 0 32px rgba(6,199,85,0.30)" }}
              >
                加入 LINE 好友
              </a>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
