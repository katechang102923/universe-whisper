import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageNavActions } from "@/components/PageNavActions";

/**
 * 公開 SEO 主題頁的共用版型。
 * 用於 /tarot/love、/tarot/work、/tarot/money、/tarot/three-card、/astrology/four-core 等
 * 主題說明頁：提供 H1、自然說明文字、以及導回主要功能的 CTA。
 *
 * 純展示用途，不含抽牌 / 星座計算 / 金流邏輯。
 */
export function TopicLandingPage({
  eyebrow,
  title,
  intro,
  sections,
  ctaHref,
  ctaLabel,
  note,
  relatedLinks,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  sections: { heading: string; body: string }[];
  ctaHref: string;
  ctaLabel: string;
  note?: string;
  relatedLinks?: { href: string; label: string }[];
}) {
  return (
    <AppShell>
      <section className="mx-auto w-full max-w-3xl py-8 sm:py-12">
        <PageNavActions className="mb-6" />
        <article className="overflow-hidden rounded-[2rem] border border-white/12 bg-white/[0.07] px-5 py-8 shadow-[0_24px_80px_rgba(9,10,35,0.34)] backdrop-blur-2xl sm:px-8 sm:py-10 lg:px-12">
          <p className="text-xs uppercase tracking-[0.36em] text-aurora/80">{eyebrow}</p>
          <h1 className="mt-4 text-3xl font-semibold leading-tight text-moon sm:text-4xl">
            {title}
          </h1>
          <p className="mt-6 text-base leading-8 text-moon/80 sm:text-lg">{intro}</p>

          <div className="mt-8 space-y-7">
            {sections.map((s) => (
              <div key={s.heading}>
                <h2 className="text-lg font-semibold text-moon sm:text-xl">{s.heading}</h2>
                <p className="mt-2 text-sm leading-7 text-moon/72 sm:text-base sm:leading-8">
                  {s.body}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-9 flex flex-col items-start gap-3">
            <Link
              href={ctaHref}
              className="inline-flex min-h-[52px] items-center justify-center rounded-full px-8 text-base font-bold text-midnight shadow-[0_18px_50px_rgba(216,189,112,0.34)] transition hover:brightness-110 active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #f7d987 0%, #d8bd70 42%, #cbb8ff 100%)",
              }}
            >
              {ctaLabel}
            </Link>
            {note ? <p className="max-w-xl text-xs leading-6 text-moon/45">{note}</p> : null}
          </div>

          {relatedLinks && relatedLinks.length > 0 ? (
            <div className="mt-9 border-t border-white/10 pt-6">
              <p className="text-xs uppercase tracking-[0.28em] text-moon/40">延伸閱讀</p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                {relatedLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-sm text-lavender/80 underline underline-offset-4 transition hover:text-moon"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </article>
      </section>
    </AppShell>
  );
}
