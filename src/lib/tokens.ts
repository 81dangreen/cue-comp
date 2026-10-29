import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";

// One-time link tokens (invites, password resets). The link carries the token;
// the database keeps only its hash, so a leaked database can't be turned into links.

export function newToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** This site's address as the browser sees it, for building links to share. */
export async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
