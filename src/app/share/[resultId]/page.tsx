import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { AppShell } from "@/components/AppShell";
import { PageNavActions } from "@/components/PageNavActions";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { LINE_RESULTS_COLLECTION, type LineResultData } from "@/lib/lineResults";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getShareResult(resultId: string): Promise<(LineResultData & { id: string }) | null> {
  try {
    const db = getAdminDb();
    const snap = await db.collection(LINE_RESULTS_COLLECTION).doc(resultId).get();
    if (!snap.exists) return null;
    return { id: resultId, ...(snap.data() as LineResultData) };
  } catch {
    return null;
  }
}

function buildCardTitle(result: LineResultData): string {
  if (!result.cards.length) return "宇宙偷偷話・塔羅解讀";
  const names = result.cards
    .map((c) => {
      const name = c.nameZh ?? c.name ?? "塔羅牌";
      const ori = c.orientationLabel ? `（${c.orientationLabel}）` : "";
      return `${name}${ori}`;
    })
    .join("、");
  return `我抽到了：${names}`;
}

function cleanText(text: string, maxLen: number): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .trim()
    .slice(0, maxLen);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ resultId: string }>;
}): Promise<Metadata> {
  const { resultId } = await params;
  const result = await getShareResult(resultId);

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://universe-whisper.vercel.app"
  ).replace(/\/$/, "");
  const shareUrl = `${siteUrl}/share/${resultId}`;
  const ogImage = `${siteUrl}/images/hero/main-cosmic-cat.webp`;

  if (!result) {
    return {
      title: "宇宙偷偷話",
      description: "每日塔羅・星座運勢・宇宙給你的訊息",
      openGraph: {
        title: "宇宙偷偷話",
        description: "每日塔羅・星座運勢・宇宙給你的訊息",
        url: siteUrl,
        type: "website",
        images: [{ url: ogImage, width: 800, height: 800 }],
      },
    };
  }

  const title = buildCardTitle(result);
  const rawDesc = result.shortText || result.fullText || "宇宙給你的訊息，點開看完整解讀。";
  const description = cleanText(rawDesc, 120);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: shareUrl,
      type: "website",
      siteName: "宇宙偷偷話",
      images: [{ url: ogImage, width: 800, height: 800 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function ShareResultPage({
  params,
}: {
  params: Promise<{ resultId: string }>;
}) {
  const { resultId } = await params;
  const result = await getShareResult(resultId);

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://universe-whisper.vercel.app"
  ).replace(/\/$/, "");

  if (!result) {
    return (
      <AppShell>
        <section className="mx-auto w-full max-w-2xl py-16 text-center">
          <p className="text-base text-moon/60">找不到這次的宇宙訊息。</p>
          <Link
            href="/tarot"
            className="mt-6 inline-block rounded-full bg-moon px-5 py-3 font-medium text-midnight transition hover:bg-white"
          >
            重新抽牌
          </Link>
        </section>
      </AppShell>
    );
  }

  const cardLine = result.cards
    .map((c) => {
      const pos = c.position ? `${c.position}・` : "";
      const name = c.nameZh ?? c.name ?? "塔羅牌";
      const ori = c.orientationLabel ? `（${c.orientationLabel}）` : "";
      return `${pos}${name}${ori}`;
    })
    .join("　");

  // shortText 顯示摘要，fullText 若有則完整顯示（已解鎖結果）
  const summaryText = cleanText(result.shortText || "", 400);
  const hasFullReading = typeof result.fullText === "string" && result.fullText.trim().length > 0;
  const fullReadingText = hasFullReading
    ? result.fullText.replace(/\*\*/g, "").trim()
    : "";

  return (
    <AppShell>
      <section className="mx-auto w-full max-w-2xl py-8 sm:py-12">
        <PageNavActions className="mb-6" />
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 overflow-hidden rounded-full">
            <Image
              src="/images/hero/main-cosmic-cat.webp"
              alt="宇宙偷偷話"
              fill
              sizes="40px"
              className="object-cover"
            />
          </div>
          <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">宇宙偷偷話・塔羅解讀</p>
        </div>

        <h1 className="mt-4 text-3xl font-semibold text-moon sm:text-4xl">
          {buildCardTitle(result)}
        </h1>

        {result.question ? (
          <p className="mt-2 text-base text-moon/58">問題：{result.question}</p>
        ) : null}

        {/* Cards */}
        {cardLine ? (
          <div className="mt-5 rounded-2xl border border-lavender/20 bg-midnight/38 px-4 py-3">
            <p className="text-sm tracking-[0.12em] text-lavender/80">{cardLine}</p>
          </div>
        ) : null}

        {/* 摘要（free summary） */}
        {summaryText ? (
          <div className="mt-5 rounded-[1.5rem] border border-[#d8bd70]/22 bg-midnight/58 p-5 shadow-glow sm:p-6">
            <p className="mb-3 text-sm tracking-[0.22em] text-[#d8bd70]/78">宇宙給你的訊息</p>
            <p className="whitespace-pre-line text-base leading-8 text-moon/84">
              {summaryText}
            </p>
          </div>
        ) : null}

        {/* 完整解讀（已解鎖時才顯示） */}
        {hasFullReading ? (
          <div className="mt-5 rounded-[1.5rem] border border-lavender/20 bg-midnight/58 p-5 shadow-glow sm:p-6">
            <p className="mb-3 text-sm tracking-[0.22em] text-lavender/70">完整解讀</p>
            <p className="whitespace-pre-line text-base leading-8 text-moon/84">
              {fullReadingText}
            </p>
          </div>
        ) : null}

        {/* CTA */}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/tarot"
            className="rounded-full bg-moon px-5 py-3 font-medium text-midnight transition hover:bg-white"
          >
            我也想抽一張牌
          </Link>
          <Link
            href="/daily"
            className="rounded-full border border-lavender/40 px-5 py-3 text-moon transition hover:bg-white/10"
          >
            看每日星座運勢
          </Link>
          <Link
            href="/tarot/lookup"
            className="rounded-full border border-white/20 px-5 py-3 text-moon/70 transition hover:bg-white/8"
          >
            查詢驗證碼結果
          </Link>
        </div>

        {/* Site branding */}
        <p className="mt-10 text-center text-xs text-moon/28 tracking-[0.18em]">
          {siteUrl.replace(/^https?:\/\//, "")}
        </p>
      </section>
    </AppShell>
  );
}
