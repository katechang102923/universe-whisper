/**
 * 三重星座限動圖 — 前端 Canvas 產圖
 * 1080 × 1920 PNG，完全在瀏覽器端執行，不呼叫任何後端 API。
 *
 * 版面（由上到下）：
 *   1. 頂部品牌區   UNIVERSE WHISPER / 我的三重星座 / 太陽×月亮×上升
 *   2. 星座資訊卡   太陽 / 月亮 / 上升 / 金星 四列
 *   3. 主內容區     整體解析卡 + 四個星座摘要卡
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
  sunCoreText?:   string | null | undefined;
  sunText?:       string | null | undefined;
  coreText?:      string | null | undefined;
  moonEmotionText?: string | null | undefined;
  moonText?:      string | null | undefined;
  emotionText?:   string | null | undefined;
  risingOuterText?: string | null | undefined;
  risingText?:    string | null | undefined;
  outerText?:     string | null | undefined;
  venusLoveText?: string | null | undefined;
  venusText?:     string | null | undefined;
  loveText?:      string | null | undefined;
  whisper:             string | null | undefined;
  advice:              string | null | undefined;
  /** 個人事業與財富天賦報告（已解鎖時傳入） */
  careerWealthText?:   string | null | undefined;
  /** 情感正緣與人際模式分析（已解鎖時傳入） */
  loveRelationshipText?: string | null | undefined;
  /** 流年與未來半年運勢（已解鎖時傳入） */
  yearlyFortuneText?:  string | null | undefined;
  /** 靈魂課題與人生方向（已解鎖時傳入） */
  soulLessonText?:     string | null | undefined;
  siteUrl?:            string;
}

export async function generateAstroStoryImage(params: StoryImageParams): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("瀏覽器不支援 Canvas，無法產生圖片。");
  }

  const backgroundImage = await loadStoryBackgroundImage();
  render(ctx, params, backgroundImage);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Canvas toBlob 失敗，請稍後再試。")),
      "image/png",
    );
  });
}

// ── 常數 ─────────────────────────────────────────────────────────────────────

const W = 1080;
const H = 1920;
const STORY_BG_SRC = "/images/astro-profile-story-bg.png";

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
    .replace(/在下方可以分別細看/g, "")
    .replace(/下方有完整解析/g, "")
    .replace(/延伸解析/g, "")
    .replace(/請繼續往下看/g, "")
    .replace(/下方可以分別細看/g, "")
    .replace(/完整解析/g, "")
    .replace(/\n{2,}/g, "\n")
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

function splitSentences(text: string): string[] {
  const normalized = clean(text);
  if (!normalized) return [];
  const matches = normalized.match(/[^。！？；!?]+[。！？；!?]*/g) ?? [normalized];
  return matches.map((part) => part.trim()).filter(Boolean);
}

function trimToChars(text: string, maxChars: number): string {
  const s = clean(text);
  if (s.length <= maxChars) return s;
  return `${[...s].slice(0, Math.max(0, maxChars - 1)).join("").trim()}…`;
}

/**
 * 依句號類標點分句，逐句累積直到超過 maxChars 或 maxSentences。
 * 確保回傳完整句，不在句子中間截斷。
 * 若第一句本身就超過 maxChars，嘗試在逗號/頓號處截斷並補「…」。
 */
function getCompleteSentenceSummary(
  text: string,
  maxChars: number,
  maxSentences: number,
): string {
  const s = clean(text);
  if (!s) return "";

  const sentences = splitSentences(s);

  if (!sentences.length) {
    if (s.length <= maxChars) return s;
    const sub = [...s].slice(0, maxChars).join("");
    const m = sub.match(/^.*[，、：]/);
    if (m && m[0].length >= 4) return m[0] + "…";
    return [...s].slice(0, maxChars - 1).join("") + "…";
  }

  const result: string[] = [];
  let total = 0;

  for (const sentence of sentences) {
    if (result.length >= maxSentences) break;
    // 第一句不管多長都先嘗試加入
    if (result.length > 0 && total + sentence.length > maxChars) break;
    result.push(sentence);
    total += sentence.length;
  }

  if (!result.length && sentences.length > 0) {
    const first = sentences[0];
    if (first.length <= maxChars) {
      return first + (sentences.length > 1 ? "…" : "");
    }
    const sub = [...first].slice(0, maxChars).join("");
    const m = sub.match(/^.*[，、：]/);
    if (m && m[0].length >= 4) return m[0] + "…";
    return [...first].slice(0, maxChars - 1).join("") + "…";
  }

  const joined = result.join("");
  // 若還有未納入的句子，補省略號
  const truncated = result.length < sentences.length || joined.length < s.length;
  // 不以逗號、頓號、破折號、冒號結尾
  const cleaned = joined.replace(/[，、：—]+$/, "");
  return truncated ? cleaned + "…" : cleaned;
}

