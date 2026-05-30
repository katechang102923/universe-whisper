import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { PageNavActions } from "@/components/PageNavActions";

export const metadata: Metadata = {
  title: "隱私政策",
  description: "了解宇宙偷偷話可能收集的資料、使用目的與使用者權利。",
  openGraph: {
    title: "隱私政策 | 宇宙偷偷話 Universe Whisper",
    description: "了解宇宙偷偷話的資料收集、使用目的與使用者權利。",
  },
};

export default function PrivacyPage() {
  return (
    <AppShell>
      <section className="mx-auto w-full max-w-4xl py-8 sm:py-12">
        <PageNavActions className="mb-6" />
        <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">privacy policy</p>
        <h1 className="mt-3 text-4xl font-semibold text-moon sm:text-5xl">隱私政策</h1>

        <div className="mt-8 space-y-5">

          {/* 收集資料 */}
          <article className="cosmic-tool-panel rounded-[1.75rem] p-5">
            <h2 className="text-2xl font-semibold text-moon">本網站可能收集的資料</h2>
            <ul className="mt-4 space-y-2 leading-7 text-moon/72">
              <li>・使用者輸入的問題內容</li>
              <li>・瀏覽器識別碼與 Cookie</li>
              <li>・裝置與瀏覽器基本資訊</li>
            </ul>
          </article>

          {/* 使用目的 */}
          <article className="cosmic-tool-panel rounded-[1.75rem] p-5">
            <h2 className="text-2xl font-semibold text-moon">資料使用目的</h2>
            <ul className="mt-4 space-y-2 leading-7 text-moon/72">
              <li>・提供塔羅與每日運勢服務</li>
              <li>・防止濫用，維護服務品質</li>
              <li>・改善網站體驗</li>
              <li>・廣告與流量分析</li>
            </ul>
          </article>

          {/* 第三方服務（模糊化） */}
          <article className="cosmic-tool-panel rounded-[1.75rem] p-5">
            <h2 className="text-2xl font-semibold text-moon">外部服務說明</h2>
            <p className="mt-3 leading-8 text-moon/72">
              本網站可能使用必要的網站分析、廣告投放與訊息傳送服務，以提供更完整的使用體驗。這些服務可能依其自身隱私政策收集相關資料，建議您亦參閱各平台說明。
            </p>
          </article>

          {/* Cookie */}
          <article className="cosmic-tool-panel rounded-[1.75rem] p-5">
            <h2 className="text-2xl font-semibold text-moon">Cookie 與追蹤技術</h2>
            <p className="mt-3 leading-8 text-moon/72">
              本網站使用 Cookie 記錄您的偏好設定（例如上次選擇的星座）與基本使用狀態。您可透過瀏覽器設定管理或停用 Cookie，但部分功能可能因此受限。
            </p>
          </article>

          {/* 使用者權利 */}
          <article className="cosmic-tool-panel rounded-[1.75rem] p-5">
            <h2 className="text-2xl font-semibold text-moon">資料保護與使用者權利</h2>
            <p className="mt-3 leading-8 text-moon/72">
              本網站不販售個人資料。您可就個人資料查詢、更正、刪除或停止使用等需求與我們聯絡；我們會在合理範圍內協助處理。
            </p>
            <p className="mt-3 leading-8 text-moon/72">
              如有任何隱私權問題，請聯絡：
              <a
                href="mailto:ciut0000@gmail.com"
                className="text-[#d8bd70] underline decoration-[#d8bd70]/40 underline-offset-4"
              >
                ciut0000@gmail.com
              </a>
            </p>
          </article>

        </div>
      </section>
    </AppShell>
  );
}
