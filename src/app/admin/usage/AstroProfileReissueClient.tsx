"use client";

import { useState } from "react";

interface ReissueCode {
  code:      string;
  status:    string;
  note:      string | null;
  createdAt: string | null;
  expiresAt: string | null;
  usedAt:    string | null;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    active:  { text: "可使用", cls: "bg-aurora/14 text-aurora" },
    used:    { text: "已兌換", cls: "bg-red-500/14 text-red-300" },
    expired: { text: "已過期", cls: "bg-white/8 text-moon/40" },
    revoked: { text: "已作廢", cls: "bg-red-500/14 text-red-300" },
  };
  const { text, cls } = map[status] ?? { text: status, cls: "bg-white/8 text-moon/40" };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{text}</span>;
}

export function AstroProfileReissueClient() {
  const [note, setNote] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<{ code: string; expiresAt: string } | null>(null);
  const [genError, setGenError] = useState("");
  const [copied, setCopied] = useState(false);

  const [codes, setCodes] = useState<ReissueCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenError("");
    setGenResult(null);
    setCopied(false);
    try {
      const res = await fetch("/api/astro-profile/reissue-code/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() }),
      });
      const data = await res.json() as { ok: boolean; code?: string; expiresAt?: string; error?: string };
      if (!res.ok || !data.ok || !data.code) {
        throw new Error(data.error === "UNAUTHORIZED" ? "需要管理員權限。" : "產生失敗，請稍後再試。");
      }
      setGenResult({ code: data.code, expiresAt: data.expiresAt ?? "" });
      setNote("");
      // 若已載入列表，重新載入
      if (loaded) void handleLoadCodes();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "產生失敗");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* ignore */ }
  };

  const handleLoadCodes = async () => {
    setLoadingCodes(true);
    setLoadError("");
    try {
      const res = await fetch("/api/astro-profile/reissue-code/list");
      const data = await res.json() as { ok: boolean; codes?: ReissueCode[]; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "載入失敗");
      setCodes(data.codes ?? []);
      setLoaded(true);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoadingCodes(false);
    }
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("zh-TW", {
        timeZone: "Asia/Taipei",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      });
    } catch { return iso; }
  };

  return (
    <div className="space-y-8">

      {/* ── 產生新序號 ── */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
        <div className="border-b border-white/8 px-5 py-4">
          <p className="text-sm font-semibold text-moon">產生補發序號（AP-XXXXXXXX）</p>
          <p className="mt-0.5 text-xs text-moon/44">
            單次使用・30 天有效・僅限三重星座解鎖（與塔羅通行碼完全獨立）
          </p>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs text-moon/55">備注（選填，例如：退款補發 / 客服協助）</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例：退款補發，訂單 MTN20260607001"
              maxLength={200}
              className="w-full rounded-xl border border-white/14 bg-[#0a1028] px-4 py-2.5 text-sm text-moon outline-none transition focus:border-lavender/60 focus:ring-2 focus:ring-lavender/20"
            />
          </div>

          <button
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="rounded-full border border-[#d8bd70]/40 bg-[#d8bd70]/10 px-6 py-2.5 text-sm font-semibold text-[#d8bd70] transition hover:bg-[#d8bd70]/20 active:scale-[0.98] disabled:opacity-60"
          >
            {generating ? "產生中…" : "✦ 產生補發序號"}
          </button>

          {genError && (
            <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-300">
              {genError}
            </p>
          )}

          {genResult && (
            <div className="space-y-3 rounded-xl border border-[#d8bd70]/30 bg-[#d8bd70]/8 p-4">
              <p className="text-xs text-moon/60">已成功產生序號：</p>
              <p className="font-mono text-xl font-bold tracking-widest text-[#d8bd70]">
                {genResult.code}
              </p>
              <p className="text-xs text-moon/45">
                有效期至：{fmtDate(genResult.expiresAt)}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => void handleCopy(genResult.code)}
                  className="rounded-full border border-[#d8bd70]/40 bg-[#d8bd70]/15 px-4 py-2 text-xs font-semibold text-[#d8bd70] transition hover:bg-[#d8bd70]/25"
                >
                  {copied ? "已複製！" : "複製序號"}
                </button>
                <button
                  onClick={() => setGenResult(null)}
                  className="rounded-full border border-white/14 bg-white/5 px-4 py-2 text-xs text-moon/45 transition hover:bg-white/10"
                >
                  關閉
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 序號列表 ── */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-midnight/50">
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-moon">補發序號列表（最近 50 筆）</p>
          </div>
          <button
            onClick={() => void handleLoadCodes()}
            disabled={loadingCodes}
            className="rounded-full border border-white/14 bg-white/5 px-4 py-2 text-xs text-moon/60 transition hover:bg-white/10 disabled:opacity-60"
          >
            {loadingCodes ? "載入中…" : loaded ? "↻ 重新整理" : "載入列表"}
          </button>
        </div>

        {loadError && (
          <div className="px-5 py-4">
            <p className="text-xs text-red-300">{loadError}</p>
          </div>
        )}

        {!loaded && !loadingCodes && !loadError && (
          <div className="px-5 py-6 text-center text-sm text-moon/38">點擊「載入列表」查看序號記錄</div>
        )}

        {loaded && codes.length === 0 && (
          <div className="px-5 py-6 text-center text-sm text-moon/38">尚無補發序號紀錄</div>
        )}

        {loaded && codes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left">
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-moon/48">序號</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-moon/48">狀態</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-moon/48">備注</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-moon/48">建立時間</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-moon/48">有效期</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-moon/48">兌換時間</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c, i) => (
                  <tr key={c.code} className={i < codes.length - 1 ? "border-b border-white/6" : ""}>
                    <td className="px-5 py-3 font-mono text-xs text-moon">{c.code}</td>
                    <td className="px-5 py-3"><StatusBadge status={c.status} /></td>
                    <td className="max-w-[200px] truncate px-5 py-3 text-xs text-moon/55">{c.note ?? "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-moon/50">{fmtDate(c.createdAt)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-moon/50">{fmtDate(c.expiresAt)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-moon/50">{fmtDate(c.usedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
