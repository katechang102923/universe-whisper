import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { PageNavActions } from "@/components/PageNavActions";

export const metadata: Metadata = {
  title: "服務條款",
  description: "使用宇宙偷偷話前，請閱讀服務範圍、付費規則、付款授權、退款政策與免責聲明。",
  openGraph: {
    title: "服務條款 | 宇宙偷偷話 Universe Whisper",
    description: "宇宙偷偷話服務範圍、付費規則、付款授權、退款政策與系統異常處理說明。",
  },
};

const terms = [
  "使用本網站即代表您同意本服務條款。",
  "本網站提供塔羅抽牌、星座相關內容、文字解讀、分享圖、LINE 或 Email 收藏等線上服務，實際功能以網站當下提供為準。",
  "本網站內容僅供娛樂、自我探索與心靈陪伴參考，不構成醫療、法律、投資、財務、心理治療或其他專業建議。",
  "使用者應自行判斷內容並承擔依內容採取行動所產生之結果，重大決策請諮詢合格專業人士。",
  "使用者不得以濫用、攻擊、繞過限制、未授權付款或其他不當方式使用本網站。",
  "若使用者未滿 18 歲，應取得法定代理人或監護人同意後再使用本網站與付費服務；付款時亦應確認已取得持卡人或付款工具所有人授權。",
  "付費功能依實際金流規則、付款頁說明與交易紀錄處理，詳見下方退款政策。",
];

const refundItems = [
  {
    title: "數位內容與線上服務特性",
    body: "本服務屬付款後立即產生或提供之個人化數位內容／線上服務。付款完成並開始產生或交付結果後，除系統異常、重複扣款、未成功提供內容或其他合理退款情形外，原則上不提供任意取消或退款。",
  },
  {
    title: "系統異常與合理退款",
    body: "若發生付款成功但內容未正常顯示、重複扣款、系統異常導致結果未產出、兌換碼無法正常使用等情況，請於付款後 24 小時內聯繫客服。客服確認後將依個案狀況協助補發、退款或取消交易。",
  },
  {
    title: "聯繫客服時請提供",
    body: "請提供付款紀錄截圖、交易時間、付款金額、使用裝置、問題描述，以及可協助辨識訂單的資訊。本站將依交易紀錄、內容是否已產出或交付、金流平台規則及相關法令協助處理。",
  },
];

