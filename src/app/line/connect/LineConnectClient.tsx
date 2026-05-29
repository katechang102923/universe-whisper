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

// Key for the pre-built LINE message (saved in both sessionStorage and localStorage).
const LINE_CONNECT_MESSAGE_KEY = "line-connect-message-payload";

// Key for the pendingId when waiting for desktop OAuth callback.
const LINE_PENDING_ID_KEY = "line-connect-pending-id";

const DESKTOP_REDIRECT_URI = "https://universe-whisper.vercel.app/line/connect";

const statusText: Record<ConnectStatus, string> = {
  booting: "正在準備 LINE 訊息...",
  login: "正在登入 LINE...",
  sending: "正在傳送到 LINE...",
  done: "已傳送到 LINE",
  error: "LINE 傳送失敗",
};

// ─── LIFF SDK loader ────────────────────────────────────────────────────────

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

// ─── Browser detection ───────────────────────────────────────────────────────

function isLineInAppBrowser() {
  return /Line\//i.test(window.navigator.userAgent);
}

// ─── Local message storage (sessionStorage + localStorage) ──────────────────

function getStoredMessage(): string {
  const parsePayload = (raw: string | null): string => {
    if (!raw) return "";
    try {
      const payload = JSON.parse(raw) as { message?: unknown; createdAt?: unknown };
      const createdAt = typeof payload.createdAt === "number" ? payload.createdAt : 0;
      if (createdAt && Date.now() - createdAt > 20 * 60 * 1000) return ""; // 20 min TTL
      return typeof payload.message === "string" ? payload.message.trim() : "";
    } catch {
      return "";
    }
  };

  // sessionStorage first (same tab, most reliable when available)
  try {
    const v = parsePayload(sessionStorage.getItem(LINE_CONNECT_MESSAGE_KEY));
    if (v) return v;
  } catch { /* unavailable */ }

  // localStorage fallback (persists across tabs, works for same-browser cross-tab)
  try {
    const v = parsePayload(localStorage.getItem(LINE_CONNECT_MESSAGE_KEY));
    if (v) return v;
  } catch { /* unavailable */ }

  return "";
}

