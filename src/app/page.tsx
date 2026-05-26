import Link from "next/link";
import { AppShell } from "@/components/AppShell";

const cosmicMessages = [
  "今天先把心放慢，答案會在安靜裡慢慢靠近。",
  "如果你正在等待一個訊號，今晚的訊號是：你值得被溫柔對待。",
  "不必急著解釋所有情緒，有些感受只是需要被陪伴。"
];

const lineAddFriendUrl = process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL ?? "https://line.me/R/ti/p/@453gfmok";

export default function Home() {
  const todayMessage = cosmicMessages[new Date().getDate() % cosmicMessages.length];

  return (
    <AppShell>
      <section className="relative flex flex-1 items-center py-8 sm:py-12 lg:min-h-[calc(100vh-96px)]">
        <span className="floating-star left-[10%] top-[12%]" />
        <span className="floating-star right-[18%] top-[18%] [animation-delay:1.2s]" />
        <span className="floating-star bottom-[18%] left-[28%] [animation-delay:2.4s]" />

        <div className="grid w-full items-center gap-6 lg:grid-cols-[1fr_0.88fr] lg:gap-10">
          <div className="relative">
            <p className="text-xs uppercase tracking-[0.36em] text-aurora/80">宇宙塔羅</p>
            <h1 className="mt-4 text-5xl font-semibold leading-tight text-moon sm:text-6xl lg:text-7xl">
              宇宙偷偷話
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-moon/76 sm:text-xl">
              深夜裡陪你整理情緒與答案的小宇宙
            </p>

            <div className="mt-7 grid gap-3 sm:flex">
              <Link
                href="/tarot"
                className="rounded-full bg-moon px-6 py-3 text-center font-medium text-midnight shadow-glow transition hover:bg-white"
              >
                進入星夜塔羅
              </Link>
              <a
                href={lineAddFriendUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-lavender/40 bg-white/8 px-6 py-3 text-center font-medium text-moon transition hover:bg-white/12"
              >
                LINE 加好友
              </a>
            </div>
          </div>

          <div className="glass-card relative min-h-[460px] overflow-hidden rounded-[2rem] p-5 sm:p-7">
            <div className="moon-glow absolute right-4 top-5 h-36 w-36 rounded-full sm:right-8 sm:h-44 sm:w-44" />
            <div className="absolute inset-x-8 top-28 h-px bg-gradient-to-r from-transparent via-moon/40 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-nebula/30 to-transparent" />

            <div className="relative z-10 flex min-h-[410px] flex-col justify-between">
              <div className="rounded-3xl border border-white/10 bg-midnight/45 p-5">
                <p className="text-sm text-lavender">今日宇宙訊息</p>
                <p className="mt-4 text-2xl font-semibold leading-9 text-moon">{todayMessage}</p>
              </div>

              <div className="grid gap-3">
                {["每日運勢", "單張塔羅", "三張牌訊息"].map((item) => (
                  <div key={item} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-moon/80">
                    <span>{item}</span>
                    <span className="h-2 w-2 rounded-full bg-aurora shadow-[0_0_16px_rgba(142,240,221,0.8)]" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
