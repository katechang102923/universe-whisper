"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageNavActions } from "@/components/PageNavActions";

type LookupStatus = "idle" | "loading" | "not_found" | "error";

export default function TarotLookupPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<LookupStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch(`/api/tarot/lookup?code=${encodeURIComponent(trimmed)}`);
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        resultId?: string;
        resultUrl?: string;
        error?: string;
      };

      if (res.status === 429) {
        setErrorMsg("查詢過於頻繁，請稍後再試。");
        setStatus("error");
        return;
      }

      if (!res.ok || !data.ok || !data.resultId) {
        setStatus("not_found");
        setErrorMsg(data.error || "找不到這組結果查詢碼，請確認是否輸入正確。");
        return;
      }

      // 成功：跳轉到分享結果頁
      router.push(`/share/${data.resultId}`);
    } catch {
      setErrorMsg("查詢時發生錯誤，請稍後再試。");
      setStatus("error");
    }
  }

  return (
    <AppShell>
      <section className="mx-auto w-full max-w-xl py-8 sm:py-12">
        <PageNavActions className="mb-6" />
        <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">result lookup</p>
        <h1 className="mt-3 text-4xl font-semibold text-moon sm:text-5xl">
          查詢我的塔羅結果
        </h1>
        <p className="mt-4 text-base leading-8 text-moon/62">
          請輸入結果查詢碼，找回你之前抽到的牌與解讀。
        </p>

        <form onSubmit={(e) => void handleLookup(e)} className="mt-8">
          <label htmlFor="lookup-code" className="sr-only">結果查詢碼</label>
          <input
            id="lookup-code"
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              if (status !== "idle") setStatus("idle");
            }}
            placeholder="例如：UW-AB3DEFGH"
            className="w-full rounded-3xl border border-white/12 bg-midnight/58 px-5 py-4 text-lg tracking-wider text-moon outline-none transition placeholder:text-moon/35 focus:border-lavender"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />

          <button
            type="submit"
            disabled={status === "loading" || !code.trim()}
            className="mt-4 w-full rounded-full bg-moon px-6 py-3 font-medium text-midnight shadow-[0_0_24px_rgba(247,241,223,0.28)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "loading" ? "查詢中..." : "查看結果"}
          </button>
        </form>

        {/* 找不到 */}
        {(status === "not_found" || status === "error") && errorMsg ? (
          <div className="mt-6 rounded-2xl border border-[#ffb4b4]/30 bg-[#ffb4b4]/5 px-5 py-4">
            <p className="text-sm leading-7 text-[#ffb4b4]">{errorMsg}</p>
            <button
              type="button"
              onClick={() => { setStatus("idle"); setErrorMsg(""); }}
              className="mt-2 text-sm text-moon/50 underline underline-offset-2 hover:text-moon/80"
            >
              重新輸入
            </button>
          </div>
        ) : null}

        {/* 提示 */}
        <div className="mt-8 rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
          <p className="text-sm leading-7 text-moon/52">
            結果查詢碼顯示在抽牌結果頁底部（格式：UW-XXXXXXXX）。
            若你已使用 LINE 傳送過結果，也可以直接在{" "}
            <span className="text-moon/70">@453gfmok</span>{" "}
            聊天室輸入查詢碼取回結果。
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/tarot"
            className="rounded-full border border-white/12 px-5 py-3 text-sm text-moon/70 transition hover:bg-white/8"
          >
            重新抽牌
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
