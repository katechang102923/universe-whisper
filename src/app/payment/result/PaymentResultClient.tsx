"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";

// ── 型別 ──────────────────────────────────────────────────────────────────────

type OrderStatus  = "loading" | "pending" | "paid" | "failed" | "not_found" | "error";
type SyncStatus   = "idle" | "syncing" | "synced" | "still_pending" | "error";
type EmailStatus  = "idle" | "sending" | "sent" | "error";

type EmailErrorCode =
  | "MISSING_ENV"
  | "INVALID_EMAIL"
  | "ORDER_NOT_FOUND"
  | "REDEEM_CODE_NOT_FOUND"
  | "MISSING_FIELD"
  | "RESEND_FAILED"
  | "UNKNOWN_ERROR";

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
  /** 遮罩後的 email（僅供顯示，不可用於寄信） */
  buyerEmail?:     string | null;
  /** 是否有真實 buyerEmail（server side 查詢時使用） */
  hasBuyerEmail?:  boolean;
  emailSent?:      boolean;
  emailSentAt?:    string | null;
  emailError?:     string | null;
}

// ── 錯誤碼 → 友善訊息 ────────────────────────────────────────────────────────

function emailErrorMessage(code: EmailErrorCode | string | undefined): string {
  switch (code) {
    case "MISSING_ENV":
      return "Email 系統尚未設定完成，請先複製通行碼保存，或聯繫客服補寄。";
    case "INVALID_EMAIL":
      return "Email 格式不正確，請確認後再試。";
    case "ORDER_NOT_FOUND":
      return "找不到訂單資料，請複製通行碼並聯繫客服。";
    case "REDEEM_CODE_NOT_FOUND":
      return "找不到通行碼資料，請聯繫客服。";
    case "RESEND_FAILED":
      return "Email 備份寄送失敗，可能是寄信服務暫時異常。請先複製通行碼保存，稍後再試。";
    default:
      return "Email 備份寄送失敗，不影響通行碼使用。請先複製通行碼保存，或稍後再試。";
  }
}

// ── 輪詢參數 ──────────────────────────────────────────────────────────────────

const POLL_DELAYS_MS = [0, 2000, 5000];
const MAX_POLLS      = POLL_DELAYS_MS.length;
const PHASE_2_POLLS  = 2;

// ── 元件 ──────────────────────────────────────────────────────────────────────

