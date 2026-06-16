import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://universe-whisper.vercel.app";

// 只列出實際存在的公開頁面
const routes = [
  "", // 首頁
  "/tarot",
  "/astro-profile",
  "/daily",
  "/tarot-cards",
  "/terms",
  "/privacy",
  "/payment-info",
  "/contact",
  "/disclaimer",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return routes.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
  }));
}
