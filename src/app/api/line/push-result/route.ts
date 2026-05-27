import { NextResponse } from "next/server";
import { getSiteUrl, pushResultToLine } from "@/lib/lineResults";

export async function POST(request: Request) {
  const internalSecret = process.env.LINE_CHANNEL_SECRET;
  console.info("[line/push-result] Request", {
    hasLineChannelSecret: Boolean(internalSecret),
    hasLineChannelAccessToken: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
  });

  if (internalSecret && request.headers.get("x-internal-line-secret") !== internalSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    resultId?: unknown;
    lineUserId?: unknown;
    lineDisplayName?: unknown;
  } | null;

  const resultId = typeof body?.resultId === "string" ? body.resultId.trim() : "";
  const lineUserId = typeof body?.lineUserId === "string" ? body.lineUserId.trim() : "";
  const lineDisplayName = typeof body?.lineDisplayName === "string" ? body.lineDisplayName.trim() : "";

  if (!resultId || !lineUserId) {
    return NextResponse.json({ ok: false, error: "缺少 resultId 或 LINE userId。" }, { status: 400 });
  }

  try {
    await pushResultToLine(resultId, lineUserId, getSiteUrl(request), lineDisplayName);
    return NextResponse.json({ ok: true, pushStatus: "sent" });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "LINE push failed.";
    console.error("[line/push-result] Failed:", { resultId, errorMessage });
    return NextResponse.json(
      {
        ok: false,
        pushStatus: "failed",
        error: errorMessage.includes("LINE push failed")
          ? "LINE 推送失敗，請確認使用者已加入好友，或檢查 Messaging API 權杖。"
          : "LINE 暫時有點安靜，請稍後再試。",
      },
      { status: 500 },
    );
  }
}
