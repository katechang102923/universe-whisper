"use client";

import { useState } from "react";
import RedeemCodeBlock from "@/components/RedeemCodeBlock";
import EmailResultBlock from "@/components/EmailResultBlock";
import { normalizePlainText } from "@/lib/textUtils";

const LINE_ADD_FRIEND_URL = "https://liff.line.me/2010215499-WrEJvUzE";

interface Props {
  resultId: string;
  /** 只在 unlocked===true 時由 Server 傳入，否則為 "" */
  initialFullText: string;
  initialUnlocked: boolean;
}

export default function ShareResultClient({
  resultId,
  initialFullText,
  initialUnlocked,
}: Props) {
  const [isUnlocked, setIsUnlocked] = useState(initialUnlocked);
  const [fullText, setFullText] = useState(initialFullText);

  function handleUnlocked(newFullText: string) {
    setIsUnlocked(true);
    setFullText(normalizePlainText(newFullText));
  }

  return (
    <>
      {/* 完整解讀（已解鎖） */}
      {isUnlocked && fullText && (
        <div className="mt-5 rounded-[1.5rem] border border-lavender/20 bg-midnight/58 p-5 shadow-glow sm:p-6">
          <p className="mb-3 text-sm tracking-[0.22em] text-lavender/70">完整解讀</p>
          <p className="whitespace-pre-line text-base leading-8 text-moon/84">
            {fullText}
          </p>
        </div>
      )}

      {/* 通行碼解鎖區塊（未解鎖時顯示） */}
      {!isUnlocked && (
        <RedeemCodeBlock resultId={resultId} onUnlocked={handleUnlocked} />
      )}

      {/* 保存結果區塊（已解鎖後顯示） */}
      {isUnlocked && (
        <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-midnight/50 p-5 sm:p-6">
          <p className="text-sm font-semibold tracking-[0.14em] text-moon">
            將本次結果保存起來
          </p>
          <p className="mt-1.5 text-sm leading-7 text-moon/55">
            你可以把本次完整解讀傳送到 LINE，或寄到 Email 收藏，之後想回來看也找得到。
          </p>

          {/* LINE 區塊 */}
          <div className="mt-5 border-t border-white/8 pt-5">
            <p className="text-xs font-medium tracking-[0.16em] text-moon/55 uppercase">
              傳送到 LINE
            </p>
            <p className="mt-1.5 text-xs leading-6 text-moon/40">
              加入官方帳號並輸入驗證碼，系統會自動回覆本次結果。
            </p>
            <a
              href={LINE_ADD_FRIEND_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.98] sm:w-auto sm:justify-start"
              style={{ background: "#06C755" }}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-white" aria-hidden="true">
                <path d="M12 2C6.48 2 2 5.93 2 10.76c0 2.65 1.4 5.01 3.58 6.61.12.09.2.23.17.39l-.36 1.74a.37.37 0 0 0 .54.41l2.05-1.07c.12-.07.26-.09.4-.06A12.4 12.4 0 0 0 12 19.5c5.52 0 10-3.93 10-8.74C22 5.93 17.52 2 12 2z" />
              </svg>
              傳送到 LINE 官方帳號
            </a>
          </div>

          {/* Email 區塊 */}
          <div className="mt-5 border-t border-white/8 pt-5">
            <p className="text-xs font-medium tracking-[0.16em] text-moon/55 uppercase">
              寄送到 Email
            </p>
            <p className="mt-1.5 text-xs leading-6 text-moon/40">
              輸入你的 Email，我們會把本次完整解讀寄給你收藏。
            </p>
            <EmailResultBlock resultId={resultId} />
          </div>
        </div>
      )}
    </>
  );
}
