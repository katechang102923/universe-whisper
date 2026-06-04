"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";

// ── 型別 ──────────────────────────────────────────────────────────────────────

type OrderStatus = "loading" | "pending" | "paid" | "failed" | "not_found" | "error";
type SyncStatus  = "idle" | "syncing" | "synced" | "still_pending" | "error";

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
  buyerEmail?:     string | null;
  emailSent?:      boolean;
  emailSentAt?:    string | null;
  emailError?:     string | null;
}

// ── 輪詢參數 ──────────────────────────────────────────────────────────────────

// 依序在 0、2、5 秒查詢，共 3 次，最多等 5 秒即顯示結果畫面
const POLL_DELAYS_MS   = [0, 2000, 5000];
const MAX_POLLS        = POLL_DELAYS_MS.length;
const PHASE_2_POLLS    = 2;   // 第 2 次後進 phase 2 文案

// ── 元件 ──────────────────────────────────────────────────────────────────────

export default function PaymentResultClient() {
  const searchParams    = useSearchParams();
  const merchantTradeNo = searchParams.get("merchantTradeNo") ?? "";

  const [order,        setOrder]        = useState<OrderResult>({
    status: "loading",
    merchantTradeNo,
  });
  const [pollCount,    setPollCount]    = useState(0);
  const [pollStopped,  setPollStopped]  = useState(false);

  const [email,        setEmail]        = useState("");
  const [emailStatus,  setEmailStatus]  = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [codeCopied,   setCodeCopied]   = useState(false);
  const [tradeNoCopied, setTradeNoCopied] = useState(false);
  const [showUnsaved,  setShowUnsaved]  = useState(false);
  const codeSavedRef = useRef(false);

  const [syncStatus,   setSyncStatus]   = useState<SyncStatus>("idle");
  const [syncMsg,      setSyncMsg]      = useState("");
  const autoSyncedRef = useRef(false);

  // ── 輪詢 order-status ─────────────────────────────────────────────────────

  const fetchOrder = useCallback(async () => {
    if (!merchantTradeNo) return;
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

      if (!data.ok) {
        setOrder((prev) => ({ ...prev, status: "not_found" }));
        return;
      }

      setOrder({
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
      });

      if (data.emailSent) codeSavedRef.current = true;
    } catch {
      setOrder((prev) => ({ ...prev, status: "error" }));
    }
  }, [merchantTradeNo]);

  useEffect(() => {
    if (!merchantTradeNo) {
      setOrder({ status: "not_found", merchantTradeNo: "" });
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    POLL_DELAYS_MS.forEach((delay, i) => {
      const t = setTimeout(async () => {
        if (cancelled) return;
        setPollCount(i + 1);
        await fetchOrder();
        if (i === POLL_DELAYS_MS.length - 1) {
          setPollStopped(true);
        }
      }, delay);
      timers.push(t);
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantTradeNo]);

  // 達到終態停止輪詢：paid 且已有 redeemCode，或付款失敗
  useEffect(() => {
    if ((order.status === "paid" && order.redeemCode) || order.status === "failed") {
      setPollStopped(true);
      setPollCount(MAX_POLLS);
    }
  }, [order.status, order.redeemCode]);

  // emailSent → 標記已保存
  useEffect(() => {
    if (order.emailSent) codeSavedRef.current = true;
  }, [order.emailSent]);

  // 輪詢結束後仍沒有通行碼 → 自動呼叫 sync-order 一次
  useEffect(() => {
    if (pollStopped && !order.redeemCode && !autoSyncedRef.current) {
      autoSyncedRef.current = true;
      void handleSync();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollStopped, order.redeemCode]);

  // ── 主動同步 sync-order ───────────────────────────────────────────────────

  async function handleSync() {
    if (syncStatus === "syncing") return;
    setSyncStatus("syncing");
    setSyncMsg("");
    try {
      const res = await fetch("/api/ecpay/sync-order", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ merchantTradeNo }),
      });
      const data = (await res.json()) as {
        ok:          boolean;
        status?:     string;
        redeemCode?: string | null;
        codeDetail?: CodeDetail | null;
        message?:    string;
        error?:      string;
      };

      if (data.ok && data.status === "paid" && data.redeemCode) {
        setSyncStatus("synced");
        // 先把 redeemCode 直接寫進 state，立即顯示成功畫面
        setOrder((prev) => ({
          ...prev,
          status:     "paid",
          redeemCode: data.redeemCode ?? prev.redeemCode,
          codeDetail: data.codeDetail ?? prev.codeDetail,
        }));
        // 再拉一次取完整資料（email 狀態等）
        await fetchOrder();
      } else if (data.ok && data.status === "pending") {
        setSyncStatus("still_pending");
        setSyncMsg("目前尚未查到綠界付款成功紀錄，請稍後再試或聯繫客服。");
      } else {
        setSyncStatus("error");
        setSyncMsg(
          data.error === "SYNC_LIMIT_EXCEEDED"
            ? "查詢次數已達上限，請聯繫客服並提供訂單編號。"
            : data.message ?? "同步失敗，請聯繫客服並提供訂單編號。",
        );
      }
    } catch {
      setSyncStatus("error");
      setSyncMsg("網路錯誤，請稍後再試。");
    }
  }

  // ── 操作函式 ──────────────────────────────────────────────────────────────

  function handleCopyCode() {
    if (!order.redeemCode) return;
    void navigator.clipboard.writeText(order.redeemCode).then(() => {
      setCodeCopied(true);
      codeSavedRef.current = true;
      setTimeout(() => setCodeCopied(false), 2500);
    });
  }

  function handleCopyTradeNo() {
    void navigator.clipboard.writeText(merchantTradeNo).then(() => {
      setTradeNoCopied(true);
      setTimeout(() => setTradeNoCopied(false), 2000);
    });
  }

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

  // ── Loading / Pending 畫面 ─────────────────────────────────────────────────

  // paid + redeemCode 才算完成；paid 但沒有 redeemCode 也繼續等待
  const isPaidNoCode = order.status === "paid" && !order.redeemCode;
  const isStillWaiting =
    ((order.status === "loading" || order.status === "pending" || isPaidNoCode) && !pollStopped);

  if (isStillWaiting) {
    const isPhase2 = pollCount >= PHASE_2_POLLS;
    return (
      <AppShell>
        <section className="mx-auto w-full max-w-md py-20 text-center">
          <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-2 border-lavender/30 border-t-lavender" />
          <h1 className="text-xl font-semibold text-moon">
            付款確認中
          </h1>
          <p className="mt-3 text-sm leading-7 text-moon/55">
            {isPhase2
              ? "正在向綠界確認付款結果，請稍候…"
              : "付款結果確認中，請稍候。"}
          </p>
        </section>
      </AppShell>
    );
  }

  // ── polling 結束 / paid 無碼：補救畫面 ──────────────────────────────────
  // 注意：status=pending 代表後端尚未確認付款，不可顯示「付款已完成」。
  // 只有 status=paid（後端已收 RtnCode=1 並更新 Firestore）才可顯示付款確認。

  if ((order.status === "loading" || order.status === "pending" || isPaidNoCode) && pollStopped) {
    const isPaid = isPaidNoCode; // true = 後端已確認 paid，false = 仍 pending/loading

    return (
      <AppShell>
        <section className="mx-auto w-full max-w-md py-12">
          <div className="text-center">
            <p className="text-4xl">{isPaid ? "✅" : "⏳"}</p>
            <h1 className="mt-4 text-xl font-semibold text-moon">
              {isPaid
                ? "付款已確認，通行碼產生中"
                : "確認付款狀態中"}
            </h1>
            <p className="mt-3 text-sm leading-7 text-moon/60">
              {isPaid
                ? <>系統已收到付款，正在產生通行碼。<br />請點下方按鈕立即同步。</>
                : <>系統尚未收到付款確認，可能是網路延遲。<br />請點下方按鈕查詢付款狀態，若已完成刷卡，通常幾秒內可完成。</>}
            </p>
          </div>

          {/* 訂單資料 */}
          <div className="mt-6 rounded-2xl border border-white/10 bg-midnight/50 p-5 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-moon/40">訂單編號</p>
                <p className="mt-0.5 font-mono text-moon/80 break-all">{merchantTradeNo || "—"}</p>
              </div>
              {order.planName && (
                <div>
                  <p className="text-xs text-moon/40">方案</p>
                  <p className="mt-0.5 text-moon">{order.planName}</p>
                </div>
              )}
              {order.amount != null && (
                <div>
                  <p className="text-xs text-moon/40">金額</p>
                  <p className="mt-0.5 text-moon">NT${order.amount}</p>
                </div>
              )}
              {order.buyerEmail && (
                <div>
                  <p className="text-xs text-moon/40">Email</p>
                  <p className="mt-0.5 text-moon/70">{order.buyerEmail}</p>
                </div>
              )}
            </div>
          </div>

          {/* 同步狀態訊息 */}
          {syncMsg && (
            <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${
              syncStatus === "error" || syncStatus === "still_pending"
                ? "border border-red-300/20 bg-red-300/6 text-red-300/80"
                : "border border-aurora/20 bg-aurora/6 text-aurora"
            }`}>
              {syncMsg}
            </div>
          )}

          {/* 操作按鈕 */}
          <div className="mt-6 space-y-3">
            <button
              onClick={() => void handleSync()}
              disabled={syncStatus === "syncing"}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-lavender/20 px-5 py-3.5 font-semibold text-lavender transition hover:bg-lavender/30 disabled:opacity-60"
            >
              {syncStatus === "syncing" ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-lavender/40 border-t-lavender" />
                  同步中…
                </>
              ) : "🔄 重新同步付款狀態"}
            </button>

            <button
              onClick={() => void fetchOrder()}
              className="flex w-full items-center justify-center rounded-full border border-white/15 px-5 py-3.5 text-sm text-moon/70 transition hover:bg-white/8"
            >
              重新查詢
            </button>

            <button
              onClick={handleCopyTradeNo}
              className="flex w-full items-center justify-center rounded-full border border-white/10 px-5 py-3 text-sm text-moon/50 transition hover:bg-white/6"
            >
              {tradeNoCopied ? "✓ 已複製訂單編號" : "複製訂單編號"}
            </button>

            <a
              href={`mailto:ciut0000@gmail.com?subject=付款成功但未收到通行碼&body=訂單編號：${merchantTradeNo}`}
              className="flex w-full items-center justify-center rounded-full border border-white/10 px-5 py-3 text-sm text-moon/50 transition hover:bg-white/6"
            >
              聯繫客服
            </a>
          </div>
        </section>
      </AppShell>
    );
  }

  // ── 付款失敗 ──────────────────────────────────────────────────────────────

  if (order.status === "failed") {
    return (
      <AppShell>
        <section className="mx-auto w-full max-w-md py-20 text-center">
          <p className="text-5xl">✕</p>
          <h1 className="mt-4 text-xl font-semibold text-moon">付款未成功</h1>
          <p className="mt-3 text-sm leading-7 text-moon/60">
            此次付款未能完成，你的帳戶不會被收費。
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

  // ── 找不到 / 錯誤 ─────────────────────────────────────────────────────────

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

        <p className="mt-3 text-center text-xs leading-6 text-moon/45">
          請先保存此通行碼。此通行碼不綁帳號，可自行使用，也可分享給朋友共同使用。
        </p>

        {/* 複製按鈕 */}
        <button
          onClick={handleCopyCode}
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
            <p className="mt-3 flex items-center gap-2 text-sm text-aurora">✓ 已寄出通行碼，請到信箱確認。</p>
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
            <p className="mt-2 text-xs text-amber-400/70">自動寄送未成功，請手動輸入 Email 補寄。</p>
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