function clearStoredMessage() {
  try { sessionStorage.removeItem(LINE_CONNECT_MESSAGE_KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(LINE_CONNECT_MESSAGE_KEY); } catch { /* ignore */ }
}

// ─── pendingId helpers ───────────────────────────────────────────────────────
// pendingId is also saved locally so that if the redirect somehow loses the URL
// param but stays in the same browser, we can still recover it.

function savePendingId(id: string) {
  try { sessionStorage.setItem(LINE_PENDING_ID_KEY, id); } catch { /* ignore */ }
  try { localStorage.setItem(LINE_PENDING_ID_KEY, id); } catch { /* ignore */ }
}

function getStoredPendingId(): string {
  try {
    const v = sessionStorage.getItem(LINE_PENDING_ID_KEY);
    if (v) return v;
  } catch { /* ignore */ }
  try {
    const v = localStorage.getItem(LINE_PENDING_ID_KEY);
    if (v) return v;
  } catch { /* ignore */ }
  return "";
}

function clearPendingId() {
  try { sessionStorage.removeItem(LINE_PENDING_ID_KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(LINE_PENDING_ID_KEY); } catch { /* ignore */ }
}

// ─── Extract pendingId from the OAuth state parameter ────────────────────────
// The start route encodes the pendingId in the OAuth state as JSON:
//   state = JSON.stringify({ csrf: "...", pendingId: "..." })
// LINE returns the state value unchanged in the callback URL.

function extractPendingIdFromOAuthState(searchParams: URLSearchParams): string {
  const state = searchParams.get("state");
  if (!state) return "";
  try {
    const parsed = JSON.parse(state) as { pendingId?: unknown };
    return typeof parsed.pendingId === "string" ? parsed.pendingId : "";
  } catch {
    // state was a plain UUID (old format before this fix) — no pendingId
    return "";
  }
}

// ─── LIFF redirect URI ────────────────────────────────────────────────────────
// Include pendingId so it survives the LIFF auth redirect.

function getLiffRedirectUri(pendingId: string): string {
  const url = new URL(window.location.href);
  // Remove all params except pendingId (keeps URL clean, avoids LIFF parameter conflicts)
  url.search = pendingId ? new URLSearchParams({ pendingId }).toString() : "";
  url.hash = "";
  return url.toString();
}

// ─── Component ───────────────────────────────────────────────────────────────

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
    pendingId: string;
    mode: string;
  }) {
    if (postingRef.current || completedRef.current) return;

    // Prefer local message (no server round-trip), fall back to pendingId lookup.
    const localMessage = getStoredMessage();

    // Validate that we have something to send before hitting the server.
    if (!localMessage && !params.pendingId) {
      setStatus("error");
      setMessage("找不到本次抽牌訊息，請回上一頁重新按「LINE 看我的結果」。");
      return;
    }

    setStatus("sending");
    postingRef.current = true;

    try {
      const response = await fetch("/api/line/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: localMessage,       // "" when cross-browser; server falls back to pendingId
          pendingId: params.pendingId, // server fetches from Firestore if message is empty
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
      clearPendingId();
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

      // pendingId resolution order:
      //   1. Direct URL param (set by TarotDrawClient before navigating here)
      //   2. OAuth state param (set by start route, returned by LINE in callback URL)
      //   3. Local storage fallback (same-browser only)
      const pendingIdFromUrl = params.get("pendingId") ?? "";
      const pendingIdFromState = extractPendingIdFromOAuthState(params);
      const pendingId = pendingIdFromUrl || pendingIdFromState || getStoredPendingId();

      console.info("[line-connect-client] connectLine", {
        lineInAppBrowser,
        hasCode: Boolean(desktopCode),
        pendingIdSource: pendingIdFromUrl
          ? "url"
          : pendingIdFromState
            ? "oauth-state"
            : getStoredPendingId()
              ? "storage"
              : "none",
        hasPendingId: Boolean(pendingId),
        hasLocalMessage: Boolean(getStoredMessage()),
      });

      // Must have either a local message or a pendingId to continue.
      if (!getStoredMessage() && !pendingId) {
        setStatus("error");
        setMessage("找不到本次抽牌訊息，請回上一頁重新按「LINE 看我的結果」。");
        return;
      }

      // ── Desktop / mobile browser (non-LINE in-app browser) ──────────────
      if (!lineInAppBrowser) {
        if (desktopCode) {
          await postConnect({ code: desktopCode, pendingId, mode: "desktop-oauth" });
          return;
        }

        // First visit — save pendingId locally before the OAuth redirect
        // (in case the callback comes back to the same browser)
        if (pendingId) savePendingId(pendingId);

        setStatus("login");
        // Pass pendingId to the start route so it gets encoded in the OAuth state param.
        // LINE returns the state unchanged in the callback URL, making pendingId available
        // even when the callback opens in a different browser (iOS Chrome → LINE → Safari).
        const startUrl = pendingId
          ? `/api/line/connect/start?pendingId=${encodeURIComponent(pendingId)}`
          : "/api/line/connect/start";
        window.location.href = startUrl;
        return;
      }

      // ── LIFF (LINE in-app browser) ───────────────────────────────────────
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

        // After LIFF init, re-read params (LIFF may have updated the URL).
        const paramsAfterInit = new URLSearchParams(window.location.search);
        const pendingIdAfterInit =
          paramsAfterInit.get("pendingId") ||
          extractPendingIdFromOAuthState(paramsAfterInit) ||
          pendingId;

        if (!window.liff.isLoggedIn()) {
          setStatus("login");
          // Include pendingId in the LIFF redirect URI so it survives LIFF auth.
          window.liff.login({ redirectUri: getLiffRedirectUri(pendingIdAfterInit) });
          return;
        }

        const idToken = window.liff.getIDToken();
        const accessToken = window.liff.getAccessToken();
        if (!idToken && !accessToken) {
          throw new Error("LIFF token is unavailable.");
        }

        await postConnect({ idToken, accessToken, pendingId: pendingIdAfterInit, mode: "liff" });
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

          {status === "error" ? (
            <a
              href="/tarot"
              className="mt-8 inline-flex rounded-full border border-moon/30 px-5 py-3 text-sm font-semibold text-moon transition hover:border-moon/60 hover:bg-white/10"
            >
              回到塔羅抽牌
            </a>
          ) : null}
        </div>
      </section>
    </main>
  );
}
