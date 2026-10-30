import "server-only";
import { randomInt } from "node:crypto";
import { cache } from "react";
import { db } from "./db";
import { readSealedCookie, writeSealedCookie } from "./session";

// Table tablets authenticate with their own long-lived cookie rather than a
// user login, and can only score matches assigned to their table.

export const DEVICE_COOKIE = "cs_device";
const DEVICE_TTL_SECONDS = 60 * 60 * 24 * 365;
export const PAIRING_TTL_MS = 10 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I
const LAST_SEEN_THROTTLE_MS = 60 * 1000;

export function newPairingCode() {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

export function normalisePairingCode(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** The paired device for this browser, with its table and venue, or null. */
export const getDevice = cache(async () => {
  const { deviceId } = await readSealedCookie<{ deviceId: string }>(DEVICE_COOKIE, DEVICE_TTL_SECONDS);
  if (!deviceId) return null;
  const device = await db.device.findUnique({
    where: { id: deviceId },
    include: { table: { include: { venue: true } } },
  });
  if (!device) return null;
  const now = Date.now();
  if (!device.lastSeenAt || now - device.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await db.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date(now) } });
  }
  return device;
});

/** Exchange a pairing code for a device cookie. Codes are single use and expire. */
export async function pairDevice(rawCode: string, name?: string) {
  const code = normalisePairingCode(rawCode);
  const table = await db.table.findFirst({
    where: { pairingCode: code, pairingExpiresAt: { gt: new Date() } },
    include: { venue: true },
  });
  if (!table) throw new Error("That code isn't valid. Codes expire after 10 minutes, so ask for a new one.");
  const device = await db.$transaction(async (tx) => {
    await tx.table.update({ where: { id: table.id }, data: { pairingCode: null, pairingExpiresAt: null } });
    return tx.device.create({
      data: {
        organizationId: table.venue.organizationId,
        tableId: table.id,
        name: name?.trim() || `${table.name} tablet`,
        lastSeenAt: new Date(),
      },
    });
  });
  await writeSealedCookie(DEVICE_COOKIE, { deviceId: device.id }, DEVICE_TTL_SECONDS);
  return device;
}

/** Load a match only if it's currently assigned to this device's table. */
export async function requireDeviceMatch(matchId: string) {
  const device = await getDevice();
  if (!device) throw new Error("This tablet isn't paired with a table any more");
  const match = await db.match.findFirst({
    where: { id: matchId, tableId: device.tableId, tournament: { organizationId: device.organizationId } },
  });
  if (!match) throw new Error("This match has been moved off this table");
  return { device, match };
}
