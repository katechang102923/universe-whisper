export const freeFeatures = ["daily_fortune", "daily_phrase", "single_tarot"] as const;
export const paidFeatures = ["love_tarot", "midnight_emotion", "three_card", "ai_detail"] as const;

export type FreeFeature = (typeof freeFeatures)[number];
export type PaidFeature = (typeof paidFeatures)[number];
export type FeatureKey = FreeFeature | PaidFeature;

export type Plan = "free" | "premium";
export type PaymentStatus = "none" | "pending" | "active" | "past_due" | "canceled";

export type UserProfile = {
  uid: string;
  lineUserId?: string;
  displayName?: string;
  photoURL?: string;
  birthDate?: string;
  zodiacSign?: string;
  plan: Plan;
  paymentStatus: PaymentStatus;
  entitlements: {
    loveTarot: boolean;
    midnightEmotionReading: boolean;
    threeCardReading: boolean;
    aiDetailedReading: boolean;
  };
  usage: {
    dailyFortuneDate?: string;
    freeTarotDate?: string;
    freeTarotCount: number;
    aiReadingCount: number;
  };
  createdAt?: unknown;
  updatedAt?: unknown;
};

export const defaultEntitlements = {
  loveTarot: false,
  midnightEmotionReading: false,
  threeCardReading: false,
  aiDetailedReading: false
};

export function canUseFeature(profile: Pick<UserProfile, "plan" | "paymentStatus" | "entitlements"> | null, feature: FeatureKey) {
  if (freeFeatures.includes(feature as FreeFeature)) {
    return { allowed: true };
  }

  if (!profile) {
    return { allowed: false, reason: "需要登入並升級後才能使用這個深度解讀。" };
  }

  const hasActivePayment = profile.plan === "premium" && profile.paymentStatus === "active";

  const entitlementMap: Record<PaidFeature, boolean> = {
    love_tarot: profile.entitlements.loveTarot,
    midnight_emotion: profile.entitlements.midnightEmotionReading,
    three_card: profile.entitlements.threeCardReading,
    ai_detail: profile.entitlements.aiDetailedReading
  };

  if (hasActivePayment && entitlementMap[feature as PaidFeature]) {
    return { allowed: true };
  }

  return { allowed: false, reason: "這是付費功能，升級後才會啟動宇宙解讀。" };
}
