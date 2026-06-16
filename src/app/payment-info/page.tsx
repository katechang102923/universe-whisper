import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { PageNavActions } from "@/components/PageNavActions";

export const metadata: Metadata = {
  title: "付款說明 | Universe Whisper 宇宙塔羅",
  description: "Universe Whisper 宇宙塔羅解讀服務付款方案、交付方式、系統異常與客服資訊。",
  alternates: { canonical: "/payment-info" },
  openGraph: {
    title: "付款說明 | Universe Whisper 宇宙偷偷話",
    description: "Universe Whisper 宇宙塔羅解讀服務付款方案、交付方式、系統異常與客服資訊。",
  },
};

export default function PaymentInfoPage() {
  return (
    <AppShell>
      <section className="mx-auto w-full max-w-4xl py-8 sm:py-12">
        <PageNavActions className="mb-6" />
        <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">payment info</p>
        <h1 className="mt-3 text-4xl font-semibold text-moon sm:text-5xl">付款說明</h1>

        <div className="cosmic-tool-panel mt-8 rounded-[1.75rem] p-5 sm:p-7">
          <p className="mb-1 text-xs uppercase tracking-[0.22em] text-aurora/70">product</p>
          <h2 className="text-2xl font-semibold text-moon">Universe Whisper｜宇宙塔羅解讀服務</h2>

          <div className="mt-6 space-y-6 leading-8 text-moon/74">
            <div>
              <p className="text-sm font-semibold text-moon/90">商品名稱：</p>
              <p>Universe Whisper｜宇宙塔羅解讀服務</p>
            </div>

            <div>
              <p className="text-sm font-semibold text-moon/90">服務內容：</p>
              <p>
                使用者完成塔羅抽牌後，系統將依照使用者選擇的牌陣、問題內容與抽到的牌，產生個人化塔羅文字解讀。
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-moon/90">付費方案：</p>
              <p className="leading-9">
                ・單次加抽／解鎖：<span className="font-semibold text-[#d8bd70]">NT$49／次</span><br />
                ・兌換碼 5 次方案：<span className="font-semibold text-[#d8bd70]">NT$220</span><br />
                ・兌換碼 10 次方案：<span className="font-semibold text-[#d8bd70]">NT$350</span>
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-moon/90">交付方式：</p>
              <p>
                付款成功、使用兌換碼或完成頁面指定流程後，解讀內容將於網站結果頁顯示。使用者也可依頁面提供的功能，將本次結果傳送至 LINE 官方帳號或 Email 收藏。
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-moon/90">系統異常：</p>
              <p>
                若發生付款成功但內容未正常顯示、重複扣款、系統異常導致結果未產出等情況，請於付款後 24 小時內聯繫客服，並提供付款紀錄截圖、問題描述、使用裝置與時間。客服確認後將協助補發、退款或取消交易。
              </p>
            </div>
          </div>
        </div>

        <div className="cosmic-tool-panel mt-8 rounded-[1.75rem] p-5 sm:p-7">
          <p className="mb-1 text-xs uppercase tracking-[0.22em] text-aurora/70">related policies</p>
          <h2 className="text-2xl font-semibold text-moon">相關規則</h2>
          <div className="mt-5 space-y-3 leading-8 text-moon/74">
            <p>
              完整退款規則請參閱：{" "}
              <a href="/terms#refund-policy" className="text-aurora/80 underline underline-offset-2 transition hover:text-aurora">
                /terms#refund-policy
              </a>
            </p>
            <p>
              完整服務條款請參閱：{" "}
              <a href="/terms" className="text-aurora/80 underline underline-offset-2 transition hover:text-aurora">
                /terms
              </a>
            </p>
            <p>
              隱私政策請參閱：{" "}
              <a href="/privacy" className="text-aurora/80 underline underline-offset-2 transition hover:text-aurora">
                /privacy
              </a>
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-aurora/20 bg-aurora/5 p-5 sm:p-6">
          <p className="mb-1 text-sm font-semibold text-aurora/90">客服信箱：</p>
          <a
            href="mailto:ciut0000@gmail.com"
            className="text-base text-moon/80 underline underline-offset-2 transition hover:text-moon"
          >
            ciut0000@gmail.com
          </a>
        </div>
      </section>
    </AppShell>
  );
}
