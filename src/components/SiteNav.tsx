"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

// 次要導覽項目（不含主 CTA 塔羅抽牌）
const secondaryNavItems = [
  { href: "/redeem/check", label: "查詢次數" },
  { href: "/daily", label: "今日運勢" },
  { href: "/tarot-cards", label: "塔羅牌介紹" },
];

// ── Google Auth 區塊（桌機） ────────────────────────────────────────────────

function GoogleAuthDesktop() {
  const {
    user,
    isAdmin,
    loading,
    sessionPending,
    signInError,
    firebaseConfigured,
    signIn,
    signOut,
    clearSignInError,
  } = useAuth();
  const [busy, setBusy] = useState(false);

  if (loading) return null;

  if (!firebaseConfigured) {
    return (
      <span className="hidden text-xs text-red-400/80 md:block">
        Google 登入尚未設定
      </span>
    );
  }

  if (user) {
    return (
      <div className="hidden items-center gap-2 md:flex">
        {isAdmin && (
          <Link
            href="/admin/usage"
            className="rounded-full border border-lavender/30 bg-lavender/10 px-3 py-1.5 text-xs font-medium text-moon transition hover:bg-lavender/20"
          >
            管理後台
          </Link>
        )}
        <div className="flex items-center gap-1.5 rounded-full border border-white/12 bg-white/6 px-3 py-1.5 text-xs text-moon/70">
          <GoogleIcon />
          <span className="max-w-[160px] truncate">
            {sessionPending ? "建立 Session…" : user.email ?? "已登入"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-moon/50 transition hover:bg-white/8 hover:text-moon"
        >
          登出
        </button>
      </div>
    );
  }

  return (
    <div className="hidden flex-col items-end gap-1 md:flex">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          clearSignInError();
          setBusy(true);
          try {
            await signIn();
          } finally {
            setBusy(false);
          }
        }}
        className="flex items-center gap-1.5 rounded-full border border-white/14 bg-white/6 px-3 py-1.5 text-xs text-moon/70 transition hover:bg-white/12 hover:text-moon disabled:cursor-not-allowed disabled:opacity-50"
      >
        <GoogleIcon />
        {busy ? "登入中…" : "使用 Google 登入"}
      </button>

      {signInError && (
        <p className="max-w-[280px] text-right text-[11px] leading-5 text-red-400/90">
          {signInError}
        </p>
      )}
    </div>
  );
}

// ── Google Auth 區塊（手機選單） ─────────────────────────────────────────────

function GoogleAuthMobile({ onClose }: { onClose: () => void }) {
  const {
    user,
    isAdmin,
    loading,
    sessionPending,
    signInError,
    firebaseConfigured,
    signIn,
    signOut,
    clearSignInError,
  } = useAuth();
  const [busy, setBusy] = useState(false);

  if (loading) return null;

  if (!firebaseConfigured) {
    return (
      <p className="px-4 py-2 text-xs text-red-400/80">Google 登入尚未設定</p>
    );
  }

  if (user) {
    return (
      <>
        <div className="max-w-full truncate px-4 py-2 text-xs text-moon/44">
          {sessionPending ? "建立 Session…" : user.email ?? "已登入"}
        </div>
        {isAdmin && (
          <Link
            href="/admin/usage"
            onClick={onClose}
            className="block rounded-2xl px-4 py-3 text-lavender/90 transition hover:bg-white/10"
          >
            管理後台
          </Link>
        )}
        <button
          type="button"
          onClick={() => {
            void signOut();
            onClose();
          }}
          className="block w-full rounded-2xl px-4 py-3 text-left text-moon/60 transition hover:bg-white/10"
        >
          登出
        </button>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          clearSignInError();
          setBusy(true);
          try {
            await signIn();
          } finally {
            setBusy(false);
            onClose();
          }
        }}
        className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left transition hover:bg-white/10 disabled:opacity-50"
      >
        <GoogleIcon />
        {busy ? "登入中…" : "使用 Google 登入"}
      </button>

      {signInError && (
        <p className="px-4 pb-2 text-xs leading-5 text-red-400/90">
          {signInError}
        </p>
      )}
    </>
  );
}

// ── Google SVG Icon ─────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

