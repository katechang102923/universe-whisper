import { Suspense } from "react";
import type { Metadata } from "next";
import { AstroProfileClient } from "./AstroProfileClient";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "我的三重星座 · 宇宙偷偷話",
  description: "輸入出生資訊，看看你的太陽、月亮與上升三重星座——核心個性、內在情感與外在氣質，延伸查看金星感情吸引力。",
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
