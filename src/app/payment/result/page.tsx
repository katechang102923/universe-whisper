"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";

type OrderStatus = "loading" | "pending" | "paid" | "failed" | "not_found" | "error";

interface CodeDetail {
  totalUses?: number;
  remainingUses?: number;
  expiresAt?: string | null;
  displayName?: string;
}

interface OrderResult {
  status: OrderStatus;
  planName?: string;
  amount?: number;
  redeemCode?: string | null;
  paidAt?: string | null;
  codeDetail?: CodeDetail | null;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS        = 20; // ~60 seconds total

export default function PaymentResultPage() {
  const searchParams      = useSearchParams();
  const merchantTradeNo   = searchParams.get("merchantTradeNo") ?? "";

  const [order,        setOrder]        = useState<OrderResult>({ status: "loading" });
  const [pollCount,    setPollCount]    = useState(0);
  const [email,        setEmail]        = useState("");
  const [emailStatus,  setEmailStatus]  = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [codeCopied,   setCodeCopied]   = useState(false);

  // ── 輪詢訂單狀態 ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!merchantTradeNo) {
      setOrder({ status: "not_found" });
      return;
    }

    let cancelled = false;

    async function poll() {
      try {
        const res  = await fetch(
          `/api/ecpay/order-status?merchantTradeNo=${encodeURIComponent(merchantTradeNo)}`,
        );
        const data = (await res.json()) as {
          ok: boolean;
          status?: string;
          planName?: string;
          amount?: number;
          redeemCode?: string | null;
          paidAt?: string | null;
          codeDetail?: CodeDetail | null;
        };

        if (cancelled) return;

        if (!data.ok) {
          setOrder({ status: "not_found" });
          return;
        }

        const status = data.status as OrderStatus;
        setOrder({
          status,
          planName:   data.planName,
          amount:     data.amount,
          redeemCode: data.redeemCode,
          paidAt:     data.paidAt,
          codeDetail: data.codeDetail,
        });
      } catch {
        if (!cancelled) setOrder({ status: "error" });
      }
    }

    void poll();

    const interval = setInterval(() => {
      if (cancelled) return;
      setPollCount((c) => {
        const next = c + 1;
        if (next >= MAX_POLLS) {
          clearInterval(interval);
          return next;
        }
        void poll();
        return next;
      });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [merchantTradeNo]);

  // Stop polling once we have a final status
  useEffect(() => {
    if (order.status === "paid" || order.status === "failed") {
      setPollCount(MAX_POLLS); // prevent further polls
    }
  }, [order.status]);

  // ── Email 寄送 ────────────────────────────────────────────────────────────
  async function handleSendEmail() {
    if (emailStatus === "sending") return;
    const code = order.redeemCode;
    if (!code || !email.trim()) return;

    setEmailStatus("sending");
    try {
      const res = await fetch("/api/email/send-redeem-code", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email:         email.trim(),
          code,
          planName:      order.codeDetail?.displayName ? undefined : "single",
          displayName:   order.codeDetail?.displayName ?? order.planName ?? "",
          totalUses:     order.codeDetail?.totalUses ?? 1,
          remainingUses: order.codeDetail?.remainingUses ?? 1,
          expiresAt:     order.codeDetail?.expiresAt ?? null,
        }),
      });
      const data = (await res.json()) as { ok: boolean };
      setEmailStatus(data.ok ? "sent" : "error");
    } catch {
      setEmailStatus("error");
    }
  }

  function handleCopy() {
    if (!order.redeemCode) return;
    void navigator.clipboard.writeText(order.redeemCode).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  }

  function fmtExpiry(iso: string | null | undefined): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("zh-TW", {
      year: "numeric", month: "long", day: "numeric",
    });
  }

  // ── 渲染 ──────────────────────────────────────────────────────────────────

  if (order.status === "loading" || (order.status === "pending" && pollCount < MAX_POLLS)) {
    return (
      <AppShell>
        <section className="mx-auto w-full max-w-md py-20 text-center">
          <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-2 border-lavender/30 border-t-lavender" />
          <h1 className="text-xl font-semibold text-moon">付款確認中</h1>
          <p className="mt-3 text-sm leading-7 text-moon/55">
            正在向銀行確認付款結果，請稍候…
          </p>
          {order.status === "pending" && pollCount > 3 && (
            <p className="mt-4 text-xs text-moon/40">
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
          <h1 className="mt-4 text-xl font-semibold text-moon">付款確認中</h1>
          <p className="mt-3 text-sm leading-7 text-moon/60">
            付款結果尚未收到通知，可能需要幾分鐘。<br />
            請稍後重新整理此頁面查看結果。
          </p>
          <p className="mt-3 text-xs text-moon/40">訂單編號：{merchantTradeNo}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 rounded-full border border-lavender/30 px-6 py-3 text-sm font-medium text-moon transition hover:bg-white/8"
          >
            重新整理
          </button>
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
            <Link
              href="/tarot"
              className="rounded-full bg-moon px-6 py-3 font-medium text-midnight transition hover:bg-white"
            >
              回到塔羅頁
            </Link>
            <a
              href="mailto:ciut0000@gmail.com"
              className="rounded-full border border-white/20 px-6 py-3 text-sm text-moon/70 transition hover:bg-white/8"
            >
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

        {/* 複製按鈕 */}
        <button
          onClick={handleCopy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#d8bd70]/30 bg-[#d8bd70]/8 px-4 py-3 text-sm font-medium text-[#d8bd70] transition hover:bg-[#d8bd70]/14 active:scale-[0.98]"
        >
          {codeCopied ? "✓ 已複製" : "複製通行碼"}
        </button>

        {/* Email 寄送 */}
        <div className="mt-5 rounded-2xl border border-white/10 bg-midnight/50 p-5">
          <p className="text-sm font-semibold text-moon">寄送通行碼到 Email</p>
          <p className="mt-1 text-xs leading-6 text-moon/50">
            通行碼寄到信箱，之後也能查詢剩餘次數。
          </p>

          {emailStatus === "sent" ? (
            <p className="mt-3 text-sm text-aurora">✓ 已寄出，請到信箱查看。</p>
          ) : (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleSendEmail()}
                placeholder="請輸入你的 Email"
                className="w-full rounded-xl border border-white/14 bg-white/6 px-4 py-2.5 text-sm text-moon placeholder-moon/30 outline-none transition focus:border-lavender/50 sm:flex-1"
                disabled={emailStatus === "sending"}
              />
              <button
                onClick={() => void handleSendEmail()}
                disabled={emailStatus === "sending" || !email.trim()}
                className="rounded-xl bg-moon/14 px-4 py-2.5 text-sm font-medium text-moon transition hover:bg-moon/22 disabled:opacity-50 sm:whitespace-nowrap"
              >
                {emailStatus === "sending" ? "寄送中…" : "寄送"}
              </button>
            </div>
          )}
          {emailStatus === "error" && (
            <p className="mt-2 text-xs text-red-300/80">寄送失敗，請稍後再試。</p>
          )}
        </div>

        {/* 行動 CTA */}
        <div className="mt-6 space-y-3">
          <Link
            href="/tarot"
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
          通行碼不綁帳號，可自行使用或分享給朋友。<br />
          如有問題請聯繫 ciut0000@gmail.com
        </p>
      </section>
    </AppShell>
  );
}
