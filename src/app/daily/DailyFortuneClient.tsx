"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { HoroscopeSign, HoroscopeSigns } from "@/lib/dailyHoroscope";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DailyHoroscopeData {
  date: string;
  signs: HoroscopeSigns;
}

type ZodiacSlug =
  | "aries" | "taurus" | "gemini" | "cancer"
  | "leo" | "virgo" | "libra" | "scorpio"
  | "sagittarius" | "capricorn" | "aquarius" | "pisces";

// ── Zodiac metadata ───────────────────────────────────────────────────────────

const ZODIAC_ORDER: ZodiacSlug[] = [
  "aries", "taurus", "gemini",
  "cancer", "leo", "virgo",
  "libra", "scorpio", "sagittarius",
  "capricorn", "aquarius", "pisces",
];

const ZODIAC_LABELS: Record<ZodiacSlug, string> = {
  aries: "牡羊座", taurus: "金牛座", gemini: "雙子座",
  cancer: "巨蟹座", leo: "獅子座", virgo: "處女座",
  libra: "天秤座", scorpio: "天蠍座", sagittarius: "射手座",
  capricorn: "摩羯座", aquarius: "水瓶座", pisces: "雙魚座",
};

const ZODIAC_SYMBOLS: Record<ZodiacSlug, string> = {
  aries: "♈", taurus: "♉", gemini: "♊",
  cancer: "♋", leo: "♌", virgo: "♍",
  libra: "♎", scorpio: "♏", sagittarius: "♐",
  capricorn: "♑", aquarius: "♒", pisces: "♓",
};

const ZODIAC_DATES: Record<ZodiacSlug, string> = {
  aries: "3/21–4/19", taurus: "4/20–5/20", gemini: "5/21–6/21",
  cancer: "6/22–7/22", leo: "7/23–8/22", virgo: "8/23–9/22",
  libra: "9/23–10/23", scorpio: "10/24–11/21", sagittarius: "11/22–12/21",
  capricorn: "12/22–1/19", aquarius: "1/20–2/18", pisces: "2/19–3/20",
};

const ZODIAC_IMAGES: Record<ZodiacSlug, string> = {
  aries: "/images/zodiac/aries-cat.webp",
  taurus: "/images/zodiac/taurus-cat.webp",
  gemini: "/images/zodiac/gemini-cat.webp",
  cancer: "/images/zodiac/cancer-cat.webp",
  leo: "/images/zodiac/leo-cat.webp",
  virgo: "/images/zodiac/virgo-cat.webp",
  libra: "/images/zodiac/libra-cat.webp",
  scorpio: "/images/zodiac/scorpio-cat.webp",
  sagittarius: "/images/zodiac/sagittarius-cat.webp",
  capricorn: "/images/zodiac/capricorn-cat.webp",
  aquarius: "/images/zodiac/aquarius-cat.webp",
  pisces: "/images/zodiac/pisces-cat.webp",
};

const LS_KEY = "universe-whisper-daily-zodiac-slug";

// ── Client-side fallback generator ───────────────────────────────────────────
// Same seeded-random logic as dailyHoroscope.ts so the deterministic
// fallback is consistent.  Runs instantly; replaced by API data once loaded.

