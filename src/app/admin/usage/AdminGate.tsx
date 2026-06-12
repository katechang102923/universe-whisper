"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

/**
 * 後台登入閘門：未登入或非管理員時顯示清楚訊息與動作，取代原本靜默 redirect("/")。
 *  - 未登入：請先以管理員 Google 帳號登入（提供 Google 登入按鈕）
 *  - 已登入但非管理員：此帳號沒有管理員權限（提供登出）
 * 登入成功（cookie 建立）後導回 /admin/usage，由伺服器重新驗證進入後台。
 */
export function AdminGate({ hasSession, email }: { hasSession: boolean; email: string | null }) {
  const { user, loading, sessionPending, signIn, signOut, signInError, firebaseConfigured } = useAuth();
  const [busy, setBusy] = useState(false);

  // 已登入但非管理員（伺服器有 session 但 email 不在白名單，或 client 已有 user 但非 admin）
  const signedInNotAdmin = hasSession || (!loading && Boolean(user));
  const shownEmail = email ?? user?.email ?? null;

  async function handleSignIn() {
    setBusy(true);
    try {
      await signIn();
      // 等 session cookie 寫入後整頁導回，讓伺服器重新驗證
      window.location.assign("/admin/usage");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-10 max-w-md rounded-3xl border border-white/12 bg-midnight/70 p-6 text-center shadow-[0_18px_60px_rgba(0,0,0,0.25)]">
      <p className="text-xs uppercase tracking-[0.28em] text-lavender/70">Admin Access</p>

      {signedInNotAdmin ? (
        <>
          <h2 className="mt-2 text-xl font-semibold text-moon">此帳號沒有管理員權限</h2>
          <p className="mt-2 text-sm leading-7 text-moon/55">
            目前登入帳號{shownEmail ? `（${shownEmail}）` : ""}不在管理員名單內。
            請改用管理員 Google 帳號登入。
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-full border border-white/20 bg-white/8 px-5 py-2.5 text-sm text-moon transition hover:bg-white/14"
            >
              登出並改用其他帳號
            </button>
            <Link href="/" className="text-xs text-moon/40 transition hover:text-moon/70">回到前台首頁</Link>
          </div>
        </>
      ) : (
        <>
          <h2 className="mt-2 text-xl font-semibold text-moon">請先以管理員 Google 帳號登入</h2>
          <p className="mt-2 text-sm leading-7 text-moon/55">
            管理後台需要管理員 Google 帳號。登入成功後會自動進入後台。
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              disabled={busy || sessionPending || !firebaseConfigured}
              onClick={() => void handleSignIn()}
              className="rounded-full border border-white/14 bg-white/8 px-5 py-2.5 text-sm font-medium text-moon transition hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy || sessionPending ? "登入中…" : "使用 Google 登入"}
            </button>
            {!firebaseConfigured ? (
              <p className="text-xs leading-6 text-red-300/90">
                Google 登入尚未設定，請確認 Vercel 已設定 NEXT_PUBLIC_FIREBASE_* 環境變數。
              </p>
            ) : null}
            {signInError ? <p className="text-xs leading-6 text-red-300/90">{signInError}</p> : null}
            <Link href="/" className="text-xs text-moon/40 transition hover:text-moon/70">回到前台首頁</Link>
          </div>
        </>
      )}
    </div>
  );
}
