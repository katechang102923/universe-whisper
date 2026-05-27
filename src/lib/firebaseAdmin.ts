import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const FIREBASE_ENV_NAMES = {
  projectId: ["FIREBASE_PROJECT_ID", "FIREBASE_ADMIN_PROJECT_ID"],
  clientEmail: ["FIREBASE_CLIENT_EMAIL", "FIREBASE_ADMIN_CLIENT_EMAIL"],
  privateKey: ["FIREBASE_PRIVATE_KEY", "FIREBASE_ADMIN_PRIVATE_KEY"],
} as const;

function readFirstEnv(names: readonly string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return undefined;
}

export function getFirebaseAdminEnvStatus() {
  return {
    hasFirebaseProjectId: Boolean(process.env.FIREBASE_PROJECT_ID),
    hasFirebaseClientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
    hasFirebasePrivateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY),
    hasFirebaseAdminProjectIdAlias: Boolean(process.env.FIREBASE_ADMIN_PROJECT_ID),
    hasFirebaseAdminClientEmailAlias: Boolean(process.env.FIREBASE_ADMIN_CLIENT_EMAIL),
    hasFirebaseAdminPrivateKeyAlias: Boolean(process.env.FIREBASE_ADMIN_PRIVATE_KEY),
  };
}

function getPrivateKey() {
  const rawKey = readFirstEnv(FIREBASE_ENV_NAMES.privateKey);
  if (!rawKey) return undefined;

  return rawKey
    .trim()
    .replace(/,$/, "")
    .replace(/^"|"$/g, "")
    .replace(/^'|'$/g, "")
    .replace(/\\n/g, "\n");
}

export function getAdminDb() {
  if (!getApps().length) {
    const projectId = readFirstEnv(FIREBASE_ENV_NAMES.projectId);
    const clientEmail = readFirstEnv(FIREBASE_ENV_NAMES.clientEmail);
    const privateKey = getPrivateKey();

    if (!projectId || !clientEmail || !privateKey) {
      const missing = [
        !projectId ? FIREBASE_ENV_NAMES.projectId.join(" or ") : null,
        !clientEmail ? FIREBASE_ENV_NAMES.clientEmail.join(" or ") : null,
        !privateKey ? FIREBASE_ENV_NAMES.privateKey.join(" or ") : null,
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