export default function TermsPage() {
  return (
    <AppShell>
      <section className="mx-auto w-full max-w-4xl py-8 sm:py-12">
        <PageNavActions className="mb-6" />
        <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">terms of service</p>
        <h1 className="mt-3 text-4xl font-semibold text-moon sm:text-5xl">服務條款</h1>

        <div className="cosmic-tool-panel mt-8 rounded-[1.75rem] p-5 sm:p-7">
          <ul className="space-y-4 leading-8 text-moon/74">
            {terms.map((item) => <li key={item}>・{item}</li>)}
          </ul>
        </div>

        <div className="cosmic-tool-panel mt-8 rounded-[1.75rem] p-5 sm:p-7">
          <p className="mb-1 text-xs uppercase tracking-[0.22em] text-aurora/70">free &amp; paid</p>
          <h2 className="text-2xl font-semibold text-moon">免費與付費服務</h2>
          <div className="mt-5 space-y-4 leading-8 text-moon/74">
            <p>
              每位使用者每日可免費進行一次塔羅抽牌。每日免費抽牌可依網站當下設定查看對應結果內容，包含完整解讀或頁面實際提供之內容範圍。
            </p>
            <p>
              若使用者希望保存本次結果，可依頁面指示將結果傳送至 Universe Whisper LINE 官方帳號或 Email 收藏。
            </p>
            <p>
              若使用者每日免費次數已使用完畢，或希望額外進行更多次抽牌，可選擇付費解鎖、購買兌換碼或使用既有兌換碼。
            </p>
            <p>
              付費方案：<br />
              ・單次加抽／解鎖：<span className="font-semibold text-[#d8bd70]">NT$49／次</span><br />
              ・兌換碼 5 次方案：<span className="font-semibold text-[#d8bd70]">NT$220</span><br />
              ・兌換碼 10 次方案：<span className="font-semibold text-[#d8bd70]">NT$350</span>
            </p>
            <p>
              付費或使用兌換碼後，系統將提供該次抽牌對應的塔羅文字解讀內容。實際可使用次數、解鎖狀態與有效狀態以系統紀錄為準。
            </p>
          </div>
        </div>

        <div className="cosmic-tool-panel mt-8 rounded-[1.75rem] p-5 sm:p-7">
          <p className="mb-1 text-xs uppercase tracking-[0.22em] text-aurora/70">age &amp; payment authorization</p>
          <h2 className="text-2xl font-semibold text-moon">年齡、監護人同意與付款授權</h2>
          <div className="mt-6 space-y-6 leading-8 text-moon/74">
            <div>
              <h3 className="mb-2 text-base font-semibold text-moon/90">・年齡與監護人同意</h3>
              <p>
                使用者確認使用本網站與付費服務時，已滿 18 歲並具備完全行為能力。
              </p>
              <p className="mt-4">
                若使用者未滿 18 歲，應於使用本網站、進行抽牌、購買付費解鎖、購買兌換碼或使用任何付費功能前，取得法定代理人或監護人之同意。未成年人未經法定代理人或監護人同意而使用本服務或付款者，請由法定代理人、監護人或持卡人儘速聯繫客服協助處理。
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-base font-semibold text-moon/90">・付款方式與持卡人授權</h3>
              <p>
                使用者於本網站進行付款時，應確認自己為付款工具之合法使用人，或已取得持卡人、帳戶所有人或付款工具所有人之明確授權。
              </p>
              <p className="mt-4">
                若發生未經授權使用信用卡、第三方支付、帳戶或其他付款工具之情形，本站得依金流紀錄、訂單狀態、內容產出紀錄、交易時間、使用裝置、IP 紀錄與相關資料進行確認，並依個案狀況協助取消交易、退款、補發內容或停止相關服務。
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-base font-semibold text-moon/90">・未成年人或付款爭議處理</h3>
              <p>
                若法定代理人、監護人或持卡人主張未成年人未經同意付款、付款工具遭未授權使用、重複扣款或其他交易爭議，請透過客服信箱聯繫本站，並提供付款紀錄截圖、交易時間、付款金額、使用裝置與問題說明。
              </p>
              <p className="mt-4">
                為避免爭議，本站建議未成年人應由法定代理人或監護人陪同使用本服務；持卡人亦應妥善保管信用卡、付款帳號、手機驗證碼與相關付款資訊。
              </p>
            </div>
          </div>
        </div>

        <div id="refund-policy" className="cosmic-tool-panel mt-8 scroll-mt-20 rounded-[1.75rem] p-5 sm:p-7">
          <p className="mb-1 text-xs uppercase tracking-[0.22em] text-aurora/70">refund policy</p>
          <h2 className="text-2xl font-semibold text-moon">退款政策與系統異常處理</h2>
          <div className="mt-6 space-y-6">
            {refundItems.map((item) => (
              <div key={item.title}>
                <h3 className="mb-2 text-base font-semibold text-moon/90">・{item.title}</h3>
                <p className="leading-8 text-moon/72">{item.body}</p>
              </div>
            ))}

            <div className="rounded-2xl border border-aurora/20 bg-aurora/5 p-4">
              <p className="mb-1 text-sm font-semibold text-aurora/90">客服信箱</p>
              <a
                href="mailto:ciut0000@gmail.com"
                className="text-base text-moon/80 underline underline-offset-2 transition hover:text-moon"
              >
                ciut0000@gmail.com
              </a>
            </div>
          </div>
        </div>

        <div className="cosmic-tool-panel mt-8 rounded-[1.75rem] p-5 sm:p-7">
          <p className="mb-1 text-xs uppercase tracking-[0.22em] text-aurora/70">disclaimer</p>
          <h2 className="text-2xl font-semibold text-moon">服務性質與免責聲明</h2>
          <p className="mt-5 leading-8 text-moon/74">
            本網站內容僅供娛樂、自我探索與心靈陪伴參考，不構成醫療、法律、投資、財務、心理治療或其他專業建議。本站不保證解讀結果準確、完整或必然發生，使用者應自行判斷並為自身決策負責。
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm text-moon/60">
            完整付款說明、商品資訊與價格請參閱{" "}
            <a href="/payment-info" className="text-aurora/80 underline underline-offset-2 transition hover:text-aurora">
              付款說明頁
            </a>。
          </p>
        </div>
      </section>
    </AppShell>
  );
}
