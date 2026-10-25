import "server-only";
import { headers } from "next/headers";

// Fixed-window attempt limiter for login, setup and tablet pairing. In-memory,
// which suits the single-server deployment; move to Redis/Postgres if scaling out.

type Window = { count: number; resetAt: number };
const globalForLimits = globalThis as unknown as { rateLimits?: Map<string, Window> };
const windows = globalForLimits.rateLimits ?? new Map<string, Window>();
globalForLimits.rateLimits = windows;

/** Counts an attempt against `key`; throws once `limit` attempts are used within `windowMs`. */
export function limitAttempts(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (windows.size > 10_000) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  }
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  w.count++;
  if (w.count > limit) {
    const minutes = Math.ceil((w.resetAt - now) / 60_000);
    throw new Error(`Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }
}

/** Best-effort client IP: the first X-Forwarded-For hop set by the hosting proxy. */
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}
