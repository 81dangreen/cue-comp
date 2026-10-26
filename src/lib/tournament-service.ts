import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { publish } from "./events";
import {
  distributeIntoGroups,
  doubleElimination,
  groupName,
  MatchSpec,
  orderQualifiers,
  resolveInitialState,
  roundRobinGroup,
  singleElimination,
} from "./bracket";
import { completeMatch, EngineError, EngineMatch, reopenMatch } from "./engine-core";
import { computeHandicap, type MatchHandicap } from "./handicap";
import { computeStandings } from "./standings";

type Tx = Prisma.TransactionClient;

export class ServiceError extends Error {}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadEngine(tx: Tx, tournamentId: string) {
  const rows = await tx.match.findMany({ where: { tournamentId } });
  return new Map<string, EngineMatch>(rows.map((r) => [r.id, r]));
}

async function persist(tx: Tx, matches: Map<string, EngineMatch>, changed: Iterable<string>) {
  for (const id of changed) {
    const m = matches.get(id)!;
    await tx.match.update({
      where: { id },
      data: {
        entry1Id: m.entry1Id,
        entry2Id: m.entry2Id,
        winnerId: m.winnerId,
        status: m.status,
        completedAt: m.completedAt,
      },
    });
  }
  // A reopened result can send downstream matches back to waiting; they lose their table.
  await tx.match.updateMany({
    where: { id: { in: [...changed] }, status: { in: ["PENDING", "VOID"] }, tableId: { not: null } },
    data: { tableId: null },
  });
}

/** Tables currently holding one of this tournament's matches, so their tablets can be told about changes. */
async function tournamentTableIds(tournamentId: string) {
  const rows = await db.match.findMany({
    where: { tournamentId, tableId: { not: null } },
    select: { tableId: true },
    distinct: ["tableId"],
  });
  return rows.map((r) => r.tableId);
}

/** Race target for each side: the handicap target if one was set when the match started, else the race. */
export function matchTargets(m: { raceTo: number; target1: number | null; target2: number | null }) {
  return { target1: m.target1 ?? m.raceTo, target2: m.target2 ?? m.raceTo };
}

/** The handicap this match gets from its tournament settings and the two entries' ranks. */
async function handicapFor(
  tx: Tx | typeof db,
  m: { tournamentId: string; raceTo: number; entry1Id: string | null; entry2Id: string | null },
): Promise<MatchHandicap> {
  const t = await tx.tournament.findUniqueOrThrow({
    where: { id: m.tournamentId },
    select: { handicapStyle: true, handicapStarts: true },
  });
  const entries = t.handicapStyle
    ? await tx.entry.findMany({ where: { id: { in: [m.entry1Id, m.entry2Id].filter((x): x is string => !!x) } } })
    : [];
  const rank = (id: string | null) => entries.find((e) => e.id === id)?.rank;
  return computeHandicap({
    style: t.handicapStyle,
    starts: t.handicapStarts,
    raceTo: m.raceTo,
    rank1: rank(m.entry1Id),
    rank2: rank(m.entry2Id),
  });
}

/**
 * A match's handicap for display: the one fixed when it started, or for a match that
 * hasn't started yet, the one it will get.
 */
export async function matchHandicap(m: {
  status: string;
  tournamentId: string;
  raceTo: number;
  entry1Id: string | null;
  entry2Id: string | null;
  handicap1: number;
  handicap2: number;
  target1: number | null;
  target2: number | null;
}): Promise<MatchHandicap> {
  if (m.status === "LIVE" || m.status === "COMPLETED") return { handicap1: m.handicap1, handicap2: m.handicap2, ...matchTargets(m) };
  return handicapFor(db, m);
}

/** Columns that fix a handicap onto a match as it starts. */
function handicapColumns(h: MatchHandicap, raceTo: number) {
  return {
    handicap1: h.handicap1,
    handicap2: h.handicap2,
    target1: h.target1 === raceTo ? null : h.target1,
    target2: h.target2 === raceTo ? null : h.target2,
  };
}

