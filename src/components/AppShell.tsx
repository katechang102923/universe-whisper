import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { AdminFooterLink } from "@/components/AdminFooterLink";
import { TrafficAnalyticsTracker } from "@/components/TrafficAnalyticsTracker";

const footerLinks = [
  { href: "/tarot-cards", label: "塔羅牌介紹" },
  { href: "/payment-info", label: "付款說明" },
  { href: "/privacy", label: "隱私政策" },
  { href: "/terms", label: "服務條款" },
  { href: "/terms#refund-policy", label: "退款政策" },
  { href: "/contact", label: "聯絡我們" },
  { href: "/disclaimer", label: "娛樂聲明" },
];

export function AppShell({
  children,
  adminMode = false,
}: {
  children: React.ReactNode;
  adminMode?: boolean;
}) {
  return (
    <main className={`star-field min-h-screen overflow-hidden ${adminMode ? "admin-shell" : ""}`}>
      <TrafficAnalyticsTracker />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-8">
        <header className="glass-card sticky top-3 z-20 flex items-center justify-between gap-3 rounded-full px-4 py-3">
          <Link href="/" className="text-sm font-semibold tracking-[0.18em] text-moon sm:text-base">
            宇宙偷偷話
          </Link>
          <SiteNav />
        </header>
        {children}
        <footer className={`mt-auto border-t border-white/10 text-sm text-moon/62 ${adminMode ? "py-4" : "py-8"}`}>
          {adminMode ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-moon/42">
              <span>宇宙偷偷話 · 後台管理</span>
              <nav className="flex gap-4">
                <Link href="/" className="transition hover:text-moon">回到前台</Link>
                <Link href="/admin/usage" className="transition hover:text-moon">後台總覽</Link>
              </nav>
            </div>
          ) : (
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-semibold tracking-[0.18em] text-moon">宇宙偷偷話 Universe Whisper</p>
                <p className="mt-2 max-w-2xl leading-7">
                  內容僅供娛樂、自我探索與心靈陪伴參考，不構成醫療、法律、投資、財務或心理治療等專業建議。
                </p>
                <p className="mt-2 text-moon/60">
                  客服信箱：{" "}
                  <a href="mailto:ciut0000@gmail.com" className="underline underline-offset-2 transition hover:text-moon">
                    ciut0000@gmail.com
                  </a>
                </p>
                <AdminFooterLink />
              </div>
              <nav className="flex flex-wrap gap-x-4 gap-y-2 md:justify-end">
                {footerLinks.map((item) => (
                  <Link key={item.href} href={item.href} className="transition hover:text-moon">
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          )}
        </footer>
      </div>
    </main>
  );
}
