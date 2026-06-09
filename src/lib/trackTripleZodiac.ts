/**
 * 三重星座（astro-profile）前台行為事件追蹤 — best-effort，純儀表化。
 *
 * 設計原則：
 *  - fire-and-forget：不回傳 Promise 給呼叫端 await，不阻擋任何 UI 流程。
 *  - 完全包在 try/catch，任何錯誤都靜默吞掉，絕不影響表單 / 付款 / LINE / Email。
 *  - 只送行為事件與非敏感欄位（不含出生日期 / 時間 / 城市 / 解析內容）。
 */

export type TripleZodiacEventType =
  | "triple_zodiac_page_view"
  | "triple_zodiac_started"
  | "triple_zodiac_generated"
  | "triple_zodiac_free_success"
  | "triple_zodiac_line_sent"
  | "triple_zodiac_email_sent"
  | "triple_zodiac_story_downloaded";

type TrackExtra = {
  sessionId?: string | null;
  isPaid?: boolean;
  source?: string | null;
};

export function trackTripleZodiac(eventType: TripleZodiacEventType, extra: TrackExtra = {}): void {
  try {
    if (typeof window === "undefined") return;

    const payload = JSON.stringify({
      eventType,
      sessionId: extra.sessionId ?? null,
      isPaid: extra.isPaid === true,
      source: extra.source ?? null,
      pagePath: window.location?.pathname ?? "/astro-profile",
    });

    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon("/api/astro-profile/track", blob)) return;
    }

    void fetch("/api/astro-profile/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // 永遠靜默 — 追蹤失敗不可影響前台行為
  }
}