// ── Main SiteNav ────────────────────────────────────────────────────────────

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isTarotActive = pathname === "/tarot";

  return (
    <div className="relative flex items-center gap-2">
      {/* Google Auth — 桌機 */}
      <GoogleAuthDesktop />

      {/* Nav links — 桌機 */}
      <nav className="hidden items-center gap-1 text-sm text-moon/76 md:flex">
        {/* 主 CTA：立即抽牌 */}
        <Link
          href="/tarot"
          className={[
            "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition",
            isTarotActive
              ? "bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-midnight shadow-[0_0_16px_rgba(251,191,36,0.5)]"
              : "bg-gradient-to-r from-amber-500/90 via-yellow-400/90 to-amber-400/90 text-midnight shadow-[0_0_10px_rgba(251,191,36,0.3)] hover:from-amber-400 hover:via-yellow-300 hover:to-amber-500 hover:shadow-[0_0_18px_rgba(251,191,36,0.55)]",
          ].join(" ")}
        >
          <span aria-hidden="true">✦</span>
          立即抽牌
        </Link>

        {/* 查詢次數 */}
        <Link
          href="/redeem/check"
          className={[
            "rounded-full px-3 py-2 text-sm transition",
            pathname === "/redeem/check"
              ? "border border-amber-400/40 text-amber-300"
              : "text-moon/76 hover:bg-white/10 hover:text-moon",
          ].join(" ")}
        >
          查詢次數
        </Link>

        {/* 今日運勢 */}
        <Link
          href="/daily"
          className={[
            "rounded-full px-3 py-2 transition",
            pathname === "/daily"
              ? "text-moon underline underline-offset-4"
              : "hover:bg-white/10 hover:text-moon",
          ].join(" ")}
        >
          今日運勢
        </Link>

        {/* 塔羅牌介紹 */}
        <Link
          href="/tarot-cards"
          className={[
            "rounded-full px-3 py-2 transition",
            pathname === "/tarot-cards"
              ? "text-moon underline underline-offset-4"
              : "hover:bg-white/10 hover:text-moon",
          ].join(" ")}
        >
          塔羅牌介紹
        </Link>
      </nav>

      {/* Hamburger — 手機 */}
      <button
        type="button"
        aria-expanded={open}
        aria-label="開啟導覽選單"
        onClick={() => setOpen((c) => !c)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/8 text-moon transition hover:bg-white/12 md:hidden"
      >
        <span className="relative h-4 w-5">
          <span
            className={`absolute left-0 top-0 h-px w-5 bg-current transition ${open ? "translate-y-2 rotate-45" : ""}`}
          />
          <span
            className={`absolute left-0 top-2 h-px w-5 bg-current transition ${open ? "opacity-0" : ""}`}
          />
          <span
            className={`absolute left-0 top-4 h-px w-5 bg-current transition ${open ? "-translate-y-2 -rotate-45" : ""}`}
          />
        </span>
      </button>

      {/* 下拉選單 — 手機 */}
      {open && (
        <nav className="absolute right-0 top-12 z-30 w-60 rounded-3xl border border-white/12 bg-midnight/95 p-2 text-sm text-moon shadow-glow backdrop-blur-xl md:hidden">
          {/* 主 CTA */}
          <Link
            href="/tarot"
            onClick={() => setOpen(false)}
            className={[
              "mb-1 flex items-center gap-2 rounded-2xl px-4 py-3 font-semibold transition",
              isTarotActive
                ? "bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-midnight"
                : "bg-gradient-to-r from-amber-500/80 via-yellow-400/80 to-amber-400/80 text-midnight hover:from-amber-400 hover:via-yellow-300 hover:to-amber-500",
            ].join(" ")}
          >
            <span aria-hidden="true">✦</span>
            立即抽牌
          </Link>

          {/* 查詢次數 */}
          <Link
            href="/redeem/check"
            onClick={() => setOpen(false)}
            className={[
              "block rounded-2xl px-4 py-3 transition",
              pathname === "/redeem/check"
                ? "text-amber-300"
                : "hover:bg-white/10",
            ].join(" ")}
          >
            查詢次數
          </Link>

          {/* 今日運勢 */}
          <Link
            href="/daily"
            onClick={() => setOpen(false)}
            className={[
              "block rounded-2xl px-4 py-3 transition",
              pathname === "/daily" ? "text-moon" : "hover:bg-white/10",
            ].join(" ")}
          >
            今日運勢
          </Link>

          {/* 塔羅牌介紹 */}
          <Link
            href="/tarot-cards"
            onClick={() => setOpen(false)}
            className={[
              "block rounded-2xl px-4 py-3 transition",
              pathname === "/tarot-cards" ? "text-moon" : "hover:bg-white/10",
            ].join(" ")}
          >
            塔羅牌介紹
          </Link>

          <div className="my-1 border-t border-white/8" />
          <GoogleAuthMobile onClose={() => setOpen(false)} />
        </nav>
      )}
    </div>
  );
}
