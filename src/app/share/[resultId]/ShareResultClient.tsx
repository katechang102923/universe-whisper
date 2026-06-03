"use client";

import { useState } from "react";
import RedeemCodeBlock from "@/components/RedeemCodeBlock";
import EmailResultBlock from "@/components/EmailResultBlock";

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
    setFullText(newFullText);
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

      {/* Email 寄送區塊（已解鎖後顯示） */}
      {isUnlocked && (
        <EmailResultBlock resultId={resultId} />
      )}
    </>
  );
}
