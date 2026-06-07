/**
 * 三重星座限動圖 — 前端 Canvas 產圖
 * 使用 HTMLCanvasElement (2D API) 產生 1080×1920 PNG，完全在瀏覽器端執行。
 * 不依賴後端 /api/astro-profile/share-image，避免 Satori edge-runtime 問題。
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
 * Canvas 文字換行 helper
 * 回傳實際繪製的行數
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
  ctx.fillStyle = color;

  const chars = [...text]; // 支援 Unicode / 中文字元
  const lines: string[] = [];
  let current = "";

  for (const ch of chars) {
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = ch;
      if (lines.length >= maxLines) break;
    } else {
      current = test;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  // 若超過 maxLines，最後一行加省略號
  if (lines.length === maxLines && chars.join("") !== lines.join("")) {
    let last = lines[maxLines - 1] ?? "";
    while (last && ctx.measureText(last + "…").width > maxWidth) {
      last = [...last].slice(0, -1).join("");
    }
    lines[maxLines - 1] = last + "…";
  }

  lines.forEach((line, i) => {
    ctx.fillText(line, x, y + i * lineHeight);
  });

  return lines.length;
}

/** 繪製圓角矩形（無 roundRect 的環境相容） */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
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

/** 繪製一個隨機感星點 */
function drawStars(ctx: CanvasRenderingContext2D) {
  const positions = [
    { x: 120, y: 110, r: 2.5, a: 0.6 },
    { x: 960, y: 90, r: 2, a: 0.5 },
    { x: 80, y: 320, r: 1.8, a: 0.4 },
    { x: 1000, y: 280, r: 2.2, a: 0.55 },
    { x: 200, y: 560, r: 1.5, a: 0.35 },
    { x: 890, y: 500, r: 2.0, a: 0.45 },
    { x: 140, y: 1400, r: 2.0, a: 0.5 },
    { x: 940, y: 1450, r: 1.8, a: 0.4 },
    { x: 60, y: 1620, r: 1.5, a: 0.3 },
    { x: 1010, y: 1700, r: 2.2, a: 0.45 },
    { x: 540, y: 80, r: 2.8, a: 0.65 },
    { x: 540, y: 1840, r: 2.5, a: 0.55 },
    { x: 320, y: 200, r: 1.6, a: 0.38 },
    { x: 760, y: 160, r: 1.4, a: 0.32 },
  ];
  for (const p of positions) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(247, 217, 135, ${p.a})`;
    ctx.fill();
  }

  // 四角大星
  const bigStars = [
    { x: 108, y: 88 },
    { x: 972, y: 88 },
    { x: 108, y: 1832 },
    { x: 972, y: 1832 },
  ];
  ctx.font = "bold 32px sans-serif";
  ctx.fillStyle = "rgba(247,217,135,0.45)";
  for (const s of bigStars) {
    ctx.fillText("✦", s.x, s.y);
  }
}

/**
 * 主要產圖函式
 * 回傳 Promise<Blob>，呼叫方負責下載
 */
export function generateAstroStoryImage(params: StoryImageParams): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("瀏覽器不支援 Canvas，無法產生圖片。"));
      return;
    }

    // ── 背景漸層 ────────────────────────────────────────────────────────────────
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#05071d");
    bg.addColorStop(0.5, "#0d0b2a");
    bg.addColorStop(1, "#1a0e2e");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 側邊發光暈
    const glowL = ctx.createRadialGradient(0, H * 0.35, 0, 0, H * 0.35, 400);
    glowL.addColorStop(0, "rgba(100,60,200,0.18)");
    glowL.addColorStop(1, "rgba(100,60,200,0)");
    ctx.fillStyle = glowL;
    ctx.fillRect(0, 0, W, H);

    const glowR = ctx.createRadialGradient(W, H * 0.65, 0, W, H * 0.65, 400);
    glowR.addColorStop(0, "rgba(60,180,160,0.12)");
    glowR.addColorStop(1, "rgba(60,180,160,0)");
    ctx.fillStyle = glowR;
    ctx.fillRect(0, 0, W, H);

    // ── 星點 ──────────────────────────────────────────────────────────────────
    drawStars(ctx);

    // ── 頂部品牌 ─────────────────────────────────────────────────────────────
    ctx.textAlign = "center";
    ctx.font = "500 34px sans-serif";
    ctx.letterSpacing = "8px";
    ctx.fillStyle = "rgba(247,217,135,0.75)";
    ctx.fillText("UNIVERSE WHISPER", W / 2, 160);

    ctx.font = "bold 64px sans-serif";
    ctx.letterSpacing = "12px";
    ctx.fillStyle = "#f7d987";
    ctx.fillText("我的三重星座", W / 2, 260);

    ctx.font = "400 34px sans-serif";
    ctx.letterSpacing = "8px";
    ctx.fillStyle = "rgba(255,247,230,0.50)";
    ctx.fillText("太陽 × 月亮 × 上升", W / 2, 330);

    // 細分隔線
    ctx.save();
    const lineGrad = ctx.createLinearGradient(120, 0, W - 120, 0);
    lineGrad.addColorStop(0, "rgba(247,217,135,0)");
    lineGrad.addColorStop(0.5, "rgba(247,217,135,0.40)");
    lineGrad.addColorStop(1, "rgba(247,217,135,0)");
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(120, 370);
    ctx.lineTo(W - 120, 370);
    ctx.stroke();
    ctx.restore();

    // ── 星座卡片 ─────────────────────────────────────────────────────────────
    const cardX = 110;
    const cardY = 410;
    const cardW = W - 220;
    const cardH = 380;

    // 卡片背景
    ctx.save();
    roundRect(ctx, cardX, cardY, cardW, cardH, 40);
    ctx.fillStyle = "rgba(255,255,255,0.055)";
    ctx.fill();
    ctx.strokeStyle = "rgba(247,217,135,0.28)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // 星座行資料
    const rows: Array<{ emoji: string; label: string; sign: string | null | undefined; color: string }> = [
      { emoji: "☀", label: "太陽", sign: params.sunSign, color: "#f7d987" },
      { emoji: "🌙", label: "月亮", sign: params.moonSign, color: "#b8a0f0" },
      { emoji: "↑", label: "上升", sign: params.risingSign, color: "#88d8b0" },
      { emoji: "♀", label: "金星", sign: params.venusSign, color: "#c9a0dc" },
    ];

    const rowH = 82;
    const rowStartY = cardY + 44;

    rows.forEach((row, i) => {
      const ry = rowStartY + i * rowH;

      // 分隔線（除第一行）
      if (i > 0) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cardX + 30, ry - 6);
        ctx.lineTo(cardX + cardW - 30, ry - 6);
        ctx.stroke();
        ctx.restore();
      }

      // Emoji + label
      ctx.textAlign = "left";
      ctx.font = "500 36px sans-serif";
      ctx.fillStyle = "rgba(255,247,230,0.52)";
      ctx.letterSpacing = "4px";
      ctx.fillText(`${row.emoji}  ${row.label}`, cardX + 50, ry + 32);

      // 星座名 + 符號
      ctx.textAlign = "right";
      ctx.font = "bold 40px sans-serif";
      ctx.fillStyle = row.sign ? row.color : "rgba(255,247,230,0.22)";
      ctx.letterSpacing = "4px";
      const signText = row.sign
        ? `${zodiacSymbol(row.sign)}  ${row.sign}`
        : "尚未提供";
      ctx.fillText(signText, cardX + cardW - 50, ry + 32);
    });

    // ── shortSummary 宇宙說卡片 ──────────────────────────────────────────────
    const summary = (params.shortSummary ?? "").replace(/\*\*/g, "").trim();
    if (summary) {
      const sumCardX = 110;
      const sumCardY = cardY + cardH + 60;
      const sumCardW = W - 220;

      // 計算需要多少行
      ctx.font = "400 36px sans-serif";
      ctx.letterSpacing = "2px";
      const maxSumWidth = sumCardW - 120;
      // 預估行數（先計算再決定卡片高度）
      let preLines = 0;
      {
        const chars = [...summary];
        let cur = "";
        for (const ch of chars) {
          const test = cur + ch;
          if (ctx.measureText(test).width > maxSumWidth && cur) {
            preLines++;
            cur = ch;
            if (preLines >= 4) break;
          } else {
            cur = test;
          }
        }
        if (cur) preLines++;
      }
      const sumCardH = 80 + Math.min(preLines, 4) * 52 + 60;

      // 卡片背景（米白漸層）
      ctx.save();
      roundRect(ctx, sumCardX, sumCardY, sumCardW, sumCardH, 44);
      const sumBg = ctx.createLinearGradient(sumCardX, sumCardY, sumCardX + sumCardW, sumCardY + sumCardH);
      sumBg.addColorStop(0, "rgba(255,247,230,0.90)");
      sumBg.addColorStop(0.5, "rgba(248,232,216,0.88)");
      sumBg.addColorStop(1, "rgba(246,219,226,0.86)");
      ctx.fillStyle = sumBg;
      ctx.fill();
      ctx.strokeStyle = "rgba(202,168,95,0.45)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // 「宇宙說」badge
      const badgeW = 160;
      const badgeH = 48;
      const badgeX = (W - badgeW) / 2;
      const badgeY2 = sumCardY + 20;
      ctx.save();
      roundRect(ctx, badgeX, badgeY2, badgeW, badgeH, 24);
      ctx.fillStyle = "#caa85f";
      ctx.fill();
      ctx.restore();
      ctx.textAlign = "center";
      ctx.font = "bold 28px sans-serif";
      ctx.letterSpacing = "4px";
      ctx.fillStyle = "#ffffff";
      ctx.fillText("宇宙說", W / 2, badgeY2 + 33);

      // Summary 文字
      ctx.textAlign = "center";
      ctx.font = "400 36px sans-serif";
      ctx.letterSpacing = "2px";
      wrapText(
        ctx,
        summary,
        W / 2 - maxSumWidth / 2,
        sumCardY + 86,
        maxSumWidth,
        52,
        4,
        "#241937",
      );
    }

    // ── 底部 ──────────────────────────────────────────────────────────────────
    const footerY = H - 110;

    // 細分隔線
    ctx.save();
    const footLineGrad = ctx.createLinearGradient(120, 0, W - 120, 0);
    footLineGrad.addColorStop(0, "rgba(247,217,135,0)");
    footLineGrad.addColorStop(0.5, "rgba(247,217,135,0.35)");
    footLineGrad.addColorStop(1, "rgba(247,217,135,0)");
    ctx.strokeStyle = footLineGrad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(120, footerY - 30);
    ctx.lineTo(W - 120, footerY - 30);
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = "center";
    ctx.font = "400 30px sans-serif";
    ctx.letterSpacing = "6px";
    ctx.fillStyle = "rgba(255,247,230,0.35)";
    ctx.fillText(
      `✦  ${params.siteUrl ?? "universe-whisper.vercel.app"}  ✦`,
      W / 2,
      footerY + 10,
    );

    // ── 輸出 Blob ─────────────────────────────────────────────────────────────
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Canvas toBlob 失敗，請稍後再試。"));
        }
      },
      "image/png",
    );
  });
}
