"use client";

/**
 * AuthContext — wraps the entire app and provides the current Firebase user,
 * admin status, and sign-in / sign-out helpers.
 *
 * Google Sign-In flow:
 *   1. signInWithPopup (client-side)
 *   2. POST /api/auth/google-session with ID token → httpOnly session cookie
 *   3. Admin pages verify the session cookie server-side
 *
 * Admin detection:
 *   - Client-side: email is in NEXT_PUBLIC_ADMIN_GOOGLE_EMAILS (for UI gating only)
 *   - Server-side: verifyAdminSessionCookie() in page routes / API routes
 *     (client isAdmin value is NEVER trusted by the server)
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  type User,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { getClientAuth } from "@/lib/firebaseClient";

// ── Admin email list (client-side UI only) ─────────────────────────────────
const ADMIN_EMAILS_CLIENT: string[] = (() => {
  const env = process.env.NEXT_PUBLIC_ADMIN_GOOGLE_EMAILS ?? "";
  const fromEnv = env
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : ["ciut0000@gmail.com"];
})();

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS_CLIENT.includes(email.toLowerCase());
}

/** Maps Firebase Auth error codes to user-readable Traditional Chinese messages */
function getFirebaseErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: string }).code;
    switch (code) {
      case "auth/popup-closed-by-user":
        return ""; // user dismissed — not really an error
      case "auth/popup-blocked":
        return "彈出視窗被封鎖，請允許本站開啟彈出視窗後再試。";
      case "auth/unauthorized-domain":
        return "Firebase Auth 網域未授權，請至 Firebase Console → Authentication → Settings → Authorized domains 加入此網域。";
      case "auth/operation-not-allowed":
        return "Google 登入尚未啟用，請至 Firebase Console → Authentication → Sign-in method 啟用 Google。";
      case "auth/network-request-failed":
        return "網路錯誤，請確認連線後再試。";
      case "auth/cancelled-popup-request":
        return ""; // multiple popups — ignore
      case "auth/internal-error":
        return "Firebase 內部錯誤，請稍後再試。";
      default:
        return `Google 登入失敗（${code}），請稍後再試。`;
    }
  }
  return "Google 登入失敗，請稍後再試。";
}

// ── Types ───────────────────────────────────────────────────────────────────

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  sessionPending: boolean;
  /** Non-empty string when the last signIn() call failed */
  signInError: string;
  /** False when NEXT_PUBLIC_FIREBASE_* env vars are not configured */
  firebaseConfigured: boolean;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  /**
   * Triggers Google sign-in popup.
   * On failure sets signInError — does NOT throw.
   */
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  clearSignInError: () => void;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  isAdmin: false,
  sessionPending: false,
  signInError: "",
  firebaseConfigured: false,
  getIdToken: async () => null,
  signIn: async () => {},
  signOut: async () => {},
  clearSignInError: () => {},
});

// ── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionPending, setSessionPending] = useState(false);
  const [signInError, setSignInError] = useState("");
  const [firebaseConfigured, setFirebaseConfigured] = useState(false);

  useEffect(() => {
    const auth = getClientAuth();
    if (!auth) {
      // Firebase env vars not set — mark unconfigured and stop loading.
      setFirebaseConfigured(false);
      setLoading(false);
      return;
    }
    setFirebaseConfigured(true);
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const clearSignInError = useCallback(() => setSignInError(""), []);

  const getIdToken = useCallback(
    async (forceRefresh = false): Promise<string | null> => {
      if (!user) return null;
      try {
        return await user.getIdToken(forceRefresh);
      } catch {
        return null;
      }
    },
    [user],
  );

  /** Creates httpOnly session cookie via server route after successful sign-in */
  const createSession = useCallback(async (firebaseUser: User): Promise<void> => {
    setSessionPending(true);
    try {
      const idToken = await firebaseUser.getIdToken(true);
      const res = await fetch("/api/auth/google-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("[AuthContext] Session cookie creation failed:", data);
        setSignInError("無法建立管理員 Session，請稍後再試。");
      }
    } catch (err) {
      console.error("[AuthContext] Failed to call /api/auth/google-session:", err);
      setSignInError("無法建立管理員 Session，請確認網路後再試。");
    } finally {
      setSessionPending(false);
    }
  }, []);

  const signIn = useCallback(async () => {
    setSignInError("");

    // ── Guard: Firebase not configured ─────────────────────────────────────
    const auth = getClientAuth();
    if (!auth) {
      const msg =
        "Google 登入尚未設定完成，請確認 Vercel 已設定 NEXT_PUBLIC_FIREBASE_API_KEY、" +
        "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN、NEXT_PUBLIC_FIREBASE_PROJECT_ID、" +
        "NEXT_PUBLIC_FIREBASE_APP_ID 等環境變數。";
      console.error("[AuthContext] Firebase not configured:", msg);
      setSignInError(msg);
      return;
    }

    // ── Google sign-in popup ────────────────────────────────────────────────
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      // Create server-side session cookie (error is handled inside createSession)
      await createSession(result.user);
    } catch (err) {
      const msg = getFirebaseErrorMessage(err);
      if (msg) {
        // Only log and surface non-trivial errors (not "user closed popup")
        console.error("[AuthContext] signInWithPopup error:", err);
        setSignInError(msg);
      }
    }
  }, [createSession]);

  const signOut = useCallback(async () => {
    setSignInError("");
    try {
      await fetch("/api/auth/google-session", { method: "DELETE" });
    } catch {
      // ignore — still sign out from Firebase
    }
    const auth = getClientAuth();
    if (auth) await firebaseSignOut(auth);
  }, []);

  const isAdmin = isAdminEmail(user?.email);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin,
        sessionPending,
        signInError,
        firebaseConfigured,
        getIdToken,
        signIn,
        signOut,
        clearSignInError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