function summarizeSentences(
  candidates: Array<string | null | undefined>,
  sentenceCount: number,
  maxChars: number,
): string[] {
  const source = pick(candidates);
  if (!source) return [];
  const summary = getCompleteSentenceSummary(source, maxChars, sentenceCount);
  return summary ? [summary] : [];
}

function summarizeParagraphs(
  candidates: Array<string | null | undefined>,
  maxChars: number,
): string[] {
  const source = pick(candidates);
  if (!source) return [];
  const summary = getCompleteSentenceSummary(source, maxChars, 3);
  return summary ? [summary] : [];
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

function loadStoryBackgroundImage(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = STORY_BG_SRC;
  });
}

// ── 裝飾 ─────────────────────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D, backgroundImage: HTMLImageElement | null) {
  if (backgroundImage?.naturalWidth && backgroundImage.naturalHeight) {
    const scale = Math.max(W / backgroundImage.naturalWidth, H / backgroundImage.naturalHeight);
    const drawW = backgroundImage.naturalWidth * scale;
    const drawH = backgroundImage.naturalHeight * scale;
    const drawX = (W - drawW) / 2;
    const drawY = (H - drawH) / 2;
    ctx.drawImage(backgroundImage, drawX, drawY, drawW, drawH);
    return;
  }

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
  const ROW_H  = 52;   // 縮小約 10%（原 58）
  const CARD_H = ROW_H * 4 + 18;

  ctx.save();
  roundRectPath(ctx, MARGIN_X, startY, INNER_W, CARD_H, 28);
  ctx.fillStyle   = "rgba(7,11,30,0.72)";
  ctx.fill();
  ctx.strokeStyle = "rgba(247,217,135,0.32)";
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  ctx.restore();

  const rows: Array<{ sym: string; label: string; sign: string | null | undefined; color: string }> = [
    { sym: "☉",  label: "太陽", sign: params.sunSign,    color: "#f7d987" },
    { sym: "☽",  label: "月亮", sign: params.moonSign,   color: "#b8a0f0" },
    { sym: "↑",  label: "上升", sign: params.risingSign, color: "#88d8b0" },
    { sym: "♀",  label: "金星", sign: params.venusSign,  color: "#c9a0dc" },
  ];

  rows.forEach((row, i) => {
    const rowTop = startY + 9 + i * ROW_H;
    const baseY  = rowTop + ROW_H / 2 + 10;

    if (i > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(MARGIN_X + 28, rowTop);
      ctx.lineTo(MARGIN_X + INNER_W - 28, rowTop);
      ctx.stroke();
      ctx.restore();
    }

    ctx.textAlign = "left";
    ctx.font      = row.sign ? "bold 28px sans-serif" : "400 25px sans-serif";
    ctx.fillStyle = row.sign ? row.color : "rgba(255,247,230,0.22)";
    const signLabel = row.sign
      ? `${row.sym}  ${row.label}  ${row.sign}`
      : `${row.sym}  ${row.label}  尚未提供`;
    ctx.fillText(signLabel, MARGIN_X + 44, baseY);
  });

  return startY + CARD_H;
}