function getTodayTaipei(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

function sr(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}
function ss(seed: number): number {
  const r = sr(seed);
  if (r < 0.10) return 1;
  if (r < 0.30) return 2;
  if (r < 0.65) return 3;
  if (r < 0.90) return 4;
  return 5;
}
function sp<T>(arr: T[], seed: number): T {
  return arr[Math.floor(sr(seed) * arr.length)];
}

const FB_COLORS = [
  "晨光金", "月霧綠", "星河銀", "珍珠白", "暖琥珀",
  "霧藍灰", "玫瑰霧", "深莓紫", "曙光橘", "松石黑",
  "極光藍", "月光紫", "薰衣草紫", "午夜藍", "翡翠綠",
];
const FB_TIMES = [
  "07:00–09:00", "09:00–11:00", "11:00–13:00",
  "13:00–15:00", "15:00–17:00", "17:00–19:00",
  "19:00–21:00", "21:00–23:00",
];
const FB_SUMMARY = [
  "今天適合把節奏放慢一些，讓自己在前進之前先確認方向。不需要急著有結果，穩穩的行動已經很好。",
  "今天的訊息提醒你，最重要的往往是內心已經知道的事。讓自己靜下來聽，答案比你想的更近。",
  "今天適合整理思緒，把複雜的事情拆成小步驟。每一個小進展都值得被肯定，不要只看最終目標。",
  "宇宙今天給你一個喘息的空間。好好接住它，休息是為了讓接下來的每一步更有力量。",
  "今天你的直覺比邏輯更準。相信那個最初的感受，它正在帶你走向對的地方。",
  "今天有些看似繁瑣的事情其實很重要。先把它們一件一件完成，會比較有完整的安心感。",
  "今天適合把自己的需求說清楚。別總是猜對方想要什麼，試著表達自己的想法與感受。",
  "今天能量偏向內收。適合反思、整理、小休息，不需要強迫自己一直輸出。",
];
const FB_LOVE = [
  "愛情裡今天適合輕鬆自在地靠近。不需要証明什麼，真實的你就是最好的禮物。",
  "感情上今天容易有些小摩擦，但不要把它放大。有話說清楚，比悶在心裡更容易解決。",
  "今天適合用行動代替語言。一個小小的關心，比反覆解釋更能讓對方感覺到你的心意。",
  "感情上今天你可能需要多一點確定感。別急著逼出答案，先照顧自己的穩定。",
  "今天有機會拉近距離。一個真誠的對話，都能讓感情向前走一步。",
];
const FB_WORK = [
  "工作上今天適合專注在一件最重要的事。完成它，你會感覺到清晰和方向感回來了。",
  "今天工作容易有臨時狀況出現。保持彈性，先確認資訊再決定怎麼應對。",
  "工作能量今天偏向細節與整理。把積累的事情一件一件清理掉，會有輕鬆感。",
  "今天適合主動溝通、推進停滯的事。等待不一定會有答案，先問一步試試看。",
  "工作上今天適合把複雜的事情拆分清楚。小步驟比大計畫更容易帶來進展。",
];
const FB_MONEY = [
  "財務上今天適合審視而不是行動。先了解現況，再做決定，會比衝動更有把握。",
  "今天財運穩中帶穩。沒有特別驚喜，但也不會有意外。適合做些平日的財務整理。",
  "今天在消費決定上保持謹慎。把衝動型支出先暫停，等一兩天再看看還需不需要。",
  "財運今天有小機會出現。留意身邊的資訊，但不要為了抓機會而冒太大的風險。",
  "今天適合把收入和支出做個簡單盤點。清楚了解財務現況，能讓你更安心地前進。",
];
const FB_SOCIAL = [
  "人際上今天一個真誠的互動勝過許多表面的來往。把心打開一點，好的連結自然會靠近。",
  "今天人際能量偏低，不適合強迫交際。給自己一點獨處的空間，也是一種充電方式。",
  "今天適合主動關心一個久沒聯絡的人。一句問候，可能比你想像中更重要。",
  "人際上今天容易有些誤解。先確認對方的意思再回應，不要把猜測當成事實。",
  "今天有機會認識到對你有幫助的人。保持開放，讓自己稍微走出舒適圈看看。",
];

function clientFallbackSign(slug: ZodiacSlug, date: string): HoroscopeSign {
  const signName = ZODIAC_LABELS[slug];
  const seed = [...`${date}-${signName}`].reduce((s, c) => s + c.charCodeAt(0), 0);
  const loveStars = ss(seed + 100);
  const workStars = ss(seed + 200);
  const moneyStars = ss(seed + 300);
  const socialStars = ss(seed + 400);
  const overallStars = Math.round((loveStars + workStars + moneyStars + socialStars) / 4);
  return {
    signName,
    symbol: ZODIAC_SYMBOLS[slug],
    overallStars,
    loveStars, workStars, moneyStars, socialStars,
    summary: sp(FB_SUMMARY, seed + 10),
    loveText: sp(FB_LOVE, seed + 110),
    workText: sp(FB_WORK, seed + 210),
    moneyText: sp(FB_MONEY, seed + 310),
    socialText: sp(FB_SOCIAL, seed + 410),
    luckyColor: sp(FB_COLORS, seed + 20),
    luckyNumber: String(1 + Math.floor(sr(seed + 30) * 99)),
    luckyTime: sp(FB_TIMES, seed + 40),
  };
}

// ── Stars component ───────────────────────────────────────────────────────────

function Stars({ count, size = "base" }: { count: number; size?: "sm" | "base" | "lg" }) {
  const safe = Math.min(5, Math.max(1, Math.round(count)));
  const cls = size === "sm" ? "text-sm" : size === "lg" ? "text-xl" : "text-base";
  return (
    <span className={`whitespace-nowrap tracking-widest ${cls}`} aria-label={`${safe} 顆星`}>
      <span className="text-amber-300">{"★".repeat(safe)}</span>
      <span className="text-moon/22">{"☆".repeat(5 - safe)}</span>
    </span>
  );
}

// ── Category card ─────────────────────────────────────────────────────────────

function CategoryCard({ label, stars, text, gradient }: {
  label: string; stars: number; text: string; gradient: string;
}) {
  return (
    <article className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-midnight/50 shadow-glow transition duration-300 hover:-translate-y-1 hover:border-[#d8bd70]/35">
      <div className={`h-1 bg-gradient-to-r ${gradient}`} />
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-moon">{label}</h3>
          <Stars count={stars} size="sm" />
        </div>
        <p className="mt-3 text-sm leading-7 text-moon/76">{text}</p>
      </div>
    </article>
  );
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

function zLoadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`圖片載入失敗：${src}`));
    img.src = src;
  });
}
function zRR(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function zWrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const lines: string[] = []; let cur = "";
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > maxWidth && cur) { lines.push(cur); cur = ch; }
    else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

