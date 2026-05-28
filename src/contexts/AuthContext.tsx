"use client";

/**
 * AuthContext — wraps the entire app and provides the current Firebase user,
 * admin status, and sign-in / sign-out helpers.
 *
 * Firebase Auth is obtained lazily via getClientAuth() inside useEffect /
 * event handlers — never at module scope — so this file is safe during
 * Next.js build even when NEXT_PUBLIC_FIREBASE_* env vars are absent.
 *
 * Admin detection: an authenticated user whose email matches the hard-coded
 * admin list is flagged `isAdmin = true` on the CLIENT SIDE only (for UI
 * gating). All server-side admin bypasses verify the ID token independently
 * via verifyAdminIdToken() — the client value is never trusted by the server.
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
// Only import the GETTER — this never calls getAuth() at module level.
import { getClientAuth } from "@/lib/firebaseClient";

const ADMIN_EMAILS = ["ciut0000@gmail.com"];

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

type AuthContextValue = {
  /** The currently signed-in Firebase user, or null if not signed in. */
  user: User | null;
  /** True while the initial auth state is being determined. */
  loading: boolean;
  /** True when the signed-in user is a recognised admin. */
  isAdmin: boolean;
  /**
   * Returns the current ID token (force-refreshes if forceRefresh is true).
   * Returns null if not signed in or Firebase is not configured.
   */
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  /** Triggers Google Sign-In via popup. */
  signIn: () => Promise<void>;
  /** Signs the current user out. */
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  isAdmin: false,
  getIdToken: async () => null,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // getClientAuth() returns null on the server OR when env vars are missing.
    // In that case skip the subscription and mark loading done so the UI
    // doesn't hang indefinitely.
    const auth = getClientAuth();
    if (!auth) {
      setLoading(false);
      return;
    }

    // onAuthStateChanged is imported statically but only CALLED here inside
    // useEffect, so it only runs in the browser — never during build/SSR.
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

  const signIn = useCallback(async () => {
    const auth = getClientAuth();
    if (!auth) {
      console.warn("[AuthContext] Firebase Auth is not configured — skipping sign-in.");
      return;
    }
    const provider = new GoogleAuthProvider();
    // Hint the account chooser towards the admin email.
    provider.setCustomParameters({ login_hint: ADMIN_EMAILS[0] });
    await signInWithPopup(auth, provider);
  }, []);

  const signOut = useCallback(async () => {
    const auth = getClientAuth();
    if (!auth) return;
    await firebaseSignOut(auth);
  }, []);

  const isAdmin = isAdminEmail(user?.email);

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, getIdToken, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