/** Auto-pilot: if enabled, fill free tables with the next ready matches. */
async function autoPilot(tournamentId: string) {
  const t = await db.tournament.findUnique({ where: { id: tournamentId }, select: { autoAssignTables: true, status: true, venueId: true } });
  if (t?.autoAssignTables && t.status === "IN_PROGRESS" && t.venueId) await autoAssignTables(tournamentId);
}

async function createMatches(tx: Tx, tournamentId: string, specs: MatchSpec[], groupIds: Map<string, string> = new Map()) {
  const resolved = resolveInitialState(specs);
  const ids = new Map(resolved.map((m) => [m.key, randomUUID()]));
  await tx.match.createMany({
    data: resolved.map((m) => ({
      id: ids.get(m.key)!,
      tournamentId,
      bracket: m.bracket,
      round: m.round,
      position: m.position,
      code: m.code,
      raceTo: m.raceTo,
      groupId: m.groupKey ? groupIds.get(m.groupKey) ?? null : null,
      entry1Id: m.entry1Id,
      entry2Id: m.entry2Id,
      winnerId: m.winnerId,
      isBye: m.isBye,
      status: m.status,
      completedAt: m.status === "COMPLETED" ? new Date() : null,
      winnerToId: m.winnerTo ? ids.get(m.winnerTo.key)! : null,
      winnerToSlot: m.winnerTo?.slot ?? null,
      loserToId: m.loserTo ? ids.get(m.loserTo.key)! : null,
      loserToSlot: m.loserTo?.slot ?? null,
    })),
  });
}

/** Entries in seed order: manual seeds first (ascending), then the rest shuffled. */
function seededEntryIds(entries: { id: string; seed: number | null }[], seeding: string) {
  if (seeding !== "MANUAL") return shuffle(entries).map((e) => e.id);
  const seeded = entries.filter((e) => e.seed != null).sort((a, b) => a.seed! - b.seed!);
  const unseeded = shuffle(entries.filter((e) => e.seed == null));
  return [...seeded, ...unseeded].map((e) => e.id);
}

/** Copy each entry's current rank in the tournament's discipline, unless the organiser already set one. */
async function freezeRanks(tx: Tx, tournamentId: string, discipline: string) {
  const entries = await tx.entry.findMany({
    where: { tournamentId, rank: null },
    include: { player: { include: { ranks: { where: { discipline } } } } },
  });
  for (const e of entries) {
    const rank = e.player.ranks[0]?.rank;
    if (rank) await tx.entry.update({ where: { id: e.id }, data: { rank } });
  }
}

