import { NextResponse } from "next/server";
import { drawCards, type TarotTopic } from "@/lib/tarot";
import { checkAndIncrementLimit, getTaipeiDate } from "@/lib/rateLimit";
import { verifyAdminIdToken } from "@/lib/verifyAdmin";

const modeToCardCount = {
  single_tarot: 1,
  three_card: 3,
} as const;

type TarotMode = keyof typeof modeToCardCount;

function normalizeTopic(topic: unknown): TarotTopic {
  if (topic === "工作") return "工作";
  if (topic === "生活") return "生活";
  return "愛情";
}

function getRequestIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwardedFor ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function getResetAt(): string {
  // Next midnight in Asia/Taipei
  const now = new Date();
  const todayTaipei = getTaipeiDate();
  const [y, m, d] = todayTaipei.split("-").map(Number);
  const nextMidnight = new Date(Date.UTC(y, m - 1, d + 1, -8, 0, 0)); // UTC-8 offset for +8
  const diff = nextMidnight.getTime() - now.getTime();
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return hours > 0 ? `約 ${hours} 小時後重置` : `約 ${minutes} 分鐘後重置`;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    mode?: unknown;
    topic?: unknown;
    question?: unknown;
    anonymousId?: unknown;
    paidMode?: unknown;
  };

  const mode = (body.mode ?? "single_tarot") as TarotMode;
  const topic = normalizeTopic(body.topic);
  const anonymousId = typeof body.anonymousId === "string" ? body.anonymousId.slice(0, 128) : null;
  const paidMode = body.paidMode === true;

  if (!modeToCardCount[mode]) {
    return NextResponse.json({ error: "不支援的抽牌模式。" }, { status: 400 });
  }

  // ── Admin bypass via Firebase ID token ───────────────────────────────────
  const idToken = request.headers.get("x-firebase-id-token");
  const isAdmin = await verifyAdminIdToken(idToken);

  // ── Rate limit: 1/day for anon, 3/day for LINE users ─────────────────────
  const ip = getRequestIp(request);
  const feature = mode === "three_card" ? "three_card" : "single_tarot";

  if (!isAdmin && !paidMode) {
    try {
      const limitResult = await checkAndIncrementLimit(
        { ip, anonymousId, lineUserId: null, feature },
        "draw_limits",
      );

      if (!limitResult.allowed) {
        return NextResponse.json(
          {
            success: false,
            code: "DAILY_LIMIT_REACHED",
            message: "今天的免費抽牌次數已用完，明天再來聽宇宙說話。",
            remaining: 0,
            resetAt: getResetAt(),
          },
          { status: 429 },
        );
      }
    } catch (err) {
      // Firestore unavailable — fail open, allow draw
      console.error("[draw] Rate limit check failed, allowing request:", err);
    }
  }

  const cards = drawCards(modeToCardCount[mode], topic);

  return NextResponse.json({
    mode,
    topic,
    question: body.question ?? "",
    cards,
    aiRequired: false,
    storage: {
      collection: "tarot_logs",
      ready: true,
    },
  });
}
