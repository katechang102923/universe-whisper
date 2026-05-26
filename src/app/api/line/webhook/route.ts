import crypto from "crypto";
import { NextResponse } from "next/server";

type LineEvent = {
  type: string;
  replyToken?: string;
  message?: {
    type: string;
    text?: string;
  };
};

const replyText = "宇宙正在傾聽你✨";

function isValidLineSignature(body: string, signature: string | null) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) {
    return true;
  }

  if (!signature) {
    return false;
  }

  const digest = crypto.createHmac("sha256", secret).update(body).digest("base64");
  if (digest.length !== signature.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

async function replyToLine(replyToken: string) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    return { skipped: true, reason: "LINE_CHANNEL_ACCESS_TOKEN is not configured." };
  }

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text: replyText }]
    })
  });

  return { skipped: false, ok: response.ok, status: response.status };
}

export async function POST(request: Request) {
  const bodyText = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!isValidLineSignature(bodyText, signature)) {
    return NextResponse.json({ error: "Invalid LINE signature." }, { status: 401 });
  }

  const payload = JSON.parse(bodyText || "{}") as { events?: LineEvent[] };
  const messageEvents = (payload.events ?? []).filter(
    (event) => event.type === "message" && event.message?.type === "text" && event.replyToken
  );

  const replies = await Promise.all(messageEvents.map((event) => replyToLine(event.replyToken as string)));

  return NextResponse.json({
    ok: true,
    replyText,
    replies
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "/api/line/webhook" });
}
