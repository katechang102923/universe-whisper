import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getPrivateKey() {
  return process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
}

export function getAdminDb() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = getPrivateKey();

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("Missing Firebase Admin environment variables.");
    }

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey
      })
    });
  }

  return getFirestore();
}
