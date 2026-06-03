"use client";

import { useState } from "react";
import { getRedeemErrorMessage, type RedeemErrorCode } from "@/lib/redeemCodes";

interface Props {
  resultId: string;
  onUnlocked: (fullText: string, remainingUses: number) => void;
}

export default function RedeemCodeBlock({ resultId, onUnlocked }: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleRedeem() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError("請輸入通行碼");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/redeem/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed, resultId }),
      });

      const data = (await res.json()) as
        | { ok: true; remainingUses: number; fullText: string }
        | { ok: false; errorCode: RedeemErrorCode };

      if (!data.ok) {
        setError(getRedeemErrorMessage(data.errorCode));
        return;
      }

      setSuccess(`解鎖成功，本通行碼剩餘 ${data.remainingUses} 次。`);
      onUnlocked(data.fullText, data.remainingUses);
    } catch {
      setError(getRedeemErrorMessage("SERVER_ERROR"));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="mt-6 rounded-2xl border border-aurora/30 bg-aurora/8 p-5">
        <p className="text-sm font-medium text-aurora">✓ {success}</p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-lavender/20 bg-midnight/50 p-5 sm:p-6">
      <p className="text-sm font-semibold tracking-[0.14em] text-moon">
        已有宇宙通行碼？
      </p>
      <p className="mt-1.5 text-sm leading-7 text-moon/60">
        輸入通行碼即可解鎖完整版，每次解鎖會扣除 1 次。
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && !loading && handleRedeem()}
          placeholder="請輸入你的宇宙通行碼"
          maxLength={12}
          className="w-full rounded-xl border border-white/14 bg-white/6 px-4 py-3 font-mono text-sm tracking-[0.12em] text-moon placeholder-moon/30 outline-none transition focus:border-lavender/50 focus:bg-white/8 sm:flex-1"
          disabled={loading}
          aria-label="宇宙通行碼"
        />
        <button
          onClick={handleRedeem}
          disabled={loading || !code.trim()}
          className="w-full rounded-xl bg-lavender px-5 py-3 text-sm font-medium text-midnight transition hover:bg-lavender/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:whitespace-nowrap"
        >
          {loading ? "驗證中…" : "使用通行碼解鎖完整版"}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-300/90" role="alert">
          ✕ {error}
        </p>
      )}
    </div>
  );
}