/** 舊版內容卡 helper，保留給相同 Canvas 樣式日後復用。
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

function fitOneLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  const s = clean(text);
  if (ctx.measureText(s).width <= maxWidth) return s;
  let fitted = s;
  while (fitted && ctx.measureText(`${fitted}…`).width > maxWidth) {
    fitted = [...fitted].slice(0, -1).join("");
  }
  return fitted ? `${fitted}…` : "";
}

function drawWrappedSummaryLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
  color: string,
): number {
  const text = lines.map(clean).filter(Boolean).join("\n");
  if (!text) return 0;

  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  ctx.fillStyle = color;

  const drawn: string[] = [];
  for (const paragraph of text.split("\n")) {
    let cur = "";
    for (const ch of [...paragraph]) {
      const test = cur + ch;
      if (ctx.measureText(test).width > maxWidth && cur) {
        drawn.push(cur);
        cur = ch;
        if (drawn.length >= maxLines) break;
      } else {
        cur = test;
      }
    }
    if (drawn.length >= maxLines) break;
    if (cur) drawn.push(cur);
    if (drawn.length >= maxLines) break;
  }

  const sourceChars = text.replace(/\n/g, "");
  const drawnChars = drawn.join("");
  if (drawn.length && drawnChars.length < sourceChars.length) {
    drawn[drawn.length - 1] = fitOneLine(ctx, drawn[drawn.length - 1], maxWidth);
  }

  drawn.slice(0, maxLines).forEach((line, i) => {
    ctx.fillText(line, x, y + i * lineHeight);
  });

  ctx.textAlign = prevAlign;
  return Math.min(drawn.length, maxLines);
}

function drawFittedSummaryLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
  initialFontSize: number,
  minFontSize: number,
  lineHeightRatio: number,
  color: string,
): number {
  const text = lines.map(clean).filter(Boolean).join("\n");
  if (!text) return 0;

  const wrapAtSize = (fontSize: number) => {
    ctx.font = `400 ${fontSize}px sans-serif`;
    const wrapped: string[] = [];
    for (const paragraph of text.split("\n")) {
      let cur = "";
      for (const ch of [...paragraph]) {
        const test = cur + ch;
        if (ctx.measureText(test).width > maxWidth && cur) {
          wrapped.push(cur);
          cur = ch;
        } else {
          cur = test;
        }
      }
      if (cur) wrapped.push(cur);
    }
    return wrapped;
  };

  let fontSize = initialFontSize;
  let wrapped = wrapAtSize(fontSize);
  let lineHeight = Math.round(fontSize * lineHeightRatio);

  while (fontSize > minFontSize && wrapped.length * lineHeight > maxHeight) {
    fontSize -= 1;
    wrapped = wrapAtSize(fontSize);
    lineHeight = Math.round(fontSize * lineHeightRatio);
  }

  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
  const displayed = wrapped.slice(0, maxLines);
  if (wrapped.length > maxLines && displayed.length) {
    displayed[displayed.length - 1] = fitOneLine(ctx, displayed[displayed.length - 1], maxWidth);
  }

  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  ctx.font = `400 ${fontSize}px sans-serif`;
  ctx.fillStyle = color;
  displayed.forEach((line, i) => {
    ctx.fillText(line, x, y + i * lineHeight);
  });
  ctx.textAlign = prevAlign;

  return displayed.length;
}

function drawOverallSummaryCard(
  ctx: CanvasRenderingContext2D,
  paragraphs: string[],
  startY: number,
): number {
  if (!paragraphs.length) return startY;

  const cardH = 240;   // 縮小（原 274）
  const padX = 44;
  const titleY = startY + 48;
  const textY  = startY + 96;

  ctx.save();
  roundRectPath(ctx, MARGIN_X, startY, INNER_W, cardH, 34);
  ctx.fillStyle = "rgba(7,11,30,0.76)";
  ctx.fill();
  ctx.strokeStyle = "rgba(247,217,135,0.34)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = "left";
  ctx.font = "bold 30px sans-serif";   // 縮小（原 34px）
  ctx.fillStyle = "#f7d987";
  ctx.fillText("三重星座整體解析", MARGIN_X + padX, titleY);

  drawFittedSummaryLines(
    ctx,
    paragraphs,
    MARGIN_X + padX,
    textY,
    INNER_W - padX * 2,
    cardH - 110,   // 動態高度
    28,
    21,
    1.38,
    "rgba(255,247,230,0.94)",
  );

  return startY + cardH;
}

interface AspectSummary {
  title: string;
  lines: string[];
  accent: string;
}

function drawAspectSummaryGrid(
  ctx: CanvasRenderingContext2D,
  aspects: AspectSummary[],
  startY: number,
  bottomY: number,
): number {
  const visible = aspects.filter((aspect) => aspect.title && aspect.lines.length > 0).slice(0, 4);
  if (!visible.length) return startY;

  const colGap = 22;
  const rowGap = 20;
  const cardW = (INNER_W - colGap) / 2;
  const rows = Math.ceil(visible.length / 2);
  const cardH = Math.min(200, Math.floor((bottomY - startY - rowGap * (rows - 1)) / rows));
  const padX = 24;

  visible.forEach((aspect, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN_X + col * (cardW + colGap);
    const y = startY + row * (cardH + rowGap);

    ctx.save();
    roundRectPath(ctx, x, y, cardW, cardH, 28);
    ctx.fillStyle = "rgba(7,11,30,0.68)";
    ctx.fill();
    ctx.strokeStyle = aspect.accent;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = "left";
    ctx.font = "bold 25px sans-serif";
    ctx.fillStyle = "rgba(255,247,230,0.94)";
    ctx.fillText(fitOneLine(ctx, aspect.title, cardW - padX * 2), x + padX, y + 44);

    drawFittedSummaryLines(
      ctx,
      aspect.lines,
      x + padX,
      y + 91,
      cardW - padX * 2,
      cardH - 112,
      28,
      20,
      1.34,
      "rgba(255,247,230,0.90)",
    );
  });

  return startY + rows * cardH + (rows - 1) * rowGap;
}

/**
 * 底部摘要卡。
 * - 已解鎖（items 有內容）：標題「本次完整解析摘要」，顯示真實解析摘要。
 * - 未解鎖（items 為空）：標題「🔓 完整版額外包含」，顯示功能預告。
 */
