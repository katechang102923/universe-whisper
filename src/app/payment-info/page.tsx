import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { PageNavActions } from "@/components/PageNavActions";

export const metadata: Metadata = {
  title: "付款說明 | Universe Whisper 宇宙塔羅",
  description: "Universe Whisper 宇宙塔羅完整解讀付款說明：每日免費一次基礎抽牌，完整解讀 NT$49／次，含退款政策與客服資訊。",
  openGraph: {
    title: "付款說明 | Universe Whisper 宇宙偷偷話",
    description: "每日免費一次基礎塔羅抽牌；完整解讀 NT$49／次，付款完成後網站結果頁立即顯示。",
  },
};

export default function PaymentInfoPage() {
  return (
    <AppShell>
      <section className="mx-auto w-full max-w-4xl py-8 sm:py-12">
        <PageNavActions className="mb-6" />
        <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">payment info</p>
        <h1 className="mt-3 text-4xl font-semibold text-moon sm:text-5xl">付款說明</h1>

        {/* 商品資訊 */}
        <div className="cosmic-tool-panel mt-8 rounded-[1.75rem] p-5 sm:p-7">
          <p className="mb-1 text-xs uppercase tracking-[0.22em] text-aurora/70">product</p>
          <h2 className="text-2xl font-semibold text-moon">Universe Whisper｜宇宙塔羅完整解讀</h2>

          <div className="mt-6 space-y-5 leading-8 text-moon/74">
            <div>
              <p className="text-sm font-semibold text-moon/90">商品名稱</p>
              <p>Universe Whisper｜宇宙塔羅完整解讀</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-moon/90">服務內容</p>
              <p>
                使用者完成塔羅抽牌後，系統將依照使用者選擇的牌陣、問題內容與抽到的牌，產生個人化塔羅文字解讀。
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-moon/90">付費方案</p>
              <p className="leading-9">
                單次完整解鎖：<span className="font-semibold text-[#d8bd70]">NT$49／次</span><br />
                兌換碼 5 次方案：<span className="font-semibold text-[#d8bd70]">NT$220</span><br />
                兌換碼 10 次方案：<span className="font-semibold text-[#d8bd70]">NT$350</span>
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-moon/90">交付方式</p>
              <p>
                完成 LINE 驗證、付費解鎖或使用兌換碼後，完整解讀將於網站結果頁顯示。使用者也可依頁面提供的功能，將本次結果傳送至 LINE 官方帳號或 Email 收藏。
              </p>
              <p className="mt-3">
                若因系統異常導致付款成功但內容未正常顯示，使用者可於付款後 24 小時內聯繫客服並提供付款紀錄，客服確認後將協助補發本次完整解讀內容；若確認無法補發，將協助退款或取消交易。
              </p>
            </div>
          </div>
        </div>

        {/* 免費與付費規則 */}
        <div className="cosmic-tool-panel mt-8 rounded-[1.75rem] p-5 sm:p-7">
          <p className="mb-1 text-xs uppercase tracking-[0.22em] text-aurora/70">free &amp; paid</p>
          <h2 className="text-2xl font-semibold text-moon">免費與付費規則</h2>

          <div className="mt-5 space-y-4 leading-8 text-moon/74">
            <p>
              每位使用者每日可免費進行一次基礎塔羅抽牌，並查看頁面提供的免費內容。免費內容範圍以網站當下顯示為準。
            </p>
            <p>
              若使用者希望查看本次塔羅的完整解讀，可選擇加入 Universe Whisper LINE 官方帳號，並依頁面指示完成驗證碼傳送，即可解鎖本次完整解讀內容。
            </p>
            <p>
              若使用者不想透過 LINE 解鎖，或希望額外進行完整解讀，可選擇以下付費方式：
            </p>
            <p>
              ・單次解鎖：<span className="font-semibold text-[#d8bd70]">NT$49／次</span><br />
              ・兌換碼 5 次方案：<span className="font-semibold text-[#d8bd70]">NT$220</span><br />
              ・兌換碼 10 次方案：<span className="font-semibold text-[#d8bd70]">NT$350</span>
            </p>
            <p>
              付費或使用兌換碼解鎖後，系統將提供本次抽牌對應的完整塔羅文字解讀內容。兌換碼可依購買方案使用指定次數，實際可使用次數與有效狀態以系統紀錄為準。
            </p>
          </div>
        </div>

        {/* 退款政策 */}
        <div id="refund" className="cosmic-tool-panel mt-8 rounded-[1.75rem] p-5 sm:p-7 scroll-mt-20">
          <p className="mb-1 text-xs uppercase tracking-[0.22em] text-aurora/70">refund policy</p>
          <h2 className="text-2xl font-semibold text-moon">退款政策</h2>

          <div className="mt-6 space-y-5 leading-8 text-moon/74">
            <p>
              本服務為即時產生之數位內容，包含但不限於塔羅牌解讀、宇宙訊息、個人化文字內容與相關結果頁面。
            </p>
            <p>
              付款完成後，若系統已成功產出、顯示或發送解讀內容，因數位內容具有即時提供、不可返還及個人化特性，恕不接受退費。
            </p>

            <div>
              <p className="text-sm font-semibold text-moon/90 mb-2">可申請客服協助的情況</p>
              <p>若發生以下情況，請於付款後 24 小時內聯繫客服並提供付款紀錄：</p>
              <ul className="mt-2 space-y-1">
                {[
                  "付款成功但未收到完整內容",
                  "系統異常導致結果未產出",
                  "LINE 傳送失敗且無法重新取得內容",
                  "重複扣款或異常扣款",
                ].map((item) => (
                  <li key={item} className="pl-4 before:mr-1 before:content-['—']">{item}</li>
                ))}
              </ul>
            </div>

            <p>
              客服確認後，將以 Email 人工協助重新提供本次完整解讀內容。若確認無法重新提供內容，將協助退款或取消交易。
            </p>
          </div>
        </div>

        {/* 服務性質免責聲明 */}
        <div className="cosmic-tool-panel mt-8 rounded-[1.75rem] p-5 sm:p-7">
          <p className="mb-1 text-xs uppercase tracking-[0.22em] text-aurora/70">disclaimer</p>
          <h2 className="text-2xl font-semibold text-moon">服務性質與免責聲明</h2>
          <p className="mt-5 leading-8 text-moon/74">
            本服務內容僅供娛樂、自我探索與心靈陪伴參考，不作為醫療、法律、投資、財務、心理治療或其他專業決策依據。使用者仍應依自身情況理性判斷，必要時請諮詢相關專業人士。
          </p>
        </div>

        {/* 客服信箱 */}
        <div className="mt-8 rounded-2xl border border-aurora/20 bg-aurora/5 p-5 sm:p-6">
          <p className="text-sm font-semibold text-aurora/90 mb-1">客服信箱</p>
          <a
            href="mailto:ciut0000@gmail.com"
            className="text-base text-moon/80 underline underline-offset-2 transition hover:text-moon"
          >
            ciut0000@gmail.com
          </a>
          <p className="mt-2 text-xs leading-6 text-moon/52">
            服務名稱：Universe Whisper 宇宙塔羅。聯繫時請提供付款紀錄截圖、問題描述與使用時間，以便我們盡快確認並協助你。
          </p>
        </div>
      </section>
    </AppShell>
  );
}