/** Build the draw (bracket or groups). Replaces any existing draw that hasn't started. */
export async function generateDraw(tournamentId: string) {
  const previousTables = await tournamentTableIds(tournamentId);
  await db.$transaction(async (tx) => {
    const t = await tx.tournament.findUniqueOrThrow({
      where: { id: tournamentId },
      include: { entries: { where: { status: "CONFIRMED" } } },
    });
    const started = await tx.match.count({
      where: { tournamentId, isBye: false, OR: [{ status: "LIVE" }, { status: "COMPLETED" }] },
    });
    if (started > 0) throw new ServiceError("Matches have already been played — reset the draw first");
    if (t.entries.length < 2) throw new ServiceError("At least 2 confirmed players are needed");

    await tx.match.deleteMany({ where: { tournamentId } });
    await tx.entry.updateMany({ where: { tournamentId }, data: { groupId: null } });
    await freezeRanks(tx, tournamentId, t.discipline);
    await tx.group.deleteMany({ where: { tournamentId } });

    const order = seededEntryIds(t.entries, t.seeding);
    const race = { raceTo: t.raceTo, raceToFinal: t.raceToFinal };

    if (t.format === "SINGLE_ELIM") {
      await createMatches(tx, tournamentId, singleElimination(order, race));
    } else if (t.format === "DOUBLE_ELIM") {
      await createMatches(tx, tournamentId, doubleElimination(order, race, { grandFinalReset: t.grandFinalReset }));
    } else {
      const groupCount = t.format === "ROUND_ROBIN" ? 1 : Math.max(1, t.groupCount ?? 2);
      if (t.format === "GROUPS_KO" && order.length < groupCount * 2) {
        throw new ServiceError(`Need at least ${groupCount * 2} players for ${groupCount} groups`);
      }
      const buckets = distributeIntoGroups(order, groupCount);
      const groupIds = new Map<string, string>();
      const specs: MatchSpec[] = [];
      for (let i = 0; i < buckets.length; i++) {
        const name = groupCount === 1 ? "Table" : `Group ${groupName(i)}`;
        const group = await tx.group.create({ data: { tournamentId, name, index: i } });
        groupIds.set(group.id, group.id);
        await tx.entry.updateMany({ where: { id: { in: buckets[i] } }, data: { groupId: group.id } });
        specs.push(...roundRobinGroup(group.id, groupCount === 1 ? "M" : groupName(i), buckets[i], t.raceTo));
      }
      await createMatches(tx, tournamentId, specs, groupIds);
    }

    await tx.tournament.update({
      where: { id: tournamentId },
      data: { status: "IN_PROGRESS", registrationOpen: false },
    });
  });
  publish(tournamentId, previousTables);
  await autoPilot(tournamentId);
}

/** Delete all matches so the draw can be rebuilt (destructive — results are lost). */
export async function resetDraw(tournamentId: string) {
  const previousTables = await tournamentTableIds(tournamentId);
  await db.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { tournamentId } });
    await tx.entry.updateMany({ where: { tournamentId }, data: { groupId: null, finalRank: null } });
    await tx.group.deleteMany({ where: { tournamentId } });
    await tx.tournament.update({ where: { id: tournamentId }, data: { status: "DRAFT" } });
  });
  publish(tournamentId, previousTables);
}

export async function groupStandings(tx: Tx | typeof db, tournamentId: string) {
  const groups = await tx.group.findMany({
    where: { tournamentId },
    orderBy: { index: "asc" },
    include: { entries: true, matches: true },
  });
  return groups.map((g) => {
    // Seed order inside the group isn't stored, so fall back to entry creation order.
    const entryIds = g.entries.sort((a, b) => +a.createdAt - +b.createdAt).map((e) => e.id);
    return { group: g, rows: computeStandings(entryIds, g.matches) };
  });
}

/** Groups → knockout: once all group matches are done, seed the qualifiers into a bracket. */
export async function generateKnockout(tournamentId: string) {
  await db.$transaction(async (tx) => {
    const t = await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
    if (t.format !== "GROUPS_KO") throw new ServiceError("Not a groups + knockout tournament");
    const unfinished = await tx.match.count({
      where: { tournamentId, bracket: "GROUP", status: { notIn: ["COMPLETED", "VOID"] } },
    });
    if (unfinished > 0) throw new ServiceError(`${unfinished} group matches still to play`);
    const existing = await tx.match.count({ where: { tournamentId, bracket: { not: "GROUP" } } });
    if (existing > 0) throw new ServiceError("Knockout stage already generated");

    const perGroup = Math.max(1, t.qualifiersPerGroup ?? 2);
    const standings = await groupStandings(tx, tournamentId);
    const qualifiers = orderQualifiers(
      standings.map((s) => s.rows.map((r) => r.entryId)),
      perGroup,
    );
    if (qualifiers.length < 2) throw new ServiceError("Not enough qualifiers for a knockout");
    await createMatches(tx, tournamentId, singleElimination(qualifiers, { raceTo: t.raceTo, raceToFinal: t.raceToFinal }));
  });
  publish(tournamentId);
  await autoPilot(tournamentId);
}

