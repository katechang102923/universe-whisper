import { Suspense } from "react";
import PaymentResultClient from "./PaymentResultClient";

export default function PaymentResultPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-lavender/30 border-t-lavender" />
            <p className="text-sm text-moon/55">付款結果確認中...</p>
          </div>
        </div>
      }
    >
      <PaymentResultClient />
    </Suspense>
  );
}
