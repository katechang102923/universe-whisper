"use client";

import { useState } from "react";

type CleanupType = "test_codes" | "test_orders";

interface CleanupTask {
  type: CleanupType;
  label: string;
  description: string;
}

const TASKS: CleanupTask[] = [
  {
    type: "test_codes",
    label: "刪除測試通行碼",
    description: "刪除所有 isTest = true 的通行碼資料",
  },
  {
    type: "test_orders",
    label: "刪除測試付款訂單",
    description: "刪除所有 isTest = true 的付款訂單資料",
  },
];

interface TaskState {
  confirming: boolean;
  loading: boolean;
  result: { deleted: number } | null;
  error: string | null;
}

export function CleanupClient() {
  const [states, setStates] = useState<Record<CleanupType, TaskState>>({
    test_codes: { confirming: false, loading: false, result: null, error: null },
    test_orders: { confirming: false, loading: false, result: null, error: null },
  });

  function startConfirm(type: CleanupType) {
    setStates((prev) => ({
      ...prev,
      [type]: { ...prev[type], confirming: true, result: null, error: null },
    }));
  }

  function cancelConfirm(type: CleanupType) {
    setStates((prev) => ({
      ...prev,
      [type]: { ...prev[type], confirming: false },
    }));
  }

  async function doDelete(type: CleanupType) {
    setStates((prev) => ({
      ...prev,
      [type]: { ...prev[type], loading: true, confirming: false, error: null },
    }));

    try {
      const res = await fetch(`/api/admin/cleanup?type=${type}`, { method: "DELETE" });
      const data = (await res.json()) as { ok: boolean; deleted?: number; error?: string };
      if (!data.ok) throw new Error(data.error ?? "刪除失敗");
      setStates((prev) => ({
        ...prev,
        [type]: { ...prev[type], loading: false, result: { deleted: data.deleted ?? 0 } },
      }));
    } catch (err) {
      setStates((prev) => ({
        ...prev,
        [type]: {
          ...prev[type],
          loading: false,
          error: err instanceof Error ? err.message : "刪除失敗",
        },
      }));
    }
  }

  return (
    <div className="space-y-4">
      {/* 警告說明 */}
      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/6 p-4 text-sm text-amber-200/80">
        <span className="font-semibold text-amber-300">注意：</span>
        以下操作只會刪除標記為 <code className="rounded bg-white/8 px-1 py-0.5 text-xs">isTest = true</code> 的資料，刪除後無法復原。
        正式付款訂單（status = paid）不受影響。
      </div>

      {TASKS.map((task) => {
        const s = states[task.type];
        return (
          <div
            key={task.type}
            className="rounded-2xl border border-white/10 bg-midnight/50 p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-moon">{task.label}</p>
                <p className="mt-0.5 text-xs text-moon/50">{task.description}</p>
              </div>

              {/* 狀態顯示 */}
              {s.result && (
                <span className="rounded-full bg-aurora/14 px-3 py-1 text-xs text-aurora">
                  已刪除 {s.result.deleted} 筆
                </span>
              )}
              {s.error && (
                <span className="rounded-full bg-red-500/14 px-3 py-1 text-xs text-red-300">
                  {s.error}
                </span>
              )}

              {/* 按鈕區 */}
              {!s.confirming && !s.loading && (
                <button
                  type="button"
                  onClick={() => startConfirm(task.type)}
                  className="rounded-full border border-red-500/30 bg-red-500/8 px-4 py-2 text-xs text-red-300 transition hover:bg-red-500/16"
                >
                  刪除測試資料
                </button>
              )}

              {s.loading && (
                <span className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-xs text-moon/50">
                  刪除中…
                </span>
              )}
            </div>

            {/* 確認框 */}
            {s.confirming && (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/6 p-4">
                <p className="text-sm font-semibold text-red-300">確定刪除測試資料？</p>
                <p className="mt-1 text-xs text-moon/60">
                  此操作只會刪除標記為測試的資料，刪除後無法復原。
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => cancelConfirm(task.type)}
                    className="rounded-full border border-white/12 bg-white/6 px-4 py-1.5 text-xs text-moon/70 transition hover:bg-white/10"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => void doDelete(task.type)}
                    className="rounded-full bg-red-500/80 px-4 py-1.5 text-xs text-white transition hover:bg-red-500"
                  >
                    確定刪除
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="rounded-2xl border border-white/8 bg-midnight/30 p-4 text-sm text-moon/44">
        <p className="font-medium text-moon/60">正式資料操作說明</p>
        <ul className="mt-2 space-y-1 text-xs leading-6">
          <li>• 正式付款訂單（paid 且非測試）無法直接刪除，請使用「作廢」或「退款」</li>
          <li>• 正式通行碼可在通行碼管理頁面進行作廢操作</li>
          <li>• 如需隱藏訂單，請在備註欄位加上說明</li>
        </ul>
      </div>
    </div>
  );
}
