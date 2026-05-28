/**
 * Server-side Instagram Story image generation.
 * 1080×1920 PNG — uses next/og (satori) so there is no html2canvas dependency.
 *
 * POST /api/share-image
 * Body: { cardNameZh, cardNameEn, cardImageUrl, resultText, siteUrl }
 * Returns: image/png
 */

import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export const runtime = "edge";

const W = 1080;
const H = 1920;

// ---------------------------------------------------------------------------
// Chinese font loading
// ---------------------------------------------------------------------------
// We try several CDN sources in order. The edge function fetches at request
// time; failures are silently skipped (Latin text still renders fine, but
// Chinese glyphs will be blank without a CJK font — so we try hard).
// ---------------------------------------------------------------------------
async function loadCJKFont(): Promise<ArrayBuffer | null> {
  // --- Option A: jsDelivr (@fontsource/noto-sans-tc) ---
  // This CDN has no rate limiting and supports CORS.
  const jsDelivrUrls = [
    "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@5.0.12/files/noto-sans-tc-chinese-traditional-400-normal.woff2",
    "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@5.0.13/files/noto-sans-tc-chinese-traditional-400-normal.woff2",
    "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@5.0.11/files/noto-sans-tc-chinese-traditional-400-normal.woff2",
    "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@5.0.14/files/noto-sans-tc-chinese-traditional-400-normal.woff2",
  ];

  for (const url of jsDelivrUrls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (resp.ok) return await resp.arrayBuffer();
    } catch {
      // try next
    }
  }

  // --- Option B: Google Fonts CSS → parse → fetch the CJK-range woff2 ---
  try {
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(4000),
      },
    ).then((r) => r.text());

    // Split into @font-face blocks and look for one covering CJK Ideographs.
    const blocks = css.split("@font-face").filter((b) => b.includes("woff2"));
    for (const block of blocks) {
      const rangeMatch = block.match(/unicode-range\s*:\s*([^;]+)/);
      const urlMatch = block.match(/url\(([^)'"]+\.woff2)\)/);
      if (!rangeMatch || !urlMatch) continue;
      const range = rangeMatch[1].toLowerCase();
      // Main CJK Unified Ideographs block: U+4E00-U+9FFF
      if (
        range.includes("4e00") ||
        range.includes("5000") ||
        range.includes("6000") ||
        range.includes("7000") ||
        range.includes("8000") ||
        range.includes("9000")
      ) {
        const fontResp = await fetch(urlMatch[1], { signal: AbortSignal.timeout(4000) });
        if (fontResp.ok) return await fontResp.arrayBuffer();
      }
    }
  } catch {
    // Give up on Google Fonts too
  }

  return null;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
function cleanText(text: string, maxLen: number): string {
  const clean = text
    .replace(/\*\*/g, "")
    // Strip most emoji/symbols that satori can't render without emoji font
    .replace(
      /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen - 1)}…` : clean;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as {
    cardNameZh?: string;
    cardNameEn?: string;
    cardImageUrl?: string;
    resultText?: string;
    siteUrl?: string;
  };

  const cardNameZh = (body.cardNameZh ?? "").slice(0, 12);
  const cardNameEn = (body.cardNameEn ?? "").slice(0, 36);
  const cardImageUrl = body.cardImageUrl ?? "";
  const resultText = cleanText(body.resultText ?? "", 96);
  const siteUrl = (body.siteUrl ?? "universe-whisper.vercel.app").replace(/^https?:\/\//, "");

  const fontData = await loadCJKFont();
  const fonts = fontData
    ? [{ name: "NotoTC", data: fontData, style: "normal" as const, weight: 400 as FontWeight }]
    : undefined;
  const ff = fontData ? "'NotoTC', sans-serif" : "sans-serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          background:
            "linear-gradient(180deg, #05071d 0%, #0d0b2a 55%, #1a0e2e 100%)",
          fontFamily: ff,
          color: "#fff7e6",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* ── Decorative stars ── */}
        <span
          style={{
            position: "absolute",
            top: 88,
            left: 110,
            fontSize: 28,
            color: "#f7d987",
            opacity: 0.55,
            display: "flex",
          }}
        >
          ✦
        </span>
        <span
          style={{
            position: "absolute",
            top: 130,
            right: 130,
            fontSize: 20,
            color: "#f7d987",
            opacity: 0.38,
            display: "flex",
          }}
        >
          ✦
        </span>
        <span
          style={{
            position: "absolute",
            bottom: 220,
            left: 90,
            fontSize: 22,
            color: "#f7d987",
            opacity: 0.45,
            display: "flex",
          }}
        >
          ✦
        </span>
        <span
          style={{
            position: "absolute",
            bottom: 250,
            right: 100,
            fontSize: 18,
            color: "#f7d987",
            opacity: 0.38,
            display: "flex",
          }}
        >
          ✦
        </span>

        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 100,
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: 30,
              letterSpacing: 12,
              color: "rgba(247,217,135,0.88)",
              fontWeight: 600,
              margin: 0,
            }}
          >
            UNIVERSE WHISPER
          </p>
          <p
            style={{
              fontSize: 84,
              fontWeight: 700,
              letterSpacing: 16,
              color: "#f7d987",
              margin: "18px 0 0",
            }}
          >
            宇宙偷偷話
          </p>
          <p
            style={{
              fontSize: 30,
              letterSpacing: 8,
              color: "rgba(255,247,230,0.76)",
              margin: "14px 0 0",
            }}
          >
            宇宙想對你說...
          </p>
        </div>

        {/* ── Card image ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            marginTop: 64,
            position: "relative",
          }}
        >
          {/* Glow behind card */}
          <div
            style={{
              position: "absolute",
              width: 340,
              height: 480,
              borderRadius: 40,
              background: "rgba(247,217,135,0.18)",
              filter: "blur(32px)",
              display: "flex",
            }}
          />
          {/* Card frame */}
          <div
            style={{
              width: 290,
              height: 440,
              borderRadius: 30,
              border: "3px solid rgba(247,217,135,0.82)",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#130b32",
              transform: "rotate(-3deg)",
              boxShadow:
                "0 0 56px rgba(247,217,135,0.38), 0 36px 88px rgba(5,7,24,0.52)",
              position: "relative",
            }}
          >
            {cardImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cardImageUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <span style={{ fontSize: 80, color: "#f7d987", display: "flex" }}>
                ☾
              </span>
            )}
          </div>
        </div>

        {/* ── Card name ── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 56,
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: "#f7d987",
              letterSpacing: 12,
              margin: 0,
            }}
          >
            {cardNameZh}
          </p>
          <p
            style={{
              fontSize: 30,
              fontWeight: 600,
              color: "rgba(255,247,230,0.80)",
              letterSpacing: 6,
              margin: "10px 0 0",
            }}
          >
            {cardNameEn}
          </p>
        </div>

        {/* ── Result text box ── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            background:
              "linear-gradient(150deg, rgba(255,247,230,0.95), rgba(248,232,216,0.91) 48%, rgba(246,219,226,0.87))",
            borderRadius: 52,
            border: "2px solid rgba(202,168,95,0.55)",
            padding: "46px 64px",
            marginTop: 54,
            width: 920,
            textAlign: "center",
            color: "#261936",
            boxShadow:
              "0 28px 80px rgba(5,7,24,0.3), inset 0 1px 0 rgba(255,255,255,0.72)",
          }}
        >
          {/* Badge row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              marginBottom: 28,
              width: "100%",
            }}
          >
            <div
              style={{
                flex: 1,
                height: 1,
                background:
                  "linear-gradient(to right, transparent, rgba(189,148,75,0.6))",
                display: "flex",
              }}
            />
            <span
              style={{
                background: "#caa85f",
                color: "white",
                borderRadius: 28,
                padding: "8px 28px",
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: 6,
                boxShadow: "0 0 24px rgba(202,168,95,0.42)",
                display: "flex",
              }}
            >
              宇宙訊息
            </span>
            <div
              style={{
                flex: 1,
                height: 1,
                background:
                  "linear-gradient(to left, transparent, rgba(189,148,75,0.6))",
                display: "flex",
              }}
            />
          </div>
          {/* Message body */}
          <p
            style={{
              fontSize: 34,
              lineHeight: 1.8,
              letterSpacing: 2,
              color: "#241937",
              margin: 0,
            }}
          >
            {resultText || "宇宙正在整理訊息，靜靜感受當下。"}
          </p>
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: "auto",
            marginBottom: 72,
            gap: 14,
          }}
        >
          <span
            style={{ color: "rgba(247,217,135,0.55)", fontSize: 24, display: "flex" }}
          >
            ✦
          </span>
          <p
            style={{
              fontSize: 24,
              color: "rgba(255,247,230,0.42)",
              letterSpacing: 4,
              margin: 0,
            }}
          >
            {siteUrl}
          </p>
          <span
            style={{ color: "rgba(247,217,135,0.55)", fontSize: 24, display: "flex" }}
          >
            ✦
          </span>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
