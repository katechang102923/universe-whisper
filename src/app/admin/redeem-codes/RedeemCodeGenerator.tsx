"use client";

import { useState } from "react";
import { REDEEM_PLANS, type RedeemPlan } from "@/lib/redeemCodes";

type GenerateResult = {
  ok: true;
  code: string;
  shareText: string;
  expiresAt: string;
} | null;

export default function RedeemCodeGenerator() {
  const [planName, setPlanName] = useState<RedeemPlan>("five_pack");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GenerateResult>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setError("");
    setResult(null);
    setCopied(false);

    try {
      const res = await fetch("/api/redeem/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planName }),
      });

      if (res.status === 401) {
        setError("無管理員權限");
        return;
      }

      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "產生失敗");
        return;
      }

      setResult(data as GenerateResult);
    } catch {
      setError("網路錯誤，請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback: select the textarea
    }
  }

  return (
    <div className="space-y-6">
      {/* 方案選擇 */}
      <div className="rounded-2xl border border-white/10 bg-midnight/50 p-6">
        <p className="mb-4 text-sm font-semibold tracking-[0.14em] text-moon">
          選擇方案
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.entries(REDEEM_PLANS) as [RedeemPlan, typeof REDEEM_PLANS[RedeemPlan]][]).map(
            ([key, plan]) => (
              <button
                key={key}
                onClick={() => setPlanName(key)}
                className={`rounded-xl border p-4 text-left transition ${
                  planName === key
                    ? "border-lavender/60 bg-lavender/12 text-moon"
                    : "border-white/10 bg-white/4 text-moon/60 hover:bg-white/8"
                }`}
              >
                <p className="font-semibold text-sm">{plan.displayName}</p>
                <p className="mt-1 text-xs text-moon/50">{plan.description}</p>
                <p className="mt-2 text-xl font-bold text-aurora">
                  NT${plan.price}
                  <span className="ml-1 text-sm font-normal text-moon/50">
                    / {plan.totalUses} 次
                  </span>
                </p>
              </button>
            ),
          )}
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="mt-5 rounded-full bg-lavender px-6 py-3 text-sm font-medium text-midnight transition hover:bg-lavender/85 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "產生中…" : "✦ 產生新兌換碼"}
        </button>

        {error && (
          <p className="mt-3 text-sm text-red-300" role="alert">
            ✕ {error}
          </p>
        )}
      </div>

      {/* 產生結果 */}
      {result && (
        <div className="rounded-2xl border border-aurora/25 bg-aurora/6 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-aurora/70">
                兌換碼已建立
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold tracking-[0.2em] text-moon">
                {result.code}
              </p>
              <p className="mt-1 text-xs text-moon/44">
                有效期限：
                {new Date(result.expiresAt).toLocaleDateString("zh-TW", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <button
              onClick={handleCopy}
              className="rounded-full border border-aurora/30 bg-aurora/10 px-4 py-2 text-sm text-aurora transition hover:bg-aurora/18"
            >
              {copied ? "✓ 已複製" : "複製發送文字"}
            </button>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-xs text-moon/44">發送文字預覽</p>
            <textarea
              readOnly
              value={result.shareText}
              rows={9}
              className="w-full rounded-xl border border-white/10 bg-midnight/60 px-4 py-3 font-mono text-xs leading-7 text-moon/80 outline-none resize-none"
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
