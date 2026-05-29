"use client";

import { useEffect, useRef, useState } from "react";

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

const LINE_CONNECT_MESSAGE_KEY = "line-connect-message-payload";
const DESKTOP_REDIRECT_URI = "https://universe-whisper.vercel.app/line/connect";

const statusText: Record<ConnectStatus, string> = {
  booting: "正在準備 LINE 訊息...",
  login: "正在登入 LINE...",
  sending: "正在傳送到 LINE...",
  done: "已傳送到 LINE",
  error: "LINE 傳送失敗",
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

function isLineInAppBrowser() {
  return /Line\//i.test(window.navigator.userAgent);
}

function getStoredMessage() {
  try {
    const raw = sessionStorage.getItem(LINE_CONNECT_MESSAGE_KEY);
    if (!raw) return "";
    const payload = JSON.parse(raw) as { message?: unknown; createdAt?: unknown };
    const createdAt = typeof payload.createdAt === "number" ? payload.createdAt : 0;
    if (createdAt && Date.now() - createdAt > 15 * 60 * 1000) return "";
    return typeof payload.message === "string" ? payload.message.trim() : "";
  } catch {
    return "";
  }
}

function clearStoredMessage() {
  try {
    sessionStorage.removeItem(LINE_CONNECT_MESSAGE_KEY);
  } catch {
    // sessionStorage can be unavailable in some browser modes.
  }
}

function getCleanRedirectUri() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function LineConnectClient() {
  const [status, setStatus] = useState<ConnectStatus>("booting");
  const [message, setMessage] = useState("");
  const postingRef = useRef(false);
  const completedRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);

  function finishAfterSuccess() {
    if (closeTimerRef.current) return;

    closeTimerRef.current = window.setTimeout(() => {
      if (window.liff?.isInClient()) {
        window.liff.closeWindow();
      }
    }, 1200);
  }

  async function postConnect(params: {
    code?: string;
    idToken?: string | null;
    accessToken?: string | null;
    mode: string;
  }) {
    if (postingRef.current || completedRef.current) return;

    const lineMessage = getStoredMessage();
    if (!lineMessage) {
      setStatus("error");
      setMessage("找不到本次抽牌訊息，請回原本頁面重新按 LINE 看我的結果。");
      return;
    }

    setStatus("sending");
    postingRef.current = true;

    try {
      const response = await fetch("/api/line/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: lineMessage,
          code: params.code ?? "",
          redirectUri: DESKTOP_REDIRECT_URI,
          idToken: params.idToken ?? "",
          accessToken: params.accessToken ?? "",
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; pushStatus?: string };

      if (!response.ok) {
        throw new Error(data.error || "LINE connect failed.");
      }

      completedRef.current = true;
      clearStoredMessage();
      setStatus("done");
      setMessage("本次抽牌結果已送到官方帳號聊天室。");
      finishAfterSuccess();
    } catch (error) {
      console.error("[line-connect-client] connectFailed", { error, mode: params.mode });
      setStatus("error");
      const errorMessage = error instanceof Error ? error.message : "LINE 傳送失敗。";
      setMessage(`傳送失敗：${errorMessage}`);
    } finally {
      postingRef.current = false;
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function connectLine() {
      const params = new URLSearchParams(window.location.search);
      const desktopCode = params.get("code") ?? "";
      const lineInAppBrowser = isLineInAppBrowser();

      if (!getStoredMessage()) {
        setStatus("error");
        setMessage("找不到本次抽牌訊息，請回原本頁面重新按 LINE 看我的結果。");
        return;
      }

      if (!lineInAppBrowser) {
        if (desktopCode) {
          await postConnect({ code: desktopCode, mode: "desktop-oauth" });
          return;
        }

        setStatus("login");
        window.location.href = "/api/line/connect/start";
        return;
      }

      const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID;
      if (!liffId) {
        setStatus("error");
        setMessage("LINE LIFF 尚未設定完成，請稍後再試。");
        return;
      }

      try {
        setStatus("booting");
        await loadLiffSdk();
        if (!window.liff) throw new Error("LIFF SDK is unavailable.");

        await window.liff.init({ liffId });
        if (cancelled) return;

        if (!window.liff.isLoggedIn()) {
          setStatus("login");
          window.liff.login({ redirectUri: getCleanRedirectUri() });
          return;
        }

        const idToken = window.liff.getIDToken();
        const accessToken = window.liff.getAccessToken();
        if (!idToken && !accessToken) {
          throw new Error("LIFF token is unavailable.");
        }

        await postConnect({ idToken, accessToken, mode: "liff" });
      } catch (error) {
        console.error("[line-connect-client] connectFailed", { error });
        setStatus("error");
        const errorMessage = error instanceof Error ? error.message : "LINE 傳送失敗。";
        setMessage(`傳送失敗：${errorMessage}`);
      }
    }

    void connectLine();

    return () => {
      cancelled = true;
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

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
                ? "可以回 LINE 查看本次結果。"
                : "請不要關閉這個頁面，正在把本次結果送到 LINE。")}
          </p>

          <div className="mt-7 flex justify-center gap-2">
            <span className="cosmic-reading-dot" />
            <span className="cosmic-reading-dot animation-delay-150" />
            <span className="cosmic-reading-dot animation-delay-300" />
          </div>
        </div>
      </section>
    </main>
  );
}
