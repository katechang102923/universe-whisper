/**
 * Client-side astrological calculations using astronomy-engine (MIT license).
 * Used only in browser context ("use client" components).
 */

import * as Astronomy from "astronomy-engine";
import type { ZodiacSign } from "./astroProfileTexts";

// ── Ecliptic longitude → Zodiac sign ─────────────────────────────────────────

const ZODIAC_SIGNS: ZodiacSign[] = [
  "牡羊座", "金牛座", "雙子座", "巨蟹座",
  "獅子座", "處女座", "天秤座", "天蠍座",
  "射手座", "摩羯座", "水瓶座", "雙魚座",
];

export function eclipticLonToSign(lon: number): ZodiacSign {
  const norm = ((lon % 360) + 360) % 360;
  return ZODIAC_SIGNS[Math.floor(norm / 30)];
}

// ── Build a UTC Date from local birth date + time string ──────────────────────
// birthDate: "YYYY-MM-DD", birthTime: "HH:MM", tzOffsetHours: +8 for Taipei

function birthToUtc(birthDate: string, birthTime: string, tzOffsetHours: number): Date {
  const [y, mo, d] = birthDate.split("-").map(Number);
  const [h, min] = birthTime.split(":").map(Number);
  // local datetime → UTC
  const utcMs = Date.UTC(y, mo - 1, d, h - tzOffsetHours, min, 0);
  return new Date(utcMs);
}

// ── Moon sign ─────────────────────────────────────────────────────────────────

export function calcMoonSign(birthDate: string, birthTime: string): ZodiacSign {
  // Taiwan is UTC+8
  const utc = birthToUtc(birthDate, birthTime, 8);
  const mLon = Astronomy.EclipticLongitude(Astronomy.Body.Moon, utc);
  return eclipticLonToSign(mLon);
}

// ── Venus sign ────────────────────────────────────────────────────────────────

export function calcVenusSign(birthDate: string, birthTime: string): ZodiacSign {
  // Taiwan is UTC+8
  const utc = birthToUtc(birthDate, birthTime, 8);
  const vLon = Astronomy.EclipticLongitude(Astronomy.Body.Venus, utc);
  return eclipticLonToSign(vLon);
}

// ── Rising sign (Ascendant) ───────────────────────────────────────────────────

/** 上升點黃道經度（0–360）。從 calcRisingSign 抽出，供完整星盤共用。*/
export function calcAscendantLongitude(
  birthDate: string,
  birthTime: string,
  latitude: number,
  longitude: number,
): number {
  const utc = birthToUtc(birthDate, birthTime, 8);

  // Greenwich Apparent Sidereal Time (hours)
  const gast = Astronomy.SiderealTime(utc);

  // Local Apparent Sidereal Time → RAMC in degrees
  const ramc = ((gast * 15 + longitude) % 360 + 360) % 360;

  // Obliquity of ecliptic (degrees) — mean obliquity approximation
  const julianDate = utc.getTime() / 86400000 + 2440587.5;
  const T = (julianDate - 2451545.0) / 36525;
  const obliqDeg = 23.4393 - 0.013004 * T;

  const ramc_r = (ramc * Math.PI) / 180;
  const lat_r = (latitude * Math.PI) / 180;
  const eps_r = (obliqDeg * Math.PI) / 180;

  // Standard ascendant formula
  const y = -Math.cos(ramc_r);
  const x = Math.sin(ramc_r) * Math.cos(eps_r) + Math.tan(lat_r) * Math.sin(eps_r);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function calcRisingSign(
  birthDate: string,
  birthTime: string,
  latitude: number,
  longitude: number,
): ZodiacSign {
  return eclipticLonToSign(calcAscendantLongitude(birthDate, birthTime, latitude, longitude));
}

// ── 完整本命盤（付費版）─────────────────────────────────────────────────────────
// 使用既有 astronomy-engine，不新增套件。先做 Whole Sign 宮位（上升星座=第一宮）。

export type PlanetKey =
  | "sun" | "moon" | "mercury" | "venus" | "mars"
  | "jupiter" | "saturn" | "uranus" | "neptune" | "pluto" | "rising";

export interface PlanetPosition {
  key: PlanetKey;
  label: string;
  sign: ZodiacSign;
  degree: number;        // 0–29：落在該星座內的度數（非黃道總經度）
  degreeText: string;    // 例如 "金牛座24°"
  house: number | null;  // Whole Sign 第幾宮（1–12）；無法判定時為 null
  houseText: string | null; // 例如 "第五宮"；無法判定時為 null
}

const HOUSE_CN = [
  "第一宮", "第二宮", "第三宮", "第四宮", "第五宮", "第六宮",
  "第七宮", "第八宮", "第九宮", "第十宮", "第十一宮", "第十二宮",
];

const PLANET_DEFS: { key: PlanetKey; label: string; body: Astronomy.Body }[] = [
  { key: "sun",     label: "太陽",   body: Astronomy.Body.Sun },
  { key: "moon",    label: "月亮",   body: Astronomy.Body.Moon },
  { key: "mercury", label: "水星",   body: Astronomy.Body.Mercury },
  { key: "venus",   label: "金星",   body: Astronomy.Body.Venus },
  { key: "mars",    label: "火星",   body: Astronomy.Body.Mars },
  { key: "jupiter", label: "木星",   body: Astronomy.Body.Jupiter },
  { key: "saturn",  label: "土星",   body: Astronomy.Body.Saturn },
  { key: "uranus",  label: "天王星", body: Astronomy.Body.Uranus },
  { key: "neptune", label: "海王星", body: Astronomy.Body.Neptune },
  { key: "pluto",   label: "冥王星", body: Astronomy.Body.Pluto },
];

function buildPosition(key: PlanetKey, label: string, lon: number, ascSignIndex: number | null): PlanetPosition {
  const norm = ((lon % 360) + 360) % 360;
  const signIdx = Math.floor(norm / 30);
  const sign = ZODIAC_SIGNS[signIdx];
  const degree = Math.floor(norm % 30); // 0–29
  let house: number | null = null;
  let houseText: string | null = null;
  if (ascSignIndex !== null && Number.isInteger(ascSignIndex)) {
    house = ((signIdx - ascSignIndex + 12) % 12) + 1;
    houseText = HOUSE_CN[house - 1];
  }
  return { key, label, sign, degree, degreeText: `${sign}${degree}°`, house, houseText };
}

/**
 * 完整本命盤：十大行星 + 上升，回傳星座 / 度數 / Whole Sign 宮位。
 * 需要出生日期、時間與出生地經緯度（自動模式才有）；計算以台灣 UTC+8 為準。
 * 任一星體計算失敗時跳過該星體，不影響其餘資料。
 */
export function calcFullChart(
  birthDate: string,
  birthTime: string,
  latitude: number,
  longitude: number,
): PlanetPosition[] {
  const utc = birthToUtc(birthDate, birthTime, 8);
  const ascLon = calcAscendantLongitude(birthDate, birthTime, latitude, longitude);
  const ascSignIndex = Math.floor((((ascLon % 360) + 360) % 360) / 30);

  const positions: PlanetPosition[] = [];
  for (const d of PLANET_DEFS) {
    try {
      const lon = Astronomy.EclipticLongitude(d.body, utc);
      if (!Number.isFinite(lon)) continue;
      positions.push(buildPosition(d.key, d.label, lon, ascSignIndex));
    } catch {
      // 單一星體失敗不影響整體
    }
  }
  positions.push(buildPosition("rising", "上升", ascLon, ascSignIndex));
  return positions;
}
