"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTournament, requireUser } from "@/lib/auth";
import { DISCIPLINES, FORMATS } from "@/lib/constants";
import { HANDICAP_STYLES, parseStartTable, type HandicapStyle } from "@/lib/handicap";
import { publish } from "@/lib/events";
import {
  autoAssignTables,
  generateDraw,
  generateKnockout,
  resetDraw,
} from "@/lib/tournament-service";
import type { ActionResult } from "@/components/forms";
import { formObject, optionalInt, run, slugify } from "./util";

/** Handicap style and start table from the settings form. A style with no starts is treated as level play. */
function handicapSettings(style: HandicapStyle | undefined, fields: Record<string, string>) {
  const starts = style ? parseStartTable((key) => fields[key]) : [];
  return starts.length ? { handicapStyle: style!, handicapStarts: starts } : { handicapStyle: null, handicapStarts: [] };
}

const tournamentSchema = z
  .object({
    name: z.string().min(2, "Tournament name is required").max(100),
    description: z.string().max(4000).optional(),
    discipline: z.enum(Object.keys(DISCIPLINES) as [keyof typeof DISCIPLINES]),
    format: z.enum(Object.keys(FORMATS) as [keyof typeof FORMATS]),
    raceTo: z.coerce.number().int().min(1, "Race must be at least 1").max(50),
    raceToFinal: optionalInt,
    maxEntries: optionalInt,
    entryFee: z.string().max(40).optional(),
    startsAt: z.coerce.date().optional(),
    venueId: z.string().optional(),
    seeding: z.enum(["RANDOM", "MANUAL"]).default("RANDOM"),
    groupCount: z.coerce.number().int().min(1).max(32).optional(),
    qualifiersPerGroup: z.coerce.number().int().min(1).max(8).optional(),
    grandFinalReset: z.string().optional(),
    isPublic: z.string().optional(),
    handicapStyle: z.enum(Object.keys(HANDICAP_STYLES) as [HandicapStyle]).optional(),
  })
  .transform((d) => ({
    ...d,
    grandFinalReset: d.grandFinalReset === "on",
    isPublic: d.isPublic === "on",
  }));

async function checkVenue(organizationId: string, venueId?: string) {
  if (!venueId) return null;
  const venue = await db.venue.findFirst({ where: { id: venueId, organizationId } });
  if (!venue) throw new Error("Venue not found");
  return venue.id;
}

