import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { PageNavActions } from "@/components/PageNavActions";

export const metadata: Metadata = {
  title: "服務條款",
  description: "使用宇宙偷偷話前，請閱讀服務範圍、責任限制、禁止行為與退款政策說明。",
  openGraph: {
    title: "服務條款 | 宇宙偷偷話 Universe Whisper",
    description: "宇宙偷偷話服務範圍、責任限制、禁止行為、退款政策與系統異常處理說明。",
  },
};

const terms = [
  "使用本網站即代表您同意本服務條款。",
  "本網站提供塔羅、星座與自我探索內容。",
  "內容僅供娛樂與心理療癒參考，不保證結果準確。",
  "本網站內容不可用於醫療、法律、投資或重大人生決策。",
  "使用者需自行承擔使用本網站內容與服務後的判斷與結果。",
  "禁止濫用、攻擊、爬蟲、惡意重複請求或以任何方式干擾服務。",
  "付費功能依實際金流規則、付款頁說明與交易紀錄處理，詳見下方退款政策。",
  "若使用者未滿 18 歲，應取得法定代理人或監護人同意後再使用本網站與付費服務；付款時亦應確認已取得持卡人或付款工具所有人授權。",
  "本站保留修改服務內容與條款之權利。",
];

const refundItems = [
  {
    title: "數位內容性質",
    body: "本服務提供即時產生之數位內容，包含但不限於塔羅牌解讀、宇宙訊息、個人化文字內容與相關結果頁面。",
  },
  {
    title: "成功產出後不接受退費",
    body: "付款完成後，若系統已成功產出、顯示或發送解讀內容，因數位內容具有即時提供、不可返還及個人化特性，恕不接受退費。",
  },
  {
    title: "可申請客服協助的情況",
    body: "若發生以下情況，請於付款後 24 小時內聯繫客服並提供付款紀錄：",
    list: [
      "付款成功但未收到完整內容",
      "系統異常導致結果未產出",
      "LINE 傳送失敗且無法重新取得內容",
      "重複扣款或異常扣款",
    ],
  },
  {
    title: "客服處理方式",
    body: "客服確認後，將以 Email 人工協助重新提供本次完整解讀內容。若確認無法重新提供內容，將協助退款或取消交易。",
  },
];

