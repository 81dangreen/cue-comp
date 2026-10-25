import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/** Whether /setup must be given SETUP_KEY. Always in production, so a fresh public install can't be claimed by a stranger. */
export function setupKeyRequired() {
  return !!process.env.SETUP_KEY || process.env.NODE_ENV === "production";
}

export function checkSetupKey(given: string): string | null {
  const expected = process.env.SETUP_KEY;
  if (!expected) return process.env.NODE_ENV === "production" ? "Setup is locked: set SETUP_KEY on the server first" : null;
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(given), digest(expected)) ? null : "Incorrect setup key";
}
