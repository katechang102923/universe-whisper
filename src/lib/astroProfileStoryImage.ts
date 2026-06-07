/**
 * 三重星座限動圖 — 前端 Canvas 產圖
 * 1080 × 1920 PNG，完全在瀏覽器端執行，不呼叫任何後端 API。
 *
 * 版面（由上到下）：
 *   1. 頂部品牌區   UNIVERSE WHISPER / 我的三重星座 / 太陽×月亮×上升
 *   2. 星座資訊卡   太陽 / 月亮 / 上升 / 金星 四列
 *   3. 主內容區     最多 3 個內容卡（整體解析 / 核心提醒 / 宇宙悄悄話）
 *   4. 底部         分隔線 + 網址
 */

// ── 公開 API ─────────────────────────────────────────────────────────────────

export interface StoryImageParams {
  sunSign:        string | null | undefined;
  moonSign:       string | null | undefined;
  risingSign:     string | null | undefined;
  venusSign:      string | null | undefined;
  shortSummary:   string | null | undefined;
  overallSummary: string | null | undefined;
  whisper:        string | null | undefined;
  advice:         string | null | undefined;
  siteUrl?:       string;
}

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
    try {
      render(ctx, params);
    } catch (e) {
      reject(e);
      return;
    }
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Canvas toBlob 失敗，請稍後再試。")),
      "image/png",
    );
  });
}

// ── 常數 ─────────────────────────────────────────────────────────────────────

const W = 1080;
const H = 1920;

// 左右邊距
const MARGIN_X = 96;
const INNER_W  = W - MARGIN_X * 2;  // 888px

// 內容卡文字設定
const CARD_FONT_SIZE = 31;       // px
const CARD_LINE_H    = 50;       // px per line
const CARD_PAD_TOP   = 26;       // 卡頂 padding
const CARD_BADGE_H   = 46;       // badge 高度
const CARD_BADGE_GAP = 16;       // badge → 文字間距
const CARD_PAD_BOT   = 32;       // 卡底 padding
const CARD_TEXT_X    = MARGIN_X + 52;
const CARD_TEXT_W    = INNER_W  - 104;

const ZODIAC_SYMBOLS: Record<string, string> = {
  牡羊座: "♈", 金牛座: "♉", 雙子座: "♊", 巨蟹座: "♋",
  獅子座: "♌", 處女座: "♍", 天秤座: "♎", 天蠍座: "♏",
  射手座: "♐", 摩羯座: "♑", 水瓶座: "♒", 雙魚座: "♓",
};

// ── 文字工具 ─────────────────────────────────────────────────────────────────

/** 清洗文字：去掉 markdown、HTML tag、<br>、undefined/null 字樣，壓縮空白 */
function clean(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .replace(/\*\*/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\bundefined\b|\bnull\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 從多個候選欄位中依序取第一個有實質內容的值。
 * minLen: 至少要有這麼多字才算「有實質內容」。
 */
function pick(candidates: Array<string | null | undefined>, minLen = 4): string {
  for (const c of candidates) {
    const s = clean(c);
    if (s.length >= minLen) return s;
  }
  return "";
}

/**
 * 預計算文字會佔幾行（不繪製）。
 * 和 wrapText 邏輯完全一致，確保高度計算準確。
 */
function countLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): number {
  if (!text) return 0;
  const chars = [...text];
  let lines = 0;
  let cur = "";
  for (const ch of chars) {
    const test = cur + ch;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines++;
      cur = ch;
      if (lines >= maxLines) return maxLines;
    } else {
      cur = test;
    }
  }
  if (cur) lines++;
  return Math.min(lines, maxLines);
}

/**
 * 繪製換行文字，始終使用 left align，不受外部 ctx 狀態影響。
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

  const prevAlign = ctx.textAlign;
  ctx.textAlign   = "left";
  ctx.fillStyle   = color;

  const chars = [...text];
  const lines: string[] = [];
  let cur = "";

  for (const ch of chars) {
    const test = cur + ch;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = ch;
      if (lines.length >= maxLines) { cur = ""; break; }
    } else {
      cur = test;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);

  // 若有被截斷，最後一行加省略號
  const allChars  = chars.join("");
  const drawnText = lines.join("");
  if (drawnText.length < allChars.length) {
    let last = lines[lines.length - 1] ?? "";
    while (last && ctx.measureText(last + "…").width > maxWidth) {
      last = [...last].slice(0, -1).join("");
    }
    lines[lines.length - 1] = last + "…";
  }

  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));

  ctx.textAlign = prevAlign;
  return lines.length;
}

/** 圓角矩形路徑（不含 fill/stroke） */
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

