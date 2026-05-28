import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://universe-whisper.vercel.app"),
  title: {
    default: "宇宙偷偷話 Universe Whisper",
    template: "%s | 宇宙偷偷話 Universe Whisper",
  },
  description: "療癒系星座、塔羅牌與宇宙訊息網站，陪你以溫柔方式探索內在感受。",
  openGraph: {
    siteName: "宇宙偷偷話 Universe Whisper",
    title: "宇宙偷偷話 Universe Whisper",
    description: "療癒系星座、塔羅牌與宇宙訊息網站，陪你以溫柔方式探索內在感受。",
    type: "website",
    locale: "zh_TW",
  },
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
