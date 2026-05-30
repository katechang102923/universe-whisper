"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Provides "← 返回" and "⌂ 首頁" actions.
 *
 * Back logic:
 *   1. If the user arrived from within the same site (document.referrer same origin),
 *      call router.back() — no visible flash.
 *   2. If history.length > 1, also try router.back() (handles in-app SPA navigation).
 *   3. Fallback: navigate to "/" so the user is never stranded.
 *
 * Style matches the site's glass / star-field aesthetic.
 * Touch target is min-h-[44px] to comply with mobile accessibility guidelines.
 */
export function PageNavActions({ className }: { className?: string }) {
  const router = useRouter();

  function handleBack() {
    try {
      const ref = typeof document !== "undefined" ? document.referrer : "";
      const sameOrigin = ref && new URL(ref).origin === window.location.origin;
      if (sameOrigin || window.history.length > 1) {
        router.back();
      } else {
        router.push("/");
      }
    } catch {
      router.push("/");
    }
  }

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-4 text-sm text-moon/72 transition hover:bg-white/12 hover:text-moon active:scale-95"
        aria-label="返回上一頁"
      >
        ← 返回
      </button>
      <Link
        href="/"
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-4 text-sm text-moon/72 transition hover:bg-white/12 hover:text-moon active:scale-95"
        aria-label="回到首頁"
      >
        ⌂ 首頁
      </Link>
    </div>
  );
}
