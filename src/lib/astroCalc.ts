/**
 * Client-side astrological calculations using astronomy-engine (MIT license).
 * Used only in browser context ("use client" components).
 */

import * as Astronomy from "astronomy-engine";
import type { ZodiacSign } from "./astroProfileTexts";

// ── Ecliptic longitude → Zodiac sign ─────────────────────────────────────────

export function eclipticLonToSign(lon: number): ZodiacSign {
  const norm = ((lon % 360) + 360) % 360;
  const idx = Math.floor(norm / 30);
  const signs: ZodiacSign[] = [
    "牡羊座", "金牛座", "雙子座", "巨蟹座",
    "獅子座", "處女座", "天秤座", "天蠍座",
    "射手座", "摩羯座", "水瓶座", "雙魚座",
  ];
  return signs[idx];
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

// ── Venus sign ────────────────────────────────────────────────────────────────

export function calcVenusSign(birthDate: string, birthTime: string): ZodiacSign {
  // Taiwan is UTC+8
  const utc = birthToUtc(birthDate, birthTime, 8);
  const vLon = Astronomy.EclipticLongitude(Astronomy.Body.Venus, utc);
  return eclipticLonToSign(vLon);
}

// ── Rising sign (Ascendant) ───────────────────────────────────────────────────

export function calcRisingSign(
  birthDate: string,
  birthTime: string,
  latitude: number,
  longitude: number,
): ZodiacSign {
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
  const asc = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;

  return eclipticLonToSign(asc);
}
