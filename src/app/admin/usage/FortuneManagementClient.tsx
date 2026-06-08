"use client";

import { useState } from "react";
import { readJsonResponse } from "@/lib/readJsonResponse";

interface FortuneManagementClientProps {
  missingSigns: string[];
  generatedSigns: string[];
  totalSigns: number;
}

export function FortuneManagementClient({
  missingSigns,
  generatedSigns,
  totalSigns,
}: FortuneManagementClientProps) {
  const [fillState, setFillState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [regenState, setRegenState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [fillResult, setFillResult] = useState<{ generated: number; failed: number; failedZodiacs: string[] } | null>(null);
  const [regenResult, setRegenResult] = useState<{ generated: number; failed: number } | null>(null);
  const [regenConfirm, setRegenConfirm] = useState(false);

  async function fillMissing() {
    setFillState("loading");
    setFillResult(null);
    try {
      const res = await fetch("/api/admin/fortune-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: false }),
      });
      const data = await readJsonResponse<{ ok: boolean; generated: number; failed: number; failedZodiacs: string[] }>(res, { ok: false, generated: 0, failed: 0, failedZodiacs: [] });
      if (!data.ok) throw new Error("補齊失敗");
      setFillResult({ generated: data.generated, failed: data.failed, failedZodiacs: data.failedZodiacs ?? [] });
      setFillState("done");
    } catch {
      setFillState("error");
    }
  }

  async function regenAll() {
    setRegenState("loading");
    setRegenConfirm(false);
    setRegenResult(null);
    try {
      const res = await fetch("/api/admin/fortune-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: true }),
      });
      const data = await readJsonResponse<{ ok: boolean; generated: number; failed: number }>(res, { ok: false, generated: 0, failed: 0 });
      if (!data.ok) throw new Error("重新生成失敗");
      setRegenResult({ generated: data.generated, failed: data.failed });
      setRegenState("done");
    } catch {
      setRegenState("error");
    }
  }

  const allGenerated = generatedSigns.length === totalSigns;

  return (
    <div className="space-y-4">
      {/* 狀態摘要 */}
      <div
        className={`rounded-2xl border p-4 ${
          allGenerated
            ? "border-aurora/20 bg-aurora/6"
            : "border-amber-400/20 bg-amber-400/6"
        }`}
      >
        <div className="flex items-center gap-3">
          <span className={`text-2xl ${allGenerated ? "text-aurora" : "text-amber-300"}`}>
            {allGenerated ? "✓" : "⚠"}
          </span>
          <div>
            <p className={`font-semibold ${allGenerated ? "text-aurora" : "text-amber-300"}`}>
              今日星座生成狀態：{generatedSigns.length} / {totalSigns}
            </p>
            {!allGenerated && missingSigns.length > 0 && (
              <p className="mt-0.5 text-xs text-moon/60">
                缺少星座：{missingSigns.join("、")}
              </p>
            )}
            {allGenerated && (
              <p className="mt-0.5 text-xs text-moon/60">12 星座全部生成完成</p>
            )}
          </div>
        </div>
      </div>

      {/* 操作按鈕 */}
      <div className="flex flex-wrap gap-3">
        {/* 補齊缺少星座 */}
        {!allGenerated && (
          <div>
            <button
              type="button"
              disabled={fillState === "loading"}
              onClick={() => void fillMissing()}
              className="rounded-full border border-lavender/30 bg-lavender/12 px-5 py-2.5 text-sm text-moon transition hover:bg-lavender/22 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {fillState === "loading" ? "補齊中…" : `✦ 補齊缺少星座（${missingSigns.length} 個）`}
            </button>
            {fillState === "done" && fillResult && (
              <p className="mt-1.5 text-xs text-aurora">
                成功生成 {fillResult.generated} 個
                {fillResult.failed > 0 && `，失敗 ${fillResult.failed} 個（${fillResult.failedZodiacs.join("、")}）`}
              </p>
            )}
            {fillState === "error" && (
              <p className="mt-1.5 text-xs text-red-300">補齊失敗，請稍後再試</p>
            )}
          </div>
        )}

        {/* 重新生成全部 */}
        <div>
          {!regenConfirm ? (
            <button
              type="button"
              disabled={regenState === "loading"}
              onClick={() => setRegenConfirm(true)}
              className="rounded-full border border-white/14 bg-white/6 px-5 py-2.5 text-sm text-moon/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {regenState === "loading" ? "生成中…" : "↻ 重新生成全部 12 星座"}
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/6 px-3 py-1.5">
              <span className="text-xs text-red-300">確定重新生成？（將覆蓋現有資料）</span>
              <button
                type="button"
                onClick={() => setRegenConfirm(false)}
                className="text-xs text-moon/50 hover:text-moon"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void regenAll()}
                className="rounded-full bg-red-500/70 px-3 py-1 text-xs text-white hover:bg-red-500"
              >
                確定
              </button>
            </div>
          )}
          {regenState === "done" && regenResult && (
            <p className="mt-1.5 text-xs text-aurora">
              重新生成完成：成功 {regenResult.generated} 個
              {regenResult.failed > 0 && `，失敗 ${regenResult.failed} 個`}
            </p>
          )}
          {regenState === "error" && (
            <p className="mt-1.5 text-xs text-red-300">重新生成失敗，請稍後再試</p>
          )}
        </div>
      </div>
    </div>
  );
}
