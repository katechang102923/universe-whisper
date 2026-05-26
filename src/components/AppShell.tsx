import Link from "next/link";

const navItems = [
  { href: "/", label: "首頁" },
  { href: "/daily", label: "今日運勢" },
  { href: "/tarot", label: "塔羅抽牌" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="star-field min-h-screen overflow-hidden">
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-8">
        <header className="glass-card sticky top-3 z-20 flex items-center justify-between gap-3 rounded-full px-4 py-3">
          <Link href="/" className="text-sm font-semibold tracking-[0.18em] text-moon sm:text-base">
            宇宙偷偷話
          </Link>
          <nav className="flex items-center gap-1 text-xs text-moon/76 sm:text-sm">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-2.5 py-2 transition hover:bg-white/10 hover:text-moon sm:px-3"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        {children}
      </div>
    </main>
  );
}
