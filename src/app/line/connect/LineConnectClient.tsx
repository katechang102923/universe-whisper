"use client";

import { useEffect, useRef, useState } from "react";
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

const SENT_RESULT_STORAGE_PREFIX = "line-connect-sent:";
const DESKTOP_RESULT_STORAGE_KEY = "line-connect-desktop-result-id";
const DESKTOP_REDIRECT_URI = "https://universe-whisper.vercel.app/line/connect";

const statusText: Record<ConnectStatus, string> = {
  booting: "正在連接宇宙訊息...",
  login: "正在登入 LINE...",
  sending: "正在把訊息送到 LINE...",
  done: "已傳送到 LINE",
  error: "連接失敗",
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

function extractResultId(searchParams: URLSearchParams) {
  const directResultId = searchParams.get("resultId");
  if (directResultId) {
    return { resultId: directResultId, source: "resultId" };
  }

  const liffState = searchParams.get("liff.state");
  if (!liffState) {
    return { resultId: "", source: "missing" };
  }

  try {
    const decodedState = decodeURIComponent(liffState);
    const normalizedState = decodedState.startsWith("?") ? decodedState.slice(1) : decodedState;
    const stateParams = new URLSearchParams(normalizedState);
    return { resultId: stateParams.get("resultId") ?? "", source: "liff.state" };
  } catch (error) {
    console.error("[line-connect-client] connectFailed parseLiffState", { liffState, error });
    return { resultId: "", source: "liff.state-parse-error" };
  }
}

function isLineInAppBrowser() {
  return /Line\//i.test(window.navigator.userAgent);
}

function getCurrentSearchParams() {
  return new URLSearchParams(window.location.search);
}

function summarizeParams(searchParams: URLSearchParams) {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  return {
    resultId: searchParams.get("resultId"),
    liffState: searchParams.get("liff.state"),
    hasCode: Boolean(searchParams.get("code")),
    hasState: Boolean(searchParams.get("state")),
    hasIdTokenParam: Boolean(searchParams.get("id_token")),
    hasHashIdToken: Boolean(hashParams.get("id_token")),
  };
}

function getCleanRedirectUri(resultId: string) {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ resultId }).toString();
  url.hash = "";
  return url.toString();
}

function saveDesktopResultId(resultId: string) {
  try {
    window.sessionStorage.setItem(DESKTOP_RESULT_STORAGE_KEY, resultId);
  } catch {
    // sessionStorage can be unavailable in some browser modes.
  }
}

