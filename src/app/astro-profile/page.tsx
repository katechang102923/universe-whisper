import type { Metadata } from "next";
import { AstroProfileClient } from "./AstroProfileClient";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "我的三重星座 · 宇宙偷偷話",
  description: "輸入生日，選擇你的上升與金星，看看今天太陽、上升、金星三層能量想提醒你什麼。",
};

export default function AstroProfilePage() {
  return (
    <AppShell>
      <AstroProfileClient />
    </AppShell>
  );
}
