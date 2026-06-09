"use client";

import { useMemo, useState } from "react";
import { readJsonResponse } from "@/lib/readJsonResponse";

// ── 直列化訂單型別 ─────────────────────────────────────────────────────────────

export interface SerializableOrder {
  id?: string;
  orderSource?: "tarot" | "astro_profile";
  orderNo?: string;
  merchantTradeNo?: string;
  ecpayTradeNo?: string;
  tradeNo?: string;
  status: string;
  planId?: string;
  planName?: string;
  amount?: number | null;
  currency?: string;
  uses?: number;
  buyerEmail?: string | null;
  userId?: string | null;
  paymentMethod?: string | null;
  paymentType?: string | null;
  paymentDate?: string | null;
  tradeAmt?: string | null;
  rtnCode?: string | null;
  rtnMsg?: string | null;
  cardLast4?: string | null;
  cardType?: string | null;
  authCode?: string | null;
  redeemCode?: string | null;
  redeemCodeId?: string | null;
  emailSent?: boolean;
  emailSentAt?: string | null;
  emailError?: string | null;
  createdAt?: string | null;
  paidAt?: string | null;
  failedAt?: string | null;
  refundedAt?: string | null;
  isTest?: boolean;
  note?: string | null;
  consents?: {
    ageAndGuardianConsent?: boolean;
    paymentAuthorizationConsent?: boolean;
    digitalContentConsent?: boolean;
    consentVersion?: string | null;
    consentAcceptedAt?: string | null;
    userAgent?: string | null;
    pagePath?: string | null;
    tarotMode?: string | null;
    amount?: number | null;
    currency?: string | null;
  } | null;
}

// ── 篩選條件 ──────────────────────────────────────────────────────────────────

type FilterKey =
  | "all" | "paid" | "pending" | "failed" | "refunded" | "test"
  | "email_unsent" | "has_code" | "no_code";

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "all",          label: "全部"       },
  { key: "paid",         label: "已付款"     },
  { key: "pending",      label: "待付款"     },
  { key: "failed",       label: "付款失敗"   },
  { key: "refunded",     label: "已退款"     },
  { key: "test",         label: "測試付款"   },
  { key: "email_unsent", label: "Email 未寄" },
  { key: "has_code",     label: "已產生碼"   },
  { key: "no_code",      label: "未產生碼"   },
];

// ── 工具 ──────────────────────────────────────────────────────────────────────

function toDateFromAny(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string") return new Date(v);
  if (typeof v === "object" && "toDate" in v) return (v as { toDate(): Date }).toDate();
  if (typeof v === "object" && "seconds" in v)
    return new Date((v as { seconds: number }).seconds * 1000);
  return null;
}

function fmtDate(v: unknown): string {
  const d = toDateFromAny(v);
  if (!d || isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function hasCompleteConsent(consents: SerializableOrder["consents"]): boolean {
  return Boolean(
    consents?.ageAndGuardianConsent &&
    consents.paymentAuthorizationConsent &&
    consents.digitalContentConsent,
  );
}

function consentText(value?: boolean): string {
  return value ? "已勾選" : "未記錄";
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, isTest }: { status: string; isTest?: boolean }) {
  const map: Record<string, { text: string; cls: string }> = {
    pending:   { text: "待付款",  cls: "bg-amber-400/14 text-amber-300" },
    paid:      { text: "已付款",  cls: "bg-green-400/14 text-green-300" },
    failed:    { text: "付款失敗", cls: "bg-red-400/14 text-red-300" },
    refunded:  { text: "已退款",  cls: "bg-white/10 text-moon/50" },
    cancelled: { text: "已取消",  cls: "bg-white/10 text-moon/40" },
  };
  const { text, cls } = map[status] ?? { text: status, cls: "bg-white/10 text-moon/50" };
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{text}</span>
      {isTest && (
        <span className="rounded-full bg-lavender/14 px-2 py-0.5 text-[11px] text-lavender">測試</span>
      )}
    </span>
  );
}

// ── 單筆訂單列 ────────────────────────────────────────────────────────────────

