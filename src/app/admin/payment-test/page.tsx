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

  const USAGE_TABS = [
    { id: "overview", label: "使用統計" },
    { id: "revenue",  label: "收入統計" },
    { id: "orders",   label: "付款訂單" },
    { id: "redeem",   label: "通行碼管理" },
    { id: "fortune",  label: "今日星座" },
    { id: "cleanup",  label: "測試清理" },
  ];

  return (
    <AppShell>
      <section className="mx-auto w-full max-w-2xl py-8 sm:py-12">
        <p className="text-xs uppercase tracking-[0.28em] text-aurora/70">管理員專用</p>
        <h1 className="mt-2 text-2xl font-semibold text-moon sm:text-3xl">付費流程測試</h1>

        {/* Tab 導覽（與 /admin/usage 相同樣式，付費測試高亮） */}
        <div className="mt-6 flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-midnight/50 p-1.5">
          {USAGE_TABS.map((t) => (
            <Link
              key={t.id}
              href={`/admin/usage?tab=${t.id}`}
              className="rounded-xl px-4 py-2 text-sm font-medium transition text-moon/60 hover:bg-white/6 hover:text-moon"
            >
              {t.label}
            </Link>
          ))}
          <span className="rounded-xl px-4 py-2 text-sm font-medium bg-lavender/20 text-lavender">
            付費測試
          </span>
        </div>

        <p className="mt-6 text-sm leading-7 text-moon/55">
          模擬付款成功後的完整流程，不會真的串接綠界，也不會真的收款。
        </p>
        <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300/80 leading-6">
          ⚠️ 測試資料（訂單、解讀、兌換碼）都會標記 <code>isTest: true</code>，
          可在後台 Cleanup tab 統一刪除。兌換碼為真實可用碼，解鎖後會消耗使用次數。
        </div>

        <PaymentTestClient />
      </section>
    </AppShell>
  );
}
