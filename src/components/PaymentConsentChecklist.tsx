"use client";

import {
  arePaidConsentsAccepted,
  EMPTY_PAID_CONSENTS,
  type PaidConsentFlags,
} from "@/lib/paidConsents";

export type { PaidConsentFlags };
export { EMPTY_PAID_CONSENTS, arePaidConsentsAccepted };

const CONSENT_ITEMS: Array<{ key: keyof PaidConsentFlags; title: string; text: string }> = [
  {
    key: "ageAndGuardianConsent",
    title: "年齡與監護人同意",
    text: "我確認已滿 18 歲；若未滿 18 歲，已取得法定代理人或監護人同意使用本服務與付款。",
  },
  {
    key: "paymentAuthorizationConsent",
    title: "付款工具授權",
    text: "我確認我是持卡人本人，或已取得持卡人／付款工具所有人同意使用此付款方式。",
  },
  {
    key: "digitalContentConsent",
    title: "數位內容立即提供",
    text: "我了解本服務為付款後立即產生並提供之個人化數位內容／線上服務；付款完成並開始產生結果後，除系統錯誤、重複扣款或未成功提供內容外，原則上不提供任意取消或退款。",
  },
];

export function PaymentConsentChecklist({
  value,
  onChange,
  disabled = false,
}: {
  value: PaidConsentFlags;
  onChange: (next: PaidConsentFlags) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.045] p-3 text-left shadow-[0_12px_28px_rgba(4,7,26,0.12)]">
      <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-[#d8bd70]/75">
        付款前確認
      </p>
      <div className="space-y-2.5">
        {CONSENT_ITEMS.map((item) => (
          <label key={item.key} className="flex gap-2.5 text-xs leading-5 text-moon/64">
            <input
              type="checkbox"
              checked={value[item.key]}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, [item.key]: e.target.checked })}
              className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-white/25 bg-midnight/80 accent-[#d8bd70]"
            />
            <span>
              <span className="block font-medium text-moon/78">{item.title}</span>
              <span>{item.text}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

