/**
 * POST /api/astro-profile/share-image
 * Generates a 9:16 Instagram Story image for the astro-profile result.
 * Body: { sunSign, moonSign, risingSign, venusSign, shortSummary, siteUrl }
 * Returns: image/png
 */

import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export const runtime = "edge";

const W = 1080;
const H = 1920;

const ZODIAC_SYMBOLS: Record<string, string> = {
  牡羊座: "♈", 金牛座: "♉", 雙子座: "♊", 巨蟹座: "♋",
  獅子座: "♌", 處女座: "♍", 天秤座: "♎", 天蠍座: "♏",
  射手座: "♐", 摩羯座: "♑", 水瓶座: "♒", 雙魚座: "♓",
};

function sym(sign: string | null | undefined): string {
  if (!sign) return "";
  return ZODIAC_SYMBOLS[sign] ?? "";
}

async function loadCJKFont(): Promise<ArrayBuffer | null> {
  const urls = [
    "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@5.0.12/files/noto-sans-tc-chinese-traditional-400-normal.woff2",
    "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@5.0.13/files/noto-sans-tc-chinese-traditional-400-normal.woff2",
    "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@5.0.11/files/noto-sans-tc-chinese-traditional-400-normal.woff2",
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (resp.ok) return await resp.arrayBuffer();
    } catch { /* try next */ }
  }
  return null;
}

function cleanSummary(text: string, maxLen: number): string {
  const clean = text
    .replace(/\*\*/g, "")
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen - 1)}…` : clean;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as {
    sunSign?: string;
    moonSign?: string | null;
    risingSign?: string | null;
    venusSign?: string | null;
    shortSummary?: string;
    siteUrl?: string;
  };

  const sunSign = (body.sunSign ?? "").slice(0, 8);
  const moonSign = body.moonSign ?? null;
  const risingSign = body.risingSign ?? null;
  const venusSign = body.venusSign ?? null;
  const shortSummary = cleanSummary(body.shortSummary ?? "", 60);
  const siteUrl = (body.siteUrl ?? "universe-whisper.vercel.app").replace(/^https?:\/\//, "");

  const fontData = await loadCJKFont();
  const fonts = fontData
    ? [{ name: "NotoTC", data: fontData, style: "normal" as const, weight: 400 as FontWeight }]
    : undefined;
  const ff = fontData ? "'NotoTC', sans-serif" : "sans-serif";

  const signRows: Array<{ label: string; sign: string | null; color: string }> = [
    { label: "太陽", sign: sunSign || null, color: "#f7d987" },
    { label: "月亮", sign: moonSign, color: "#b8a0f0" },
    { label: "上升", sign: risingSign, color: "#88d8b0" },
    ...(venusSign ? [{ label: "金星", sign: venusSign, color: "#c9a0dc" }] : []),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          background: "linear-gradient(180deg, #05071d 0%, #0d0b2a 55%, #1a0e2e 100%)",
          fontFamily: ff,
          color: "#fff7e6",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative stars — explicit spans to avoid undefined CSS values in Satori */}
        <span style={{ position: "absolute", top: 90, left: 110, fontSize: 28, color: "#f7d987", opacity: 0.55, display: "flex" }}>✦</span>
        <span style={{ position: "absolute", top: 140, right: 130, fontSize: 20, color: "#f7d987", opacity: 0.38, display: "flex" }}>✦</span>
        <span style={{ position: "absolute", bottom: 200, left: 90, fontSize: 22, color: "#f7d987", opacity: 0.45, display: "flex" }}>✦</span>
        <span style={{ position: "absolute", bottom: 260, right: 100, fontSize: 18, color: "#f7d987", opacity: 0.38, display: "flex" }}>✦</span>

        {/* Brand header */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 120,
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: 26,
              letterSpacing: 10,
              color: "rgba(247,217,135,0.80)",
              fontWeight: 600,
              margin: 0,
            }}
          >
            UNIVERSE WHISPER
          </p>
          <p
            style={{
              fontSize: 44,
              fontWeight: 700,
              letterSpacing: 10,
              color: "#f7d987",
              margin: "14px 0 0",
            }}
          >
            我的四核心星座
          </p>
          <p
            style={{
              fontSize: 26,
              letterSpacing: 6,
              color: "rgba(255,247,230,0.60)",
              margin: "10px 0 0",
            }}
          >
            太陽 × 月亮 × 上升 × 金星
          </p>
        </div>

        {/* Sign card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 70,
            width: 860,
            borderRadius: 40,
            border: "1.5px solid rgba(247,217,135,0.30)",
            background: "rgba(255,255,255,0.05)",
            padding: "44px 60px",
            gap: 0,
          }}
        >
          {signRows.map((row, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: i < signRows.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
                padding: "22px 0",
              }}
            >
              <span style={{ fontSize: 30, color: "rgba(255,247,230,0.55)", letterSpacing: 4 }}>
                {row.label}
              </span>
              {row.sign ? (
                <span style={{ fontSize: 36, fontWeight: 700, color: row.color, letterSpacing: 4 }}>
                  {sym(row.sign)}{" "}{row.sign}
                </span>
              ) : (
                <span style={{ fontSize: 28, color: "rgba(255,247,230,0.25)" }}>
                  尚未提供
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Short summary box */}
        {shortSummary && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              background: "linear-gradient(150deg, rgba(255,247,230,0.92), rgba(248,232,216,0.88) 48%, rgba(246,219,226,0.85))",
              borderRadius: 44,
              border: "1.5px solid rgba(202,168,95,0.50)",
              padding: "36px 56px",
              marginTop: 60,
              width: 860,
              textAlign: "center",
              color: "#261936",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, width: "100%" }}>
              <div
                style={{
                  flex: 1,
                  height: 1,
                  background: "linear-gradient(to right, transparent, rgba(189,148,75,0.55))",
                  display: "flex",
                }}
              />
              <span
                style={{
                  background: "#caa85f",
                  color: "white",
                  borderRadius: 24,
                  padding: "6px 24px",
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: 4,
                  display: "flex",
                }}
              >
                宇宙說
              </span>
              <div
                style={{
                  flex: 1,
                  height: 1,
                  background: "linear-gradient(to left, transparent, rgba(189,148,75,0.55))",
                  display: "flex",
                }}
              />
            </div>
            <p
              style={{
                fontSize: 32,
                lineHeight: 1.75,
                letterSpacing: 2,
                color: "#241937",
                margin: 0,
              }}
            >
              {shortSummary}
            </p>
          </div>
        )}

        {/* Spacer – pushes footer to bottom (Satori/Yoga does not support marginTop:"auto") */}
        <div style={{ flex: 1, display: "flex" }} />

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: 80,
            gap: 12,
          }}
        >
          <span style={{ color: "rgba(247,217,135,0.50)", fontSize: 22, display: "flex" }}>✦</span>
          <p style={{ fontSize: 22, color: "rgba(255,247,230,0.38)", letterSpacing: 4, margin: 0 }}>
            {siteUrl}
          </p>
          <span style={{ color: "rgba(247,217,135,0.50)", fontSize: 22, display: "flex" }}>✦</span>
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
