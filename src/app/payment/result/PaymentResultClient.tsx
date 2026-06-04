"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";

// ── 型別 ──────────────────────────────────────────────────────────────────────

type OrderStatus = "loading" | "pending" | "paid" | "failed" | "not_found" | "error";

interface CodeDetail {
  totalUses?:     number;
  remainingUses?: number;
  expiresAt?:     string | null;
  displayName?:   string;
}

interface OrderResult {
  status:          OrderStatus;
  merchantTradeNo: string;
  planName?:       string;
  amount?:         number;
  redeemCode?:     string | null;
  paidAt?:         string | null;
  codeDetail?:     CodeDetail | null;
  buyerEmail?:     string | null;   // 遮罩後的 Email，例如 a***@gmail.com
  emailSent?:      boolean;
  emailSentAt?:    string | null;
  emailError?:     string | null;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS        = 30; // 最多 60 秒

// ── 元件 ──────────────────────────────────────────────────────────────────────

export default function PaymentResultClient() {
  const searchParams    = useSearchParams();
  const merchantTradeNo = searchParams.get("merchantTradeNo") ?? "";

  const [order,           setOrder]           = useState<OrderResult>({
    status: "loading",
    merchantTradeNo,
  });
  const [pollCount,       setPollCount]       = useState(0);
  const [email,           setEmail]           = useState("");
  const [emailStatus,     setEmailStatus]     = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [codeCopied,      setCodeCopied]      = useState(false);
  const [showUnsaved,     setShowUnsaved]     = useState(false);
  const codeSavedRef = useRef(false); // true = 已複製或 Email 成功寄出

  // ── 輪詢訂單狀態 ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!merchantTradeNo) {
      setOrder({ status: "not_found", merchantTradeNo: "" });
      return;
    }

    let cancelled = false;

    async function poll() {
      try {
        const res  = await fetch(
          `/api/ecpay/order-status?merchantTradeNo=${encodeURIComponent(merchantTradeNo)}`,
        );
        const data = (await res.json()) as {
          ok:              boolean;
          status?:         string;
          merchantTradeNo?: string;
          planName?:       string;
          amount?:         number;
          redeemCode?:     string | null;
          paidAt?:         string | null;
          codeDetail?:     CodeDetail | null;
          buyerEmail?:     string | null;
          emailSent?:      boolean;
          emailSentAt?:    string | null;
          emailError?:     string | null;
        };

        if (cancelled) return;

        if (!data.ok) {
          setOrder({ status: "not_found", merchantTradeNo });
          return;
        }

        const next: OrderResult = {
          status:          data.status as OrderStatus,
          merchantTradeNo: data.merchantTradeNo ?? merchantTradeNo,
          planName:        data.planName,
          amount:          data.amount,
          redeemCode:      data.redeemCode,
          paidAt:          data.paidAt,
          codeDetail:      data.codeDetail,
          buyerEmail:      data.buyerEmail,
          emailSent:       data.emailSent,
          emailSentAt:     data.emailSentAt,
          emailError:      data.emailError,
        };
        setOrder(next);

        // 預填 Email input（使用遮罩後的值作為 placeholder hint，不自動填入以免誤用）
        if (data.emailSent) {
          codeSavedRef.current = true; // Email 已寄出視同已保存
        }
      } catch {
        if (!cancelled) setOrder((prev) => ({ ...prev, status: "error" }));
      }
    }

    void poll();

    const interval = setInterval(() => {
      if (cancelled) return;
      setPollCount((c) => {
        const next = c + 1;
        if (next >= MAX_POLLS) clearInterval(interval);
        else void poll();
        return next;
      });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantTradeNo]);

  // 達到終態後停止輪詢
  useEffect(() => {
    if (order.status === "paid" || order.status === "failed") {
      setPollCount(MAX_POLLS);
    }
  }, [order.status]);

  // 同步 emailSent 狀態到 codeSavedRef
  useEffect(() => {
    if (order.emailSent) codeSavedRef.current = true;
  }, [order.emailSent]);

  // ── 操作函式 ──────────────────────────────────────────────────────────────

  function handleCopy() {
    if (!order.redeemCode) return;
    void navigator.clipboard.writeText(order.redeemCode).then(() => {
      setCodeCopied(true);
      codeSavedRef.current = true;
      setTimeout(() => setCodeCopied(false), 2500);
    });
  }

