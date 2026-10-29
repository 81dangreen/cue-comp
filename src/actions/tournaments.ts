"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTournament, requireUser } from "@/lib/auth";
import { DISCIPLINES, FORMATS } from "@/lib/constants";
import { describeMatches, sameNamePlayers } from "@/lib/directory";
import { HANDICAP_STYLES, parseMatrixForm, parseStartTable, type HandicapStyle } from "@/lib/handicap";
import { FINISH_RULES, isFrameKind, LINEUP_MODES, majority, MAX_FRAMES } from "@/lib/match-format";
import { DEFAULT_TIEBREAKERS, TIEBREAKERS } from "@/lib/standings";
import { BREAK_RULES } from "@/lib/breaks";
import { publish } from "@/lib/events";
import {
  autoAssignTables,
  generateDraw,
  generateKnockout,
  resetDraw,
  setGroupTable,
  setShootout,
} from "@/lib/tournament-service";
import type { ActionResult } from "@/components/forms";
import { formObject, optionalInt, run, slugify } from "./util";

/**
 * Handicap style and starts from the settings form: a table per rank gap, or per pairing of ranks.
 * A style with no starts is treated as level play.
 */
function handicapSettings(style: HandicapStyle | undefined, fields: Record<string, string>) {
  const level = { handicapStyle: null, handicapStarts: [] as number[], handicapMatrix: Prisma.DbNull };
  if (!style) return level;
  if (fields.handicapMode === "PAIRS") {
    const matrix = parseMatrixForm(Number(fields.matrixSize), (key) => fields[key]);
    return matrix ? { handicapStyle: style, handicapStarts: [] as number[], handicapMatrix: matrix } : level;
  }
  const starts = parseStartTable((key) => fields[key]);
  return starts.length ? { handicapStyle: style, handicapStarts: starts, handicapMatrix: Prisma.DbNull } : level;
}

/** Match format, group-table rules and plate from the settings form. */
function structureSettings(fields: Record<string, string>, entryType: string) {
  const useFrames = entryType === "PAIRS" && fields.matchFormat === "FRAMES";
  const frames = useFrames ? (fields.matchFrames ?? "").split(",").map((f) => f.trim()).filter(Boolean) : [];
  if (frames.some((f) => !isFrameKind(f))) throw new Error("Unknown frame type in the match format");
  if (useFrames && frames.length < 1) throw new Error("Add at least one frame to the match format");
  if (frames.length > MAX_FRAMES) throw new Error(`A match can have at most ${MAX_FRAMES} frames`);
  // The group-table fields are only on the form for formats with groups; keep the defaults otherwise.
  const tiebreakers = fields.groupRules
    ? [1, 2, 3, 4]
        .map((i) => fields[`tiebreak-${i}`])
        .filter((v): v is keyof typeof TIEBREAKERS => !!v && v in TIEBREAKERS)
        .filter((v, i, all) => all.indexOf(v) === i)
    : DEFAULT_TIEBREAKERS;
  const points = (key: string, fallback: number) => {
    const n = fields[key] === undefined ? fallback : Number(fields[key]);
    if (!Number.isInteger(n) || n < -10 || n > 10) throw new Error("Points must be whole numbers from -10 to 10");
    return n;
  };
  const plate = fields.plateQualifiers ? Number(fields.plateQualifiers) : 0;
  if (!Number.isInteger(plate) || plate < 0 || plate > 8) throw new Error("Plate places must be 0–8");
  const pick = <T extends object>(value: string | undefined, options: T, fallback: keyof T & string) =>
    value && value in options ? value : fallback;
  return {
    matchFrames: frames,
    groupFinish: pick(fields.groupFinish, FINISH_RULES, "FIRST_TO"),
    koFinish: pick(fields.koFinish, FINISH_RULES, "FIRST_TO"),
    lineupMode: pick(fields.lineupMode, LINEUP_MODES, "RANDOM"),
    breakRule: pick(fields.breakRule, BREAK_RULES, "ALTERNATE"),
    pointsWin: points("pointsWin", 2),
    pointsDraw: points("pointsDraw", 1),
    pointsLoss: points("pointsLoss", 0),
    tiebreakers,
    plateQualifiers: plate || null,
    tablePerGroup: fields.tablePerGroup === "on",
    // A frame-list match is won by a majority of its frames.
    ...(frames.length ? { raceTo: majority(frames.length), raceToFinal: undefined } : {}),
  };
}