async function generateZodiacStoryImage(slug: ZodiacSlug, sign: HoroscopeSign, siteUrlRaw: string): Promise<Blob> {
  const W = 1080, H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("無法建立 Canvas 環境，請重新整理頁面。");
  const ff = "'PingFang TC','Microsoft JhengHei','Noto Sans TC',sans-serif";
  const siteUrl = siteUrlRaw.replace(/^https?:\/\//, "");

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#05071d"); bg.addColorStop(0.55, "#0d0b2a"); bg.addColorStop(1, "#1a0e2e");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  try { const bi = await zLoadImg("/reference/story-bg.png"); ctx.drawImage(bi, 0, 0, W, H); } catch { /* use gradient */ }

  for (const [x, y, sz, a] of [[110, 90, 26, 0.55], [W - 130, 125, 20, 0.38], [88, H - 228, 22, 0.45], [W - 108, H - 260, 18, 0.38]] as [number, number, number, number][]) {
    ctx.font = `${sz}px serif`; ctx.fillStyle = `rgba(247,217,135,${a})`; ctx.textAlign = "left";
    ctx.fillText("✦", x, y + sz);
  }

  ctx.textAlign = "center";
  ctx.font = `600 28px ${ff}`; ctx.fillStyle = "rgba(247,217,135,0.88)"; ctx.fillText("UNIVERSE WHISPER", W / 2, 120);
  ctx.font = `700 90px ${ff}`; ctx.fillStyle = "#f7d987"; ctx.shadowBlur = 18; ctx.shadowColor = "rgba(247,217,135,0.36)";
  ctx.fillText("宇宙偷偷話", W / 2, 210); ctx.shadowBlur = 0;
  ctx.font = `400 28px ${ff}`; ctx.fillStyle = "rgba(255,247,230,0.72)"; ctx.fillText("今日星座運勢", W / 2, 265);

  const IW = 302, IH = 437, icx = W / 2, icy = 540;
  ctx.save(); ctx.shadowBlur = 56; ctx.shadowColor = "rgba(247,217,135,0.36)";
  ctx.fillStyle = "rgba(247,217,135,0.16)"; zRR(ctx, icx - IW / 2 - 18, icy - IH / 2 - 18, IW + 36, IH + 36, 40); ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(icx, icy); zRR(ctx, -IW / 2, -IH / 2, IW, IH, 26); ctx.clip();
  ctx.fillStyle = "#130b32"; ctx.fillRect(-IW / 2, -IH / 2, IW, IH);
  try { const zi = await zLoadImg(ZODIAC_IMAGES[slug]); ctx.drawImage(zi, -IW / 2, -IH / 2, IW, IH); }
  catch { ctx.font = "72px serif"; ctx.textAlign = "center"; ctx.fillStyle = "#f7d987"; ctx.fillText(ZODIAC_SYMBOLS[slug], 0, 28); }
  ctx.restore();
  ctx.save(); ctx.translate(icx, icy); zRR(ctx, -IW / 2, -IH / 2, IW, IH, 26);
  ctx.strokeStyle = "rgba(247,217,135,0.80)"; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();

  let cy = icy + IH / 2 + 36;
  ctx.textAlign = "center"; ctx.font = `400 26px ${ff}`; ctx.fillStyle = "rgba(247,217,135,0.80)";
  ctx.fillText(new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "long", day: "numeric" }).format(new Date()), W / 2, cy); cy += 42;
  ctx.font = `700 44px ${ff}`; ctx.fillStyle = "#f7d987"; ctx.fillText(`${ZODIAC_SYMBOLS[slug]} ${sign.signName}`, W / 2, cy); cy += 18;

  // Overall stars
  ctx.font = "32px serif";
  const starsStr = "★".repeat(sign.overallStars) + "☆".repeat(5 - sign.overallStars);
  const sw = ctx.measureText(starsStr).width;
  const sx = W / 2 - sw / 2;
  ctx.fillStyle = "#f5c518"; ctx.fillText("★".repeat(sign.overallStars), sx, cy + 36);
  ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fillText("☆".repeat(5 - sign.overallStars), sx + ctx.measureText("★".repeat(sign.overallStars)).width, cy + 36);
  cy += 60;

  // Overall summary box
  const BX = 80, BW = 920, BPXY = 34, BPXX = 52;
  const otext = sign.summary.replace(/\*\*/g, "").trim();
  ctx.font = `400 29px ${ff}`;
  const oLines = zWrap(ctx, otext, BW - BPXX * 2).slice(0, 3);
  const LH29 = 29 * 1.72;
  const BH = BPXY * 2 + 44 + 16 + oLines.length * LH29;
  ctx.save(); zRR(ctx, BX, cy, BW, BH, 46); ctx.clip();
  const bg2 = ctx.createLinearGradient(BX, cy, BX + BW * 0.5, cy + BH);
  bg2.addColorStop(0, "rgba(255,247,230,0.94)"); bg2.addColorStop(0.5, "rgba(248,232,216,0.90)"); bg2.addColorStop(1, "rgba(246,219,226,0.86)");
  ctx.fillStyle = bg2; ctx.fillRect(BX, cy, BW, BH); ctx.restore();
  ctx.save(); ctx.shadowBlur = 50; ctx.shadowColor = "rgba(5,7,24,0.28)";
  zRR(ctx, BX, cy, BW, BH, 46); ctx.strokeStyle = "rgba(202,168,95,0.52)"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  const btext = "今日提醒"; ctx.font = `700 22px ${ff}`;
  const bfw = ctx.measureText(btext).width + 44, bbx = (W - bfw) / 2, bby = cy + BPXY;
  ctx.save(); zRR(ctx, bbx, bby, bfw, 44, 22); ctx.fillStyle = "#caa85f"; ctx.fill(); ctx.restore();
  ctx.textAlign = "center"; ctx.font = `700 22px ${ff}`; ctx.fillStyle = "white"; ctx.fillText(btext, W / 2, bby + 29);
  const sly = bby + 22; ctx.strokeStyle = "rgba(189,148,75,0.55)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(BX + BPXX, sly); ctx.lineTo(bbx - 12, sly); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bbx + bfw + 12, sly); ctx.lineTo(BX + BW - BPXX, sly); ctx.stroke();
  ctx.font = `400 29px ${ff}`; ctx.fillStyle = "#241937"; ctx.textAlign = "center";
  const otY = bby + 44 + 20; oLines.forEach((l, i) => ctx.fillText(l, W / 2, otY + i * LH29));
  cy += BH + 20;

  // Aspect boxes
  const AW = 490, AH = 155, AGAPX = 20, AGAPY = 14, APX = 26, APY = 18;
  const AX0 = (W - AW * 2 - AGAPX) / 2;
  const aspects = [
    { label: "愛情運", stars: sign.loveStars, text: sign.loveText },
    { label: "工作運", stars: sign.workStars, text: sign.workText },
    { label: "財運", stars: sign.moneyStars, text: sign.moneyText },
    { label: "人際運", stars: sign.socialStars, text: sign.socialText },
  ];
  const aColors = ["rgba(252,182,200,0.28)", "rgba(100,200,230,0.22)", "rgba(200,230,150,0.22)", "rgba(200,180,255,0.22)"];
  for (let i = 0; i < 4; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const ax = AX0 + col * (AW + AGAPX), ay = cy + row * (AH + AGAPY), asp = aspects[i];
    ctx.save(); zRR(ctx, ax, ay, AW, AH, 28); ctx.fillStyle = "rgba(13,11,42,0.78)"; ctx.fill();
    ctx.strokeStyle = "rgba(247,217,135,0.20)"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    ctx.save(); zRR(ctx, ax, ay, AW, AH, 28); ctx.clip();
    const tg = ctx.createLinearGradient(ax, ay, ax, ay + 55);
    tg.addColorStop(0, aColors[i]); tg.addColorStop(1, "transparent");
    ctx.fillStyle = tg; ctx.fillRect(ax, ay, AW, AH); ctx.restore();
    ctx.font = `700 23px ${ff}`; ctx.fillStyle = "#f7d987"; ctx.textAlign = "left"; ctx.fillText(asp.label, ax + APX, ay + APY + 23);
    ctx.font = "18px serif";
    for (let s = 0; s < 5; s++) {
      ctx.fillStyle = s < asp.stars ? "#f5c518" : "rgba(255,255,255,0.18)";
      ctx.fillText(s < asp.stars ? "★" : "☆", ax + AW - APX - (5 - s) * 20, ay + APY + 23);
    }
    const dly = ay + APY + 35; ctx.strokeStyle = "rgba(247,217,135,0.18)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ax + APX, dly); ctx.lineTo(ax + AW - APX, dly); ctx.stroke();
    const tlines = zWrap(ctx, asp.text.replace(/\*\*/g, "").trim(), AW - APX * 2).slice(0, 3);
    ctx.font = `400 21px ${ff}`; ctx.fillStyle = "rgba(255,247,230,0.80)"; ctx.textAlign = "left";
    tlines.forEach((l, li) => ctx.fillText(l, ax + APX, dly + 24 + li * (21 * 1.58)));
  }
  cy += 2 * AH + AGAPY + 22;

  // Lucky info (3 boxes)
  const LCW = 200, LCH = 76, LCG = 14;
  const lcTotalW = LCW * 3 + LCG * 2, lcX0 = (W - lcTotalW) / 2;
  const lcLabels = ["幸運色", "幸運數字", "幸運時段"];
  const lcValues = [sign.luckyColor, sign.luckyNumber, sign.luckyTime];
  const lcBorders = ["rgba(247,217,135,0.30)", "rgba(200,180,255,0.28)", "rgba(100,200,230,0.28)"];
  for (let i = 0; i < 3; i++) {
    const lx = lcX0 + i * (LCW + LCG);
    ctx.save(); zRR(ctx, lx, cy, LCW, LCH, 18); ctx.fillStyle = "rgba(247,217,135,0.10)"; ctx.fill();
    ctx.strokeStyle = lcBorders[i]; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    ctx.textAlign = "center"; ctx.font = `400 18px ${ff}`; ctx.fillStyle = "rgba(255,247,230,0.52)";
    ctx.fillText(lcLabels[i], lx + LCW / 2, cy + 24);
    ctx.font = `700 24px ${ff}`; ctx.fillStyle = "#d8bd70"; ctx.fillText(lcValues[i], lx + LCW / 2, cy + 57);
  }
  cy += LCH + 30;

  // QR + footer
  const QS = 130, QX = W - QS - 72, QY = cy;
  let qrImg: HTMLImageElement | null = null;
  try {
    const { default: QRCode } = await import("qrcode");
    const qrUrl = await QRCode.toDataURL("https://lin.ee/ObZxFcx", { width: 160, margin: 2, color: { dark: "#2a1a3e", light: "#fff8f0" } });
    qrImg = await zLoadImg(qrUrl);
  } catch { /* skip */ }
  if (qrImg) {
    ctx.save(); ctx.shadowBlur = 20; ctx.shadowColor = "rgba(247,217,135,0.24)";
    zRR(ctx, QX - 8, QY - 8, QS + 16, QS + 16, 14); ctx.fillStyle = "#fff8f0"; ctx.fill(); ctx.restore();
    ctx.drawImage(qrImg, QX, QY, QS, QS);
  }
  ctx.textAlign = "left"; ctx.font = `700 24px ${ff}`; ctx.fillStyle = "rgba(255,247,230,0.86)"; ctx.fillText("掃描加入 LINE", 72, QY + 38);
  ctx.font = `400 20px ${ff}`; ctx.fillStyle = "rgba(255,247,230,0.60)"; ctx.fillText("接收每日宇宙訊息", 72, QY + 72);
  ctx.textAlign = "center"; ctx.font = `400 22px ${ff}`; ctx.fillStyle = "rgba(255,247,230,0.58)"; ctx.fillText(`✦  ${siteUrl}  ✦`, W / 2, H - 68);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Canvas 轉換失敗，請重新整理後再試。")),
      "image/png",
    );
  });
}