function drawUnlockTeaserCard(
  ctx: CanvasRenderingContext2D,
  startY: number,
  items?: Array<{ icon: string; title: string; desc: string }>,
): number {
  const isUnlocked = items && items.length > 0;
  const CARD_H = 310;   // 縮小（原 340）
  const padX = 38;

  // 卡片背景
  ctx.save();
  roundRectPath(ctx, MARGIN_X, startY, INNER_W, CARD_H, 32);
  ctx.fillStyle = "rgba(7,11,30,0.78)";
  ctx.fill();
  ctx.strokeStyle = isUnlocked
    ? "rgba(247,217,135,0.36)"
    : "rgba(247,217,135,0.22)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // 標題
  ctx.textAlign = "left";
  ctx.font = "bold 30px sans-serif";
  ctx.fillStyle = "#f7d987";
  ctx.fillText(
    isUnlocked ? "本次完整解析摘要" : "🔓 完整版額外包含",
    MARGIN_X + padX,
    startY + 52,
  );

  // 標題下分隔線
  ctx.save();
  ctx.strokeStyle = "rgba(247,217,135,0.20)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN_X + padX, startY + 66);
  ctx.lineTo(MARGIN_X + INNER_W - padX, startY + 66);
  ctx.stroke();
  ctx.restore();

  const DISPLAY_ITEMS = isUnlocked ? items! : [
    { icon: "💰", title: "個人事業與財富天賦報告", desc: "分析工作模式、累積財富的方式與金錢盲點。" },
    { icon: "❤️", title: "情感正緣與人際模式分析", desc: "了解你的吸引力、感情需求與人際互動模式。" },
    { icon: "🌙", title: "流年與未來半年運勢",     desc: "整理三重星座能量與未來半年的方向機會。" },
    { icon: "✨", title: "靈魂課題與人生方向",     desc: "找出太陽、月亮、上升三重能量的成長課題。" },
  ];

  const colGap = 20;
  const rowGap = 14;
  const contentW = INNER_W - padX * 2;
  const itemW = (contentW - colGap) / 2;
  const itemH = 103;   // 縮小（原 106）
  const gridTop = startY + 78;   // 往上移（原 82）

  DISPLAY_ITEMS.forEach((item, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const ix = MARGIN_X + padX + col * (itemW + colGap);
    const iy = gridTop + row * (itemH + rowGap);

    // 小卡背景
    ctx.save();
    roundRectPath(ctx, ix, iy, itemW, itemH, 16);
    ctx.fillStyle = "rgba(255,255,255,0.048)";
    ctx.fill();
    ctx.strokeStyle = isUnlocked
      ? "rgba(247,217,135,0.22)"
      : "rgba(247,217,135,0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // icon + title（最多 1 行）
    ctx.textAlign = "left";
    ctx.font = "bold 21px sans-serif";
    ctx.fillStyle = isUnlocked
      ? "rgba(255,247,230,0.96)"
      : "rgba(255,247,230,0.72)";
    ctx.fillText(
      fitOneLine(ctx, `${item.icon} ${item.title}`, itemW - 28),
      ix + 14,
      iy + 30,
    );

    // desc（自動縮字，最多 1～2 行）
    drawFittedSummaryLines(
      ctx,
      [item.desc],
      ix + 14,
      iy + 52,
      itemW - 28,
      itemH - 62,   // 足夠放 2 行
      19,
      14,
      1.38,
      isUnlocked
        ? "rgba(255,247,230,0.80)"
        : "rgba(255,247,230,0.55)",
    );
  });

  return startY + CARD_H;
}

