"use client";

/**
 * Lazy Firebase client-side initialisation.
 *
 * IMPORTANT: Do NOT call getAuth / getFirestore at module scope.
 * These getter functions guard against:
 *   - Server-side evaluation during Next.js build (typeof window check)
 *   - Missing NEXT_PUBLIC_* env vars (returns null instead of throwing)
 *
 * Import the getters from this file; call them inside useEffect or event
 * handlers only — never at component render time or module level.
 */

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** True only when the minimum required config values are present. */
function isConfigAvailable(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.appId,
  );
}

// Singletons — populated on first client-side call.
let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

/**
 * Returns the Firebase app, or null if:
 *  - we are on the server (build / SSR)
 *  - the required NEXT_PUBLIC_* env vars are not set
 */
function getApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null;
  if (!isConfigAvailable()) return null;
  if (!_app) {
    _app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return _app;
}

/**
 * Returns the Firebase Auth instance, or null when:
 *  - running on the server / during build
 *  - the required env vars are not configured
 *
 * Always call this inside useEffect or event handlers, never at module level.
 */
export function getClientAuth(): Auth | null {
  const app = getApp();
  if (!app) return null;
  if (!_auth) _auth = getAuth(app);
  return _auth;
}

/**
 * Returns the Firestore instance, or null when:
 *  - running on the server / during build
 *  - the required env vars are not configured
 *
 * Always call this inside useEffect or event handlers, never at module level.
 */
export function getClientDb(): Firestore | null {
  const app = getApp();
  if (!app) return null;
  if (!_db) _db = getFirestore(app);
  return _db;
}