export async function createTournament(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  const fields = formObject(formData);
  const parsed = tournamentSchema.safeParse(fields);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let handicap;
  try {
    handicap = handicapSettings(parsed.data.handicapStyle, fields);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const data = { ...parsed.data, ...handicap };
  const venueId = await checkVenue(user.organizationId, data.venueId);
  const slug = `${slugify(data.name) || "tournament"}-${randomBytes(3).toString("hex")}`;
  const t = await db.tournament.create({
    data: { ...data, venueId, slug, organizationId: user.organizationId },
  });
  redirect(`/admin/tournaments/${t.id}/entries`);
}

export async function updateTournament(tournamentId: string, _prev: ActionResult, formData: FormData) {
  return run(async () => {
    const { user, tournament } = await requireTournament(tournamentId);
    const fields = formObject(formData);
    const parsed = tournamentSchema.parse(fields);
    const data = { ...parsed, ...handicapSettings(parsed.handicapStyle, fields) };
    const hasDraw = (await db.match.count({ where: { tournamentId } })) > 0;
    if (hasDraw && (data.format !== tournament.format || data.raceTo !== tournament.raceTo)) {
      throw new Error("Reset the draw before changing the format or race length");
    }
    const sameHandicap =
      data.handicapStyle === tournament.handicapStyle && data.handicapStarts.join() === tournament.handicapStarts.join();
    if (hasDraw && !sameHandicap) throw new Error("Reset the draw before changing the handicap");
    const venueId = await checkVenue(user.organizationId, data.venueId);
    await db.tournament.update({
      where: { id: tournamentId },
      data: {
        ...data,
        venueId,
        description: data.description ?? null,
        raceToFinal: data.raceToFinal ?? null,
        maxEntries: data.maxEntries ?? null,
        entryFee: data.entryFee ?? null,
        startsAt: data.startsAt ?? null,
        groupCount: data.groupCount ?? null,
        qualifiersPerGroup: data.qualifiersPerGroup ?? null,
      },
    });
    publish(tournamentId);
    return "Saved";
  });
}

export async function deleteTournament(tournamentId: string) {
  await requireTournament(tournamentId, "OWNER");
  await db.tournament.delete({ where: { id: tournamentId } });
  redirect("/admin");
}

export async function setRegistration(tournamentId: string, open: boolean) {
  return run(async () => {
    const { tournament } = await requireTournament(tournamentId);
    if (open && tournament.status === "IN_PROGRESS") throw new Error("The draw has already been made");
    await db.tournament.update({
      where: { id: tournamentId },
      data: {
        registrationOpen: open,
        status: tournament.status === "DRAFT" || tournament.status === "REGISTRATION" ? (open ? "REGISTRATION" : "DRAFT") : tournament.status,
      },
    });
    publish(tournamentId);
  });
}

async function assertDrawNotMade(tournamentId: string) {
  if ((await db.match.count({ where: { tournamentId } })) > 0) {
    throw new Error("The draw has been made — reset it before changing entries");
  }
}

/** Add existing players (checkbox list) and/or a new player typed by name. */
export async function addEntries(tournamentId: string, _prev: ActionResult, formData: FormData) {
  return run(async () => {
    const { user, tournament } = await requireTournament(tournamentId);
    await assertDrawNotMade(tournamentId);
    const ids = formData.getAll("playerId").map(String);
    const newName = String(formData.get("newPlayer") ?? "").trim();
    if (newName) {
      const [firstName, ...rest] = newName.split(/\s+/);
      const p = await db.player.create({
        data: { firstName, lastName: rest.join(" "), organizationId: user.organizationId },
      });
      ids.push(p.id);
    }
    if (!ids.length) throw new Error("Select at least one player");
    const players = await db.player.findMany({
      where: { id: { in: ids }, organizationId: user.organizationId },
      select: { id: true },
    });
    const current = await db.entry.count({ where: { tournamentId, status: { not: "WITHDRAWN" } } });
    if (tournament.maxEntries && current + players.length > tournament.maxEntries) {
      throw new Error(`This tournament is limited to ${tournament.maxEntries} players`);
    }
    for (const p of players) {
      await db.entry.upsert({
        where: { tournamentId_playerId: { tournamentId, playerId: p.id } },
        create: { tournamentId, playerId: p.id, status: "CONFIRMED" },
        update: { status: "CONFIRMED" },
      });
    }
    publish(tournamentId);
    return `Added ${players.length} player${players.length === 1 ? "" : "s"}`;
  });
}

export async function removeEntry(tournamentId: string, entryId: string) {
  return run(async () => {
    await requireTournament(tournamentId);
    await assertDrawNotMade(tournamentId);
    await db.entry.deleteMany({ where: { id: entryId, tournamentId } });
    publish(tournamentId);
  });
}

export async function confirmEntry(tournamentId: string, entryId: string) {
  return run(async () => {
    await requireTournament(tournamentId);
    await assertDrawNotMade(tournamentId);
    await db.entry.updateMany({ where: { id: entryId, tournamentId }, data: { status: "CONFIRMED" } });
    publish(tournamentId);
  });
}

/**
 * Save the entries table: seeds (manual seeding, before the draw) and handicap ranks.
 * Ranks can still be corrected after the draw; they apply to matches that haven't started.
 */
export async function saveEntries(tournamentId: string, _prev: ActionResult, formData: FormData) {
  return run(async () => {
    const { tournament } = await requireTournament(tournamentId);
    const entries = await db.entry.findMany({ where: { tournamentId } });
    const drawMade = (await db.match.count({ where: { tournamentId } })) > 0;

    if (tournament.handicapStyle) {
      for (const e of entries) {
        const raw = String(formData.get(`rank-${e.id}`) ?? "").trim();
        const rank = raw ? Number(raw) : null;
        if (rank !== null && (!Number.isInteger(rank) || rank < 1)) throw new Error("Ranks must be whole numbers from 1");
        await db.entry.update({ where: { id: e.id }, data: { rank } });
      }
    }
    if (tournament.seeding !== "MANUAL" || drawMade) return "Saved";

    const seen = new Set<number>();
    for (const e of entries) {
      const raw = String(formData.get(`seed-${e.id}`) ?? "").trim();
      const seed = raw ? Number(raw) : null;
      if (seed !== null) {
        if (!Number.isInteger(seed) || seed < 1) throw new Error("Seeds must be whole numbers from 1");
        if (seen.has(seed)) throw new Error(`Seed ${seed} is used twice`);
        seen.add(seed);
      }
      await db.entry.update({ where: { id: e.id }, data: { seed } });
    }
    return "Saved";
  });
}

export async function generateDrawAction(tournamentId: string) {
  return run(async () => {
    await requireTournament(tournamentId);
    await generateDraw(tournamentId);
    return "Draw generated";
  });
}

export async function resetDrawAction(tournamentId: string) {
  return run(async () => {
    await requireTournament(tournamentId);
    await resetDraw(tournamentId);
    return "Draw reset";
  });
}

export async function generateKnockoutAction(tournamentId: string) {
  return run(async () => {
    await requireTournament(tournamentId);
    await generateKnockout(tournamentId);
    return "Knockout stage generated";
  });
}

export async function autoAssignTablesAction(tournamentId: string) {
  return run(async () => {
    await requireTournament(tournamentId);
    const n = await autoAssignTables(tournamentId);
    return n ? `Assigned ${n} match${n === 1 ? "" : "es"} to tables` : "No free tables or no ready matches";
  });
}

const registrationSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(60),
  lastName: z.string().min(1, "Last name is required").max(60),
  email: z.email("Enter a valid email"),
  phone: z.string().max(30).optional(),
});