// ── 主繪製入口 ────────────────────────────────────────────────────────────────

function render(
  ctx: CanvasRenderingContext2D,
  params: StoryImageParams,
  backgroundImage: HTMLImageElement | null,
) {
  drawBackground(ctx, backgroundImage);
  drawStarDots(ctx);

  // 1. 頂部品牌
  const headerBottom = drawHeader(ctx);

  // 2. 星座卡
  const signCardTop    = headerBottom + 36;
  const signCardBottom = drawSignCard(ctx, signCardTop, params);

  // 3. 主內容區：精簡分享版，不直接照貼完整版
  const overallParagraphs = summarizeParagraphs(
    [params.overallSummary, params.shortSummary, params.whisper, params.advice],
    132,
  );
  const sunLines = summarizeSentences(
    [params.sunCoreText, params.sunText, params.coreText, params.overallSummary],
    2,
    76,
  );
  const moonLines = summarizeSentences(
    [params.moonEmotionText, params.moonText, params.emotionText, params.overallSummary],
    2,
    76,
  );
  const risingLines = summarizeSentences(
    [params.risingOuterText, params.risingText, params.outerText, params.overallSummary],
    2,
    76,
  );
  const venusLines = summarizeSentences(
    [params.venusLoveText, params.venusText, params.loveText, params.overallSummary],
    2,
    66,
  );

  const aspects: AspectSummary[] = [
    {
      title: params.sunSign ? `☀ 核心本質｜太陽${params.sunSign}` : "",
      lines: sunLines,
      accent: "rgba(247,217,135,0.34)",
    },
    {
      title: params.moonSign ? `🌙 內在情感｜月亮${params.moonSign}` : "",
      lines: moonLines,
      accent: "rgba(184,160,240,0.34)",
    },
    {
      title: params.risingSign ? `⬆ 外在展現｜上升${params.risingSign}` : "",
      lines: risingLines,
      accent: "rgba(136,216,176,0.34)",
    },
    {
      title: params.venusSign ? `♀ 感情吸引力｜金星${params.venusSign}` : "",
      lines: venusLines,
      accent: "rgba(201,160,220,0.34)",
    },
  ];
  // ── 版面安全區常數 ────────────────────────────────────────────────────────────
  const FOOTER_RESERVED  = 220;   // footer div + 網址 + 底部留白（原 148）
  const FOOTER_GAP       = 80;    // teaser 底部到 footer 分隔線的最小間距
  const SUMMARY_CARD_H   = 310;   // 底部摘要卡固定高度（原 340）
  const GAP              = 18;    // 各區塊間距（原 24）

  const footerDivY       = H - FOOTER_RESERVED + 20;          // 分隔線 Y
  const contentAreaBottom = footerDivY - FOOTER_GAP;          // 摘要卡可用底邊

  let curY = signCardBottom + 32;   // 縮小上方間距（原 40）
  curY = drawOverallSummaryCard(ctx, overallParagraphs, curY);
  curY += overallParagraphs.length ? GAP : 0;
  curY = drawAspectSummaryGrid(ctx, aspects, curY, contentAreaBottom - SUMMARY_CARD_H - GAP);

  // 已解鎖時傳入真實摘要，未解鎖傳 undefined → 顯示功能預告
  const unlockedItems =
    params.careerWealthText && params.loveRelationshipText &&
    params.yearlyFortuneText && params.soulLessonText
      ? [
          { icon: "💰", title: "事業與財富", desc: getCompleteSentenceSummary(params.careerWealthText,  60, 1) },
          { icon: "❤️", title: "情感與人際", desc: getCompleteSentenceSummary(params.loveRelationshipText, 60, 1) },
          { icon: "🌙", title: "流年運勢",   desc: getCompleteSentenceSummary(params.yearlyFortuneText, 60, 1) },
          { icon: "✨", title: "靈魂方向",   desc: getCompleteSentenceSummary(params.soulLessonText,    60, 1) },
        ]
      : undefined;

  drawUnlockTeaserCard(ctx, Math.min(curY + GAP, contentAreaBottom - SUMMARY_CARD_H), unlockedItems);

  // 4. 底部
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
