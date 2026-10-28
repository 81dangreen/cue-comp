"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireDirectoryAdmin, requireUser } from "@/lib/auth";
import { DISCIPLINES } from "@/lib/constants";
import { describeMatches, DirectoryError, mergePlayers as mergeRecords, sameNamePlayers } from "@/lib/directory";
import type { ActionResult } from "@/components/forms";
import { formObject, run } from "./util";

// The player directory is shared by every organiser. Any organiser can add a missing
// player; editing records, contact details and ranks is for directory admins.

const publicFields = {
  firstName: z.string().min(1, "First name is required").max(60),
  lastName: z.string().min(1, "Last name is required").max(60),
  nickname: z.string().max(40).optional(),
  country: z.string().max(60).optional(),
  homeClub: z.string().max(80).optional(),
};
const newPlayerSchema = z.object(publicFields);
const playerSchema = z.object({
  ...publicFields,
  email: z.email("Enter a valid email").optional(),
  phone: z.string().max(30).optional(),
});

/** Add someone to the directory, refusing a likely duplicate unless the organiser says it's a different person. */
export async function createPlayer(_prev: ActionResult, formData: FormData) {
  return run(async () => {
    const user = await requireUser("ADMIN");
    const fields = formObject(formData);
    const data = newPlayerSchema.parse(fields);
    const matches = await sameNamePlayers(data.firstName, data.lastName);
    if (matches.length && fields.differentPerson !== "on") {
      throw new Error(
        `Already in the directory: ${describeMatches(matches)}. If this is someone else, tick “This is a different person” and add a home club or nickname to tell them apart.`,
      );
    }
    await db.player.create({ data: { ...data, organizationId: user.organizationId } });
    return `Added ${data.firstName} ${data.lastName}`;
  });
}

export async function updatePlayer(playerId: string, _prev: ActionResult, formData: FormData) {
  return run(async () => {
    await requireDirectoryAdmin();
    const data = playerSchema.parse(formObject(formData));
    const { count } = await db.player.updateMany({
      where: { id: playerId },
      data: { nickname: null, email: null, phone: null, country: null, homeClub: null, ...data },
    });
    if (!count) throw new Error("Player not found");
    return "Saved";
  });
}

export async function deletePlayer(playerId: string) {
  await requireDirectoryAdmin();
  const entries = await db.entry.count({ where: { OR: [{ playerId }, { partnerId: playerId }] } });
  if (entries > 0) throw new Error("This player has tournament history and can't be deleted");
  await db.player.deleteMany({ where: { id: playerId } });
  redirect("/admin/players");
}

/** Merge a duplicate record (`sourceId`, from the form) into this player. */
export async function mergePlayer(targetId: string, _prev: ActionResult, formData: FormData) {
  return run(async () => {
    await requireDirectoryAdmin();
    const sourceId = String(formData.get("sourceId") ?? "");
    if (!sourceId) throw new Error("Choose the duplicate to merge");
    try {
      await mergeRecords(sourceId, targetId);
    } catch (e) {
      if (e instanceof DirectoryError) throw new Error(e.message);
      throw e;
    }
    return "Merged: entries, ranks and missing details moved across";
  });
}

/** Paste a list of names, one per line: "First Last" or "Last, First". Names already in the directory are skipped. */
export async function importPlayers(_prev: ActionResult, formData: FormData) {
  return run(async () => {
    const user = await requireDirectoryAdmin();
    const lines = String(formData.get("names") ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) throw new Error("Paste at least one name");
    const players = lines.map((line) => {
      if (line.includes(",")) {
        const [last, first] = line.split(",").map((s) => s.trim());
        return { firstName: first || last, lastName: first ? last : "" };
      }
      const parts = line.split(/\s+/);
      return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
    });
    const skipped: string[] = [];
    let added = 0;
    for (const p of players) {
      if ((await sameNamePlayers(p.firstName, p.lastName)).length) {
        skipped.push(`${p.firstName} ${p.lastName}`.trim());
        continue;
      }
      await db.player.create({ data: { ...p, organizationId: user.organizationId } });
      added++;
    }
    return `Imported ${added} player${added === 1 ? "" : "s"}${skipped.length ? `; skipped ${skipped.length} already in the directory (${skipped.join(", ")})` : ""}`;
  });
}

const MAX_RANK = 999;

/** Validate a rank box: blank clears the rank, otherwise a whole number from 1. */
function parseRank(raw: string | undefined, label: string): number | null {
  const value = raw?.trim();
  if (!value) return null;
  const rank = Number(value);
  if (!Number.isInteger(rank) || rank < 1 || rank > MAX_RANK) throw new Error(`${label}: rank must be a whole number from 1`);
  return rank;
}

async function setRank(playerId: string, discipline: string, rank: number | null) {
  if (rank === null) {
    await db.playerRank.deleteMany({ where: { playerId, discipline } });
  } else {
    await db.playerRank.upsert({
      where: { playerId_discipline: { playerId, discipline } },
      create: { playerId, discipline, rank },
      update: { rank },
    });
  }
}

/** One player's ranks across all disciplines (boxes named "rank-<DISCIPLINE>"). */
export async function savePlayerRanks(playerId: string, _prev: ActionResult, formData: FormData) {
  return run(async () => {
    await requireDirectoryAdmin();
    const player = await db.player.findUnique({ where: { id: playerId } });
    if (!player) throw new Error("Player not found");
    const ranks = Object.entries(DISCIPLINES).map(
      ([key, label]) => [key, parseRank(formData.get(`rank-${key}`)?.toString(), label)] as const,
    );
    for (const [discipline, rank] of ranks) await setRank(playerId, discipline, rank);
    return "Ranks saved";
  });
}

/**
 * Ranks in one discipline for the players shown on the bulk page (boxes named "rank-<playerId>").
 * Only players present in the form are touched, so a filtered page can't clear anyone else.
 */
export async function saveDisciplineRanks(discipline: string, _prev: ActionResult, formData: FormData) {
  return run(async () => {
    await requireDirectoryAdmin();
    if (!(discipline in DISCIPLINES)) throw new Error("Unknown discipline");
    const ids = [...formData.keys()].filter((k) => k.startsWith("rank-")).map((k) => k.slice(5));
    const players = await db.player.findMany({ where: { id: { in: ids } } });
    const ranks = players.map((p) => [p.id, parseRank(formData.get(`rank-${p.id}`)?.toString(), `${p.firstName} ${p.lastName}`)] as const);
    for (const [playerId, rank] of ranks) await setRank(playerId, discipline, rank);
    return `Saved ${ranks.filter(([, r]) => r !== null).length} ranks`;
  });
}
