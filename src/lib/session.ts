import "server-only";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { sealData, unsealData } from "iron-session";

export type SessionData = { userId?: string };

export const SESSION_COOKIE = "cs_session";
const TTL_SECONDS = 60 * 60 * 24 * 30;

function password() {
  const value = process.env.SESSION_PASSWORD;
  if (!value || value.length < 32) throw new Error("SESSION_PASSWORD must be set to at least 32 characters");
  return value;
}

/** Read and verify a sealed cookie; returns {} if it's missing, tampered with or expired. */
export async function readSealedCookie<T extends object>(name: string, ttl: number): Promise<Partial<T>> {
  const cookie = (await cookies()).get(name)?.value;
  if (!cookie) return {};
  // Unsealing checks expiry against the clock, so make it explicitly request-time.
  await connection();
  try {
    return await unsealData<T>(cookie, { password: password(), ttl });
  } catch {
    return {};
  }
}

export async function writeSealedCookie(name: string, data: object, ttl: number) {
  const sealed = await sealData(data, { password: password(), ttl });
  // Secure whenever the site is served over HTTPS (the hosting proxy says so), so a
  // production build on plain-http venue wifi still works.
  const https = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(name, sealed, {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    maxAge: ttl,
  });
}

export async function getSession(): Promise<SessionData> {
  return readSealedCookie<SessionData>(SESSION_COOKIE, TTL_SECONDS);
}

export async function setSession(data: SessionData) {
  await writeSealedCookie(SESSION_COOKIE, data, TTL_SECONDS);
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
