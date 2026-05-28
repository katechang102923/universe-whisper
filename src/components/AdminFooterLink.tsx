"use client";

/**
 * A deliberately low-key footer link for admin sign-in.
 * Renders as a small, muted text button so regular visitors won't notice it.
 * Shows "管理員 · 登出" when already signed in as admin.
 */
import { useAuth } from "@/contexts/AuthContext";

export function AdminFooterLink() {
  const { user, isAdmin, loading, signIn, signOut } = useAuth();

  if (loading) return null;

  if (user && isAdmin) {
    return (
      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-1 text-xs text-moon/30 transition hover:text-moon/55"
        title="管理員登出"
      >
        管理員 · 登出
      </button>
    );
  }

  // When a non-admin is signed in (shouldn't happen in production, but just in case)
  if (user && !isAdmin) {
    return (
      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-1 text-xs text-moon/20 transition hover:text-moon/40"
      >
        登出
      </button>
    );
  }

  // Not signed in — show the subtle "管理員登入" link
  return (
    <button
      type="button"
      onClick={() => void signIn()}
      className="mt-1 text-xs text-moon/20 transition hover:text-moon/40"
      title="管理員登入"
    >
      管理員登入
    </button>
  );
}