  async function handleSendEmail() {
    if (emailStatus === "sending") return;
    const code = order.redeemCode;
    if (!code) return;
    const trimmed = email.trim();
    if (!trimmed) return;

    setEmailStatus("sending");
    try {
      const res = await fetch("/api/email/send-redeem-code", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email:         trimmed,
          code,
          planName:      order.codeDetail?.displayName ? undefined : "single",
          displayName:   order.codeDetail?.displayName ?? order.planName ?? "",
          totalUses:     order.codeDetail?.totalUses ?? 1,
          remainingUses: order.codeDetail?.remainingUses ?? 1,
          expiresAt:     order.codeDetail?.expiresAt ?? null,
        }),
      });
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) {
        setEmailStatus("sent");
        codeSavedRef.current = true;
      } else {
        setEmailStatus("error");
      }
    } catch {
      setEmailStatus("error");
    }
  }

  function handleGoDrawClick(e: React.MouseEvent) {
    if (!codeSavedRef.current) {
      e.preventDefault();
      setShowUnsaved(true);
    }
  }

  function fmtExpiry(iso: string | null | undefined): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("zh-TW", {
      year: "numeric", month: "long", day: "numeric",
    });
  }

  // ── 載入中 / 待確認 ───────────────────────────────────────────────────────

  if (order.status === "loading" || (order.status === "pending" && pollCount < MAX_POLLS)) {
    return (
      <AppShell>
        <section className="mx-auto w-full max-w-md py-20 text-center">
          <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-2 border-lavender/30 border-t-lavender" />
          <h1 className="text-xl font-semibold text-moon">付款確認中</h1>
          <p className="mt-3 text-sm leading-7 text-moon/55">
            {order.status === "pending"
              ? "付款已完成，系統正在產生通行碼，請稍候 5～10 秒。"
              : "正在向銀行確認付款結果，請稍候…"}
          </p>
          {order.status === "pending" && pollCount > 5 && (
            <p className="mt-3 text-xs text-moon/38">
              付款確認有時需要數秒，請耐心等待。
            </p>
          )}
        </section>
      </AppShell>
    );
  }

  if (order.status === "pending" && pollCount >= MAX_POLLS) {
    return (
      <AppShell>
        <section className="mx-auto w-full max-w-md py-20 text-center">
          <p className="text-5xl">⏳</p>
          <h1 className="mt-4 text-xl font-semibold text-moon">付款已完成，通行碼準備中</h1>
          <p className="mt-3 text-sm leading-7 text-moon/60">
            付款結果尚未收到通知，可能需要幾分鐘。<br />
            請稍後重新整理此頁面查看結果。
          </p>
          <p className="mt-3 text-xs text-moon/40">訂單編號：{merchantTradeNo}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              onClick={() => window.location.reload()}
              className="rounded-full border border-lavender/30 px-6 py-3 text-sm font-medium text-moon transition hover:bg-white/8"
            >
              重新整理
            </button>
            <a
              href="mailto:ciut0000@gmail.com"
              className="rounded-full border border-white/15 px-6 py-3 text-sm text-moon/60 transition hover:bg-white/8"
            >
              聯繫客服
            </a>
          </div>
        </section>
      </AppShell>
    );
  }

  if (order.status === "failed") {
    return (
      <AppShell>
        <section className="mx-auto w-full max-w-md py-20 text-center">
          <p className="text-5xl">✕</p>
          <h1 className="mt-4 text-xl font-semibold text-moon">付款未成功</h1>
          <p className="mt-3 text-sm leading-7 text-moon/60">
            此次付款未能完成，你的帳戶不會被收費。<br />
            如有疑問，請聯繫客服。
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/tarot" className="rounded-full bg-moon px-6 py-3 font-medium text-midnight transition hover:bg-white">
              回到塔羅頁
            </Link>
            <a href="mailto:ciut0000@gmail.com" className="rounded-full border border-white/20 px-6 py-3 text-sm text-moon/70 transition hover:bg-white/8">
              聯繫客服
            </a>
          </div>
        </section>
      </AppShell>
    );
  }

  if (order.status === "not_found" || order.status === "error") {
    return (
      <AppShell>
        <section className="mx-auto w-full max-w-md py-20 text-center">
          <p className="text-moon/50">找不到此筆付款記錄。</p>
          <Link href="/tarot" className="mt-6 inline-block text-sm text-lavender/80 underline underline-offset-4">
            回到塔羅頁
          </Link>
        </section>
      </AppShell>
    );
  }

  // ── 付款成功 ──────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <section className="mx-auto w-full max-w-md py-12">

        {/* 未保存警告彈窗 */}
        {showUnsaved && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-5 backdrop-blur-sm">
            <div className="w-full max-w-xs rounded-2xl border border-white/15 bg-midnight p-5 shadow-glow">
              <p className="text-sm font-semibold text-moon">你還沒有保存通行碼</p>
              <p className="mt-2 text-xs leading-6 text-moon/65">
                你還沒有複製或寄送通行碼，之後可能會找不到剩餘次數。確定要直接開始抽牌嗎？
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowUnsaved(false)}
                  className="flex-1 rounded-xl border border-[#d8bd70]/50 px-3 py-2.5 text-xs font-semibold text-[#d8bd70] transition hover:border-[#d8bd70]/80"
                >
                  先返回保存
                </button>
                <Link
                  href="/tarot"
                  className="flex-1 rounded-xl border border-white/15 px-3 py-2.5 text-center text-xs text-moon/60 transition hover:border-white/30 hover:text-moon/85"
                >
                  確定開始抽牌
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="text-center">
          <p className="text-5xl">✨</p>
          <h1 className="mt-4 text-2xl font-semibold text-moon">購買成功！</h1>
          <p className="mt-2 text-sm text-moon/55">你的宇宙通行碼已準備好，請妥善保存。</p>
        </div>

        {/* 通行碼卡片 */}
        <div className="mt-8 rounded-2xl border border-[#d8bd70]/35 bg-[#d8bd70]/8 px-6 py-6 text-center">
          <p className="text-xs uppercase tracking-[0.28em] text-[#d8bd70]/80">宇宙通行碼</p>
          <p className="mt-3 font-mono text-3xl font-bold tracking-[0.22em] text-[#d8bd70] select-all">
            {order.redeemCode ?? "—"}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 text-left text-sm">
            <div>
              <p className="text-xs text-moon/44">方案</p>
              <p className="mt-0.5 text-moon">{order.codeDetail?.displayName ?? order.planName ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-moon/44">費用</p>
              <p className="mt-0.5 text-moon">NT${order.amount ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-moon/44">剩餘次數</p>
              <p className="mt-0.5 text-moon">{order.codeDetail?.remainingUses ?? "—"} 次</p>
            </div>
            <div>
              <p className="text-xs text-moon/44">有效期至</p>
              <p className="mt-0.5 text-moon">{fmtExpiry(order.codeDetail?.expiresAt)}</p>
            </div>
          </div>
        </div>

        {/* 保存提醒 */}
        <p className="mt-3 text-center text-xs leading-6 text-moon/45">
          請先保存此通行碼。此通行碼不綁帳號，可自行使用，也可分享給朋友共同使用。
        </p>

        {/* 複製按鈕 */}
        <button
          onClick={handleCopy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#d8bd70]/30 bg-[#d8bd70]/8 px-4 py-3 text-sm font-medium text-[#d8bd70] transition hover:bg-[#d8bd70]/14 active:scale-[0.98]"
        >
          {codeCopied ? "✓ 已複製" : "複製通行碼"}
        </button>

        {/* Email 寄送 */}
        <div className="mt-5 rounded-2xl border border-white/10 bg-midnight/50 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-moon">寄送通行碼到 Email</p>
            {order.emailSent && (
              <span className="rounded-full bg-aurora/14 px-2 py-0.5 text-[11px] text-aurora">已自動寄出</span>
            )}
          </div>
          <p className="mt-1 text-xs leading-6 text-moon/50">
            {order.emailSent
              ? `通行碼已寄送到 ${order.buyerEmail ?? "你的信箱"}，也可以重新寄送到其他信箱。`
              : "輸入 Email，把通行碼寄到信箱保存。"}
          </p>

          {emailStatus === "sent" ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-aurora">
              <span>✓</span> 已寄出通行碼，請到信箱確認。
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleSendEmail()}
                placeholder={order.buyerEmail ? `原 Email：${order.buyerEmail}` : "請輸入你的 Email"}
                className="w-full rounded-xl border border-white/14 bg-white/6 px-4 py-2.5 text-sm text-moon placeholder-moon/30 outline-none transition focus:border-lavender/50 sm:flex-1"
                disabled={emailStatus === "sending"}
              />
              <button
                onClick={() => void handleSendEmail()}
                disabled={emailStatus === "sending" || !email.trim()}
                className="rounded-xl bg-moon/14 px-4 py-2.5 text-sm font-medium text-moon transition hover:bg-moon/22 disabled:opacity-50 sm:whitespace-nowrap"
              >
                {emailStatus === "sending" ? "寄送中…" : "寄送通行碼到 Email"}
              </button>
            </div>
          )}
          {emailStatus === "error" && (
            <p className="mt-2 text-xs text-red-300/80">
              寄送失敗，請確認 Email 是否正確，或先複製通行碼保存。
            </p>
          )}
          {order.emailError && !order.emailSent && emailStatus === "idle" && (
            <p className="mt-2 text-xs text-amber-400/70">
              自動寄送未成功，請手動輸入 Email 補寄。
            </p>
          )}
        </div>

        {/* 行動 CTA */}
        <div className="mt-6 space-y-3">
          <Link
            href="/tarot"
            onClick={handleGoDrawClick}
            className="flex w-full items-center justify-center rounded-full bg-moon px-5 py-3.5 font-semibold text-midnight transition hover:bg-white"
          >
            我已保存通行碼，立即抽牌
          </Link>
          <Link
            href={`/redeem/check?code=${encodeURIComponent(order.redeemCode ?? "")}`}
            className="flex w-full items-center justify-center rounded-full border border-white/20 px-5 py-3.5 text-sm text-moon/70 transition hover:bg-white/8"
          >
            查詢剩餘次數
          </Link>
        </div>

        <p className="mt-8 text-center text-xs text-moon/30">
          通行碼可用來查詢剩餘次數與再次抽牌。<br />
          如有問題請聯繫 ciut0000@gmail.com
        </p>
      </section>
    </AppShell>
  );
}
