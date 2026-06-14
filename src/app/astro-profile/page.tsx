import { Suspense } from "react";
import type { Metadata } from "next";
import { AstroProfileClient } from "./AstroProfileClient";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "四核心星座解析 · 宇宙偷偷話",
  description: "輸入出生資訊，免費看你的太陽、月亮、上升與金星四核心星座——核心個性、內在情感、外在氣質與感情吸引力；可升級完整星盤人格解析。",
};

export default function AstroProfilePage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="min-h-screen" />}>
        <AstroProfileClient />
      </Suspense>
    </AppShell>
  );
}