/** Public self-registration. Entries arrive as REGISTERED and the organiser confirms them. */
export async function registerForTournament(slug: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = registrationSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const t = await db.tournament.findUnique({ where: { slug } });
  if (!t || !t.isPublic || !t.registrationOpen) return { error: "Registration is closed" };
  const count = await db.entry.count({ where: { tournamentId: t.id, status: { not: "WITHDRAWN" } } });
  if (t.maxEntries && count >= t.maxEntries) return { error: "This tournament is full" };

  const email = parsed.data.email.toLowerCase();
  const player =
    (await db.player.findFirst({ where: { organizationId: t.organizationId, email } })) ??
    (await db.player.create({ data: { ...parsed.data, email, organizationId: t.organizationId } }));
  const existing = await db.entry.findUnique({
    where: { tournamentId_playerId: { tournamentId: t.id, playerId: player.id } },
  });
  if (existing) return { error: "You're already registered for this tournament" };
  await db.entry.create({ data: { tournamentId: t.id, playerId: player.id, status: "REGISTERED" } });
  publish(t.id);
  return { message: "You're registered! The organiser will confirm your place." };
}

export async function setAutoPilotAction(tournamentId: string, on: boolean) {
  return run(async () => {
    const { tournament } = await requireTournament(tournamentId);
    if (on && !tournament.venueId) throw new Error("Set a venue for this tournament first");
    await db.tournament.update({ where: { id: tournamentId }, data: { autoAssignTables: on } });
    if (!on) return "Auto-pilot off";
    const n = tournament.status === "IN_PROGRESS" ? await autoAssignTables(tournamentId) : 0;
    return n ? `Auto-pilot on: assigned ${n} match${n === 1 ? "" : "es"}` : "Auto-pilot on";
  });
}
