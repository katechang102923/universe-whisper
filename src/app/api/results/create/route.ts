import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import {
  getSiteUrl,
  LINE_RESULTS_COLLECTION,
  type LineResultCard,
  type LineResultType,
} from "@/lib/lineResults";
import { getAdminDb, getFirebaseAdminEnvStatus } from "@/lib/firebaseAdmin";

const validTypes = ["tarot", "daily", "whisper"] as const;

function isResultType(value: unknown): value is LineResultType {
  return typeof value === "string" && validTypes.includes(value as LineResultType);
}

function normalizeCards(cards: unknown): LineResultCard[] {
  if (!Array.isArray(cards)) return [];

  return cards.slice(0, 10).map((card) => {
    if (!card || typeof card !== "object") return {};
    const source = card as Record<string, unknown>;

    return {
      name: typeof source.name === "string" ? source.name : undefined,
      nameEn: typeof source.nameEn === "string" ? source.nameEn : undefined,
      nameZh: typeof source.nameZh === "string" ? source.nameZh : undefined,
      suit: typeof source.suit === "string" ? source.suit : undefined,
      orientation: typeof source.orientation === "string" ? source.orientation : undefined,
      orientationLabel: typeof source.orientationLabel === "string" ? source.orientationLabel : undefined,
      position: typeof source.position === "string" ? source.position : undefined,
    };
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const envStatus = getFirebaseAdminEnvStatus();

  if (!body || !isResultType(body.type)) {
    return NextResponse.json({ ok: false, error: "缺少有效的結果類型。" }, { status: 400 });
  }

  const shortText = typeof body.shortText === "string" ? body.shortText.trim() : "";
  const fullText = typeof body.fullText === "string" ? body.fullText.trim() : "";

  if (!shortText && !fullText) {
    return NextResponse.json({ ok: false, error: "缺少可儲存的宇宙訊息。" }, { status: 400 });
  }

  const resultId = crypto.randomUUID();
  const siteUrl = getSiteUrl(request);
  const resultUrl = `${siteUrl}/tarot?result=${encodeURIComponent(resultId)}`;
  console.info("[results/create] Request", {
    resultId,
    type: body.type,
    cardCount: Array.isArray(body.cards) ? body.cards.length : 0,
    shortTextLength: shortText.length,
    fullTextLength: fullText.length,
    envStatus,
  });

  try {
    await getAdminDb()
      .collection(LINE_RESULTS_COLLECTION)
      .doc(resultId)
      .set({
        id: resultId,
        resultId,
        type: body.type,
        question: typeof body.question === "string" ? body.question.trim().slice(0, 1000) : "",
        cards: normalizeCards(body.cards),
        shortText,
        fullText,
        resultUrl,
        lineUserId: null,
        lineDisplayName: null,
        pushedAt: null,
        pushStatus: "pending",
        pushError: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

    console.info("[results/create] Firestore write success", { resultId });
    return NextResponse.json({ ok: true, resultId, resultUrl });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Firestore error.";
    console.error("[results/create] Failed to save result:", { resultId, errorMessage, envStatus });
    return NextResponse.json(
      {
        ok: false,
        error: errorMessage.startsWith("Missing Firebase Admin")
          ? errorMessage
          : errorMessage.startsWith("Firebase Admin initialization failed")
            ? errorMessage
            : "宇宙訊息暫時存不起來，請稍後再試。",
        envStatus,
      },
      { status: 500 },
    );
  }
}