// ── 裝飾 ─────────────────────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0,    "#05071d");
  bg.addColorStop(0.45, "#0d0b2a");
  bg.addColorStop(1,    "#1a0e2e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 側邊光暈
  const gL = ctx.createRadialGradient(0, H * 0.38, 0, 0, H * 0.38, 460);
  gL.addColorStop(0, "rgba(100,60,200,0.14)");
  gL.addColorStop(1, "rgba(100,60,200,0)");
  ctx.fillStyle = gL; ctx.fillRect(0, 0, W, H);

  const gR = ctx.createRadialGradient(W, H * 0.62, 0, W, H * 0.62, 460);
  gR.addColorStop(0, "rgba(60,180,160,0.09)");
  gR.addColorStop(1, "rgba(60,180,160,0)");
  ctx.fillStyle = gR; ctx.fillRect(0, 0, W, H);
}

function drawStarDots(ctx: CanvasRenderingContext2D) {
  const pts = [
    [120, 110, 2.5, 0.55], [960,  90, 2.0, 0.45], [ 80, 320, 1.8, 0.38],
    [1000, 280, 2.2, 0.50], [200, 560, 1.5, 0.32], [890, 500, 2.0, 0.42],
    [140, 1400, 2.0, 0.45], [940, 1450, 1.8, 0.38], [60, 1620, 1.5, 0.28],
    [1010,1700, 2.2, 0.42], [540,  80, 2.8, 0.60], [540, 1840, 2.5, 0.50],
    [320, 200, 1.6, 0.35], [760, 160, 1.4, 0.30],
  ] as [number, number, number, number][];

  for (const [x, y, r, a] of pts) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(247,217,135,${a})`;
    ctx.fill();
  }

  ctx.font      = "28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(247,217,135,0.38)";
  for (const [x, y] of [[108, 96], [972, 96], [108, 1840], [972, 1840]] as [number,number][]) {
    ctx.fillText("✦", x, y);
  }
}

function drawDivider(ctx: CanvasRenderingContext2D, y: number) {
  const lg = ctx.createLinearGradient(MARGIN_X, 0, W - MARGIN_X, 0);
  lg.addColorStop(0,   "rgba(247,217,135,0)");
  lg.addColorStop(0.5, "rgba(247,217,135,0.34)");
  lg.addColorStop(1,   "rgba(247,217,135,0)");
  ctx.save();
  ctx.strokeStyle = lg;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN_X, y);
  ctx.lineTo(W - MARGIN_X, y);
  ctx.stroke();
  ctx.restore();
}

// ── 區塊繪製 ─────────────────────────────────────────────────────────────────

/** 頂部品牌區，回傳底部 Y */
function drawHeader(ctx: CanvasRenderingContext2D): number {
  ctx.textAlign = "center";

  ctx.font      = "500 30px sans-serif";
  ctx.fillStyle = "rgba(247,217,135,0.72)";
  ctx.fillText("UNIVERSE WHISPER", W / 2, 148);

  ctx.font      = "bold 64px sans-serif";
  ctx.fillStyle = "#f7d987";
  ctx.fillText("我的三重星座", W / 2, 244);

  ctx.font      = "400 30px sans-serif";
  ctx.fillStyle = "rgba(255,247,230,0.46)";
  ctx.fillText("太陽  ×  月亮  ×  上升", W / 2, 300);

  const divY = 338;
  drawDivider(ctx, divY);
  return divY + 12;
}

/** 星座資訊卡，回傳底部 Y */
function drawSignCard(
  ctx: CanvasRenderingContext2D,
  startY: number,
  params: StoryImageParams,
): number {
  const ROW_H  = 90;
  const CARD_H = ROW_H * 4 + 20;

  ctx.save();
  roundRectPath(ctx, MARGIN_X, startY, INNER_W, CARD_H, 36);
  ctx.fillStyle   = "rgba(255,255,255,0.050)";
  ctx.fill();
  ctx.strokeStyle = "rgba(247,217,135,0.24)";
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  ctx.restore();

  const rows: Array<{ sym: string; label: string; sign: string | null | undefined; color: string }> = [
    { sym: "☀",  label: "太陽", sign: params.sunSign,    color: "#f7d987" },
    { sym: "●",  label: "月亮", sign: params.moonSign,   color: "#b8a0f0" },
    { sym: "↑",  label: "上升", sign: params.risingSign, color: "#88d8b0" },
    { sym: "♀",  label: "金星", sign: params.venusSign,  color: "#c9a0dc" },
  ];

  rows.forEach((row, i) => {
    const rowTop = startY + 10 + i * ROW_H;
    const baseY  = rowTop + ROW_H / 2 + 13;

    if (i > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(MARGIN_X + 28, rowTop);
      ctx.lineTo(MARGIN_X + INNER_W - 28, rowTop);
      ctx.stroke();
      ctx.restore();
    }

    // 左側標籤
    ctx.textAlign = "left";
    ctx.font      = "400 33px sans-serif";
    ctx.fillStyle = "rgba(255,247,230,0.50)";
    ctx.fillText(`${row.sym}  ${row.label}`, MARGIN_X + 44, baseY);

    // 右側星座
    ctx.textAlign = "right";
    ctx.font      = row.sign ? "bold 36px sans-serif" : "400 28px sans-serif";
    ctx.fillStyle = row.sign ? row.color : "rgba(255,247,230,0.22)";
    const signLabel = row.sign
      ? `${ZODIAC_SYMBOLS[row.sign] ?? ""}  ${row.sign}`
      : "尚未提供";
    ctx.fillText(signLabel, MARGIN_X + INNER_W - 44, baseY);
  });

  return startY + CARD_H;
}

/** 內容卡（整體解析 / 核心提醒 / 宇宙悄悄話）
 *  @param badgeLabel  標題文字
 *  @param text        已清洗後的文字
 *  @param maxLines    最多行數
 *  @param startY      卡頂 Y
 *  @param darkStyle   true=米白底深字；false=深色半透明底淺字
 *  @returns 卡底 Y
 */
function drawContentCard(
  ctx: CanvasRenderingContext2D,
  badgeLabel: string,
  text: string,
  maxLines: number,
  startY: number,
  darkStyle: boolean,
): number {
  // 先量好行數，再畫背景
  ctx.font = `400 ${CARD_FONT_SIZE}px sans-serif`;
  const lineCount = countLines(ctx, text, CARD_TEXT_W, maxLines);
  const actualLines = Math.max(lineCount, 1); // 至少 1 行（避免卡片過矮）

  const cardH =
    CARD_PAD_TOP + CARD_BADGE_H + CARD_BADGE_GAP +
    actualLines * CARD_LINE_H + CARD_PAD_BOT;

  // 卡片背景
  ctx.save();
  roundRectPath(ctx, MARGIN_X, startY, INNER_W, cardH, 40);
  if (darkStyle) {
    const g = ctx.createLinearGradient(MARGIN_X, startY, MARGIN_X, startY + cardH);
    g.addColorStop(0,    "rgba(255,247,230,0.92)");
    g.addColorStop(0.55, "rgba(248,232,216,0.90)");
    g.addColorStop(1,    "rgba(246,219,226,0.87)");
    ctx.fillStyle   = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(202,168,95,0.40)";
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  } else {
    ctx.fillStyle   = "rgba(255,255,255,0.058)";
    ctx.fill();
    ctx.strokeStyle = "rgba(184,160,240,0.22)";
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  }
  ctx.restore();

  // Badge
  const badgeW = Math.min(ctx.measureText(badgeLabel).width + 60, INNER_W * 0.7);
  // 重新量：badge font
  ctx.font = "bold 24px sans-serif";
  const badgeTextW = ctx.measureText(badgeLabel).width;
  const bW  = badgeTextW + 56;
  const bH  = CARD_BADGE_H;
  const bX  = MARGIN_X + (INNER_W - bW) / 2;
  const bY  = startY + CARD_PAD_TOP;
  void badgeW; // suppress unused

  ctx.save();
  roundRectPath(ctx, bX, bY, bW, bH, bH / 2);
  ctx.fillStyle = darkStyle ? "#caa85f" : "rgba(184,160,240,0.42)";
  ctx.fill();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.font      = "bold 24px sans-serif";
  ctx.fillStyle = darkStyle ? "#ffffff" : "rgba(255,247,230,0.90)";
  ctx.fillText(badgeLabel, W / 2, bY + bH * 0.67);

  // 正文
  const textY = bY + bH + CARD_BADGE_GAP + CARD_FONT_SIZE;
  ctx.font = `400 ${CARD_FONT_SIZE}px sans-serif`;
  wrapText(
    ctx,
    text,
    CARD_TEXT_X,
    textY,
    CARD_TEXT_W,
    CARD_LINE_H,
    maxLines,
    darkStyle ? "#241937" : "rgba(255,247,230,0.86)",
  );

  return startY + cardH;
}

// ── 主繪製入口 ────────────────────────────────────────────────────────────────

function render(ctx: CanvasRenderingContext2D, params: StoryImageParams) {
  drawBackground(ctx);
  drawStarDots(ctx);

  // 1. 頂部品牌
  const headerBottom = drawHeader(ctx);

  // 2. 星座卡
  const signCardTop    = headerBottom + 36;
  const signCardBottom = drawSignCard(ctx, signCardTop, params);

  // 3. 主內容區 ── 準備 3 張內容卡的文字
  const overall = pick([params.overallSummary, params.shortSummary, params.whisper, params.advice]);
  const advice  = pick([params.advice, params.whisper, params.shortSummary, params.overallSummary]);
  const whisper = pick([params.whisper, params.shortSummary, params.advice]);

  // 避免卡片間內容完全相同（如果 overall 已等於 advice 就換用備用）
  const adviceText   = advice  === overall ? pick([params.whisper, params.shortSummary]) : advice;
  const whisperText  = whisper === overall || whisper === adviceText
    ? pick([params.shortSummary, params.advice])
    : whisper;

  // 底部保留給 footer（分隔線 + 網址）
  const FOOTER_RESERVED = 148;
  const contentAreaBottom = H - FOOTER_RESERVED;
  const GAP = 28;

  let curY = signCardBottom + 40;

  // ── 卡 A：整體解析（最重要，給最多行）
  if (overall) {
    curY = drawContentCard(ctx, "三重星座整體解析", overall, 6, curY, false);
    curY += GAP;
  }

  // ── 卡 B：核心提醒
  if (adviceText && curY + 180 < contentAreaBottom) {
    const remainB = contentAreaBottom - curY - (whisperText ? GAP + 160 : 0);
    // 動態計算最多幾行可放
    ctx.font = `400 ${CARD_FONT_SIZE}px sans-serif`;
    const maxLinesB = Math.max(2, Math.floor(
      (remainB - CARD_PAD_TOP - CARD_BADGE_H - CARD_BADGE_GAP - CARD_PAD_BOT) / CARD_LINE_H,
    ));
    const cappedB = Math.min(maxLinesB, 5);
    curY = drawContentCard(ctx, "核心提醒", adviceText, cappedB, curY, true);
    curY += GAP;
  }

  // ── 卡 C：宇宙悄悄話
  if (whisperText && curY + 160 < contentAreaBottom) {
    const remainC = contentAreaBottom - curY;
    ctx.font = `400 ${CARD_FONT_SIZE}px sans-serif`;
    const maxLinesC = Math.max(2, Math.floor(
      (remainC - CARD_PAD_TOP - CARD_BADGE_H - CARD_BADGE_GAP - CARD_PAD_BOT) / CARD_LINE_H,
    ));
    const cappedC = Math.min(maxLinesC, 4);
    curY = drawContentCard(ctx, "宇宙悄悄話", whisperText, cappedC, curY, false);
  }

  // 4. 底部
  const footerDivY = H - FOOTER_RESERVED + 20;
  drawDivider(ctx, footerDivY);

  ctx.textAlign = "center";
  ctx.font      = "400 26px sans-serif";
  ctx.fillStyle = "rgba(255,247,230,0.30)";
  ctx.fillText(
    `✦  ${params.siteUrl ?? "universe-whisper.vercel.app"}  ✦`,
    W / 2,
    footerDivY + 56,
  );
}
