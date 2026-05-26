import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "宇宙偷偷話",
  description: "療癒系星座與宇宙塔羅 LINE Bot + Web App"
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