function getDesktopResultId() {
  try {
    return window.sessionStorage.getItem(DESKTOP_RESULT_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function clearDesktopResultId() {
  try {
    window.sessionStorage.removeItem(DESKTOP_RESULT_STORAGE_KEY);
  } catch {
    // sessionStorage can be unavailable in some browser modes.
  }
}

function wasResultSent(resultId: string) {
  try {
    return window.sessionStorage.getItem(`${SENT_RESULT_STORAGE_PREFIX}${resultId}`) === "1";
  } catch {
    return false;
  }
}

function markResultSent(resultId: string) {
  try {
    window.sessionStorage.setItem(`${SENT_RESULT_STORAGE_PREFIX}${resultId}`, "1");
  } catch {
    // sessionStorage can be unavailable in some in-app browser modes.
  }
}

export function LineConnectClient() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<ConnectStatus>("booting");
  const [message, setMessage] = useState("");
  const postingRef = useRef(false);
  const completedRef = useRef(false);
  const closeOrRedirectTimerRef = useRef<number | null>(null);

  function finishAfterSuccess(resultId: string) {
    if (closeOrRedirectTimerRef.current) return;

    closeOrRedirectTimerRef.current = window.setTimeout(() => {
      if (window.liff?.isInClient()) {
        console.info("[line-connect-client] connectSuccess closeWindow", { resultId });
        window.liff.closeWindow();
        return;
      }

      const redirectUrl = `/tarot?lineSent=1&resultId=${encodeURIComponent(resultId)}`;
      console.info("[line-connect-client] connectSuccess redirect", { resultId, redirectUrl });
      window.location.replace(redirectUrl);
    }, 1200);
  }

  async function postDesktopConnect(resultId: string, code: string) {
    if (postingRef.current) {
      console.info("[line-connect-client] postingConnect skippedDuplicate", { resultId, mode: "desktop-oauth" });
      return;
    }

    setStatus("sending");
    postingRef.current = true;
    console.info("[line-connect-client] postingConnect", {
      resultId,
      hasCode: Boolean(code),
      redirectUri: DESKTOP_REDIRECT_URI,
      mode: "desktop-oauth",
    });

    try {
      const response = await fetch("/api/line/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultId, code, redirectUri: DESKTOP_REDIRECT_URI }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; pushStatus?: string };

      if (!response.ok) {
        console.error("[line-connect-client] connectFailed", {
          resultId,
          status: response.status,
          error: data.error,
          mode: "desktop-oauth",
        });
        throw new Error(data.error || "LINE connect failed.");
      }

      completedRef.current = true;
      markResultSent(resultId);
      clearDesktopResultId();
      console.info("[line-connect-client] connectSuccess", { resultId, pushStatus: data.pushStatus, mode: "desktop-oauth" });
      setStatus("done");
      setMessage("已傳送到 LINE，請打開 LINE 查看。");
    } catch (error) {
      console.error("[line-connect-client] connectFailed", { error, mode: "desktop-oauth" });
      setStatus("error");
      const errorMessage = error instanceof Error ? error.message : "LINE 連接失敗。";
      setMessage(`送出前卡住了：${errorMessage}`);
    } finally {
      postingRef.current = false;
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function connectLine(trigger: string) {
      const params = getCurrentSearchParams();
      const desktopCode = params.get("code") ?? "";
      const lineInAppBrowser = isLineInAppBrowser();
      const extracted = extractResultId(params);
      const resultId = lineInAppBrowser ? extracted.resultId : extracted.resultId || getDesktopResultId();
      const source = lineInAppBrowser ? extracted.source : extracted.resultId ? extracted.source : "sessionStorage";
      const receivedParams = summarizeParams(params);
      const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID;
      console.info("[line-connect-client] gotParams", {
        trigger,
        resultId,
        resultIdSource: source,
        hasCode: Boolean(desktopCode),
        lineInAppBrowser,
        hasLiffId: Boolean(liffId),
        currentPath: window.location.pathname,
        currentSearch: window.location.search,
        receivedParams,
      });

      if (!resultId) {
        setStatus("error");
        setMessage(`缺少結果代碼，收到的參數：${JSON.stringify(receivedParams)}`);
        return;
      }

      if (!lineInAppBrowser) {
        if (completedRef.current || wasResultSent(resultId)) {
          completedRef.current = true;
          setStatus("done");
          setMessage("已傳送到 LINE，請打開 LINE 查看。");
          return;
        }

        if (desktopCode) {
          await postDesktopConnect(resultId, desktopCode);
          return;
        }

        saveDesktopResultId(resultId);
        setStatus("login");
        console.info("[line-connect-client] gotParams desktopOAuthRedirect", { resultId, redirectUri: DESKTOP_REDIRECT_URI });
        window.location.href = "/api/line/connect/start";
        return;
      }

      if (!liffId) {
        console.error("[line-connect-client] connectFailed missingLiffId");
        setStatus("error");
        setMessage("LINE LIFF 尚未設定，請稍後再試。");
        return;
      }

      if (completedRef.current || wasResultSent(resultId)) {
        completedRef.current = true;
        setStatus("done");
        setMessage("已傳送到 LINE。");
        finishAfterSuccess(resultId);
        return;
      }

      try {
        setStatus("booting");
        await loadLiffSdk();
        console.info("[line-connect-client] gotParams liffSdkLoaded", { hasLiff: Boolean(window.liff) });

        if (!window.liff) throw new Error("LIFF SDK is unavailable.");

        await window.liff.init({ liffId });
        const paramsAfterInit = getCurrentSearchParams();
        const { resultId: resultIdAfterInit } = extractResultId(paramsAfterInit);
        const activeResultId = resultIdAfterInit || resultId;
        console.info("[line-connect-client] gotParams afterLiffInit", {
          resultId: activeResultId,
          isLoggedIn: window.liff.isLoggedIn(),
          isInClient: window.liff.isInClient(),
          receivedParams: summarizeParams(paramsAfterInit),
        });

        if (cancelled) return;

        if (!window.liff.isLoggedIn()) {
          setStatus("login");
          const redirectUri = getCleanRedirectUri(activeResultId);
          console.info("[line-connect-client] gotParams callingLogin", { redirectUri });
          window.liff.login({ redirectUri });
          return;
        }

        if (postingRef.current) {
          console.info("[line-connect-client] postingConnect skippedDuplicate", { resultId: activeResultId });
          return;
        }

        const idToken = window.liff.getIDToken();
        const accessToken = window.liff.getAccessToken();
        console.info("[line-connect-client] gotParams tokens", {
          resultId: activeResultId,
          hasIdToken: Boolean(idToken),
          hasAccessToken: Boolean(accessToken),
        });

        if (!idToken && !accessToken) {
          throw new Error("LIFF token is unavailable.");
        }

        setStatus("sending");
        postingRef.current = true;
        console.info("[line-connect-client] postingConnect", {
          resultId: activeResultId,
          hasIdToken: Boolean(idToken),
          hasAccessToken: Boolean(accessToken),
        });

        const response = await fetch("/api/line/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resultId: activeResultId, idToken, accessToken }),
        });
        const data = (await response.json().catch(() => ({}))) as { error?: string; pushStatus?: string };

        if (!response.ok) {
          console.error("[line-connect-client] connectFailed", {
            resultId: activeResultId,
            status: response.status,
            error: data.error,
          });
          throw new Error(data.error || "LINE connect failed.");
        }

        completedRef.current = true;
        markResultSent(activeResultId);
        console.info("[line-connect-client] connectSuccess", { resultId: activeResultId, pushStatus: data.pushStatus });
        setStatus("done");
        setMessage("已傳送到 LINE。");
        finishAfterSuccess(activeResultId);
      } catch (error) {
        console.error("[line-connect-client] connectFailed", { error });
        setStatus("error");
        const errorMessage = error instanceof Error ? error.message : "LINE 連接失敗。";
        setMessage(`送出前卡住了：${errorMessage}`);
      } finally {
        postingRef.current = false;
      }
    }

    void connectLine("effect");

    function handlePageShow() {
      void connectLine("pageshow");
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void connectLine("visible");
      }
    }

    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (closeOrRedirectTimerRef.current) {
        window.clearTimeout(closeOrRedirectTimerRef.current);
        closeOrRedirectTimerRef.current = null;
      }
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
                ? "訊息已送到 LINE。"
                : "請稍等一下，正在替你把宇宙訊息送往 LINE。")}
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
