"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageNavActions } from "@/components/PageNavActions";
import { TarotDrawClient } from "./TarotDrawClient";

const SPREAD_OPTIONS = [
  {
    key: "single" as const,
    emoji: "✨",
    label: "單張宇宙訊息",
    shortDesc: "快速獲得一個提醒",
    longDesc:
      "快速獲得一個提醒與方向，適合想立刻聽一句宇宙給你的提示。",
  },
  {
    key: "three" as const,
    emoji: "🔮",
    label: "三張宇宙訊息",
    shortDesc: "看清整體脈絡",
    longDesc:
      "從過去、現在、未來看清整體脈絡，適合想更完整理解狀況。",
  },
] as const;

export function TarotModeClient({
  initialSpread,
}: {
  initialSpread: "single" | "three";
}) {
  const router = useRouter();
  const [spread, setSpread] = useState<"single" | "three">(initialSpread);

  const current = SPREAD_OPTIONS.find((o) => o.key === spread) ?? SPREAD_OPTIONS[0];

  function switchSpread(next: "single" | "three") {
    setSpread(next);
    // 更新 URL 但不重新載入頁面、不捲動
    router.replace(`/tarot?spread=${next}`, { scroll: false });
  }

  return (
    /* id 供導覽列「立即抽牌」平滑捲動到此區塊 */
    <div id="tarot-mode-select">
      <PageNavActions className="mb-6" />

      {/* ── Hero：左側標題 + 右側模式切換 ── */}
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        {/* 左：目前模式標題 */}
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">
            cosmic tarot · 星夜牌陣
          </p>
          <h2 className="mt-3 text-4xl font-semibold text-moon sm:text-5xl">
            {current.label}
          </h2>
          <div className="mt-1.5 h-px w-24 bg-gradient-to-r from-aurora/60 to-transparent" />
          <p className="mt-4 max-w-[400px] text-base leading-8 text-moon/72">
            {current.longDesc}
          </p>
        </div>

        {/* 右：模式切換（桌機垂直排列，手機水平緊湊）*/}
        <div className="grid shrink-0 grid-cols-2 gap-3 sm:flex sm:flex-col sm:items-end sm:pt-1">
          <p className="hidden text-right text-[11px] tracking-[0.18em] text-moon/35 sm:block">
            選擇模式
          </p>
          {SPREAD_OPTIONS.map((option) => {
            const isActive = spread === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => switchSpread(option.key)}
                className={[
                  "group relative min-h-[112px] overflow-hidden rounded-[1.5rem] border px-4 py-3 text-left text-sm transition active:scale-[0.98]",
                  "sm:flex-none sm:min-w-[190px] sm:min-h-[112px] sm:px-4 sm:py-3",
                  isActive
                    ? "border-[#d8bd70]/64 bg-[#d8bd70]/14 text-moon shadow-[0_0_28px_rgba(216,189,112,0.18)]"
                    : "border-white/10 bg-white/[0.045] text-moon/60 shadow-[0_14px_34px_rgba(4,7,26,0.18)] hover:border-white/22 hover:bg-white/8 hover:text-moon/82",
                ].join(" ")}
              >
                <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(216,189,112,0.16),transparent_34%)] opacity-0 transition group-hover:opacity-100" />
                <span className="relative flex items-center gap-2 font-semibold leading-snug">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-white/8" aria-hidden="true">{option.emoji}</span>
                  {option.label}
                </span>
                {/* 短敘述只在桌機顯示 */}
                <span className="relative mt-2 block text-xs leading-5 text-moon/44">
                  {option.shortDesc}
                </span>
                {isActive ? (
                  <span className="relative mt-3 block h-1.5 w-12 rounded-full bg-[#d8bd70]" />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* 裝飾星點 */}
        <span
          className="pointer-events-none absolute right-0 top-0 hidden text-2xl text-[#d8bd70]/38 sm:block"
          aria-hidden="true"
        >
          ✦
        </span>
        <span
          className="pointer-events-none absolute right-8 top-7 hidden text-base text-lavender/28 sm:block"
          aria-hidden="true"
        >
          ✦
        </span>
      </div>

      {/* TarotDrawClient — key 確保切換模式時重置狀態 */}
      <TarotDrawClient key={spread} initialSpread={spread} />
    </div>
  );
}
