const LINE_ADD_FRIEND_URL =
  process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL ?? "https://line.me/R/ti/p/@453gfmok";

export function LineCtaBanner() {
  return (
    <section className="pb-12 sm:pb-16">
      <div
        className="overflow-hidden rounded-[1.75rem]"
        style={{
          background:
            "linear-gradient(135deg, rgba(6,199,85,0.10) 0%, rgba(6,199,85,0.03) 100%)",
          border: "1px solid rgba(6,199,85,0.20)",
          boxShadow:
            "0 0 48px rgba(6,199,85,0.08), 0 24px 64px rgba(0,0,0,0.24)",
          backdropFilter: "blur(18px)",
        }}
      >
        <div className="flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          {/* Text */}
          <div className="flex-1">
            {/* LINE icon pill */}
            <div
              className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: "#06C755" }}
            >
              {/* Simplified LINE logo mark */}
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 fill-white"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path d="M12 2C6.48 2 2 5.93 2 10.76c0 2.65 1.4 5.01 3.58 6.61.12.09.2.23.17.39l-.36 1.74a.37.37 0 0 0 .54.41l2.05-1.07c.12-.07.26-.09.4-.06A12.4 12.4 0 0 0 12 19.5c5.52 0 10-3.93 10-8.74C22 5.93 17.52 2 12 2z" />
              </svg>
            </div>

            <p className="text-xs uppercase tracking-[0.28em] text-[#06C755]/80">
              LINE 深夜陪伴
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-moon sm:text-3xl">
              加入 LINE，領取完整宇宙訊息
            </h2>
            <p className="mt-2 max-w-sm text-base leading-7 text-moon/68">
              抽牌後可在 LINE 查看完整版解讀與每日提醒。
            </p>
          </div>

          {/* CTA button */}
          <div className="w-full shrink-0 sm:w-auto">
            <a
              href={LINE_ADD_FRIEND_URL}
              target="_blank"
              rel="noreferrer"
              className="block w-full rounded-full px-8 py-3.5 text-center text-base font-semibold text-white transition hover:opacity-90 active:scale-95 sm:w-auto"
              style={{
                background: "#06C755",
                boxShadow: "0 0 32px rgba(6,199,85,0.30)",
              }}
            >
              加入 LINE 好友
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