function OrderRow({ o, idx, total }: { o: SerializableOrder; idx: number; total: number }) {
  const [copied,      setCopied]      = useState(false);
  const [emailInput,  setEmailInput]  = useState("");
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [syncStatus,  setSyncStatus]  = useState<"idle" | "loading" | "synced" | "noop" | "error">("idle");
  const [syncMsg,     setSyncMsg]     = useState("");
  const [genStatus,   setGenStatus]   = useState<"idle" | "loading" | "done" | "error">("idle");
  const [genMsg,      setGenMsg]      = useState("");
  const [showEmail,   setShowEmail]   = useState(false);
  const [showDetail,  setShowDetail]  = useState(false);
  const [localCode,   setLocalCode]   = useState(o.redeemCode ?? null);

  const isLast = idx === total - 1;
  const effectiveCode = localCode ?? o.redeemCode;
  const isAstroOrder = o.orderSource === "astro_profile";

  function copyCode() {
    if (!effectiveCode) return;
    void navigator.clipboard.writeText(effectiveCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function resendEmail() {
    if (emailStatus === "sending") return;
    const trimmed = emailInput.trim();
    if (!trimmed || !effectiveCode) return;
    setEmailStatus("sending");
    try {
      const res = await fetch("/api/email/send-redeem-code", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantTradeNo: o.merchantTradeNo,
          redeemCode:      effectiveCode,
          email:           trimmed,
        }),
      });
      const data = await readJsonResponse<{ ok: boolean; message?: string }>(res, { ok: false });
      setEmailStatus(data.ok ? "sent" : "error");
    } catch {
      setEmailStatus("error");
    }
  }

  async function syncEcpay() {
    if (syncStatus === "loading") return;
    setSyncStatus("loading");
    setSyncMsg("");
    try {
      const res = await fetch("/api/ecpay/sync-order", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantTradeNo: o.merchantTradeNo }),
      });
      const data = await readJsonResponse<{
        ok: boolean; status?: string; redeemCode?: string; message?: string; error?: string;
      }>(res, { ok: false });
      if (data.ok && data.status === "paid") {
        setSyncStatus("synced");
        if (data.redeemCode) setLocalCode(data.redeemCode);
        setSyncMsg(data.message === "already_paid" ? "訂單已是付款狀態。" : `同步成功！通行碼：${data.redeemCode ?? ""}`);
      } else if (data.ok && data.status === "pending") {
        setSyncStatus("noop");
        setSyncMsg(data.message ?? "目前尚未查到付款成功紀錄。");
      } else {
        setSyncStatus("error");
        setSyncMsg(data.message ?? data.error ?? "同步失敗");
      }
    } catch {
      setSyncStatus("error");
      setSyncMsg("網路錯誤");
    }
  }

  async function manualGenerate() {
    if (genStatus === "loading") return;
    setGenStatus("loading");
    setGenMsg("");
    try {
      const res = await fetch("/api/ecpay/sync-order", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantTradeNo: o.merchantTradeNo, forceGenerate: true }),
      });
      const data = await readJsonResponse<{ ok: boolean; redeemCode?: string; message?: string; error?: string }>(res, { ok: false });
      if (data.ok && data.redeemCode) {
        setGenStatus("done");
        setLocalCode(data.redeemCode);
        setGenMsg(`通行碼已產生：${data.redeemCode}`);
      } else {
        setGenStatus("error");
        setGenMsg(data.message ?? data.error ?? "產生失敗");
      }
    } catch {
      setGenStatus("error");
      setGenMsg("網路錯誤");
    }
  }

  return (
    <>
      <tr className={!isLast ? "border-b border-white/6" : ""}>
        <td className="whitespace-nowrap px-3 py-2.5 text-moon/55">{fmtDate(o.createdAt)}</td>
        <td className="whitespace-nowrap px-3 py-2.5 text-moon/55">{fmtDate(o.paidAt ?? o.paymentDate)}</td>
        <td className="px-3 py-2.5 text-moon/80">{o.planName ?? "—"}</td>
        <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-moon">
          {o.amount != null ? `NT$${o.amount}` : "—"}
        </td>
        <td className="px-3 py-2.5">
          <StatusBadge status={o.status} isTest={o.isTest} />
        </td>
        <td className="max-w-[110px] truncate px-3 py-2.5 text-moon/60">{o.buyerEmail ?? "—"}</td>
        <td className="px-3 py-2.5 font-mono tracking-[0.1em] text-[11px] text-moon/80">
          {effectiveCode ?? <span className="text-moon/30">—</span>}
        </td>
        <td className="px-3 py-2.5 font-mono text-[10px] text-moon/40">{o.merchantTradeNo ?? "—"}</td>
        <td className="px-3 py-2.5 font-mono text-[10px] text-moon/35">{o.ecpayTradeNo ?? o.tradeNo ?? "—"}</td>
        <td className="px-3 py-2.5">
          {o.emailSent ? (
            <span className="rounded-full bg-aurora/12 px-2 py-0.5 text-[11px] text-aurora">已寄</span>
          ) : o.emailError ? (
            <span className="rounded-full bg-red-400/12 px-2 py-0.5 text-[11px] text-red-300" title={o.emailError}>失敗</span>
          ) : (
            <span className="rounded-full bg-white/6 px-2 py-0.5 text-[11px] text-moon/40">未寄</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] ${hasCompleteConsent(o.consents) ? "bg-aurora/12 text-aurora" : "bg-white/6 text-moon/40"}`}>
            同意紀錄：{hasCompleteConsent(o.consents) ? "完整" : "未記錄"}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap gap-1">
            {effectiveCode && (
              <button onClick={copyCode} className="rounded-lg bg-[#d8bd70]/12 px-2 py-1 text-[11px] text-[#d8bd70] transition hover:bg-[#d8bd70]/20">
                {copied ? "✓已複製" : "複製碼"}
              </button>
            )}
            {!isAstroOrder && (
              <button onClick={() => setShowEmail(!showEmail)} className="rounded-lg bg-white/8 px-2 py-1 text-[11px] text-moon/60 transition hover:bg-white/14">
                補寄 Email
              </button>
            )}
            {!isAstroOrder && o.status !== "refunded" && o.status !== "cancelled" && (
              <button onClick={() => void syncEcpay()} disabled={syncStatus === "loading"} className="rounded-lg bg-lavender/12 px-2 py-1 text-[11px] text-lavender/80 transition hover:bg-lavender/20 disabled:opacity-50">
                {syncStatus === "loading" ? "同步中…" : "同步綠界"}
              </button>
            )}
            {!isAstroOrder && o.status === "paid" && !effectiveCode && (
              <button onClick={() => void manualGenerate()} disabled={genStatus === "loading"} className="rounded-lg bg-amber-400/14 px-2 py-1 text-[11px] text-amber-300 transition hover:bg-amber-400/22 disabled:opacity-50">
                {genStatus === "loading" ? "產生中…" : "手動產生碼"}
              </button>
            )}
            <button onClick={() => setShowDetail(!showDetail)} className="rounded-lg bg-white/6 px-2 py-1 text-[11px] text-moon/40 transition hover:bg-white/12">
              {showDetail ? "收起" : "詳情"}
            </button>
          </div>
        </td>
      </tr>

      {/* 補寄 Email 展開列 */}
      {showEmail && (
        <tr className="border-b border-white/6 bg-white/[0.02]">
          <td colSpan={12} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder={o.buyerEmail ? `原：${o.buyerEmail}` : "請輸入 Email"}
                className="w-56 rounded-lg border border-white/12 bg-white/6 px-3 py-1.5 text-xs text-moon placeholder-moon/30 outline-none focus:border-lavender/40"
                disabled={emailStatus === "sending"}
              />
              <button
                onClick={() => void resendEmail()}
                disabled={emailStatus === "sending" || !emailInput.trim() || !effectiveCode}
                className="rounded-lg bg-moon/14 px-3 py-1.5 text-xs font-medium text-moon transition hover:bg-moon/22 disabled:opacity-50"
              >
                {emailStatus === "sending" ? "寄送中…" : "寄送通行碼"}
              </button>
              {emailStatus === "sent"  && <span className="text-xs text-aurora">✓ 已寄出</span>}
              {emailStatus === "error" && <span className="text-xs text-red-300/80">寄送失敗</span>}
            </div>
          </td>
        </tr>
      )}

      {/* 同步結果列 */}
      {syncMsg && (
        <tr className="border-b border-white/6 bg-white/[0.02]">
          <td colSpan={12} className="px-4 py-2">
            <p className={`text-xs ${syncStatus === "error" ? "text-red-300/80" : "text-aurora/80"}`}>
              {syncStatus === "synced" ? "✓ " : syncStatus === "noop" ? "ℹ " : "✕ "}{syncMsg}
            </p>
          </td>
        </tr>
      )}

      {/* 手動產生結果列 */}
      {genMsg && (
        <tr className="border-b border-white/6 bg-white/[0.02]">
          <td colSpan={12} className="px-4 py-2">
            <p className={`text-xs ${genStatus === "error" ? "text-red-300/80" : "text-amber-300/80"}`}>
              {genStatus === "done" ? "✓ " : "✕ "}{genMsg}
            </p>
          </td>
        </tr>
      )}

      {/* 詳情列 */}
      {showDetail && (
        <tr className="border-b border-white/6 bg-white/[0.015]">
          <td colSpan={12} className="px-4 py-3">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-4">
              {([
                ["訂單 ID",         o.id],
                ["MerchantTradeNo", o.merchantTradeNo],
                ["ECPay TradeNo",   o.ecpayTradeNo ?? o.tradeNo],
                ["付款方式",        o.paymentType],
                ["付款金額",        o.amount != null ? `NT$${o.amount}` : undefined],
                ["RtnCode",         o.rtnCode],
                ["RtnMsg",          o.rtnMsg],
                ["PaymentDate",     o.paymentDate],
                ["TradeAmt",        o.tradeAmt],
                ["買家 Email",      o.buyerEmail],
                ["通行碼 ID",       o.redeemCodeId ?? effectiveCode],
                ["Email 寄送",      o.emailSent ? `已寄 ${fmtDate(o.emailSentAt)}` : "未寄"],
                ["Email 錯誤",      o.emailError],
                ["建立時間",        fmtDate(o.createdAt)],
                ["付款時間",        fmtDate(o.paidAt ?? o.paymentDate)],
                ["測試訂單",        o.isTest ? "是" : undefined],
              ] as [string, string | number | null | undefined][])
                .filter(([, val]) => val != null && val !== "")
                .map(([label, val]) => (
                  <div key={label}>
                    <p className="text-moon/40">{label}</p>
                    <p className="font-mono text-moon/70 break-all">{String(val)}</p>
                  </div>
                ))}
            </div>
            <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.025] p-3 text-xs">
              <p className="mb-2 font-semibold text-moon/70">付款同意紀錄</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-moon/40">年齡/監護人同意</p>
                  <p className="text-moon/70">{consentText(o.consents?.ageAndGuardianConsent)}</p>
                </div>
                <div>
                  <p className="text-moon/40">付款授權同意</p>
                  <p className="text-moon/70">{consentText(o.consents?.paymentAuthorizationConsent)}</p>
                </div>
                <div>
                  <p className="text-moon/40">數位內容提供同意</p>
                  <p className="text-moon/70">{consentText(o.consents?.digitalContentConsent)}</p>
                </div>
                <div>
                  <p className="text-moon/40">同意時間</p>
                  <p className="font-mono text-moon/70">{o.consents?.consentAcceptedAt ? fmtDate(o.consents.consentAcceptedAt) : "未記錄"}</p>
                </div>
                <div>
                  <p className="text-moon/40">consentVersion</p>
                  <p className="font-mono text-moon/70 break-all">{o.consents?.consentVersion ?? "未記錄"}</p>
                </div>
                <div>
                  <p className="text-moon/40">來源頁面 / 模式</p>
                  <p className="font-mono text-moon/70 break-all">
                    {[o.consents?.pagePath, o.consents?.tarotMode].filter(Boolean).join(" / ") || "未記錄"}
                  </p>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── 主元件 ────────────────────────────────────────────────────────────────────

export function OrdersTabClient({ orders }: { orders: SerializableOrder[] }) {
  const [filterKey, setFilterKey] = useState<FilterKey>("all");
  const [search,    setSearch]    = useState("");

  const filtered = useMemo(() => {
    let rows = orders;

    // 狀態篩選
    switch (filterKey) {
      case "paid":         rows = rows.filter((o) => o.status === "paid" && !o.isTest); break;
      case "pending":      rows = rows.filter((o) => o.status === "pending");            break;
      case "failed":       rows = rows.filter((o) => o.status === "failed");             break;
      case "refunded":     rows = rows.filter((o) => o.status === "refunded");           break;
      case "test":         rows = rows.filter((o) => o.isTest);                          break;
      case "email_unsent": rows = rows.filter((o) => !o.emailSent);                     break;
      case "has_code":     rows = rows.filter((o) => Boolean(o.redeemCode));             break;
      case "no_code":      rows = rows.filter((o) => !o.redeemCode);                    break;
    }

    // 關鍵字搜尋
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((o) => (
        o.buyerEmail?.toLowerCase().includes(q) ||
        o.redeemCode?.toLowerCase().includes(q) ||
        o.merchantTradeNo?.toLowerCase().includes(q) ||
        o.ecpayTradeNo?.toLowerCase().includes(q) ||
        o.tradeNo?.toLowerCase().includes(q)
      ));
    }

    return rows;
  }, [orders, filterKey, search]);

  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-midnight/50 p-8 text-center">
        <p className="text-moon/50">尚無付款訂單資料</p>
      </div>
    );
  }

  const paidCount    = orders.filter((o) => o.status === "paid" && !o.isTest).length;
  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const testCount    = orders.filter((o) => o.isTest).length;
  const revenue      = orders
    .filter((o) => o.status === "paid" && !o.isTest)
    .reduce((s, o) => s + (o.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* 小統計 */}
      <div className="flex flex-wrap gap-3">
        {([
          ["總筆數", orders.length],
          ["已付款", paidCount],
          ["待付款", pendingCount],
          ["測試", testCount],
          ["實際收入", revenue > 0 ? `NT$${revenue.toLocaleString("zh-TW")}` : "—"],
        ] as [string, string | number][]).map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-midnight/50 px-4 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-moon/40">{label}</p>
            <p className="text-lg font-semibold text-moon">{value}</p>
          </div>
        ))}
      </div>

      {/* 搜尋 + 篩選 */}
      <div className="space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋 Email、通行碼、MerchantTradeNo、TradeNo…"
          className="w-full rounded-xl border border-white/12 bg-midnight/50 px-4 py-2.5 text-sm text-moon placeholder-moon/30 outline-none transition focus:border-lavender/40"
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTER_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterKey(key)}
              className={[
                "rounded-full px-3 py-1.5 text-xs font-medium transition",
                filterKey === key
                  ? "bg-lavender/22 text-lavender"
                  : "bg-white/6 text-moon/55 hover:bg-white/12 hover:text-moon",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
        {(search || filterKey !== "all") && (
          <p className="text-xs text-moon/40">
            顯示 {filtered.length} / {orders.length} 筆
            {search && ` · 搜尋「${search}」`}
          </p>
        )}
      </div>

      {/* 表格 */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
        <div className="border-b border-white/8 px-5 py-4">
          <p className="text-sm font-semibold text-moon">付款訂單（{filtered.length} 筆）</p>
        </div>
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-moon/40">找不到符合條件的訂單</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/8 text-left">
                  {[
                    "建立時間", "付款時間", "方案", "金額", "狀態",
                    "Email", "通行碼", "MerchantTradeNo", "TradeNo",
                    "Email 狀態", "同意紀錄", "操作",
                  ].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-3 py-3 font-medium uppercase tracking-wider text-moon/40"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((o, i) => (
                  <OrderRow key={o.id ?? i} o={o} idx={i} total={filtered.length} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
