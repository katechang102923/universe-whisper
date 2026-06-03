import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getAdminUserIds } from "@/lib/rateLimit";
import {
  REDEEM_CODES_COLLECTION,
  REDEEM_PLANS,
  type RedeemCodeData,
} from "@/lib/redeemCodes";
import RedeemCodeGenerator from "./RedeemCodeGenerator";
import {
  SESSION_COOKIE_NAME,
  verifyAdminSessionCookie,
} from "@/lib/verifyAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function listRecentCodes(): Promise<RedeemCodeData[]> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection(REDEEM_CODES_COLLECTION)
      .orderBy("createdAt", "desc")
      .limit(30)
      .get();
    return snap.docs.map((d) => d.data() as RedeemCodeData);
  } catch {
    return [];
  }
}

function statusLabel(status: RedeemCodeData["status"]) {
  const map = {
    active: { text: "使用中", cls: "bg-aurora/14 text-aurora" },
    used_up: { text: "已用完", cls: "bg-red-500/14 text-red-300" },
    expired: { text: "已過期", cls: "bg-white/8 text-moon/40" },
    disabled: { text: "已停用", cls: "bg-white/8 text-moon/40" },
  };
  return map[status] ?? { text: status, cls: "bg-white/8 text-moon/40" };
}

export default async function AdminRedeemCodesPage() {
  // ── 管理員驗證（Google session cookie 或 LINE cookie）─────────────────────
  const cookieStore = await cookies();

  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const isGoogleAdmin = await verifyAdminSessionCookie(sessionCookie);

  const lineUserId = cookieStore.get("line_user_id")?.value ?? null;
  const isLineAdmin = Boolean(lineUserId && getAdminUserIds().includes(lineUserId));

  if (!isGoogleAdmin && !isLineAdmin) {
    redirect("/");
  }

  const codes = await listRecentCodes();

  return (
    <AppShell>
      <section className="mx-auto w-full max-w-4xl py-8 sm:py-12">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">
              admin · 後台
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-moon sm:text-4xl">
              宇宙通行碼管理
            </h1>
          </div>
          <Link
            href="/admin/usage"
            className="mt-1 rounded-full border border-white/12 bg-white/8 px-5 py-2.5 text-sm text-moon transition hover:bg-white/14"
          >
            ← 使用統計
          </Link>
        </div>

        {/* 方案說明 */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {(
            Object.entries(REDEEM_PLANS) as [
              keyof typeof REDEEM_PLANS,
              (typeof REDEEM_PLANS)[keyof typeof REDEEM_PLANS],
            ][]
          ).map(([key, plan]) => (
            <div
              key={key}
              className="rounded-2xl border border-white/10 bg-midnight/50 p-4"
            >
              <p className="text-sm font-semibold text-moon">{plan.displayName}</p>
              <p className="mt-1 text-xs text-moon/50">{plan.description}</p>
              <p className="mt-2 text-lg font-bold text-aurora">
                NT${plan.price}
                <span className="ml-1 text-xs font-normal text-moon/44">
                  · {plan.totalUses} 次 · 60 天有效
                </span>
              </p>
            </div>
          ))}
        </div>

        {/* 產生器 */}
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-moon">產生新兌換碼</h2>
          <RedeemCodeGenerator />
        </div>

        {/* 最近 30 筆兌換碼列表 */}
        <div className="mt-10">
          <h2 className="mb-4 text-lg font-semibold text-moon">
            最近兌換碼（前 30 筆）
          </h2>

          {codes.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-midnight/50 p-5">
              <p className="text-sm text-moon/44">尚無兌換碼紀錄。</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/8 text-left">
                      {["兌換碼", "方案", "剩餘", "狀態", "到期日", "使用次數"].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-moon/44"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {codes.map((c, i) => {
                      const { text, cls } = statusLabel(c.status);
                      const expiry =
                        c.expiresAt instanceof Date
                          ? c.expiresAt
                          : (
                              c.expiresAt as import("firebase-admin/firestore").Timestamp
                            ).toDate();
                      return (
                        <tr
                          key={c.code}
                          className={
                            i < codes.length - 1 ? "border-b border-white/6" : ""
                          }
                        >
                          <td className="px-4 py-3 font-mono text-xs tracking-[0.14em] text-moon/90">
                            {c.code}
                          </td>
                          <td className="px-4 py-3 text-moon/70">
                            {c.displayName}
                          </td>
                          <td className="px-4 py-3 font-semibold text-moon">
                            {c.remainingUses}
                            <span className="text-moon/40 font-normal">
                              /{c.totalUses}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs ${cls}`}
                            >
                              {text}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-moon/50">
                            {expiry.toLocaleDateString("zh-TW")}
                          </td>
                          <td className="px-4 py-3 text-moon/60">
                            {(c.usedLogs ?? []).length} 筆
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-moon/28">
          資料來源：Firestore › {REDEEM_CODES_COLLECTION}
        </p>
      </section>
    </AppShell>
  );
}