const tournamentSchema = z
  .object({
    name: z.string().min(2, "Tournament name is required").max(100),
    description: z.string().max(4000).optional(),
    discipline: z.enum(Object.keys(DISCIPLINES) as [keyof typeof DISCIPLINES]),
    format: z.enum(Object.keys(FORMATS) as [keyof typeof FORMATS]),
    entryType: z.enum(["SINGLES", "PAIRS"]).default("SINGLES"),
    raceTo: z.coerce.number().int().min(1, "Race must be at least 1").max(50).default(5),
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
  let settings;
  try {
    settings = { ...handicapSettings(parsed.data.handicapStyle, fields), ...structureSettings(fields, parsed.data.entryType) };
  } catch (e) {
    return { error: (e as Error).message };
  }
  const data = { ...parsed.data, ...settings };
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
    const data = { ...parsed, ...handicapSettings(parsed.handicapStyle, fields), ...structureSettings(fields, parsed.entryType) };
    const hasDraw = (await db.match.count({ where: { tournamentId } })) > 0;
    if (data.entryType !== tournament.entryType && (await db.entry.count({ where: { tournamentId } }))) {
      throw new Error("Remove the entries before switching between singles and pairs");
    }
    const sameFormat =
      data.format === tournament.format &&
      data.raceTo === tournament.raceTo &&
      data.matchFrames.join() === tournament.matchFrames.join() &&
      data.groupFinish === tournament.groupFinish &&
      data.koFinish === tournament.koFinish &&
      data.lineupMode === tournament.lineupMode;
    if (hasDraw && !sameFormat) throw new Error("Reset the draw before changing the format or match length");
    const matrixJson = (m: unknown) => JSON.stringify(m === Prisma.DbNull ? null : (m ?? null));
    const sameHandicap =
      data.handicapStyle === tournament.handicapStyle &&
      data.handicapStarts.join() === tournament.handicapStarts.join() &&
      matrixJson(data.handicapMatrix) === matrixJson(tournament.handicapMatrix);
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
    if (open && tournament.entryType === "PAIRS") throw new Error("Pairs are entered by the organiser, so online registration isn't available");
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

/** Add players picked from the directory and/or new players typed by name. */
export async function addEntries(tournamentId: string, _prev: ActionResult, formData: FormData) {
  return run(async () => {
    const { user, tournament } = await requireTournament(tournamentId);
    await assertDrawNotMade(tournamentId);
    if (tournament.entryType === "PAIRS") throw new Error("This is a pairs comp: add pairs instead");
    const ids = [...new Set(formData.getAll("playerId").map(String).filter(Boolean))];
    // Check every new name before creating any, so a refused name leaves nothing behind.
    const newPlayers: { firstName: string; lastName: string }[] = [];
    for (const raw of new Set(formData.getAll("newPlayer").map((v) => String(v).trim().replace(/\s+/g, " ")).filter(Boolean))) {
      const [firstName, ...rest] = raw.split(" ");
      const lastName = rest.join(" ");
      if (!lastName) throw new Error(`${raw}: type their first and last name`);
      // Players are shared across organisers, so don't create a second record for someone already listed.
      const matches = await sameNamePlayers(firstName, lastName);
      if (matches.length) {
        throw new Error(`${raw} is already in the player directory (${describeMatches(matches)}). Pick them from the list instead.`);
      }
      newPlayers.push({ firstName, lastName });
    }
    if (!ids.length && !newPlayers.length) throw new Error("Choose at least one player");
    const players = await db.player.findMany({ where: { id: { in: ids } }, select: { id: true } });
    const current = await db.entry.count({ where: { tournamentId, status: { not: "WITHDRAWN" } } });
    const adding = players.length + newPlayers.length;
    if (tournament.maxEntries && current + adding > tournament.maxEntries) {
      throw new Error(`This tournament is limited to ${tournament.maxEntries} players`);
    }
    await db.$transaction(async (tx) => {
      for (const p of newPlayers) {
        players.push({ id: (await tx.player.create({ data: { ...p, organizationId: user.organizationId } })).id });
      }
      for (const p of players) {
        await tx.entry.upsert({
          where: { tournamentId_playerId: { tournamentId, playerId: p.id } },
          create: { tournamentId, playerId: p.id, status: "CONFIRMED" },
          update: { status: "CONFIRMED" },
        });
      }
    });
    publish(tournamentId);
    return `Added ${players.length} player${players.length === 1 ? "" : "s"}`;
  });
}

/**
 * Check one member of a pair without saving anything: an existing directory player, or a new
 * name that isn't already listed. Nothing is created until both members pass.
 */
async function checkPairMember(slot: number, id: string, name: string) {
  if (id) {
    const p = await db.player.findUnique({ where: { id } });
    if (!p) throw new Error("Player not found");
    return { id: p.id, firstName: p.firstName, lastName: p.lastName };
  }
  const [firstName, ...rest] = name.split(/\s+/);
  if (!firstName || !rest.length) throw new Error(`Player ${slot}: choose them from the list, or type a new player's first and last name`);
  const matches = await sameNamePlayers(firstName, rest.join(" "));
  if (matches.length) {
    throw new Error(`Player ${slot}: ${name} is already in the player directory (${describeMatches(matches)}). Pick them from the list instead.`);
  }
  return { id: null, firstName, lastName: rest.join(" ") };
}

/** Pairs comps: enter two players as one entry, optionally with a team name and handicap group. */
export async function addPair(tournamentId: string, _prev: ActionResult, formData: FormData) {
  return run(async () => {
    const { user, tournament } = await requireTournament(tournamentId);
    await assertDrawNotMade(tournamentId);
    if (tournament.entryType !== "PAIRS") throw new Error("This isn't a pairs comp");
    const field = (key: string) => String(formData.get(key) ?? "").trim();
    const rankRaw = field("rank");
    const rank = rankRaw ? Number(rankRaw) : null;
    if (rank !== null && (!Number.isInteger(rank) || rank < 1)) throw new Error("Handicap groups are whole numbers from 1");
    if (!field("player1Id") && !field("newPlayer1")) throw new Error("Choose the first player");
    if (!field("player2Id") && !field("newPlayer2")) throw new Error("Choose the second player");
    if (field("player1Id") && field("player1Id") === field("player2Id")) throw new Error("Choose two different players");
    const current = await db.entry.findMany({ where: { tournamentId, status: { not: "WITHDRAWN" } } });
    if (tournament.maxEntries && current.length >= tournament.maxEntries) {
      throw new Error(`This tournament is limited to ${tournament.maxEntries} pairs`);
    }
    const entered = new Set(current.flatMap((e) => [e.playerId, e.partnerId]));
    for (const id of [field("player1Id"), field("player2Id")]) {
      if (id && entered.has(id)) throw new Error("One of those players is already in a pair in this comp");
    }
    const p1 = await checkPairMember(1, field("player1Id"), field("newPlayer1"));
    const p2 = await checkPairMember(2, field("player2Id"), field("newPlayer2"));
    if (!p1.id && !p2.id && `${p1.firstName} ${p1.lastName}`.toLowerCase() === `${p2.firstName} ${p2.lastName}`.toLowerCase()) {
      throw new Error("Choose two different players");
    }
    // New players are added to the directory only together with the pair, so a refused pair leaves nothing behind.
    await db.$transaction(async (tx) => {
      const save = async (p: typeof p1) =>
        p.id ?? (await tx.player.create({ data: { firstName: p.firstName, lastName: p.lastName, organizationId: user.organizationId } })).id;
      const playerId = await save(p1);
      const partnerId = await save(p2);
      await tx.entry.create({
        data: { tournamentId, playerId, partnerId, teamName: field("teamName") || null, rank, status: "CONFIRMED" },
      });
    });
    publish(tournamentId);
    return `Added ${p1.firstName} ${p1.lastName} & ${p2.firstName} ${p2.lastName}`;
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
      const directoryRanks = new Map(
        (
          await db.playerRank.findMany({
            where: { playerId: { in: entries.map((e) => e.playerId) }, discipline: tournament.discipline },
          })
        ).map((r) => [r.playerId, r.rank]),
      );
      for (const e of entries) {
        const raw = String(formData.get(`rank-${e.id}`) ?? "").trim();
        const rank = raw ? Number(raw) : null;
        if (rank !== null && (!Number.isInteger(rank) || rank < 1)) throw new Error("Ranks must be whole numbers from 1");
        // Before the draw, only a comp-only override is stored; an unchanged rank keeps following the
        // directory (so central re-ranking still applies) until the draw freezes it. Pairs' groups are always set here.
        const override = drawMade || e.partnerId || rank !== directoryRanks.get(e.playerId) ? rank : null;
        await db.entry.update({ where: { id: e.id }, data: { rank: override } });
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

/** Record a shootout between entries level in a group table: `place-<entryId>` = 1st, 2nd, … */
export async function setShootoutAction(tournamentId: string, _prev: ActionResult, formData: FormData) {
  return run(async () => {
    await requireTournament(tournamentId);
    const places = [...formData.entries()]
      .filter(([key]) => key.startsWith("place-"))
      .map(([key, value]) => ({ id: key.slice(6), place: Number(value) }));
    if (places.some((p) => !Number.isInteger(p.place) || p.place < 1)) throw new Error("Give each tied entry a finishing place");
    if (new Set(places.map((p) => p.place)).size !== places.length) throw new Error("Each place can only be used once");
    await setShootout(tournamentId, places.sort((a, b) => a.place - b.place).map((p) => p.id));
    return "Shootout result saved";
  });
}

export async function setGroupTableAction(tournamentId: string, groupId: string, _prev: ActionResult, formData: FormData) {
  return run(async () => {
    const { tournament } = await requireTournament(tournamentId);
    const group = await db.group.findFirst({ where: { id: groupId, tournamentId } });
    if (!group) throw new Error("Group not found");
    const tableId = String(formData.get("tableId") ?? "") || null;
    if (tableId && !(await db.table.findFirst({ where: { id: tableId, venueId: tournament.venueId ?? "" } }))) {
      throw new Error("That table isn't at this tournament's venue");
    }
    await setGroupTable(groupId, tableId);
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
  if (!t || !t.isPublic || !t.registrationOpen || t.entryType === "PAIRS") return { error: "Registration is closed" };
  const count = await db.entry.count({ where: { tournamentId: t.id, status: { not: "WITHDRAWN" } } });
  if (t.maxEntries && count >= t.maxEntries) return { error: "This tournament is full" };

  const email = parsed.data.email.toLowerCase();
  const phone = parsed.data.phone || null;
  // Reuse the person's directory record when their email is already known; otherwise add them.
  const player =
    (await db.player.findFirst({ where: { email: { equals: email, mode: "insensitive" } } })) ??
    (await db.player.create({ data: { ...parsed.data, email, organizationId: t.organizationId } }));
  const existing = await db.entry.findUnique({
    where: { tournamentId_playerId: { tournamentId: t.id, playerId: player.id } },
  });
  if (existing) return { error: "You're already registered for this tournament" };
  // The organiser sees the contact details given for this entry; the directory record's stay with directory admins.
  await db.entry.create({
    data: { tournamentId: t.id, playerId: player.id, status: "REGISTERED", contactEmail: email, contactPhone: phone },
  });
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