export default function TermsPage() {
  return (
    <AppShell>
      <section className="mx-auto w-full max-w-4xl py-8 sm:py-12">
        <PageNavActions className="mb-6" />
        <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">terms of service</p>
        <h1 className="mt-3 text-4xl font-semibold text-moon sm:text-5xl">服務條款</h1>

        {/* 一般條款 */}
        <div className="cosmic-tool-panel mt-8 rounded-[1.75rem] p-5 sm:p-7">
          <ul className="space-y-4 leading-8 text-moon/74">
            {terms.map((item) => <li key={item}>・{item}</li>)}
          </ul>
        </div>

        {/* 免費與付費服務 */}
        <div className="cosmic-tool-panel mt-8 rounded-[1.75rem] p-5 sm:p-7">
          <p className="mb-1 text-xs uppercase tracking-[0.22em] text-aurora/70">free &amp; paid</p>
          <h2 className="text-2xl font-semibold text-moon">免費與付費服務</h2>
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

        {/* 年齡、監護人同意與付款授權 */}
        <div className="cosmic-tool-panel mt-8 rounded-[1.75rem] p-5 sm:p-7">
          <p className="mb-1 text-xs uppercase tracking-[0.22em] text-aurora/70">age &amp; payment authorization</p>
          <h2 className="text-2xl font-semibold text-moon">年齡、監護人同意與付款授權</h2>
          <div className="mt-6 space-y-6 leading-8 text-moon/74">
            <div>
              <h3 className="mb-2 text-base font-semibold text-moon/90">・年齡與監護人同意</h3>
              <div className="space-y-4">
                <p>
                  使用者確認使用本網站與付費服務時，已滿 18 歲並具備完全行為能力。
                </p>
                <p>
                  若使用者未滿 18 歲，應於使用本網站、進行抽牌、購買付費解鎖、購買兌換碼或使用任何付費功能前，取得法定代理人或監護人之同意。未成年人未經法定代理人或監護人同意而使用本服務或付款者，請由法定代理人、監護人或持卡人儘速聯繫客服協助處理。
                </p>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-base font-semibold text-moon/90">・付款方式與持卡人授權</h3>
              <div className="space-y-4">
                <p>
                  使用者於本網站進行付款時，應確認自己為付款工具之合法使用人，或已取得持卡人、帳戶所有人或付款工具所有人之明確授權。
                </p>
                <p>
                  若發生未經授權使用信用卡、第三方支付、帳戶或其他付款工具之情形，本站得依金流紀錄、訂單狀態、內容產出紀錄、交易時間、使用裝置、IP 紀錄與相關資料進行確認，並依個案狀況協助取消交易、退款、補發內容或停止相關服務。
                </p>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-base font-semibold text-moon/90">・未成年人或付款爭議處理</h3>
              <div className="space-y-4">
                <p>
                  若法定代理人、監護人或持卡人主張未成年人未經同意付款、付款工具遭未授權使用、重複扣款或其他交易爭議，請透過客服信箱聯繫本站，並提供付款紀錄截圖、交易時間、付款金額、使用裝置與問題說明。
                </p>
                <p>
                  本站將依交易紀錄、內容是否已產出或交付、金流平台規則及相關法令協助處理。若確認屬於系統異常、重複扣款、未成功提供內容或其他合理退款情形，本站將協助退款或取消交易。
                </p>
                <p>
                  為避免爭議，本站建議未成年人應由法定代理人或監護人陪同使用本服務；持卡人亦應妥善保管信用卡、付款帳號、手機驗證碼與相關付款資訊。
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 退款政策與系統異常處理 */}
        <div id="refund" className="cosmic-tool-panel mt-8 rounded-[1.75rem] p-5 sm:p-7 scroll-mt-20">
          <p className="mb-1 text-xs uppercase tracking-[0.22em] text-aurora/70">refund policy</p>
          <h2 className="text-2xl font-semibold text-moon">退款政策與系統異常處理</h2>
          <div className="mt-6 space-y-6">
            {refundItems.map((item) => (
              <div key={item.title}>
                <h3 className="mb-2 text-base font-semibold text-moon/90">・{item.title}</h3>
                <p className="leading-8 text-moon/72">{item.body}</p>
                {item.list && (
                  <ul className="mt-2 space-y-1 leading-8 text-moon/72">
                    {item.list.map((l) => (
                      <li key={l} className="pl-4 before:mr-1 before:content-['—']">{l}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}

            {/* 客服信箱 */}
            <div className="rounded-2xl border border-aurora/20 bg-aurora/5 p-4">
              <p className="text-sm font-semibold text-aurora/90 mb-1">客服信箱</p>
              <a
                href="mailto:ciut0000@gmail.com"
                className="text-base text-moon/80 underline underline-offset-2 transition hover:text-moon"
              >
                ciut0000@gmail.com
              </a>
              <p className="mt-2 text-xs leading-6 text-moon/52">
                聯繫時請提供：付款紀錄截圖、問題描述、使用裝置與時間，以便我們盡快確認並協助你。
              </p>
            </div>
          </div>
        </div>

        {/* 服務性質與免責聲明 */}
        <div className="cosmic-tool-panel mt-8 rounded-[1.75rem] p-5 sm:p-7">
          <p className="mb-1 text-xs uppercase tracking-[0.22em] text-aurora/70">disclaimer</p>
          <h2 className="text-2xl font-semibold text-moon">服務性質與免責聲明</h2>
          <p className="mt-5 leading-8 text-moon/74">
            本服務內容僅供娛樂、自我探索與心靈陪伴參考，不作為醫療、法律、投資、財務、心理治療或其他專業決策依據。使用者仍應依自身情況理性判斷，必要時請諮詢相關專業人士。
          </p>
        </div>

        {/* 付款說明連結 */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm text-moon/60">
            完整付款說明、商品資訊與價格請參閱
            {" "}
            <a href="/payment-info" className="text-aurora/80 underline underline-offset-2 transition hover:text-aurora">
              付款說明頁
            </a>。
          </p>
        </div>
      </section>
    </AppShell>
  );
}