export default function PaymentResultClient() {
  const searchParams    = useSearchParams();
  const merchantTradeNo = searchParams.get("merchantTradeNo") ?? "";

  const [order,       setOrder]       = useState<OrderResult>({ status: "loading", merchantTradeNo });
  const [pollCount,   setPollCount]   = useState(0);
  const [pollStopped, setPollStopped] = useState(false);

  // Email 備份
  const [email,       setEmail]       = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [emailMsg,    setEmailMsg]    = useState("");

  // 複製
  const [codeCopied,    setCodeCopied]    = useState(false);
  const [tradeNoCopied, setTradeNoCopied] = useState(false);

  // 保存狀態
  const [codeSaved,   setCodeSaved]   = useState(false);
  const [showUnsaved, setShowUnsaved] = useState(false);

  // 同步
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncMsg,    setSyncMsg]    = useState("");
  const autoSyncedRef = useRef(false);

  // ── 輪詢 order-status ─────────────────────────────────────────────────────

  const fetchOrder = useCallback(async () => {
    if (!merchantTradeNo) return;
    try {
      const res  = await fetch(
        `/api/ecpay/order-status?merchantTradeNo=${encodeURIComponent(merchantTradeNo)}`,
      );
      const data = (await res.json()) as {
        ok:               boolean;
        status?:          string;
        merchantTradeNo?: string;
        planName?:        string;
        amount?:          number;
        redeemCode?:      string | null;
        paidAt?:          string | null;
        codeDetail?:      CodeDetail | null;
        buyerEmail?:      string | null;
        hasBuyerEmail?:   boolean;
        emailSent?:       boolean;
        emailSentAt?:     string | null;
        emailError?:      string | null;
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
        buyerEmail:      data.buyerEmail ?? null,       // 遮罩後，僅顯示用
        hasBuyerEmail:   data.hasBuyerEmail ?? false,  // API server 查真實 email 時用
        emailSent:       data.emailSent,
        emailSentAt:     data.emailSentAt,
        emailError:      data.emailError,
      });

      // ★ 不把遮罩 email 填入 input！
      //   input 用於使用者自行輸入或留空（留空時 API 用 buyerEmail）
      if (data.emailSent) setCodeSaved(true);
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
        if (i === POLL_DELAYS_MS.length - 1) setPollStopped(true);
      }, delay);
      timers.push(t);
    });
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantTradeNo]);

  useEffect(() => {
    if ((order.status === "paid" && order.redeemCode) || order.status === "failed") {
      setPollStopped(true);
      setPollCount(MAX_POLLS);
    }
  }, [order.status, order.redeemCode]);

  useEffect(() => {
    if (order.emailSent) setCodeSaved(true);
  }, [order.emailSent]);

  useEffect(() => {
    if (pollStopped && !order.redeemCode && !autoSyncedRef.current) {
      autoSyncedRef.current = true;
      void handleSync();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollStopped, order.redeemCode]);

  // ── 同步 sync-order ───────────────────────────────────────────────────────

  async function handleSync() {
    if (syncStatus === "syncing") return;
    setSyncStatus("syncing");
    setSyncMsg("");
    try {
      const res  = await fetch("/api/ecpay/sync-order", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ merchantTradeNo }),
      });
      const data = (await res.json()) as {
        ok: boolean; status?: string; redeemCode?: string | null;
        codeDetail?: CodeDetail | null; message?: string; error?: string;
      };
      if (data.ok && data.status === "paid" && data.redeemCode) {
        setSyncStatus("synced");
        setOrder((prev) => ({
          ...prev,
          status:     "paid",
          redeemCode: data.redeemCode ?? prev.redeemCode,
          codeDetail: data.codeDetail ?? prev.codeDetail,
        }));
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

  // ── 複製 ─────────────────────────────────────────────────────────────────

  function handleCopyCode() {
    if (!order.redeemCode) return;
    void navigator.clipboard.writeText(order.redeemCode).then(() => {
      setCodeCopied(true);
      setCodeSaved(true);
      setTimeout(() => setCodeCopied(false), 2500);
    });
  }

  function handleCopyTradeNo() {
    void navigator.clipboard.writeText(merchantTradeNo).then(() => {
      setTradeNoCopied(true);
      setTimeout(() => setTradeNoCopied(false), 2000);
    });
  }

  // ── 寄送 Email ────────────────────────────────────────────────────────────

  async function handleSendEmail() {
    if (emailStatus === "sending") return;
    const trimmed = email.trim();

    // 有填 email 才驗格式；沒填表示要用 buyerEmail（server side 查）
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailMsg("Email 格式不正確，請確認後再試。");
      return;
    }
    // 沒填 email 且也沒有 buyerEmail → 提示輸入
    if (!trimmed && !order.hasBuyerEmail) {
      setEmailMsg("請輸入要接收備份的 Email。");
      return;
    }

    setEmailStatus("sending");
    setEmailMsg("");

    try {
      const body: Record<string, string> = { merchantTradeNo };
      if (trimmed) body.email = trimmed;

      const res  = await fetch("/api/redeem-codes/send-email", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok: boolean; message?: string; errorCode?: string;
      };

      if (data.ok) {
        setEmailStatus("sent");
        setCodeSaved(true);
        setEmailMsg(data.message ?? "已寄出通行碼，請到信箱確認。");
        await fetchOrder();
      } else {
        setEmailStatus("error");
        setEmailMsg(emailErrorMessage(data.errorCode as EmailErrorCode));
      }
    } catch {
      setEmailStatus("error");
      setEmailMsg("網路錯誤，請稍後再試。");
    }
  }

  // ── 離開前確認 ────────────────────────────────────────────────────────────

  function handleGoDrawClick(e: React.MouseEvent) {
    if (!codeSaved) { e.preventDefault(); setShowUnsaved(true); }
  }

  function fmtExpiry(iso: string | null | undefined): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
  }

  // ── Loading / Pending ─────────────────────────────────────────────────────

  const isPaidNoCode   = order.status === "paid" && !order.redeemCode;
  const isStillWaiting = ((order.status === "loading" || order.status === "pending" || isPaidNoCode) && !pollStopped);

  if (isStillWaiting) {
    return (
      <AppShell>
        <section className="mx-auto w-full max-w-md py-20 text-center">
          <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-2 border-lavender/30 border-t-lavender" />
          <h1 className="text-xl font-semibold text-moon">付款確認中</h1>
          <p className="mt-3 text-sm leading-7 text-moon/55">
            {pollCount >= PHASE_2_POLLS ? "正在向綠界確認付款結果，請稍候…" : "付款結果確認中，請稍候。"}
          </p>
        </section>
      </AppShell>
    );
  }

  // ── 補救畫面 ──────────────────────────────────────────────────────────────

  if ((order.status === "loading" || order.status === "pending" || isPaidNoCode) && pollStopped) {
    const isPaid = isPaidNoCode;
    return (
      <AppShell>
        <section className="mx-auto w-full max-w-md py-12">
          <div className="text-center">
            <p className="text-4xl">{isPaid ? "✅" : "⏳"}</p>
            <h1 className="mt-4 text-xl font-semibold text-moon">
              {isPaid ? "付款已確認，通行碼產生中" : "確認付款狀態中"}
            </h1>
            <p className="mt-3 text-sm leading-7 text-moon/60">
              {isPaid
                ? <>系統已收到付款，正在產生通行碼。<br/>請點下方按鈕立即同步。</>
                : <>系統尚未收到付款確認，可能是網路延遲。<br/>請點下方按鈕查詢付款狀態。</>}
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-midnight/50 p-5 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-moon/40">訂單編號</p>
                <p className="mt-0.5 font-mono text-moon/80 break-all">{merchantTradeNo || "—"}</p>
              </div>
              {order.planName && <div><p className="text-xs text-moon/40">方案</p><p className="mt-0.5 text-moon">{order.planName}</p></div>}
              {order.amount != null && <div><p className="text-xs text-moon/40">金額</p><p className="mt-0.5 text-moon">NT${order.amount}</p></div>}
            </div>
          </div>

          {syncMsg && (
            <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${syncStatus === "error" || syncStatus === "still_pending" ? "border border-red-300/20 bg-red-300/6 text-red-300/80" : "border border-aurora/20 bg-aurora/6 text-aurora"}`}>
              {syncMsg}
            </div>
          )}

          <div className="mt-6 space-y-3">
            <button onClick={() => void handleSync()} disabled={syncStatus === "syncing"}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-lavender/20 px-5 py-3.5 font-semibold text-lavender transition hover:bg-lavender/30 disabled:opacity-60">
              {syncStatus === "syncing" ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-lavender/40 border-t-lavender"/>同步中…</> : "🔄 重新同步付款狀態"}
            </button>
            <button onClick={() => void fetchOrder()}
              className="flex w-full items-center justify-center rounded-full border border-white/15 px-5 py-3.5 text-sm text-moon/70 transition hover:bg-white/8">
              重新查詢
            </button>
            <button onClick={handleCopyTradeNo}
              className="flex w-full items-center justify-center rounded-full border border-white/10 px-5 py-3 text-sm text-moon/50 transition hover:bg-white/6">
              {tradeNoCopied ? "✓ 已複製訂單編號" : "複製訂單編號"}
            </button>
            <a href={`mailto:support@universewhisper.com?subject=付款成功但未收到通行碼&body=訂單編號：${merchantTradeNo}`}
              className="flex w-full items-center justify-center rounded-full border border-white/10 px-5 py-3 text-sm text-moon/50 transition hover:bg-white/6">
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
          <p className="mt-3 text-sm leading-7 text-moon/60">此次付款未能完成，你的帳戶不會被收費。</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/tarot" className="rounded-full bg-moon px-6 py-3 font-medium text-midnight transition hover:bg-white">回到塔羅頁</Link>
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
          <Link href="/tarot" className="mt-6 inline-block text-sm text-lavender/80 underline underline-offset-4">回到塔羅頁</Link>
        </section>
      </AppShell>
    );
  }

  // ── 付款成功 ──────────────────────────────────────────────────────────────

  const hasBuyerEmail = Boolean(order.hasBuyerEmail);

  // Email 狀態 Banner
  const emailBanner = (() => {
    if (order.emailSent) {
      return (
        <div className="rounded-xl border border-aurora/25 bg-aurora/8 px-4 py-3 text-sm text-aurora">
          ✓ 已自動寄出通行碼到{order.buyerEmail ? ` ${order.buyerEmail}` : "你的信箱"}，請到信箱確認。
        </div>
      );
    }
    if (order.emailError && !order.emailSent) {
      return (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/6 px-4 py-3 text-sm text-amber-400/90">
          ⚠ Email 備份寄送失敗，不影響通行碼使用。請先複製通行碼保存，或稍後再試。
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-moon/55">
        你可以輸入 Email，將通行碼寄到信箱備份。
      </div>
    );
  })();

  return (
    <AppShell>
      <section className="mx-auto w-full max-w-md py-12">

        {/* 未保存警告彈窗 */}
        {showUnsaved && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-5 backdrop-blur-sm">
            <div className="w-full max-w-xs rounded-2xl border border-white/15 bg-midnight p-5 shadow-glow">
              <p className="text-sm font-semibold text-moon">你還沒有保存通行碼</p>
              <p className="mt-2 text-xs leading-6 text-moon/65">
                之後查詢剩餘次數或再次抽牌會需要這組通行碼。建議先複製或寄到 Email 備份。
              </p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setShowUnsaved(false)}
                  className="flex-1 rounded-xl border border-[#d8bd70]/50 px-3 py-2.5 text-xs font-semibold text-[#d8bd70] transition hover:border-[#d8bd70]/80">
                  返回保存
                </button>
                <Link href="/tarot"
                  className="flex-1 rounded-xl border border-white/15 px-3 py-2.5 text-center text-xs text-moon/60 transition hover:border-white/30 hover:text-moon/85">
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
        <button onClick={handleCopyCode}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#d8bd70]/30 bg-[#d8bd70]/8 px-4 py-3 text-sm font-medium text-[#d8bd70] transition hover:bg-[#d8bd70]/14 active:scale-[0.98]">
          {codeCopied ? "✓ 已複製通行碼，請妥善保存。" : "複製通行碼"}
        </button>

        {/* Email 備份區塊 */}
        <div className="mt-5 rounded-2xl border border-white/10 bg-midnight/50 p-5">
          <p className="text-sm font-semibold text-moon">備份通行碼到 Email</p>
          <p className="mt-1 text-xs leading-6 text-moon/50">
            建議將通行碼寄到信箱備份，之後查詢剩餘次數或再次抽牌時會用到。
          </p>

          {/* Email 狀態 banner */}
          <div className="mt-3">{emailBanner}</div>

          {/* 輸入框 + 按鈕（寄送成功後隱藏） */}
          {emailStatus !== "sent" && (
            <div className="mt-4 space-y-2">
              <div className="space-y-1">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (emailMsg) setEmailMsg(""); }}
                  onKeyDown={(e) => e.key === "Enter" && void handleSendEmail()}
                  placeholder="請輸入要接收備份的 Email"
                  className="w-full rounded-xl border border-white/14 bg-white/6 px-4 py-3 text-sm text-moon placeholder-moon/30 outline-none transition focus:border-lavender/50"
                  disabled={emailStatus === "sending"}
                />
                {/* 如果有 buyerEmail → 顯示提示說明（不顯示遮罩 email 作為 placeholder 或 value） */}
                {hasBuyerEmail && (
                  <p className="text-xs text-moon/45">
                    已帶入付款時填寫的 Email，你也可以改成其他信箱。
                  </p>
                )}
              </div>

              {emailMsg && (
                <p className="text-xs text-red-300/80">{emailMsg}</p>
              )}

              <button
                onClick={() => void handleSendEmail()}
                disabled={emailStatus === "sending" || (!email.trim() && !hasBuyerEmail)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-lavender px-4 py-3.5 text-sm font-semibold text-midnight transition hover:bg-lavender/90 disabled:opacity-50 active:scale-[0.98]"
              >
                {emailStatus === "sending" ? (
                  <><span className="h-4 w-4 animate-spin rounded-full border-2 border-midnight/30 border-t-midnight"/>寄送中…</>
                ) : (
                  hasBuyerEmail && !email.trim()
                    ? "寄送通行碼到付款 Email"
                    : "寄送通行碼到 Email 備份"
                )}
              </button>
            </div>
          )}

          {emailStatus === "sent" && (
            <p className="mt-3 text-sm text-aurora">✓ {emailMsg || "已寄出通行碼，請到信箱確認。"}</p>
          )}
        </div>

        {/* 行動 CTA */}
        <div className="mt-6 space-y-3">
          <Link href="/tarot" onClick={handleGoDrawClick}
            className="flex w-full items-center justify-center rounded-full bg-moon px-5 py-3.5 font-semibold text-midnight transition hover:bg-white">
            我已保存通行碼，立即抽牌
          </Link>
          <Link href={`/redeem/check?code=${encodeURIComponent(order.redeemCode ?? "")}`}
            className="flex w-full items-center justify-center rounded-full border border-white/20 px-5 py-3.5 text-sm text-moon/70 transition hover:bg-white/8">
            查詢剩餘次數
          </Link>
        </div>

        <p className="mt-8 text-center text-xs text-moon/30">
          通行碼可用來查詢剩餘次數與再次抽牌。<br/>
          如有問題請透過網站聯絡客服。
        </p>
      </section>
    </AppShell>
  );
}
