"use client";

import Link from "next/link";
import { useState } from "react";

const navItems = [
  { href: "/tarot-cards", label: "塔羅牌介紹" },
  { href: "/daily", label: "今日運勢" },
  { href: "/tarot", label: "塔羅抽牌" },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label="開啟導覽選單"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/8 text-moon transition hover:bg-white/12 md:hidden"
      >
        <span className="relative h-4 w-5">
          <span className={`absolute left-0 top-0 h-px w-5 bg-current transition ${open ? "translate-y-2 rotate-45" : ""}`} />
          <span className={`absolute left-0 top-2 h-px w-5 bg-current transition ${open ? "opacity-0" : ""}`} />
          <span className={`absolute left-0 top-4 h-px w-5 bg-current transition ${open ? "-translate-y-2 -rotate-45" : ""}`} />
        </span>
      </button>

      <nav className="hidden items-center gap-1 text-sm text-moon/76 md:flex">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-moon"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {open ? (
        <nav className="absolute right-0 top-12 z-30 w-52 rounded-3xl border border-white/12 bg-midnight/95 p-2 text-sm text-moon shadow-glow backdrop-blur-xl md:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-2xl px-4 py-3 transition hover:bg-white/10"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
