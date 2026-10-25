"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { DISCIPLINES } from "@/lib/constants";
import type { ActionResult } from "@/components/forms";
import { formObject, run } from "./util";

const playerSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(60),
  lastName: z.string().min(1, "Last name is required").max(60),
  nickname: z.string().max(40).optional(),
  email: z.email("Enter a valid email").optional(),
  phone: z.string().max(30).optional(),
  country: z.string().max(60).optional(),
});

export async function createPlayer(_prev: ActionResult, formData: FormData) {
  return run(async () => {
    const user = await requireUser("ADMIN");
    const data = playerSchema.parse(formObject(formData));
    await db.player.create({ data: { ...data, organizationId: user.organizationId } });
    return `Added ${data.firstName} ${data.lastName}`;
  });
}

export async function updatePlayer(playerId: string, _prev: ActionResult, formData: FormData) {
  return run(async () => {
    const user = await requireUser("ADMIN");
    const data = playerSchema.parse(formObject(formData));
    const { count } = await db.player.updateMany({
      where: { id: playerId, organizationId: user.organizationId },
      data: { nickname: null, email: null, phone: null, country: null, ...data },
    });
    if (!count) throw new Error("Player not found");
    return "Saved";
  });
}

export async function deletePlayer(playerId: string) {
  const user = await requireUser("ADMIN");
  const entries = await db.entry.count({ where: { playerId } });
  if (entries > 0) throw new Error("This player has tournament history and can't be deleted");
  await db.player.deleteMany({ where: { id: playerId, organizationId: user.organizationId } });
  redirect("/admin/players");
}

/** Paste a list of names, one per line: "First Last" or "Last, First". */
export async function importPlayers(_prev: ActionResult, formData: FormData) {
  return run(async () => {
    const user = await requireUser("ADMIN");
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
    await db.player.createMany({
      data: players.map((p) => ({ ...p, organizationId: user.organizationId })),
    });
    return `Imported ${players.length} players`;
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
    const user = await requireUser("ADMIN");
    const player = await db.player.findFirst({ where: { id: playerId, organizationId: user.organizationId } });
    if (!player) throw new Error("Player not found");
    const ranks = Object.entries(DISCIPLINES).map(
      ([key, label]) => [key, parseRank(formData.get(`rank-${key}`)?.toString(), label)] as const,
    );
    for (const [discipline, rank] of ranks) await setRank(playerId, discipline, rank);
    return "Ranks saved";
  });
}

/** Every player's rank in one discipline (boxes named "rank-<playerId>"). */
export async function saveDisciplineRanks(discipline: string, _prev: ActionResult, formData: FormData) {
  return run(async () => {
    const user = await requireUser("ADMIN");
    if (!(discipline in DISCIPLINES)) throw new Error("Unknown discipline");
    const players = await db.player.findMany({ where: { organizationId: user.organizationId } });
    const ranks = players.map((p) => [p.id, parseRank(formData.get(`rank-${p.id}`)?.toString(), `${p.firstName} ${p.lastName}`)] as const);
    for (const [playerId, rank] of ranks) await setRank(playerId, discipline, rank);
    return `Saved ${ranks.filter(([, r]) => r !== null).length} ranks`;
  });
}