async function refreshTournamentStatus(tx: Tx, tournamentId: string) {
  const t = await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
  const matches = await tx.match.findMany({ where: { tournamentId }, select: { status: true, bracket: true } });
  const allDone = matches.length > 0 && matches.every((m) => m.status === "COMPLETED" || m.status === "VOID");
  const awaitingKnockout = t.format === "GROUPS_KO" && !matches.some((m) => m.bracket !== "GROUP");
  const status = allDone && !awaitingKnockout ? "COMPLETED" : "IN_PROGRESS";
  if (status !== t.status) await tx.tournament.update({ where: { id: tournamentId }, data: { status } });
}

function wrapEngine<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof EngineError) throw new ServiceError(e.message);
    throw e;
  }
}

/** Score one rack/frame for a player. Completes the match when they reach the race. */
export async function addFrame(matchId: string, slot: 1 | 2, breakAndRun = false) {
  const match = await db.$transaction(async (tx) => {
    const m = await tx.match.findUniqueOrThrow({ where: { id: matchId }, include: { _count: { select: { frames: true } } } });
    if (m.status !== "READY" && m.status !== "LIVE") throw new ServiceError("This match can't be scored right now");
    if (!m.entry1Id || !m.entry2Id) throw new ServiceError("Both players must be known");

    // Scoring the first rack of a ready match starts it, which fixes its handicap.
    const start = m.status === "READY" ? handicapColumns(await handicapFor(tx, m), m.raceTo) : null;
    const { target1, target2 } = matchTargets(start ? { ...start, raceTo: m.raceTo } : m);

    await tx.frame.create({ data: { matchId, number: m._count.frames + 1, winner: slot, breakAndRun } });
    const score1 = (start ? start.handicap1 : m.score1) + (slot === 1 ? 1 : 0);
    const score2 = (start ? start.handicap2 : m.score2) + (slot === 2 ? 1 : 0);
    await tx.match.update({
      where: { id: matchId },
      data: { ...(start ?? {}), score1, score2, status: "LIVE", startedAt: m.startedAt ?? new Date() },
    });

    const finished = score1 >= target1 || score2 >= target2;
    if (finished) {
      const matches = await loadEngine(tx, m.tournamentId);
      const changed = wrapEngine(() => completeMatch(matches, matchId, score1 >= target1 ? 1 : 2));
      await persist(tx, matches, changed);
      await refreshTournamentStatus(tx, m.tournamentId);
    }
    return { ...m, finished };
  });
  publish(match.tournamentId, [match.tableId]);
  if (match.finished) await autoPilot(match.tournamentId);
}

/** Mark a ready match as started, recording who breaks first. */
export async function startMatch(matchId: string, breakSlot?: 1 | 2) {
  const m = await db.$transaction(async (tx) => {
    const m = await tx.match.findUniqueOrThrow({ where: { id: matchId } });
    if (m.status !== "READY") throw new ServiceError("This match isn't ready to start");
    const start = handicapColumns(await handicapFor(tx, m), m.raceTo);
    await tx.match.update({
      where: { id: matchId },
      data: { ...start, score1: start.handicap1, score2: start.handicap2, status: "LIVE", startedAt: new Date(), breakSlot },
    });
    return m;
  });
  publish(m.tournamentId, [m.tableId]);
}

/** Remove the most recent frame. Reopens the match if that frame had decided it. */
export async function undoFrame(matchId: string) {
  const match = await db.$transaction(async (tx) => {
    const m = await tx.match.findUniqueOrThrow({ where: { id: matchId } });
    const last = await tx.frame.findFirst({ where: { matchId }, orderBy: { number: "desc" } });
    if (!last) throw new ServiceError("No frames to undo");

    if (m.status === "COMPLETED") {
      const matches = await loadEngine(tx, m.tournamentId);
      const changed = wrapEngine(() => reopenMatch(matches, matchId));
      await persist(tx, matches, changed);
    }
    await tx.frame.delete({ where: { id: last.id } });
    await tx.match.update({
      where: { id: matchId },
      data: {
        score1: { decrement: last.winner === 1 ? 1 : 0 },
        score2: { decrement: last.winner === 2 ? 1 : 0 },
        status: "LIVE",
      },
    });
    await refreshTournamentStatus(tx, m.tournamentId);
    return m;
  });
  publish(match.tournamentId, [match.tableId]);
}

