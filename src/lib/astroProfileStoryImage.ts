/**
 * 三重星座限動圖 — 前端 Canvas 產圖
 * 使用 HTMLCanvasElement (2D API) 產生 1080×1920 PNG，完全在瀏覽器端執行。
 * 不依賴後端 API，無 Satori/edge-runtime 問題。
 */

export interface StoryImageParams {
  sunSign: string | null | undefined;
  moonSign: string | null | undefined;
  risingSign: string | null | undefined;
  venusSign: string | null | undefined;
  shortSummary: string | null | undefined;
  siteUrl?: string;
}

const W = 1080;
const H = 1920;

const ZODIAC_SYMBOLS: Record<string, string> = {
  牡羊座: "♈", 金牛座: "♉", 雙子座: "♊", 巨蟹座: "♋",
  獅子座: "♌", 處女座: "♍", 天秤座: "♎", 天蠍座: "♏",
  射手座: "♐", 摩羯座: "♑", 水瓶座: "♒", 雙魚座: "♓",
};

function zodiacSymbol(sign: string | null | undefined): string {
  if (!sign) return "";
  return ZODIAC_SYMBOLS[sign] ?? "";
}

/**
 * 繪製換行文字（始終左對齊）
 * @param ctx  canvas context
 * @param text 原始文字
 * @param x    文字左邊界（textAlign 固定為 left）
 * @param y    首行 baseline
 * @param maxWidth  最大寬度
 * @param lineHeight 行高
 * @param maxLines  最多行數，超過結尾加 …
 * @param color 文字顏色
 * @returns 實際繪製行數
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
  color: string,
): number {
  if (!text) return 0;

  // 強制左對齊，不受外部 textAlign 影響
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  ctx.fillStyle = color;

  const chars = [...text]; // 正確處理 Unicode / 中文字元
  const lines: string[] = [];
  let current = "";

  for (const ch of chars) {
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = ch;
      if (lines.length >= maxLines) { current = ""; break; }
    } else {
      current = test;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  // 若原文比所有行合起來更長，最後一行加省略號
  const fullText = chars.join("");
  const joined  = lines.join("");
  if (joined.length < fullText.length) {
    let last = lines[lines.length - 1] ?? "";
    while (last && ctx.measureText(last + "…").width > maxWidth) {
      last = [...last].slice(0, -1).join("");
    }
    lines[lines.length - 1] = last + "…";
  }

  lines.forEach((line, i) => {
    ctx.fillText(line, x, y + i * lineHeight);
  });

  ctx.textAlign = prevAlign;
  return lines.length;
}

/** 繪製圓角矩形路徑（不含 fill/stroke，由呼叫者決定） */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** 在 canvas 上繪製細星點裝飾 */
function drawStars(ctx: CanvasRenderingContext2D) {
  const dots = [
    { x: 120, y: 110, r: 2.5, a: 0.6 },
    { x: 960, y:  90, r: 2.0, a: 0.5 },
    { x:  80, y: 320, r: 1.8, a: 0.4 },
    { x: 1000,y: 280, r: 2.2, a: 0.55 },
    { x: 200, y: 560, r: 1.5, a: 0.35 },
    { x: 890, y: 500, r: 2.0, a: 0.45 },
    { x: 140, y:1400, r: 2.0, a: 0.5 },
    { x: 940, y:1450, r: 1.8, a: 0.4 },
    { x:  60, y:1620, r: 1.5, a: 0.3 },
    { x:1010, y:1700, r: 2.2, a: 0.45 },
    { x: 540, y:  80, r: 2.8, a: 0.65 },
    { x: 540, y:1840, r: 2.5, a: 0.55 },
    { x: 320, y: 200, r: 1.6, a: 0.38 },
    { x: 760, y: 160, r: 1.4, a: 0.32 },
  ];
  for (const p of dots) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(247,217,135,${p.a})`;
    ctx.fill();
  }
  // 四角小符號
  ctx.font = "28px sans-serif";
  ctx.fillStyle = "rgba(247,217,135,0.40)";
  ctx.textAlign = "center";
  ctx.fillText("✦", 108,  96);
  ctx.fillText("✦", 972,  96);
  ctx.fillText("✦", 108, 1840);
  ctx.fillText("✦", 972, 1840);
}

/**
 * 主要產圖函式。
 * 回傳 Promise<Blob>，呼叫方負責下載。
 */
export function generateAstroStoryImage(params: StoryImageParams): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("瀏覽器不支援 Canvas，無法產生圖片。"));
      return;
    }

    // ── 1. 背景漸層 ────────────────────────────────────────────────────────────
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0,   "#05071d");
    bg.addColorStop(0.5, "#0d0b2a");
    bg.addColorStop(1,   "#1a0e2e");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 側邊光暈
    const gL = ctx.createRadialGradient(0, H * 0.35, 0, 0, H * 0.35, 420);
    gL.addColorStop(0, "rgba(100,60,200,0.16)");
    gL.addColorStop(1, "rgba(100,60,200,0)");
    ctx.fillStyle = gL;
    ctx.fillRect(0, 0, W, H);

    const gR = ctx.createRadialGradient(W, H * 0.65, 0, W, H * 0.65, 420);
    gR.addColorStop(0, "rgba(60,180,160,0.10)");
    gR.addColorStop(1, "rgba(60,180,160,0)");
    ctx.fillStyle = gR;
    ctx.fillRect(0, 0, W, H);

    // ── 2. 星點 ────────────────────────────────────────────────────────────────
    drawStars(ctx);

    // ── 3. 頂部品牌文字 ────────────────────────────────────────────────────────
    ctx.textAlign = "center";

    ctx.font = "500 32px sans-serif";
    ctx.fillStyle = "rgba(247,217,135,0.72)";
    ctx.fillText("UNIVERSE WHISPER", W / 2, 154);

    ctx.font = "bold 62px sans-serif";
    ctx.fillStyle = "#f7d987";
    ctx.fillText("我的三重星座", W / 2, 248);

    ctx.font = "400 32px sans-serif";
    ctx.fillStyle = "rgba(255,247,230,0.48)";
    ctx.fillText("太陽  ×  月亮  ×  上升", W / 2, 310);

    // 頂部細線
    {
      const lg = ctx.createLinearGradient(120, 0, W - 120, 0);
      lg.addColorStop(0,   "rgba(247,217,135,0)");
      lg.addColorStop(0.5, "rgba(247,217,135,0.38)");
      lg.addColorStop(1,   "rgba(247,217,135,0)");
      ctx.strokeStyle = lg;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(120, 352);
      ctx.lineTo(W - 120, 352);
      ctx.stroke();
    }

    // ── 4. 星座卡片 ────────────────────────────────────────────────────────────
    const CARD_X  = 100;
    const CARD_Y  = 388;
    const CARD_W  = W - 200;
    const ROW_H   = 88;    // 每行高度
    const ROWS    = 4;     // 最多 4 行
    const CARD_H  = ROW_H * ROWS + 24; // 24 = 上下 padding

    ctx.save();
    roundRectPath(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 38);
    ctx.fillStyle = "rgba(255,255,255,0.052)";
    ctx.fill();
    ctx.strokeStyle = "rgba(247,217,135,0.26)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    const signRows: Array<{
      symbol: string;
      label: string;
      sign: string | null | undefined;
      color: string;
    }> = [
      { symbol: "☀",  label: "太陽", sign: params.sunSign,    color: "#f7d987" },
      { symbol: "●",  label: "月亮", sign: params.moonSign,   color: "#b8a0f0" },
      { symbol: "↑",  label: "上升", sign: params.risingSign, color: "#88d8b0" },
      { symbol: "♀",  label: "金星", sign: params.venusSign,  color: "#c9a0dc" },
    ];

    signRows.forEach((row, i) => {
      const rowTop = CARD_Y + 12 + i * ROW_H;
      const baseY  = rowTop + ROW_H / 2 + 14; // vertical center baseline

      // 行分隔線
      if (i > 0) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.065)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(CARD_X + 28, rowTop);
        ctx.lineTo(CARD_X + CARD_W - 28, rowTop);
        ctx.stroke();
        ctx.restore();
      }

      // 左：符號 + 標籤
      ctx.textAlign = "left";
      ctx.font = "400 34px sans-serif";
      ctx.fillStyle = "rgba(255,247,230,0.50)";
      ctx.fillText(`${row.symbol}  ${row.label}`, CARD_X + 44, baseY);

      // 右：星座符號 + 名稱
      ctx.textAlign = "right";
      ctx.font = "bold 38px sans-serif";
      ctx.fillStyle = row.sign ? row.color : "rgba(255,247,230,0.20)";
      const signText = row.sign
        ? `${zodiacSymbol(row.sign)}  ${row.sign}`
        : "尚未提供";
      ctx.fillText(signText, CARD_X + CARD_W - 44, baseY);
    });

    // ── 5. shortSummary 卡片 ───────────────────────────────────────────────────
    const summary = (params.shortSummary ?? "").replace(/\*\*/g, "").trim();

    const SUM_CARD_X  = 100;
    const SUM_CARD_Y  = CARD_Y + CARD_H + 56;
    const SUM_CARD_W  = W - 200;
    const TEXT_X      = SUM_CARD_X + 60;
    const TEXT_MAX_W  = SUM_CARD_W - 120;
    const TEXT_SIZE   = 35;
    const LINE_H      = 56;
    const MAX_SUM_LINES = 4;

    // ── 預算行數以計算卡片高度 ──
    let estimatedLines = 0;
    if (summary) {
      ctx.font = `400 ${TEXT_SIZE}px sans-serif`;
      const chars = [...summary];
      let cur = "";
      for (const ch of chars) {
        const test = cur + ch;
        if (ctx.measureText(test).width > TEXT_MAX_W && cur) {
          estimatedLines++;
          cur = ch;
          if (estimatedLines >= MAX_SUM_LINES) { cur = ""; break; }
        } else {
          cur = test;
        }
      }
      if (cur) estimatedLines++;
      estimatedLines = Math.min(estimatedLines, MAX_SUM_LINES);
    }

    const BADGE_H    = 52;
    const BADGE_PAD  = 24;          // top padding above badge
    const TEXT_PAD_T = 18;          // gap between badge bottom and first text line
    const CARD_PAD_B = 44;          // bottom padding
    const SUM_CARD_H = summary
      ? BADGE_PAD + BADGE_H + TEXT_PAD_T + estimatedLines * LINE_H + CARD_PAD_B
      : 0;

    if (summary && SUM_CARD_H > 0) {
      // 卡片背景
      ctx.save();
      roundRectPath(ctx, SUM_CARD_X, SUM_CARD_Y, SUM_CARD_W, SUM_CARD_H, 42);
      const sumBg = ctx.createLinearGradient(SUM_CARD_X, SUM_CARD_Y, SUM_CARD_X, SUM_CARD_Y + SUM_CARD_H);
      sumBg.addColorStop(0,   "rgba(255,247,230,0.91)");
      sumBg.addColorStop(0.5, "rgba(248,232,216,0.89)");
      sumBg.addColorStop(1,   "rgba(246,219,226,0.86)");
      ctx.fillStyle = sumBg;
      ctx.fill();
      ctx.strokeStyle = "rgba(202,168,95,0.42)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // 「宇宙說」badge
      const BADGE_W   = 170;
      const badgeX    = SUM_CARD_X + (SUM_CARD_W - BADGE_W) / 2;
      const badgeY    = SUM_CARD_Y + BADGE_PAD;
      ctx.save();
      roundRectPath(ctx, badgeX, badgeY, BADGE_W, BADGE_H, BADGE_H / 2);
      ctx.fillStyle = "#caa85f";
      ctx.fill();
      ctx.restore();

      ctx.textAlign = "center";
      ctx.font = "bold 26px sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText("宇 宙 說", W / 2, badgeY + BADGE_H * 0.68);

      // 摘要文字（左對齊換行）
      const textY = badgeY + BADGE_H + TEXT_PAD_T + TEXT_SIZE;
      ctx.font = `400 ${TEXT_SIZE}px sans-serif`;
      wrapText(ctx, summary, TEXT_X, textY, TEXT_MAX_W, LINE_H, MAX_SUM_LINES, "#241937");
    }

    // ── 6. 底部 ───────────────────────────────────────────────────────────────
    const FOOTER_Y = H - 96;

    // 底部細線
    {
      const lg = ctx.createLinearGradient(120, 0, W - 120, 0);
      lg.addColorStop(0,   "rgba(247,217,135,0)");
      lg.addColorStop(0.5, "rgba(247,217,135,0.32)");
      lg.addColorStop(1,   "rgba(247,217,135,0)");
      ctx.strokeStyle = lg;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(120, FOOTER_Y - 28);
      ctx.lineTo(W - 120, FOOTER_Y - 28);
      ctx.stroke();
    }

    ctx.textAlign = "center";
    ctx.font = "400 28px sans-serif";
    ctx.fillStyle = "rgba(255,247,230,0.32)";
    ctx.fillText(
      `✦  ${params.siteUrl ?? "universe-whisper.vercel.app"}  ✦`,
      W / 2,
      FOOTER_Y,
    );

    // ── 7. 輸出 Blob ───────────────────────────────────────────────────────────
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob 失敗，請稍後再試。"));
      },
      "image/png",
    );
  });
}
