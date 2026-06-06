import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SESSION_COOKIE_NAME, verifyAdminSessionCookie } from "@/lib/verifyAdmin";
import { getAdminUserIds } from "@/lib/rateLimit";
import PaymentTestClient from "./PaymentTestClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminPaymentTestPage() {
  // ── Admin guard（與 /admin/usage/page.tsx 相同的雙軌驗證）──────────────────
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const isGoogleAdmin = await verifyAdminSessionCookie(sessionCookie);
  const lineUserId = cookieStore.get("line_user_id")?.value ?? null;
  const isLineAdmin = Boolean(lineUserId && getAdminUserIds().includes(lineUserId));

  if (!isGoogleAdmin && !isLineAdmin) redirect("/");

  return (
    <AppShell>
      <section className="mx-auto w-full max-w-2xl py-8 sm:py-12">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/admin/usage"
            className="text-xs text-moon/40 hover:text-moon/70 transition"
          >
            ← 後台首頁
          </Link>
        </div>

        <p className="text-xs uppercase tracking-[0.28em] text-aurora/70">管理員專用</p>
        <h1 className="mt-2 text-2xl font-semibold text-moon sm:text-3xl">付費流程測試</h1>
        <p className="mt-3 text-sm leading-7 text-moon/55">
          這個頁面只用來模擬付款成功後的流程，不會真的串接綠界，也不會真的收款。
        </p>

        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300/80 leading-6">
          ⚠️ 測試資料（訂單、解讀、兌換碼）都會標記 <code>isTest: true</code>，
          可在後台 Cleanup tab 統一刪除。兌換碼為真實可用碼，解鎖後會消耗使用次數。
        </div>

        <PaymentTestClient />
      </section>
    </AppShell>
  );
}