// ── Main component ────────────────────────────────────────────────────────────

export function DailyFortuneClient() {
  const [todayStr] = useState(() => getTodayTaipei());
  const [apiData, setApiData] = useState<DailyHoroscopeData | null>(null);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<ZodiacSlug | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [downloadError, setDownloadError] = useState("");
  const detailRef = useRef<HTMLDivElement>(null);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "universe-whisper.vercel.app";

  // ── Load API data on mount (background – UI never blocks on this) ──────────
  useEffect(() => {
    // Restore previously selected sign
    const saved = window.localStorage.getItem(LS_KEY) as ZodiacSlug | null;
    if (saved && ZODIAC_ORDER.includes(saved)) setSelectedSlug(saved);

    fetch("/api/daily-horoscope")
      .then((r) => {
        if (!r.ok) throw new Error("daily horoscope request failed");
        return r.json() as Promise<DailyHoroscopeData>;
      })
      .then((d) => { setApiData(d); setApiLoading(false); })
      .catch(() => { setApiError("今天星光訊號有點微弱，稍後再試。"); setApiLoading(false); });
  }, []);

  // Scroll to detail when sign selected
  useEffect(() => {
    if (selectedSlug && detailRef.current) {
      window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
  }, [selectedSlug]);

  function selectSign(slug: ZodiacSlug) {
    setSelectedSlug(slug);
    setDownloadStatus("idle");
    setDownloadError("");
    window.localStorage.setItem(LS_KEY, slug);
  }

  function clearSign() {
    setSelectedSlug(null);
    setDownloadStatus("idle");
    setDownloadError("");
  }

  async function downloadImage() {
    if (downloadStatus === "working" || !selectedSlug) return;
    setDownloadError("");
    setDownloadStatus("working");
    try {
      const sign = apiData?.signs[selectedSlug] ?? clientFallbackSign(selectedSlug, todayStr);
      const blob = await generateZodiacStoryImage(selectedSlug, sign, siteUrl);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "universe-whisper-zodiac-story.png";
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      setDownloadStatus("done");
      window.setTimeout(() => setDownloadStatus("idle"), 3500);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : String(err));
      setDownloadStatus("error");
    }
  }

  // ── Always resolve sign data: API data if loaded, instant local fallback otherwise ──
  const sign: HoroscopeSign | null = selectedSlug
    ? (apiData?.signs[selectedSlug] ?? clientFallbackSign(selectedSlug, todayStr))
    : null;

  const isApiDataForSelectedSign = Boolean(selectedSlug && apiData?.signs[selectedSlug]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Selector ── */}
      <section className="mt-8 rounded-[1.75rem] border border-lavender/18 bg-midnight/38 p-4 shadow-glow sm:p-5">
        <h2 className="text-lg font-semibold text-moon sm:text-xl">選擇你的星座</h2>
        <p className="mt-0.5 text-xs leading-6 text-moon/52">
          看看今天宇宙想提醒你什麼。
        </p>

        {/* 3 × 4 compact grid – no images */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {ZODIAC_ORDER.map((slug) => {
            const isSelected = selectedSlug === slug;
            return (
              <button
                key={slug}
                type="button"
                onClick={() => selectSign(slug)}
                className={[
                  "group flex flex-col items-center justify-center gap-0.5 rounded-xl border py-3 px-1 transition-all duration-200 active:scale-95",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8bd70]/60",
                  isSelected
                    ? "border-[#d8bd70]/80 bg-[#d8bd70]/14 shadow-[0_0_14px_rgba(216,189,112,0.28)]"
                    : "border-white/10 bg-midnight/50 hover:border-[#d8bd70]/36 hover:bg-white/5",
                ].join(" ")}
              >
                <span
                  className={`text-xl leading-none sm:text-2xl ${isSelected ? "text-[#d8bd70]" : "text-moon/75"}`}
                  aria-hidden="true"
                >
                  {ZODIAC_SYMBOLS[slug]}
                </span>
                <span
                  className={`text-[11px] font-medium leading-tight sm:text-xs ${isSelected ? "text-[#d8bd70]" : "text-moon/75"}`}
                >
                  {ZODIAC_LABELS[slug]}
                </span>
                <span className="hidden text-[9px] text-moon/32 sm:block">
                  {ZODIAC_DATES[slug]}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── No selection placeholder ── */}
      {!selectedSlug && (
        <div className="mt-5 rounded-[1.75rem] border border-white/8 bg-midnight/28 px-6 py-10 text-center">
          <p className="text-base text-moon/46">點選上方星座，查看今日宇宙訊息 ✦</p>
        </div>
      )}

      {/* ── Fortune detail ─ always shown once a sign is selected ── */}
      {selectedSlug && sign && (
        <div ref={detailRef} className="mt-5 scroll-mt-4">
          {/* Back button */}
          <button
            type="button"
            onClick={clearSign}
            className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-white/14 bg-midnight/50 px-4 py-1.5 text-sm text-moon/65 transition hover:border-white/28 hover:text-moon"
          >
            ← 重新選擇星座
          </button>

          {/* API-fresh badge */}
          {apiLoading && (
            <p className="mb-2 text-xs text-lavender/50">正在取回今天最新訊息…</p>
          )}
          {apiError && !isApiDataForSelectedSign && (
            <p className="mb-2 text-xs text-moon/40">{apiError}</p>
          )}

          <section className="relative overflow-hidden rounded-[1.75rem] border border-lavender/22 bg-midnight/52 shadow-glow">
            {/* Decorative bg zodiac image */}
            <div className="pointer-events-none absolute inset-y-4 right-[-8%] z-0 w-[68%] max-w-[440px] opacity-[0.07] blur-[1.5px] sm:right-0 sm:w-[38%]">
              <Image src={ZODIAC_IMAGES[selectedSlug]} alt="" fill sizes="440px" className="object-contain" aria-hidden="true" />
            </div>

            <div className="relative z-10 h-1 bg-gradient-to-r from-nebula/60 via-lavender/80 to-aurora/60" />

            <div className="relative z-10 p-5 sm:p-7">
              {/* Sign title */}
              <div className="mb-4 flex items-center gap-3">
                <span className="text-3xl text-[#d8bd70] sm:text-4xl" aria-hidden="true">
                  {ZODIAC_SYMBOLS[selectedSlug]}
                </span>
                <div>
                  <h2 className="text-xl font-semibold text-moon sm:text-2xl">
                    {sign.signName} 今日運勢
                  </h2>
                  <p className="text-xs text-moon/40">{ZODIAC_DATES[selectedSlug]}</p>
                </div>
              </div>

              {/* Star ratings */}
              <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="space-y-1.5">
                  {[
                    { label: "總評", stars: sign.overallStars, accent: true },
                    { label: "愛情", stars: sign.loveStars, accent: false },
                    { label: "工作", stars: sign.workStars, accent: false },
                    { label: "財運", stars: sign.moneyStars, accent: false },
                    { label: "人際", stars: sign.socialStars, accent: false },
                  ].map(({ label, stars, accent }, i) => (
                    <div
                      key={label}
                      className={`flex items-center justify-between gap-4 ${
                        i === 0 ? "border-b border-white/8 pb-2" : ""
                      }`}
                    >
                      <span className={`text-sm ${accent ? "font-semibold text-[#d8bd70]" : "text-moon/60"}`}>
                        {label}
                      </span>
                      <Stars count={stars} size={accent ? "base" : "sm"} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Download button – right after star ratings */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={downloadImage}
                  disabled={downloadStatus === "working"}
                  className="inline-flex items-center gap-2 rounded-full border border-[#d8bd70]/35 bg-[#d8bd70]/10 px-4 py-2 text-sm font-medium text-[#d8bd70] transition hover:bg-[#d8bd70]/20 active:scale-95 disabled:cursor-wait disabled:opacity-60"
                >
                  {downloadStatus === "working" ? "正在產生圖片…" : "⬇ 下載今日運勢圖"}
                </button>
                {downloadStatus === "done" && <p className="text-xs text-moon/55">圖片已下載 ✨</p>}
                {downloadStatus === "error" && <p className="text-xs text-[#ffb4b4]">{downloadError || "產生失敗，請稍後再試。"}</p>}
              </div>

              {/* Summary */}
              <div className="mb-4 rounded-xl border border-lavender/14 bg-lavender/5 p-4">
                <p className="text-[10px] tracking-[0.22em] text-lavender/55">今日提醒</p>
                <p className="mt-2 text-sm leading-7 text-moon/80 sm:text-base">{sign.summary}</p>
              </div>

              {/* Category cards */}
              <div className="grid gap-3 sm:grid-cols-2">
                <CategoryCard label="愛情運" stars={sign.loveStars} text={sign.loveText} gradient="from-pink-300/20 to-lavender/16" />
                <CategoryCard label="工作運" stars={sign.workStars} text={sign.workText} gradient="from-aurora/18 to-nebula/16" />
                <CategoryCard label="財運" stars={sign.moneyStars} text={sign.moneyText} gradient="from-[#d8bd70]/20 to-moon/12" />
                <CategoryCard label="人際運" stars={sign.socialStars} text={sign.socialText} gradient="from-lavender/22 to-aurora/14" />
              </div>

              {/* Lucky info */}
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  { label: "幸運色", value: sign.luckyColor },
                  { label: "幸運數字", value: sign.luckyNumber },
                  { label: "幸運時間", value: sign.luckyTime },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-center"
                    style={{ minWidth: "88px" }}
                  >
                    <p className="text-[10px] text-moon/42">{label}</p>
                    <p className="mt-0.5 text-sm font-semibold text-[#d8bd70]">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
