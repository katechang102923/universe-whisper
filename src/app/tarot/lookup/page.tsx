"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageNavActions } from "@/components/PageNavActions";

type LookupStatus = "idle" | "loading" | "found" | "expired" | "not_found" | "error";

type CardData = {
  name?: string;
  nameZh?: string;
  nameEn?: string;
  orientation?: string;
  orientationLabel?: string;
  position?: string;
};

type LookupResult = {
  resultId: string;
  question: string;
  cards: CardData[];
  shortText: string;
  fullText: string;
  unlocked: boolean;
  createdAt: string | null;
};

export default function TarotLookupPage() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<LookupStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    setStatus("loading");
    setErrorMsg("");
    setResult(null);

    try {
      const res = await fetch(`/api/tarot/lookup?code=${encodeURIComponent(trimmed)}`);
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        expired?: boolean;
        resultId?: string;
        question?: string;
        cards?: CardData[];
        shortText?: string;
        fullText?: string;
        unlocked?: boolean;
        createdAt?: string | null;
        error?: string;
      };

      if (res.status === 429) {
        setErrorMsg("查詢過於頻繁，請稍後再試。");
        setStatus("error");
        return;
      }

      if (res.status === 410 || data.expired) {
        setStatus("expired");
        return;
      }

      if (!res.ok || !data.ok || !data.resultId) {
        setStatus("not_found");
        setErrorMsg(data.error || "找不到這組驗證碼，可能已過期或輸入錯誤。");
        return;
      }

      setResult({
        resultId: data.resultId,
        question: data.question ?? "",
        cards: data.cards ?? [],
        shortText: data.shortText ?? "",
        fullText: data.fullText ?? "",
        unlocked: data.unlocked === true,
        createdAt: data.createdAt ?? null,
      });
      setStatus("found");
    } catch {
      setErrorMsg("查詢時發生錯誤，請稍後再試。");
      setStatus("error");
    }
  }

  function reset() {
    setStatus("idle");
    setErrorMsg("");
    setResult(null);
    setCode("");
  }

  return (
    <AppShell>
      <section className="mx-auto w-full max-w-xl py-8 sm:py-12">
        <PageNavActions className="mb-6" />

        {status !== "found" && (
          <>
            <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">result lookup</p>
            <h1 className="mt-3 text-4xl font-semibold text-moon sm:text-5xl">
              查詢我的塔羅結果
            </h1>
            <p className="mt-4 text-base leading-8 text-moon/62">
              輸入你剛剛抽牌後取得的驗證碼，1 小時內可查詢本次結果。
            </p>

            <form onSubmit={(e) => void handleLookup(e)} className="mt-8">
              <label htmlFor="lookup-code" className="sr-only">驗證碼</label>
              <input
                id="lookup-code"
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (status !== "idle") setStatus("idle");
                }}
                placeholder="輸入 1 小時內的驗證碼（例如：UW-AB3DEFG）"
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

            {/* 過期 */}
            {status === "expired" && (
              <div className="mt-6 rounded-2xl border border-[#ffb4b4]/30 bg-[#ffb4b4]/5 px-5 py-4">
                <p className="text-sm leading-7 text-[#ffb4b4]">
                  驗證碼已過期，請重新抽牌。
                </p>
                <button
                  type="button"
                  onClick={reset}
                  className="mt-2 text-sm text-moon/50 underline underline-offset-2 hover:text-moon/80"
                >
                  重新輸入
                </button>
              </div>
            )}

            {/* 找不到 / 錯誤 */}
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

            <div className="mt-8 rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
              <p className="text-sm leading-7 text-moon/52">
                驗證碼顯示在抽牌結果頁（格式：UW-XXXXXXX），1 小時內有效。
                也可以直接將驗證碼傳到 LINE 官方帳號{" "}
                <span className="text-moon/70">@453gfmok</span>{" "}
                查詢結果。
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
          </>
        )}

        {/* 查詢結果 */}
        {status === "found" && result && (
          <div className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-aurora/80">查詢結果</p>
              <h1 className="mt-2 text-3xl font-semibold text-moon sm:text-4xl">你的塔羅結果</h1>
            </div>

            {/* 問題 */}
            {result.question && (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
                <p className="text-xs tracking-[0.18em] text-moon/40 mb-1">你的問題</p>
                <p className="text-base leading-7 text-moon/80">{result.question}</p>
              </div>
            )}

            {/* 牌 */}
            {result.cards.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs tracking-[0.18em] text-moon/40">抽到的牌</p>
                <div className="flex flex-wrap gap-3">
                  {result.cards.map((card, i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-lavender/20 bg-midnight/58 px-4 py-3 text-sm"
                    >
                      {card.position && (
                        <p className="text-xs text-moon/40 mb-0.5">{card.position}</p>
                      )}
                      <p className="font-semibold text-moon">
                        {card.nameZh || card.name || card.nameEn || "未知"}
                      </p>
                      {card.orientationLabel && (
                        <p className="text-xs text-lavender/70 mt-0.5">{card.orientationLabel}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 免費摘要 */}
            {result.shortText && (
              <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-5 py-4">
                <p className="text-xs tracking-[0.18em] text-moon/40 mb-2">宇宙訊息摘要</p>
                <p className="text-base leading-8 text-moon/80 whitespace-pre-wrap">{result.shortText}</p>
              </div>
            )}

            {/* 完整解讀（只在已解鎖時顯示） */}
            {result.unlocked && result.fullText ? (
              <div className="cosmic-reading-card rounded-[1.75rem] border border-lavender/20 bg-midnight/58 p-5 shadow-glow sm:p-6">
                <p className="text-sm tracking-[0.22em] text-lavender/70">完整解讀</p>
                <h3 className="mt-2 text-2xl font-semibold text-moon">完整宇宙訊息</h3>
                <div className="mt-4 text-base leading-8 text-moon/80 whitespace-pre-wrap">
                  {result.fullText.replace(/\*\*/g, "")}
                </div>
              </div>
            ) : !result.unlocked ? (
              <div className="rounded-2xl border border-[#d8bd70]/20 bg-[#d8bd70]/5 px-5 py-5">
                <p className="text-sm leading-7 text-moon/70">
                  本次為免費摘要版，完整解讀需回到抽牌頁分享或解鎖。
                </p>
                <Link
                  href="/tarot"
                  className="mt-3 inline-block rounded-full bg-moon px-5 py-2.5 text-sm font-medium text-midnight transition hover:bg-white"
                >
                  回到抽牌頁
                </Link>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={reset}
                className="rounded-full border border-white/12 px-5 py-3 text-sm text-moon/70 transition hover:bg-white/8"
              >
                查詢其他驗證碼
              </button>
              <Link
                href="/tarot"
                className="rounded-full border border-white/12 px-5 py-3 text-sm text-moon/70 transition hover:bg-white/8"
              >
                重新抽牌
              </Link>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
