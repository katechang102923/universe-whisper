"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const ANON_ID_KEY = "cosmic_anon_id";
const SESSION_KEY = "uw_traffic_session";
const LAST_ACTIVITY_KEY = "uw_traffic_last_activity";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const HEARTBEAT_MS = 15000;

type StoredSession = {
  sessionId: string;
  startedAt: number;
};

function createId(prefix: string) {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${randomPart}`;
}

function getOrCreateAnonymousId() {
  try {
    const existing = window.localStorage.getItem(ANON_ID_KEY);
    if (existing) return existing;
    const next = createId("anon");
    window.localStorage.setItem(ANON_ID_KEY, next);
    return next;
  } catch {
    return createId("anon");
  }
}

function getSession(now: number) {
  try {
    const lastActivity = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY) ?? "0");
    const raw = window.localStorage.getItem(SESSION_KEY);
    const existing = raw ? (JSON.parse(raw) as Partial<StoredSession>) : null;
    if (
      existing?.sessionId &&
      existing.startedAt &&
      lastActivity &&
      now - lastActivity < SESSION_TIMEOUT_MS
    ) {
      window.localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      return { session: existing as StoredSession, isNew: false };
    }
  } catch {
    // Storage may be unavailable in private browsing.
  }

  const session = { sessionId: createId("sess"), startedAt: now };
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  } catch {
    // Ignore storage failures; the server still receives an event.
  }
  return { session, isNew: true };
}

function isFrontendPath(path: string) {
  return !(
    path.startsWith("/admin") ||
    path.startsWith("/api/admin") ||
    path.startsWith("/api/") ||
    path.startsWith("/line/connect")
  );
}

function sendAnalytics(payload: Record<string, unknown>, beacon = false) {
  const body = JSON.stringify(payload);
  if (beacon && typeof navigator !== "undefined" && "sendBeacon" in navigator) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon("/api/analytics/events", blob)) return;
  }
  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: beacon,
  }).catch(() => undefined);
}

function textIncludes(target: EventTarget | null, keywords: string[]) {
  const element = target instanceof Element ? target.closest("button,a") : null;
  const text = element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return keywords.some((keyword) => text.includes(keyword));
}

export function TrafficAnalyticsTracker() {
  const pathname = usePathname();
  const activeSecondsRef = useRef(0);
  const pageActiveSecondsRef = useRef(0);
  const sessionStartedAtRef = useRef(Date.now());
  const lastTickRef = useRef(Date.now());
  const sessionIdRef = useRef("");
  const anonymousIdRef = useRef("");
  const currentPathRef = useRef(pathname || "/");
  const sentPaymentRef = useRef(false);

  useEffect(() => {
    if (!pathname || !isFrontendPath(pathname)) return;

    const now = Date.now();
    const anonymousId = getOrCreateAnonymousId();
    const { session, isNew } = getSession(now);
    anonymousIdRef.current = anonymousId;
    sessionIdRef.current = session.sessionId;
    sessionStartedAtRef.current = session.startedAt;
    currentPathRef.current = pathname;
    pageActiveSecondsRef.current = 0;
    lastTickRef.current = now;

    const basePayload = {
      sessionId: session.sessionId,
      anonymousId,
      path: pathname,
      referrer: document.referrer || "",
      url: window.location.href,
    };

    if (isNew) {
      sendAnalytics({
        eventType: "session_start",
        ...basePayload,
        landingPath: pathname,
      });
    }

    sendAnalytics({
      eventType: "page_view",
      ...basePayload,
    });
  }, [pathname]);

  useEffect(() => {
    const tick = (beacon = false) => {
      const now = Date.now();
      const elapsed = Math.max(0, now - lastTickRef.current);
      lastTickRef.current = now;
      if (document.visibilityState === "visible") {
        const seconds = elapsed / 1000;
        activeSecondsRef.current += seconds;
        pageActiveSecondsRef.current += seconds;
      }
      try {
        window.localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      } catch {
        // Ignore storage failures.
      }
      if (!sessionIdRef.current || !anonymousIdRef.current || !isFrontendPath(currentPathRef.current)) return;
      sendAnalytics(
        {
          eventType: "session_heartbeat",
          sessionId: sessionIdRef.current,
          anonymousId: anonymousIdRef.current,
          path: currentPathRef.current,
          activeSeconds: Math.min(Math.round(activeSecondsRef.current), 7200),
          pageActiveSeconds: Math.min(Math.round(pageActiveSecondsRef.current), 7200),
          totalSeconds: Math.min(Math.round((now - sessionStartedAtRef.current) / 1000), 7200),
          lastActiveAt: new Date(now).toISOString(),
        },
        beacon,
      );
    };

    const interval = window.setInterval(() => tick(false), HEARTBEAT_MS);
    const flush = () => tick(true);
    const handleVisibility = () => {
      tick(document.visibilityState === "hidden");
    };

    const handleClick = (event: MouseEvent) => {
      if (!sessionIdRef.current || !anonymousIdRef.current) return;
      let eventType = "";
      if (textIncludes(event.target, ["完整版", "完整解讀"])) eventType = "full_reading_click";
      if (textIncludes(event.target, ["Facebook 解鎖", "分享 Facebook"])) eventType = "free_unlock";
      if (textIncludes(event.target, ["LINE 看我的結果", "LINE 保存", "LINE"])) eventType = "line_save";
      if (textIncludes(event.target, ["下載限動圖片", "下載分享圖"])) eventType = "share_image_download_click";
      if (!eventType) return;
      sendAnalytics({
        eventType,
        sessionId: sessionIdRef.current,
        anonymousId: anonymousIdRef.current,
        path: currentPathRef.current,
      });
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await originalFetch(input, init);
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/tarot/draw") && response.ok && sessionIdRef.current && anonymousIdRef.current) {
        sendAnalytics({
          eventType: "tarot_draw_complete",
          sessionId: sessionIdRef.current,
          anonymousId: anonymousIdRef.current,
          path: currentPathRef.current,
        });
      }
      return response;
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("click", handleClick);

    return () => {
      window.clearInterval(interval);
      window.fetch = originalFetch;
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("click", handleClick);
    };
  }, []);

  useEffect(() => {
    if (sentPaymentRef.current || pathname !== "/payment/result") return;
    const timer = window.setInterval(() => {
      if (!document.body.textContent?.includes("購買成功")) return;
      sentPaymentRef.current = true;
      window.clearInterval(timer);
      sendAnalytics({
        eventType: "payment_success",
        sessionId: sessionIdRef.current,
        anonymousId: anonymousIdRef.current,
        path: pathname,
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pathname]);

  return null;
}
