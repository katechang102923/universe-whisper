import Link from "next/link";
import { type ReactNode } from "react";

interface FeatureCardProps {
  /** Tailwind gradient utility classes for the 4 px top accent bar, e.g. "from-lavender/40 to-nebula/24" */
  gradient: string;
  /** Small icon rendered inside the icon slot (16–20 px SVG recommended) */
  icon: ReactNode;
  title: string;
  description: string;
  href: string;
  /** Optional pill badge such as "免費" */
  badge?: string;
}

export function FeatureCard({ gradient, icon, title, description, href, badge }: FeatureCardProps) {
  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-[1.75rem] border border-white/10 bg-midnight/54 shadow-[0_18px_54px_rgba(4,7,26,0.22)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-2 hover:border-white/22 hover:shadow-[0_12px_48px_rgba(203,184,255,0.28)]"
    >
      {/* Top gradient accent bar */}
      <div className={`h-1 bg-gradient-to-r ${gradient}`} />

      <div className="p-5 sm:p-6">
        {/* Icon container */}
        <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/12 bg-white/8 shadow-[0_10px_24px_rgba(4,7,26,0.14)]">
          {icon}
        </div>

        {/* Title + optional badge */}
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-moon">{title}</h3>
          {badge ? (
            <span className="rounded-full border border-aurora/38 bg-aurora/12 px-2 py-0.5 text-xs text-aurora">
              {badge}
            </span>
          ) : null}
        </div>

        {/* Description */}
        <p className="mt-1.5 text-sm leading-6 text-moon/60">{description}</p>

        {/* Animated arrow CTA */}
        <div className="mt-4 flex items-center gap-1 text-xs text-lavender/60 transition-colors group-hover:text-lavender">
          <span>前往</span>
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </div>
      </div>
    </Link>
  );
}
