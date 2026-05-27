import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export function getFirebaseAdminEnvStatus() {
  return {
    hasFirebaseProjectId: Boolean(process.env.FIREBASE_PROJECT_ID),
    hasFirebaseClientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
    hasFirebasePrivateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY),
  };
}

function getPrivateKey() {
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!rawKey) return undefined;

  return rawKey
    .replace(/^"|"$/g, "")
    .replace(/^'|'$/g, "")
    .replace(/\\n/g, "\n");
}

export function getAdminDb() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = getPrivateKey();

    if (!projectId || !clientEmail || !privateKey) {
      const missing = [
        !projectId ? "FIREBASE_PROJECT_ID" : null,
        !clientEmail ? "FIREBASE_CLIENT_EMAIL" : null,
        !privateKey ? "FIREBASE_PRIVATE_KEY" : null,
      ].filter(Boolean);
      throw new Error(`Missing Firebase Admin environment variables: ${missing.join(", ")}`);
    }

    try {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Firebase Admin initialization error.";
      throw new Error(`Firebase Admin initialization failed: ${message}`);
    }
  }

  return getFirestore();
}
