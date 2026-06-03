"use client";

import { useState } from "react";

interface Props {
  resultId: string;
}

export default function EmailResultBlock({ resultId }: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error" | "not_configured">("idle");

  function validateEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  async function handleSend() {
    if (!validateEmail(email)) {
      setStatus("error");
      return;
    }

    setLoading(true);
    setStatus("idle");

    try {
      const res = await fetch("/api/email/send-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), resultId }),
      });

      const data = (await res.json()) as
        | { ok: true }
        | { ok: false; error: string };

      if (!data.ok) {
        if (!data.ok && "error" in data && data.error === "EMAIL_NOT_CONFIGURED") {
          setStatus("not_configured");
        } else {
          setStatus("error");
        }
        return;
      }

      setStatus("success");
    } catch {
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }

  if (status === "not_configured") {
    return (
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/4 p-5">
        <p className="text-sm text-moon/44">📭 Email 寄送服務尚未啟用，請聯絡站長開通。</p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="mt-6 rounded-2xl border border-aurora/28 bg-aurora/8 p-5">
        <p className="text-sm font-medium text-aurora">
          ✓ 已寄出完整結果，請至信箱查看。
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-midnight/50 p-5 sm:p-6">
      <p className="text-sm font-semibold tracking-[0.14em] text-moon">
        寄送完整結果到 Email
      </p>
      <p className="mt-1.5 text-sm leading-7 text-moon/60">
        輸入 Email 後，系統會將本次完整塔羅結果寄送給你保存。
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "error") setStatus("idle");
          }}
          onKeyDown={(e) => e.key === "Enter" && !loading && handleSend()}
          placeholder="請輸入你的 Email"
          className="w-full rounded-xl border border-white/14 bg-white/6 px-4 py-3 text-sm text-moon placeholder-moon/30 outline-none transition focus:border-lavender/50 focus:bg-white/8 sm:flex-1"
          disabled={loading}
          aria-label="Email 地址"
        />
        <button
          onClick={handleSend}
          disabled={loading || !email.trim()}
          className="w-full rounded-xl bg-moon/14 px-5 py-3 text-sm font-medium text-moon transition hover:bg-moon/22 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:whitespace-nowrap"
        >
          {loading ? "寄送中…" : "寄送完整結果"}
        </button>
      </div>

      {status === "error" && (
        <p className="mt-3 text-sm text-red-300/90" role="alert">
          {!validateEmail(email) && email
            ? "✕ 請輸入有效的 Email 格式"
            : "✕ Email 寄送失敗，請稍後再試。"}
        </p>
      )}
    </div>
  );
}
