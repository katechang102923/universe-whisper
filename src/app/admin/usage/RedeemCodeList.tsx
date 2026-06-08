"use client";

import { useState } from "react";
import { readJsonResponse } from "@/lib/readJsonResponse";

// ── 可序列化型別（由 Server Component 傳入） ─────────────────────────────────

export interface SerializableUsedLog {
  usedAt: string | null;
  resultId: string;
  question?: string;
  spreadType?: string;
  mode?: "single" | "three" | "unknown";
  source?: string;
  remainingUsesAfter: number;
}

export interface SerializableRedeemCode {
  code: string;
  planName: string;
  displayName: string;
  price: number;
  totalUses: number;
  remainingUses: number;
  status: string;
  createdAt: string | null;
  expiresAt: string | null;
  usedLogs: SerializableUsedLog[];
  source?: string;
  createdByAdmin?: boolean;
  paymentStatus?: string;
  isTest?: boolean;
  merchantTradeNo?: string;
  ecpayTradeNo?: string;
  buyerEmail?: string;
  emailSent?: boolean;
}

// ── 輔助元件 ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    active:   { text: "使用中", cls: "bg-aurora/14 text-aurora" },
    used_up:  { text: "已用完", cls: "bg-red-500/14 text-red-300" },
    expired:  { text: "已過期", cls: "bg-white/8 text-moon/40" },
    disabled: { text: "已停用", cls: "bg-white/8 text-moon/40" },
    revoked:  { text: "已作廢", cls: "bg-red-500/14 text-red-300" },
    refunded: { text: "已退款", cls: "bg-amber-400/14 text-amber-300" },
    test:     { text: "測試",   cls: "bg-lavender/14 text-lavender" },
  };
  const { text, cls } = map[status] ?? { text: status, cls: "bg-white/8 text-moon/40" };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{text}</span>;
}

function SourceBadge({ source }: { source?: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    ecpay_paid:     { text: "綠界付款", cls: "bg-aurora/12 text-aurora" },
    manual_admin:   { text: "後台建立", cls: "bg-lavender/12 text-lavender" },
    test:           { text: "測試",     cls: "bg-white/8 text-moon/40" },
    free_grant:     { text: "免費贈送", cls: "bg-amber-400/12 text-amber-300" },
    refund_reissue: { text: "退款補發", cls: "bg-red-500/12 text-red-300" },
  };
  if (!source) return <span className="text-moon/30 text-xs">—</span>;
  const { text, cls } = map[source] ?? { text: source, cls: "bg-white/8 text-moon/40" };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{text}</span>;
}

function ModeBadge({ mode }: { mode?: string }) {
  if (mode === "three") return <span className="rounded-full bg-lavender/12 px-2 py-0.5 text-xs text-lavender">三張牌</span>;
  if (mode === "single") return <span className="rounded-full bg-aurora/12 px-2 py-0.5 text-xs text-aurora">單張牌</span>;
  return <span className="text-moon/30 text-xs">—</span>;
}

function fmtDateStr(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("zh-TW") + " " + d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wider text-moon/40">{label}</span>
      <span className="text-sm text-moon/80">{value ?? "—"}</span>
    </div>
  );
}

// ── 詳細 Modal ────────────────────────────────────────────────────────────────

