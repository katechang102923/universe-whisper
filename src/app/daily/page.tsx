import { AppShell } from "@/components/AppShell";

const fortunes = [
  {
    title: "愛情",
    score: 88,
    message: "今天適合放慢回訊息的節奏。真正珍惜你的人，會願意理解你的柔軟與界線。",
    color: "from-pink-300/22 to-lavender/18"
  },
  {
    title: "工作",
    score: 76,
    message: "先完成最小的一步，壓力會因此變得可以整理。不要用完美主義消耗靈感。",
    color: "from-aurora/20 to-nebula/18"
  },
  {
    title: "財運",
    score: 72,
    message: "今天適合檢查訂閱與小額支出。宇宙提醒你，安全感也需要被好好規劃。",
    color: "from-yellow-100/18 to-aurora/14"
  },
  {
    title: "心情",
    score: 91,
    message: "情緒不是麻煩，它只是正在敲門。給自己一杯熱飲和十分鐘安靜。",
    color: "from-lavender/22 to-moon/12"
  }
];

export default function DailyPage() {
  return (
    <AppShell>
      <section className="mx-auto w-full max-w-5xl py-8 sm:py-12">
        <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">daily cosmic note</p>
        <h1 className="mt-3 text-4xl font-semibold text-moon sm:text-5xl">每日運勢</h1>
        <p className="mt-4 max-w-2xl leading-8 text-moon/72">
          先用假資料呈現 MVP 版四大面向，之後可以改成 Firestore 每日內容或模板池溫柔抽取。
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {fortunes.map((fortune) => (
            <article key={fortune.title} className="glass-card overflow-hidden rounded-[1.5rem] p-5">
              <div className={`-mx-5 -mt-5 h-24 bg-gradient-to-br ${fortune.color}`} />
              <div className="-mt-10 flex items-end justify-between">
                <div className="rounded-2xl border border-white/10 bg-midnight/70 px-4 py-3 backdrop-blur">
                  <p className="text-sm text-lavender">{fortune.title}</p>
                  <h2 className="mt-1 text-2xl font-semibold text-moon">今日指引</h2>
                </div>
                <div className="rounded-full bg-moon px-4 py-2 text-xl font-semibold text-midnight">{fortune.score}</div>
              </div>
              <p className="mt-5 leading-8 text-moon/78">{fortune.message}</p>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
