"use client";

import { useState } from "react";

type TestResult = {
  orderId: string;
  merchantTradeNo: string;
  resultId: string;
  resultUrl: string;
  lookupCode: string;
  redeemCode: string;
  displayName: string;
  totalUses: number;
  remainingUses: number;
  expiresAt: string;
  emailSent: boolean;
  emailTo: string | null;
  emailMessageId: string | null;
  emailError: string | null;
  debug: {
    fulfillFunction: string;
    emailFunction: string;
    isTest: boolean;
    source: string;
    paymentMethod: string;
  };
};

export default function PaymentTestClient() {
  const [email, setEmail]         = useState("");
  const [question, setQuestion]   = useState("我接下來的感情會如何？");
  const [mode, setMode]           = useState<"single_tarot" | "three_card">("single_tarot");
  const [sendEmail, setSendEmail] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [result, setResult]       = useState<TestResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/admin/payment-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, question, mode, amount: 49, sendEmail }),
      });
      const data = await res.json() as { ok: boolean; error?: string; detail?: string } & Partial<TestResult>;
      if (!data.ok) {
        setError(data.detail || data.error || "發生錯誤");
      } else {
        setResult(data as TestResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "網路錯誤");
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text: string) {
    void navigator.clipboard.writeText(text);
  }

  return (
    <div className="mt-8 space-y-6">
      {/* ── 表單 ── */}
      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-moon/80 mb-1.5">
            測試 Email <span className="text-aurora">*</span>
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="test@example.com"
            className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-moon placeholder:text-moon/30 focus:border-lavender/50 focus:outline-none"
          />
        </div>

        {/* Question */}
        <div>
          <label className="block text-sm font-medium text-moon/80 mb-1.5">測試問題文字</label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="例如：我接下來的感情會如何？"
            className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-moon placeholder:text-moon/30 focus:border-lavender/50 focus:outline-none"
          />
        </div>

        {/* Mode */}
        <div>
          <label className="block text-sm font-medium text-moon/80 mb-1.5">抽牌類型</label>
          <div className="flex gap-3">
            {(["single_tarot", "three_card"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  mode === m
                    ? "bg-lavender/30 border border-lavender/50 text-moon"
                    : "border border-white/15 text-moon/50 hover:border-white/30"
                }`}
              >
                {m === "single_tarot" ? "單張牌" : "三張牌"}
              </button>
            ))}
          </div>
        </div>

        {/* Amount (readonly) */}
        <div>
          <label className="block text-sm font-medium text-moon/80 mb-1.5">模擬付款金額</label>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-moon/50 w-32">
            NT$49
          </div>
        </div>

        {/* Send Email checkbox */}
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-white/30 accent-lavender"
          />
          <div>
            <p className="text-sm font-medium text-moon/80">發送測試兌換碼 Email</p>
            <p className="mt-0.5 text-xs text-moon/40">
              有勾才發。系統會把兌換碼寄到上方填入的 Email（使用正式 Email 格式，內容不含測試標記）。
            </p>
          </div>
        </label>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-lavender/80 px-5 py-3 text-sm font-semibold text-midnight transition hover:bg-lavender disabled:opacity-50"
        >
          {loading ? "處理中…" : "模擬付款成功"}
        </button>

        {error && (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            錯誤：{error}
          </p>
        )}
      </form>

      {/* ── 結果 ── */}
      {result && (
        <div className="space-y-4 rounded-2xl border border-aurora/25 bg-aurora/5 p-5 sm:p-6">
          <p className="text-sm font-semibold tracking-[0.12em] text-aurora">模擬付款成功 ✓</p>

          <dl className="space-y-3 text-sm">
            <Row label="測試訂單 ID">
              <CopyField value={result.orderId} />
            </Row>
            <Row label="付款狀態">
              <span className="rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs text-green-300">mock_paid</span>
            </Row>
            <Row label="兌換碼">
              <CopyField value={result.redeemCode} highlight />
            </Row>
            <Row label="查詢碼">
              <CopyField value={result.lookupCode} />
            </Row>
            <Row label="方案">
              <span className="text-moon/70">{result.displayName}（{result.totalUses} 次）</span>
            </Row>
            <Row label="到期日">
              <span className="text-moon/70">
                {new Date(result.expiresAt).toLocaleDateString("zh-TW", {
                  year: "numeric", month: "long", day: "numeric",
                })}
              </span>
            </Row>
            <Row label="Share 連結">
              <a
                href={result.resultUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all text-lavender underline underline-offset-2"
              >
                {result.resultUrl}
              </a>
            </Row>
            <Row label="Email 狀態">
              {result.emailSent ? (
                <span className="text-green-300">已送出 ✓</span>
              ) : result.emailError ? (
                <span className="text-red-300">失敗：{result.emailError}</span>
              ) : (
                <span className="text-moon/40">未勾選，未寄出</span>
              )}
            </Row>
            {result.emailTo && (
              <Row label="收件人">
                <span className="text-moon/70">{result.emailTo}</span>
              </Row>
            )}
            {result.emailMessageId && (
              <Row label="messageId">
                <CopyField value={result.emailMessageId} />
              </Row>
            )}
          </dl>

          {/* 除錯資訊 */}
          <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.03] p-4">
            <p className="mb-2 text-xs tracking-[0.15em] text-moon/40 uppercase">除錯資訊（流程確認）</p>
            <dl className="space-y-1.5 text-xs text-moon/60">
              <div className="flex gap-2"><dt className="w-36 shrink-0 text-moon/35">付款完成函式</dt><dd className="font-mono text-aurora/80">{result.debug.fulfillFunction}</dd></div>
              <div className="flex gap-2"><dt className="w-36 shrink-0 text-moon/35">Email 寄送函式</dt><dd className="font-mono text-aurora/80">{result.debug.emailFunction}</dd></div>
              <div className="flex gap-2"><dt className="w-36 shrink-0 text-moon/35">isTest</dt><dd className="font-mono">{String(result.debug.isTest)}</dd></div>
              <div className="flex gap-2"><dt className="w-36 shrink-0 text-moon/35">source</dt><dd className="font-mono">{result.debug.source}</dd></div>
              <div className="flex gap-2"><dt className="w-36 shrink-0 text-moon/35">paymentMethod</dt><dd className="font-mono">{result.debug.paymentMethod}</dd></div>
            </dl>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <p className="mb-2 text-xs tracking-[0.15em] text-moon/50 uppercase">下一步：驗證兌換碼可用</p>
            <ol className="space-y-1.5 text-xs text-moon/60 list-decimal list-inside leading-6">
              <li>點上方 Share 連結，進入解讀頁</li>
              <li>在「輸入宇宙通行碼」欄位輸入：<strong className="text-moon">{result.redeemCode}</strong></li>
              <li>確認完整版解讀正常顯示</li>
              <li>
                或至{" "}
                <a href="/redeem/check" target="_blank" rel="noreferrer" className="text-lavender underline">
                  /redeem/check
                </a>{" "}
                查詢剩餘次數
              </li>
            </ol>
          </div>

          <p className="text-xs text-moon/30">
            MerchantTradeNo: {result.merchantTradeNo} ·
            ResultId: {result.resultId}
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
      <dt className="w-28 shrink-0 text-moon/45">{label}</dt>
      <dd className="flex-1 min-w-0">{children}</dd>
    </div>
  );
}

function CopyField({ value, highlight = false }: { value: string; highlight?: boolean }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className={`break-all font-mono ${highlight ? "text-aurora font-semibold" : "text-moon/80"}`}>
        {value}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 rounded px-2 py-0.5 text-xs border border-white/15 text-moon/50 hover:text-moon transition"
      >
        {copied ? "已複製" : "複製"}
      </button>
    </span>
  );
}
