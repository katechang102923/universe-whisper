"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

declare global {
  interface Window {
    liff?: {
      init: (config: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: (config?: { redirectUri?: string }) => void;
      getIDToken: () => string | null;
      getAccessToken: () => string | null;
      closeWindow: () => void;
      isInClient: () => boolean;
    };
  }
}

type ConnectStatus = "booting" | "login" | "sending" | "done" | "error";

const statusText: Record<ConnectStatus, string> = {
  booting: "正在連接宇宙訊息...",
  login: "正在登入 LINE...",
  sending: "正在把訊息送到你的 LINE...",
  done: "已成功送出，請回 LINE 查看",
  error: "傳送失敗，請稍後再試",
};

function loadLiffSdk() {
  if (window.liff) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-liff-sdk]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("LIFF SDK load failed.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    script.async = true;
    script.dataset.liffSdk = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("LIFF SDK load failed."));
    document.head.appendChild(script);
  });
}

export function LineConnectClient() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<ConnectStatus>("booting");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function connectLine() {
      const resultId = searchParams.get("resultId");
      const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID;
      console.info("[line-connect-client] Boot", { resultId, hasLiffId: Boolean(liffId), currentPath: window.location.pathname });

      if (!resultId) {
        setStatus("error");
        setMessage("找不到這次的宇宙訊息，請回塔羅頁重新抽牌。");
        return;
      }

      if (!liffId) {
        console.error("[line/connect] Missing NEXT_PUBLIC_LINE_LIFF_ID.");
        setStatus("error");
        setMessage("LINE 連接尚未設定完成，請稍後再試。");
        return;
      }

      try {
        setStatus("booting");
        await loadLiffSdk();
        console.info("[line-connect-client] LIFF SDK loaded", { hasLiff: Boolean(window.liff) });

        if (!window.liff) throw new Error("LIFF SDK is unavailable.");

        await window.liff.init({ liffId });
        console.info("[line-connect-client] LIFF init success", { resultId, isLoggedIn: window.liff.isLoggedIn() });

        if (cancelled) return;

        if (!window.liff.isLoggedIn()) {
          setStatus("login");
          console.info("[line-connect-client] Calling liff.login", { redirectUri: window.location.href });
          window.liff.login({ redirectUri: window.location.href });
          return;
        }

        const idToken = window.liff.getIDToken();
        const accessToken = window.liff.getAccessToken();
        console.info("[line-connect-client] LIFF tokens", { hasIdToken: Boolean(idToken), hasAccessToken: Boolean(accessToken) });

        if (!idToken && !accessToken) {
          throw new Error("LIFF token is unavailable.");
        }

        setStatus("sending");

        const response = await fetch("/api/line/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resultId, idToken, accessToken }),
        });
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        console.info("[line-connect-client] /api/line/connect response", { status: response.status, ok: response.ok });

        if (!response.ok) {
          throw new Error(data.error || "LINE connect failed.");
        }

        setStatus("done");
        setMessage("今晚的完整版訊息已經送到你的 LINE。");
      } catch (error) {
        console.error("[line/connect] Client flow failed:", error);
        setStatus("error");
        const errorMessage = error instanceof Error ? error.message : "LINE 連接失敗。";
        setMessage(`宇宙訊號有點微弱：${errorMessage}`);
      }
    }

    void connectLine();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <main className="relative min-h-screen overflow-hidden px-5 py-10 text-moon">
      <div className="pointer-events-none absolute inset-0 stars-layer opacity-80" />
      <div className="pointer-events-none absolute left-1/2 top-16 h-48 w-48 -translate-x-1/2 rounded-full bg-lavender/20 blur-3xl" />

      <section className="relative z-10 mx-auto flex min-h-[78vh] max-w-xl flex-col items-center justify-center text-center">
        <div className="moon-glow h-24 w-24 rounded-full animate-pulse" />

        <div className="cosmic-reading-card mt-8 w-full rounded-[2rem] border border-lavender/22 bg-midnight/62 p-6 shadow-glow sm:p-8">
          <p className="text-sm tracking-[0.24em] text-lavender/72">LINE CONNECT</p>
          <h1 className="mt-3 text-3xl font-semibold text-moon">{statusText[status]}</h1>
          <p className="mx-auto mt-4 max-w-sm text-base leading-8 text-moon/72">
            {message ||
              (status === "done"
                ? "可以回 LINE 慢慢看，宇宙已經替你把訊息收好。"
                : "請不要關閉這個頁面，星光正在幫你把訊息送過去。")}
          </p>

          <div className="mt-7 flex justify-center gap-2">
            <span className="cosmic-reading-dot" />
            <span className="cosmic-reading-dot animation-delay-150" />
            <span className="cosmic-reading-dot animation-delay-300" />
          </div>

          <a
            href="/tarot"
            className="mt-8 inline-flex rounded-full border border-moon/30 px-5 py-3 text-sm font-semibold text-moon transition hover:border-moon/60 hover:bg-white/10"
          >
            回到塔羅抽牌
          </a>
        </div>
      </section>
    </main>
  );
}
