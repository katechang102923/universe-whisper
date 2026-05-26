import { auth, db } from "./firebaseClient";

export const collections = {
  users: "users",
  tarotLogs: "tarot_logs"
} as const;

export type UserDocument = {
  uid: string;
  displayName?: string;
  lineUserId?: string;
  plan: "free" | "premium";
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type TarotLogDocument = {
  userId?: string;
  topic: "感情" | "工作" | "曖昧";
  mode: "single_tarot" | "three_card";
  cardIds: string[];
  question?: string;
  createdAt?: unknown;
};

export { auth, db };
