/**
 * /api/admin/payment-test
 *
 * 管理員專用：模擬付款成功後的完整流程。
 * - 不呼叫綠界，不產生真實金流交易
 * - 建立 isTest:true 的測試訂單 + 測試解讀，再走正式 fulfillPaidOrder 邏輯
 * - 非管理員呼叫回傳 403
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getAdminUserIds } from "@/lib/rateLimit";
import { SESSION_COOKIE_NAME, verifyAdminSessionCookie } from "@/lib/verifyAdmin";
import { fulfillPaidOrder } from "@/lib/paymentFulfillment";
import { PAYMENT_ORDERS_COLLECTION } from "@/lib/redeemCodes";

export const runtime = "nodejs";

// ── Admin guard（與其他 admin API 路由相同的模式）────────────────────────────

async function verifyAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (await verifyAdminSessionCookie(sessionCookie)) return true;
  const lineUserId = cookieStore.get("line_user_id")?.value;
  return Boolean(lineUserId && getAdminUserIds().includes(lineUserId));
}

// ── 測試用 fullText 產生器（含所有 extractSection 能識別的標題）──────────────

function buildTestFullText(question: string, isThreeCard: boolean): string {
  if (isThreeCard) {
    return [
      "【⚠️ 管理員測試用，非正式占卜結果】",
      "",
      "本次問題焦點：",
      question,
      "",
      "宇宙偷偷話：",
      "這是三張牌測試解讀，愚者、戀人、星星三牌組合帶來積極向上的訊息。",
      "",
      "第1張牌：愚者（正位）",
      "牌面重點：",
      "愚者代表全新的開始與未知的冒險，帶著無憂無慮的心情踏上旅程。",
      "對你的問題代表：",
      "在你的問題中，這張牌提醒你保持開放的心態，不要被過去的包袱限制前進。",
      "這張牌提醒你：",
      "勇敢踏出第一步，宇宙會為你鋪路。",
      "",
      "第2張牌：戀人（正位）",
      "牌面重點：",
      "戀人代表選擇、和諧與深刻的連結，是心與心之間的真誠對話。",
      "對你的問題代表：",
      "在你的問題中，這張牌提醒你做出符合內心真實感受的選擇，而非只顧外在期待。",
      "這張牌提醒你：",
      "跟隨你的心，讓愛與和諧引導你的決定，誠實面對自己的需求。",
      "",
      "第3張牌：星星（正位）",
      "牌面重點：",
      "星星代表希望、療癒與對未來的信念，是黑暗後的一道光。",
      "對你的問題代表：",
      "在你的問題中，這張牌帶來希望與樂觀的訊息，事情正在往好的方向發展。",
      "這張牌提醒你：",
      "相信自己的直覺，保持希望，前方有美好的可能在等待你。",
      "",
      "牌陣總結",
      "整體答案：",
      "這三張牌組合傳達了一個清晰的訊息：你正站在一個新的起點，面臨重要的選擇。整體能量積極向上，只要跟隨內心，前路會越來越清晰。",
      "為什麼會這樣：",
      "過去的經歷讓你學到了寶貴的教訓，現在是時候將這些智慧運用到當下的選擇中，放下舊有的恐懼。",
      "3～7 天行動建議：",
      "這幾天先靜下來思考你真正想要的是什麼，不要急著做決定，讓答案自然浮現。找一個信任的朋友聊聊你的想法。",
      "",
      "給你的溫柔提醒：",
      "這是管理員測試解讀，用於確認付費解鎖流程是否正常運作。流程若正常，你會看到這段文字。",
      "",
      "一句專屬祝福：",
      "測試成功，系統運作一切正常！願每個求問的人都能收到宇宙真誠的回應。",
    ].join("\n");
  }

  return [
    "【⚠️ 管理員測試用，非正式占卜結果】",
    "",
    "本次問題焦點：",
    question,
    "",
    "宇宙偷偷話：",
    "這是測試用的單張牌解讀內容，愚者牌帶來全新開始的訊息，宇宙正在對你微笑。",
    "",
    "針對你的問題：",
    "在你的問題中，這張牌提醒你保持開放的心態，勇敢面對未知的可能性，一切都有其意義。",
    "",
    "今天可以怎麼做：",
    "找一件你一直想嘗試但還沒行動的事，今天就邁出第一步，哪怕只是很小的行動。",
    "",
    "給你的溫柔提醒：",
    "這是管理員測試解讀，用於確認付費解鎖流程是否正常運作。流程若正常，你會看到這段文字。",
    "",
    "一句專屬祝福：",
    "測試成功，系統運作一切正常！",
  ].join("\n");
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as {
    email?: string;
    question?: string;
    mode?: string;
    amount?: number;
    sendEmail?: boolean;
  };

  const {
    email,
    question = "測試問題（管理員模擬）",
    mode = "single_tarot",
    amount = 49,
    sendEmail = false,
  } = body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "INVALID_EMAIL" }, { status: 400 });
  }

  const db = getAdminDb();
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://universe-whisper.vercel.app"
  ).replace(/\/$/, "");
  const isThreeCard = mode === "three_card";

  // ── 1. 建立測試解讀（lineResults collection）────────────────────────────────
  const resultId = crypto.randomUUID();
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const lookupCode = `UW-${seg(8)}`;
  const resultUrl = `${siteUrl}/share/${resultId}`;

  const testCards = isThreeCard
    ? [
        { nameZh: "愚者",  name: "The Fool",   orientation: "upright", orientationLabel: "正位", position: "過去" },
        { nameZh: "戀人",  name: "The Lovers", orientation: "upright", orientationLabel: "正位", position: "現在" },
        { nameZh: "星星",  name: "The Star",   orientation: "upright", orientationLabel: "正位", position: "未來" },
      ]
    : [{ nameZh: "愚者", name: "The Fool", orientation: "upright", orientationLabel: "正位" }];

  await db.collection("lineResults").doc(resultId).set({
    id: resultId,
    resultId,
    type: "tarot",
    question,
    cards: testCards,
    shortText: "【管理員測試】這是管理員建立的測試解讀，用於確認付費流程是否正常運作。",
    fullText: buildTestFullText(question, isThreeCard),
    unlocked: false,
    resultUrl,
    lookupCode,
    lineUserId: null,
    lineDisplayName: null,
    pushStatus: "pending",
    isTest: true,
    source: "admin_payment_test",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // ── 2. 建立模擬付款訂單（paymentOrders collection）──────────────────────────
  // 只在 sendEmail===true 時帶入 buyerEmail，fulfillPaidOrder 會依此決定是否寄信
  const mockMerchantTradeNo = `MOCK${Date.now()}${seg(4)}`;
  const orderRef = db.collection(PAYMENT_ORDERS_COLLECTION).doc();

  const orderDoc: Record<string, unknown> = {
    orderNo: mockMerchantTradeNo,
    merchantTradeNo: mockMerchantTradeNo,
    status: "pending",
    planId: "single",
    planName: "宇宙通行碼 單次",
    amount,
    currency: "TWD",
    uses: 1,
    paymentMethod: "mock",
    isTest: true,
    source: "admin_payment_test",
    note: `管理員付費流程測試 ${new Date().toISOString()}`,
    createdAt: FieldValue.serverTimestamp(),
  };
  if (sendEmail) orderDoc.buyerEmail = email;

  await orderRef.set(orderDoc);

  // ── 3. 走正式交付流程（與綠界付款成功後完全相同的邏輯）──────────────────────
  let fulfillResult;
  try {
    fulfillResult = await fulfillPaidOrder({
      merchantTradeNo: mockMerchantTradeNo,
      providerPayload: {},
      source: "admin_payment_test",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "fulfillment failed";
    console.error("[admin/payment-test] fulfillment error", { detail });
    return NextResponse.json({ ok: false, error: "FULFILLMENT_FAILED", detail }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    orderId:          orderRef.id,
    merchantTradeNo:  mockMerchantTradeNo,
    resultId,
    resultUrl,
    lookupCode,
    redeemCode:       fulfillResult.redeemCode,
    displayName:      fulfillResult.displayName,
    totalUses:        fulfillResult.totalUses,
    remainingUses:    fulfillResult.remainingUses,
    expiresAt:        fulfillResult.expiresAt.toISOString(),
    emailSent:        fulfillResult.emailSent,
    emailTo:          sendEmail ? email : null,
    emailMessageId:   fulfillResult.emailMessageId ?? null,
    emailError:       fulfillResult.emailError ?? null,
    // 除錯資訊
    debug: {
      fulfillFunction: "fulfillPaidOrder",
      emailFunction:   "sendRedeemCodeEmail",
      isTest:          true,
      source:          "admin_payment_test",
      paymentMethod:   "mock",
    },
  });
}
