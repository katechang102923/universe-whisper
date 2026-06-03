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
// Read from NEXT_PUBLIC_ADMIN_GOOGLE_EMAILS; fall back to hardcoded list.
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

// ── Types ───────────────────────────────────────────────────────────────────

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  /** True while the session cookie is being written after sign-in */
  sessionPending: boolean;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  isAdmin: false,
  sessionPending: false,
  getIdToken: async () => null,
  signIn: async () => {},
  signOut: async () => {},
});

// ── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionPending, setSessionPending] = useState(false);

  useEffect(() => {
    const auth = getClientAuth();
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

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

  /** Creates server-side session cookie after successful Google sign-in */
  const createSession = useCallback(async (firebaseUser: User) => {
    setSessionPending(true);
    try {
      const idToken = await firebaseUser.getIdToken(true);
      await fetch("/api/auth/google-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
    } catch (err) {
      console.warn("[AuthContext] Failed to create session cookie:", err);
    } finally {
      setSessionPending(false);
    }
  }, []);

  const signIn = useCallback(async () => {
    const auth = getClientAuth();
    if (!auth) {
      console.warn("[AuthContext] Firebase Auth is not configured.");
      return;
    }
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const result = await signInWithPopup(auth, provider);
    await createSession(result.user);
  }, [createSession]);

  const signOut = useCallback(async () => {
    const auth = getClientAuth();
    // Clear server-side session cookie first
    try {
      await fetch("/api/auth/google-session", { method: "DELETE" });
    } catch {
      // ignore
    }
    if (auth) await firebaseSignOut(auth);
  }, []);

  const isAdmin = isAdminEmail(user?.email);

  return (
    <AuthContext.Provider
      value={{ user, loading, isAdmin, sessionPending, getIdToken, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
