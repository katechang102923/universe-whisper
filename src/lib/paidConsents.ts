export const PAID_CONSENT_VERSION = "2026-06-09-paid-v1";

export type PaidConsentFlags = {
  ageAndGuardianConsent: boolean;
  paymentAuthorizationConsent: boolean;
  digitalContentConsent: boolean;
};

export type PaidConsentPayload = Partial<PaidConsentFlags> & {
  consentVersion?: string;
  consentAcceptedAt?: string;
  userAgent?: string;
  pagePath?: string;
  tarotMode?: string;
  amount?: number;
  currency?: string;
};

export const EMPTY_PAID_CONSENTS: PaidConsentFlags = {
  ageAndGuardianConsent: false,
  paymentAuthorizationConsent: false,
  digitalContentConsent: false,
};

export function arePaidConsentsAccepted(consents: Partial<PaidConsentFlags> | null | undefined): boolean {
  return Boolean(
    consents?.ageAndGuardianConsent &&
    consents.paymentAuthorizationConsent &&
    consents.digitalContentConsent,
  );
}

