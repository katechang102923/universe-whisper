import { NextResponse } from "next/server";

export const DB_BUSY_MESSAGE = "資料庫暫時忙碌，請稍後再試。";

export function isQuotaError(error: unknown): boolean {
  const value = error as { code?: unknown; message?: unknown; details?: unknown };
  const text = `${String(value.code ?? "")} ${String(value.message ?? "")} ${String(value.details ?? "")}`.toLowerCase();
  return text.includes("resource_exhausted") || text.includes("quota exceeded") || text.includes("quota");
}

export function jsonServerError(error: unknown, fallback = "SERVER_ERROR") {
  if (isQuotaError(error)) {
    return NextResponse.json({ ok: false, error: DB_BUSY_MESSAGE }, { status: 503 });
  }
  return NextResponse.json({ ok: false, error: fallback }, { status: 500 });
}
