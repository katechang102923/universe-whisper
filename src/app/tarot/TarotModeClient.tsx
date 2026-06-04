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
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        {/* 左：目前模式標題 */}
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">
            cosmic tarot · 星夜牌陣
          </p>
          <h1 className="mt-3 text-4xl font-semibold text-moon sm:text-5xl">
            {current.label}
          </h1>
          <div className="mt-1.5 h-px w-24 bg-gradient-to-r from-aurora/60 to-transparent" />
          <p className="mt-4 max-w-[400px] text-base leading-8 text-moon/72">
            {current.longDesc}
          </p>
        </div>

        {/* 右：模式切換（桌機垂直排列，手機水平緊湊）*/}
        <div className="flex shrink-0 flex-row gap-2 sm:flex-col sm:items-end sm:pt-1">
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
                  "flex-1 rounded-2xl border px-3 py-2 text-left text-sm transition",
                  "sm:flex-none sm:min-w-[172px] sm:px-4 sm:py-3",
                  isActive
                    ? "border-[#d8bd70]/50 bg-[#d8bd70]/10 text-moon shadow-[0_0_14px_rgba(216,189,112,0.14)]"
                    : "border-white/10 bg-white/[0.04] text-moon/52 hover:border-white/18 hover:bg-white/8 hover:text-moon/78",
                ].join(" ")}
              >
                <span className="flex items-center gap-1.5 font-medium leading-snug">
                  <span aria-hidden="true">{option.emoji}</span>
                  {option.label}
                </span>
                {/* 短敘述只在桌機顯示 */}
                <span className="mt-0.5 hidden text-xs text-moon/40 sm:block">
                  {option.shortDesc}
                </span>
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
