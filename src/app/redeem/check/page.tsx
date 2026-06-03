"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";

type CheckResult = {
  code: string;
  planName: string;
  displayName: string;
  totalUses: number;
  remainingUses: number;
  status: string;
  statusLabel: string;
  expiresAt: string;
  usedCount: number;
  lastUsedAt: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  active:   "bg-aurora/14 text-aurora",
  used_up:  "bg-red-500/14 text-red-300",
  expired:  "bg-white/8 text-moon/45",
  disabled: "bg-white/8 text-moon/45",
};

function RedeemCheckForm() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);

  // Auto-fill and check if ?code= is in URL
  useEffect(() => {
    const paramCode = searchParams.get("code");
    if (paramCode) {
      const upper = paramCode.toUpperCase();
      setCode(upper);
      void doCheck(upper);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doCheck(codeToCheck: string) {
    const trimmed = codeToCheck.trim().toUpperCase();
    if (!trimmed) { setError("請輸入宇宙通行碼"); return; }
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/redeem/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json() as { ok: boolean; error?: string } & Partial<CheckResult>;
      if (!data.ok) {
        setError(data.error ?? "查詢失敗，請稍後再試");
        return;
      }
      setResult(data as CheckResult);
    } catch {
      setError("網路錯誤，請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  function handleCheck() {
    void doCheck(code);
  }

  const expiryStr = result
    ? new Date(result.expiresAt).toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" })
    : "";
  const lastUsedStr = result?.lastUsedAt
    ? new Date(result.lastUsedAt).toLocaleDateString("zh-TW", {
        year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <>
      {/* Input */}
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); setResult(null); }}
          onKeyDown={(e) => e.key === "Enter" && !loading && handleCheck()}
          placeholder="UW-XXXX-XXXX"
          maxLength={12}
          className="flex-1 rounded-2xl border border-white/14 bg-white/6 px-4 py-3 font-mono text-base tracking-[0.14em] text-moon placeholder-moon/30 outline-none transition focus:border-lavender/50 focus:bg-white/8"
          disabled={loading}
          aria-label="宇宙通行碼"
        />
        <button
          onClick={handleCheck}
          disabled={loading || !code.trim()}
          className="rounded-2xl bg-[#d8bd70] px-6 py-3 text-sm font-semibold text-midnight transition hover:bg-moon disabled:cursor-not-allowed disabled:opacity-50 sm:whitespace-nowrap"
        >
          {loading ? "查詢中…" : "查詢通行碼"}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-300/90" role="alert">✕ {error}</p>
      )}

      {/* Result card */}
      {result && (
        <div className="mt-6 rounded-2xl border border-[#d8bd70]/25 bg-midnight/50 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-mono text-xl font-bold tracking-[0.16em] text-[#d8bd70]">{result.code}</p>
              <p className="mt-0.5 text-sm text-moon/60">{result.displayName}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLE[result.status] ?? "bg-white/8 text-moon/40"}`}>
              {result.statusLabel}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/4 p-4 text-center">
              <p className="text-xs text-moon/45">剩餘次數</p>
              <p className="mt-1 text-4xl font-bold text-moon">
                {result.remainingUses}
                <span className="ml-1 text-lg font-normal text-moon/40">/ {result.totalUses}</span>
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/4 p-4 text-center">
              <p className="text-xs text-moon/45">到期日</p>
              <p className="mt-1 text-base font-semibold text-moon leading-7">{expiryStr}</p>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm text-moon/60">
            <div className="flex justify-between">
              <span>已使用次數</span>
              <span className="text-moon/80">{result.usedCount} 次</span>
            </div>
            {lastUsedStr && (
              <div className="flex justify-between">
                <span>最近使用</span>
                <span className="text-moon/80">{lastUsedStr}</span>
              </div>
            )}
          </div>

          {result.status === "active" && result.remainingUses > 0 && (
            <p className="mt-4 rounded-xl bg-aurora/8 px-3 py-2 text-xs leading-6 text-aurora/80">
              ✓ 此通行碼有效，可在塔羅頁或結果頁輸入通行碼使用。
            </p>
          )}
        </div>
      )}
    </>
  );
}

export default function RedeemCheckPage() {
  return (
    <AppShell>
      <section className="mx-auto w-full max-w-lg py-10 sm:py-14">
        <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">宇宙通行碼</p>
        <h1 className="mt-3 text-3xl font-semibold text-moon sm:text-4xl">查詢剩餘次數</h1>
        <p className="mt-3 text-base leading-7 text-moon/65">
          輸入你的宇宙通行碼，查看剩餘可用次數、有效期限與使用狀態。
        </p>

        <Suspense fallback={<div className="mt-7 h-14 rounded-2xl bg-white/4 animate-pulse" />}>
          <RedeemCheckForm />
        </Suspense>

        {/* 使用說明 */}
        <div className="mt-8 rounded-2xl border border-white/8 bg-white/4 p-5 text-sm leading-7 text-moon/55">
          <p className="font-semibold text-moon/75 mb-2">宇宙通行碼使用說明</p>
          <ul className="space-y-1.5">
            <li>· 當今日免費次數用完，在塔羅頁輸入通行碼可繼續抽牌並解鎖完整版</li>
            <li>· 每成功抽牌並產生完整解讀一次，扣除 1 次</li>
            <li>· 購買後 60 天內使用完畢</li>
            <li>· 不綁帳號，可分享給朋友共同使用</li>
            <li>· 次數用完或逾期後即失效</li>
          </ul>
        </div>

        <div className="mt-6 text-center">
          <Link href="/tarot" className="text-sm text-moon/45 underline underline-offset-2 transition hover:text-moon/70">
            回到塔羅抽牌
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
