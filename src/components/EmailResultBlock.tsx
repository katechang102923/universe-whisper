"use client";

import { useState } from "react";
import { readJsonResponse } from "@/lib/readJsonResponse";

type SendStatus =
  | "idle"
  | "expanded"
  | "sending"
  | "success"
  | "error"
  | "not_unlocked"
  | "content_invalid"
  | "not_configured";

interface Props {
  resultId: string;
}

export default function EmailResultBlock({ resultId }: Props) {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [status, setStatus] = useState<SendStatus>("idle");

  function validateEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function handleExpand() {
    setStatus("expanded");
    setEmail("");
    setEmailError("");
  }

  async function handleSend() {
    const trimmed = email.trim();
    if (!validateEmail(trimmed)) {
      setEmailError("請輸入有效的 Email 信箱。");
      return;
    }
    setEmailError("");
    setStatus("sending");

    try {
      const res = await fetch("/api/email/send-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, resultId }),
      });

      const data = await readJsonResponse<{ ok: boolean; error?: string }>(res, { ok: false });

      if (!res.ok || !data.ok) {
        const err = data.error ?? "";
        if (err === "EMAIL_NOT_CONFIGURED") {
          setStatus("not_configured");
        } else if (err === "NOT_UNLOCKED") {
          setStatus("not_unlocked");
        } else if (err === "CONTENT_INCOMPLETE") {
          setStatus("content_invalid");
        } else if (err === "COOLDOWN_ACTIVE") {
          setEmailError("請稍等 1 分鐘後再重新寄送。");
          setStatus("expanded");
        } else if (err === "RATE_LIMIT_EXCEEDED") {
          setEmailError("此結果已達寄送上限（最多 5 次），如有需要請聯繫客服。");
          setStatus("expanded");
        } else {
          setStatus("error");
        }
        return;
      }

      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  // ── 各狀態渲染 ────────────────────────────────────────────────────────────

  if (status === "not_configured") {
    return (
      <p className="mt-3 text-sm text-moon/44">
        📭 Email 寄送服務尚未啟用，請聯絡客服。
      </p>
    );
  }

  if (status === "success") {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-aurora/28 bg-aurora/6 px-4 py-3">
        <span className="text-aurora">✓</span>
        <p className="text-sm font-medium text-aurora">已寄出完整解讀，請到信箱查看。</p>
      </div>
    );
  }

  if (status === "not_unlocked") {
    return (
      <p className="mt-3 text-sm text-red-300/80">
        請先解鎖完整版後再寄送 Email。
      </p>
    );
  }

  if (status === "content_invalid") {
    return (
      <p className="mt-3 text-sm text-red-300/80">
        完整版產生異常，請稍後再試或聯繫客服，我們會協助補發。
      </p>
    );
  }

  if (status === "idle") {
    return (
      <button
        type="button"
        onClick={handleExpand}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-lavender/30 bg-lavender/8 px-4 py-3 text-sm font-medium text-lavender/90 transition hover:border-lavender/50 hover:bg-lavender/12 active:scale-[0.98] sm:w-auto sm:justify-start"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
          <path d="M2.003 5.884 10 9.882l7.997-3.998A2 2 0 0 0 16 4H4a2 2 0 0 0-1.997 1.884z" />
          <path d="m18 8.118-8 4-8-4V14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.118z" />
        </svg>
        寄送完整解讀到 Email
      </button>
    );
  }

  // expanded / sending
  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs leading-6 text-moon/55">
        輸入你的 Email，我們會把本次完整解讀寄給你收藏。
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && status !== "sending" && void handleSend()}
          placeholder="請輸入你的 Email"
          className="w-full rounded-xl border border-white/14 bg-white/6 px-4 py-3 text-sm text-moon placeholder-moon/30 outline-none transition focus:border-lavender/50 focus:bg-white/8 sm:flex-1"
          disabled={status === "sending"}
          aria-label="Email 地址"
          autoFocus
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={status === "sending" || !email.trim()}
          className="w-full rounded-xl bg-lavender/18 px-5 py-3 text-sm font-medium text-moon transition hover:bg-lavender/28 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:whitespace-nowrap"
        >
          {status === "sending" ? "寄送中..." : "送出完整解讀"}
        </button>
      </div>
      {emailError && (
        <p className="text-sm text-red-300/90" role="alert">
          {emailError}
        </p>
      )}
      {status === "error" && !emailError && (
        <p className="text-sm text-red-300/90" role="alert">
          寄送失敗，請稍後再試或聯繫客服。
        </p>
      )}
    </div>
  );
}