function RedeemCodeModal({
  code,
  onClose,
}: {
  code: SerializableRedeemCode;
  onClose: () => void;
}) {
  const usedCount = code.usedLogs.length;
  const remaining = code.remainingUses;

  const sourceLabel: Record<string, string> = {
    ecpay_paid:     "綠界付款",
    manual_admin:   "後台建立",
    test:           "測試",
    free_grant:     "免費贈送",
    refund_reissue: "退款補發",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-8 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0d0d1a] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/8 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-moon/44">通行碼詳細紀錄</p>
            <p className="mt-1 font-mono text-lg tracking-[0.16em] text-moon">{code.code}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm text-moon/60 transition hover:bg-white/12"
          >
            關閉
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* 基本資料 */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-moon/44">基本資料</h3>
            <div className="grid gap-4 rounded-xl border border-white/8 bg-white/4 p-4 sm:grid-cols-2">
              <Field label="方案名稱" value={code.displayName} />
              <Field label="狀態" value={<StatusBadge status={code.status} />} />
              <Field label="總次數" value={code.totalUses} />
              <Field label="已使用次數" value={usedCount} />
              <Field label="剩餘次數" value={remaining} />
              <Field label="來源" value={<SourceBadge source={code.source} />} />
              <Field label="建立時間" value={fmtDateStr(code.createdAt)} />
              <Field label="到期時間" value={fmtDateStr(code.expiresAt)} />
            </div>
          </section>

          {/* 付款 / 來源資料 */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-moon/44">付款 / 來源資料</h3>
            <div className="grid gap-4 rounded-xl border border-white/8 bg-white/4 p-4 sm:grid-cols-2">
              <Field label="來源類型" value={sourceLabel[code.source ?? ""] ?? (code.source ?? "—")} />
              <Field label="付款金額" value={code.price ? `NT$${code.price}` : "—"} />
              <Field label="購買 Email" value={code.buyerEmail ?? "—"} />
              <Field label="聯絡 Email" value={code.buyerEmail ?? "—"} />
              <Field label="MerchantTradeNo" value={
                code.merchantTradeNo
                  ? <span className="font-mono text-xs text-moon/70">{code.merchantTradeNo}</span>
                  : "—"
              } />
              <Field label="綠界交易編號 / TradeNo" value={
                code.ecpayTradeNo
                  ? <span className="font-mono text-xs text-moon/70">{code.ecpayTradeNo}</span>
                  : "—"
              } />
              <Field label="付款狀態" value={code.paymentStatus ?? "—"} />
              <Field label="Email 已寄" value={
                code.emailSent
                  ? <span className="rounded-full bg-aurora/12 px-2 py-0.5 text-xs text-aurora">已寄出</span>
                  : <span className="text-moon/40">未寄</span>
              } />
            </div>
          </section>

          {/* 使用紀錄 */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-moon/44">
              使用紀錄（{usedCount} 筆）
            </h3>
            {usedCount === 0 ? (
              <div className="rounded-xl border border-white/8 bg-white/4 p-4 text-sm text-moon/40">
                尚無使用紀錄
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-white/8">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/8 bg-white/4 text-left">
                      {["#", "使用時間", "功能", "問題摘要", "ResultId"].map((h) => (
                        <th key={h} className="whitespace-nowrap px-4 py-3 font-medium uppercase tracking-wider text-moon/44">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {code.usedLogs
                      .slice()
                      .sort((a, b) => {
                        if (!a.usedAt) return 1;
                        if (!b.usedAt) return -1;
                        return new Date(a.usedAt).getTime() - new Date(b.usedAt).getTime();
                      })
                      .map((log, idx) => (
                        <tr key={idx} className={idx < usedCount - 1 ? "border-b border-white/6" : ""}>
                          <td className="px-4 py-3 text-moon/40">{idx + 1}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-moon/60">
                            {fmtDateStr(log.usedAt)}
                          </td>
                          <td className="px-4 py-3">
                            <ModeBadge mode={log.mode ?? (
                              log.spreadType === "three" || log.spreadType === "three_card" ? "three"
                              : log.spreadType === "single" || log.spreadType === "tarot" ? "single"
                              : "unknown"
                            )} />
                          </td>
                          <td className="max-w-[160px] truncate px-4 py-3 text-moon/60">
                            {log.question ? (
                              <span title={log.question}>{log.question}</span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3 font-mono text-moon/40">
                            {log.resultId
                              ? <span title={log.resultId} className="text-xs">{log.resultId.slice(0, 8)}…</span>
                              : "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ── 刪除確認 Modal ────────────────────────────────────────────────────────────

function DeleteConfirmModal({
  code,
  onCancel,
  onConfirm,
  loading,
}: {
  code: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-[#0d0d1a] shadow-2xl">
        <div className="border-b border-white/8 px-6 py-5">
          <p className="text-base font-semibold text-moon">確定要刪除此通行碼？</p>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-moon/60">
            刪除後，此通行碼將無法再使用，相關紀錄也會從管理列表移除。此操作無法復原。
          </p>
          <div className="rounded-xl border border-white/8 bg-white/4 px-4 py-3">
            <span className="text-xs text-moon/44">即將刪除</span>
            <p className="mt-1 font-mono text-sm tracking-[0.14em] text-red-300">{code}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-white/8 px-6 py-4">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-full border border-white/12 bg-white/6 px-5 py-2 text-sm text-moon/70 transition hover:bg-white/10 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="rounded-full bg-red-500/80 px-5 py-2 text-sm text-white transition hover:bg-red-500 disabled:opacity-50"
          >
            {loading ? "刪除中…" : "確認刪除"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 批次刪除測試碼確認 Modal ──────────────────────────────────────────────────

function BulkDeleteConfirmModal({
  count,
  onCancel,
  onConfirm,
  loading,
}: {
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-[#0d0d1a] shadow-2xl">
        <div className="border-b border-white/8 px-6 py-5">
          <p className="text-base font-semibold text-moon">確定刪除測試通行碼？</p>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-moon/60">
            這會刪除目前後台建立的測試通行碼（source = manual_admin 且無正式付款資料），正式販售前請確認沒有要保留的通行碼。
          </p>
          {count > 0 && (
            <div className="rounded-xl border border-white/8 bg-white/4 px-4 py-3">
              <span className="text-xs text-moon/44">符合條件的通行碼</span>
              <p className="mt-1 text-sm font-semibold text-red-300">{count} 筆</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-white/8 px-6 py-4">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-full border border-white/12 bg-white/6 px-5 py-2 text-sm text-moon/70 transition hover:bg-white/10 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="rounded-full bg-red-500/80 px-5 py-2 text-sm text-white transition hover:bg-red-500 disabled:opacity-50"
          >
            {loading ? "刪除中…" : "確認刪除"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 主元件：通行碼列表 ────────────────────────────────────────────────────────

export function RedeemCodeList({ codes: initialCodes }: { codes: SerializableRedeemCode[] }) {
  const [codes, setCodes] = useState<SerializableRedeemCode[]>(initialCodes);
  const [selected, setSelected] = useState<SerializableRedeemCode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SerializableRedeemCode | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  // 測試碼：source === "manual_admin" 且無正式付款資料
  const adminCodes = codes.filter(
    (c) => c.source === "manual_admin" && !c.merchantTradeNo && !c.ecpayTradeNo && !c.buyerEmail && c.paymentStatus !== "paid",
  );

  function showToast(msg: string, type: "success" | "error") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleDelete(code: SerializableRedeemCode) {
    setDeleteLoading(true);
    try {
      const res = await fetch("/api/redeem/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.code }),
      });
      const data = await readJsonResponse<{ ok: boolean; error?: string }>(res, { ok: false });
      if (!data.ok) throw new Error(data.error ?? "刪除失敗");
      setCodes((prev) => prev.filter((c) => c.code !== code.code));
      showToast(`已刪除通行碼 ${code.code}`, "success");
    } catch {
      showToast("刪除失敗，請稍後再試", "error");
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  }

  async function handleBulkDelete() {
    setBulkLoading(true);
    try {
      const res = await fetch("/api/admin/cleanup?type=admin_codes", { method: "DELETE" });
      const data = await readJsonResponse<{ ok: boolean; deleted?: number; error?: string }>(res, { ok: false });
      if (!data.ok) throw new Error(data.error ?? "刪除失敗");
      // 從列表中移除同條件的通行碼
      setCodes((prev) =>
        prev.filter(
          (c) => !(c.source === "manual_admin" && !c.merchantTradeNo && !c.ecpayTradeNo && !c.buyerEmail && c.paymentStatus !== "paid"),
        ),
      );
      showToast(`已刪除 ${data.deleted ?? 0} 筆測試通行碼`, "success");
    } catch {
      showToast("批次刪除失敗，請稍後再試", "error");
    } finally {
      setBulkLoading(false);
      setShowBulkConfirm(false);
    }
  }

  return (
    <>
      {/* Toast 提示 */}
      {toast && (
        <div
          className={[
            "fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full px-5 py-2.5 text-sm shadow-xl transition",
            toast.type === "success"
              ? "bg-aurora/90 text-midnight"
              : "bg-red-500/90 text-white",
          ].join(" ")}
        >
          {toast.msg}
        </div>
      )}

      {/* 詳細 Modal */}
      {selected && (
        <RedeemCodeModal code={selected} onClose={() => setSelected(null)} />
      )}

      {/* 刪除確認 Modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          code={deleteTarget.code}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void handleDelete(deleteTarget)}
          loading={deleteLoading}
        />
      )}

      {/* 批次刪除確認 Modal */}
      {showBulkConfirm && (
        <BulkDeleteConfirmModal
          count={adminCodes.length}
          onCancel={() => setShowBulkConfirm(false)}
          onConfirm={() => void handleBulkDelete()}
          loading={bulkLoading}
        />
      )}

      {/* 列表上方：批次刪除按鈕 */}
      {adminCodes.length > 0 && (
        <div className="mb-3 flex justify-end">
          <button
            onClick={() => setShowBulkConfirm(true)}
            className="rounded-full border border-red-500/30 bg-red-500/8 px-4 py-2 text-xs text-red-300 transition hover:bg-red-500/16"
          >
            刪除測試通行碼（{adminCodes.length} 筆）
          </button>
        </div>
      )}

      {codes.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-midnight/50 p-5">
          <p className="text-sm text-moon/44">尚無通行碼紀錄。</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/8 text-left">
                  {["通行碼", "方案", "已用/總次", "狀態", "來源", "到期日", "購買Email", "MerchantNo", "Email", "使用次數", "操作"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 font-medium uppercase tracking-wider text-moon/44">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {codes.map((c, i) => {
                  const usedCount = c.usedLogs.length;
                  return (
                    <tr
                      key={c.code}
                      className={[
                        i < codes.length - 1 ? "border-b border-white/6" : "",
                        "transition hover:bg-white/4",
                      ].join(" ")}
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelected(c)}
                          className="font-mono tracking-[0.12em] text-moon/90 underline-offset-2 hover:text-aurora hover:underline"
                        >
                          {c.code}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-moon/70">{c.displayName}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-moon">{usedCount}</span>
                        <span className="text-moon/40">/{c.totalUses}</span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                      <td className="px-4 py-3"><SourceBadge source={c.source} /></td>
                      <td className="whitespace-nowrap px-4 py-3 text-moon/50">
                        {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("zh-TW") : "—"}
                      </td>
                      <td className="max-w-[120px] truncate px-4 py-3 text-moon/60">
                        {c.buyerEmail ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-moon/40">{c.merchantTradeNo ?? "—"}</td>
                      <td className="px-4 py-3">
                        {c.emailSent
                          ? <span className="rounded-full bg-aurora/12 px-2 py-0.5 text-aurora">已寄</span>
                          : <span className="text-moon/30">—</span>}
                      </td>
                      <td className="px-4 py-3 text-moon/60">{usedCount} 筆</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setSelected(c)}
                            className="rounded-full border border-lavender/30 bg-lavender/10 px-3 py-1 text-xs text-lavender transition hover:bg-lavender/20"
                          >
                            查看
                          </button>
                          <button
                            onClick={() => setDeleteTarget(c)}
                            className="rounded-full border border-red-500/30 bg-red-500/8 px-3 py-1 text-xs text-red-300 transition hover:bg-red-500/20"
                          >
                            刪除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