/** Organiser enters a final score directly (no frame-by-frame history). */
export async function setResult(matchId: string, score1: number, score2: number) {
  const match = await db.$transaction(async (tx) => {
    const m = await tx.match.findUniqueOrThrow({ where: { id: matchId } });
    if (!m.entry1Id || !m.entry2Id) throw new ServiceError("Both players must be known");
    // A match entered without being played still gets its handicap.
    const start = m.status === "READY" || m.status === "PENDING" ? handicapColumns(await handicapFor(tx, m), m.raceTo) : null;
    const h = start ?? m;
    const { target1, target2 } = matchTargets(start ? { ...start, raceTo: m.raceTo } : m);
    const won1 = score1 === target1 && score2 < target2;
    const won2 = score2 === target2 && score1 < target1;
    if (!won1 && !won2) {
      throw new ServiceError(
        target1 === target2 ? `The winner must reach ${target1}` : `Player 1 needs ${target1} or player 2 needs ${target2} to win`,
      );
    }
    if (score1 < h.handicap1 || score2 < h.handicap2) throw new ServiceError("A score can't be below the player's start");
    const matches = await loadEngine(tx, m.tournamentId);
    if (m.status === "COMPLETED") {
      const changed = wrapEngine(() => reopenMatch(matches, matchId));
      await persist(tx, matches, changed);
    }
    await tx.frame.deleteMany({ where: { matchId } });
    await tx.match.update({
      where: { id: matchId },
      data: { ...(start ?? {}), score1, score2, status: "LIVE", startedAt: m.startedAt ?? new Date() },
    });
    const fresh = matches.get(matchId)!;
    fresh.score1 = score1;
    fresh.score2 = score2;
    fresh.status = "LIVE";
    const changed = wrapEngine(() => completeMatch(matches, matchId, won1 ? 1 : 2));
    await persist(tx, matches, changed);
    await refreshTournamentStatus(tx, m.tournamentId);
    return m;
  });
  publish(match.tournamentId, [match.tableId]);
  await autoPilot(match.tournamentId);
}

export async function assignTable(matchId: string, tableId: string | null) {
  const m = await db.match.findUniqueOrThrow({ where: { id: matchId } });
  if (tableId) {
    const busy = await db.match.findFirst({
      where: { tableId, id: { not: matchId }, status: { in: ["READY", "LIVE"] } },
    });
    if (busy) throw new ServiceError("That table already has a match on it");
  }
  await db.match.update({ where: { id: matchId }, data: { tableId } });
  publish(m.tournamentId, [m.tableId, tableId]);
}

/** Put the next ready matches on any free tables at the tournament's venue. */
export async function autoAssignTables(tournamentId: string) {
  const t = await db.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    include: { venue: { include: { tables: { orderBy: { sortOrder: "asc" } } } } },
  });
  if (!t.venue) throw new ServiceError("Set a venue for this tournament first");
  const busy = await db.match.findMany({
    where: { tableId: { not: null }, status: { in: ["READY", "LIVE"] } },
    select: { tableId: true },
  });
  const busyIds = new Set(busy.map((b) => b.tableId));
  const free = t.venue.tables.filter((table) => !busyIds.has(table.id));
  const waiting = await db.match.findMany({
    where: { tournamentId, status: "READY", tableId: null },
    orderBy: [{ round: "asc" }, { bracket: "desc" }, { position: "asc" }],
    take: free.length,
  });
  for (let i = 0; i < waiting.length; i++) {
    await db.match.update({ where: { id: waiting[i].id }, data: { tableId: free[i].id } });
  }
  publish(tournamentId, free.slice(0, waiting.length).map((f) => f.id));
  return waiting.length;
}
