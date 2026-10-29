import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { dishAllowed, nextBreaker } from "./breaks";
import type { Dish } from "./constants";
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
import { completeDraw, completeMatch, EngineError, EngineMatch, reopenMatch } from "./engine-core";
import { computeHandicap, parseStartMatrix, type MatchHandicap } from "./handicap";
import {
  drawLineup,
  frameAt,
  frameOutcome,
  framePlayers,
  isSingles,
  parseLineup,
  singlesQuota,
  type FrameFormat,
  type Lineup,
} from "./match-format";
import { computeStandings, unresolvedTies, type StandingRules } from "./standings";

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
    data: { tableId: null, calledAt: null },
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

/**
 * A frame-list match's rules (pairs comps), or null for a plain race. Knockout matches
 * use the knockout finish and can't be drawn.
 */
export function frameFormat(
  t: { matchFrames: string[]; groupFinish: string; koFinish: string },
  bracket: string,
): FrameFormat | null {
  if (!t.matchFrames.length) return null;
  const knockout = bracket !== "GROUP";
  return { frames: t.matchFrames, finish: knockout ? t.koFinish : t.groupFinish, knockout };
}

/** The handicap this match gets from its tournament settings and the two entries' ranks. */
async function handicapFor(
  tx: Tx | typeof db,
  m: { tournamentId: string; raceTo: number; entry1Id: string | null; entry2Id: string | null },
): Promise<MatchHandicap> {
  const t = await tx.tournament.findUniqueOrThrow({
    where: { id: m.tournamentId },
    select: { handicapStyle: true, handicapStarts: true, handicapMatrix: true },
  });
  const entries = t.handicapStyle
    ? await tx.entry.findMany({ where: { id: { in: [m.entry1Id, m.entry2Id].filter((x): x is string => !!x) } } })
    : [];
  const rank = (id: string | null) => entries.find((e) => e.id === id)?.rank;
  return computeHandicap({
    style: t.handicapStyle,
    starts: t.handicapStarts,
    matrix: parseStartMatrix(t.handicapMatrix),
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

/**
 * Copy each entry's current rank in the tournament's discipline, unless the organiser already set one.
 * Pairs have no directory rank: the organiser gives each pair its handicap group.
 */
async function freezeRanks(tx: Tx, tournamentId: string, discipline: string) {
  const entries = await tx.entry.findMany({
    where: { tournamentId, rank: null, partnerId: null },
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
      include: {
        entries: { where: { status: "CONFIRMED" } },
        venue: { include: { tables: { orderBy: { sortOrder: "asc" } } } },
      },
    });
    const started = await tx.match.count({
      where: { tournamentId, isBye: false, OR: [{ status: "LIVE" }, { status: "COMPLETED" }] },
    });
    if (started > 0) throw new ServiceError("Matches have already been played — reset the draw first");
    const word = t.entryType === "PAIRS" ? "pairs" : "players";
    if (t.entries.length < 2) throw new ServiceError(`At least 2 confirmed ${word} are needed`);

    await tx.match.deleteMany({ where: { tournamentId } });
    await tx.entry.updateMany({ where: { tournamentId }, data: { groupId: null, tiebreak: null } });
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
        throw new ServiceError(`Need at least ${groupCount * 2} ${word} for ${groupCount} groups`);
      }
      const tables = t.venue?.tables ?? [];
      if (t.tablePerGroup && tables.length < groupCount) {
        throw new ServiceError(`Each group needs its own table: ${groupCount} groups but ${tables.length} tables at the venue`);
      }
      const buckets = distributeIntoGroups(order, groupCount);
      const groupIds = new Map<string, string>();
      const specs: MatchSpec[] = [];
      for (let i = 0; i < buckets.length; i++) {
        const name = groupCount === 1 ? "Table" : `Group ${groupName(i)}`;
        const tableId = t.tablePerGroup ? tables[i].id : null;
        const group = await tx.group.create({ data: { tournamentId, name, index: i, tableId } });
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
    await tx.entry.updateMany({ where: { tournamentId }, data: { groupId: null, finalRank: null, tiebreak: null } });
    await tx.group.deleteMany({ where: { tournamentId } });
    await tx.tournament.update({ where: { id: tournamentId }, data: { status: "DRAFT" } });
  });
  publish(tournamentId, previousTables);
}

/** A tournament's group-table rules, with shootout results from its entries. */
export function standingRules(
  t: { pointsWin: number; pointsDraw: number; pointsLoss: number; tiebreakers: string[] },
  entries: { id: string; tiebreak: number | null }[],
): StandingRules {
  return {
    win: t.pointsWin,
    draw: t.pointsDraw,
    loss: t.pointsLoss,
    tiebreakers: t.tiebreakers,
    shootout: new Map(entries.map((e) => [e.id, e.tiebreak])),
  };
}

export async function groupStandings(tx: Tx | typeof db, tournamentId: string) {
  const t = await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
  const groups = await tx.group.findMany({
    where: { tournamentId },
    orderBy: { index: "asc" },
    include: { entries: true, matches: true },
  });
  return groups.map((g) => {
    // Seed order inside the group isn't stored, so fall back to entry creation order.
    const entryIds = g.entries.sort((a, b) => +a.createdAt - +b.createdAt).map((e) => e.id);
    return { group: g, rows: computeStandings(entryIds, g.matches, standingRules(t, g.entries)) };
  });
}

/** Record the shootout order (best first) for entries level in a group table. */
export async function setShootout(tournamentId: string, order: string[]) {
  const entries = await db.entry.findMany({ where: { tournamentId, id: { in: order } } });
  if (entries.length !== order.length || new Set(order).size !== order.length) throw new ServiceError("Choose each tied entry once");
  if (await db.match.count({ where: { tournamentId, bracket: { not: "GROUP" } } })) {
    throw new ServiceError("The knockout stage has already been drawn");
  }
  await db.$transaction(order.map((id, i) => db.entry.update({ where: { id }, data: { tiebreak: i + 1 } })));
  publish(tournamentId);
}

/** Give a group a different table (or none). */
export async function setGroupTable(groupId: string, tableId: string | null) {
  const g = await db.group.update({ where: { id: groupId }, data: { tableId } });
  publish(g.tournamentId);
  await autoPilot(g.tournamentId);
}

/** Groups → knockout: once all group matches are done, seed the qualifiers into a bracket (and a plate). */
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
    if (t.tiebreakers.includes("SHOOTOUT")) {
      const tied = standings.filter((s) => unresolvedTies(s.rows).length).map((s) => s.group.name);
      if (tied.length) throw new ServiceError(`Enter the shootout result for the tie in ${tied.join(", ")} first`);
    }
    const positions = standings.map((s) => s.rows.map((r) => r.entryId));
    const race = { raceTo: t.raceTo, raceToFinal: t.raceToFinal };
    const qualifiers = orderQualifiers(positions, perGroup);
    if (qualifiers.length < 2) throw new ServiceError("Not enough qualifiers for a knockout");
    await createMatches(tx, tournamentId, singleElimination(qualifiers, race));
    // The next finishers in each group play off for the plate.
    const plate = orderQualifiers(positions, t.plateQualifiers ?? 0, perGroup);
    if (plate.length >= 2) await createMatches(tx, tournamentId, singleElimination(plate, race, { plate: true }));
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

/** Finish a match with a winner, or as a draw (winner null). */
async function finishMatch(tx: Tx, m: { id: string; tournamentId: string }, winner: 1 | 2 | null) {
  const matches = await loadEngine(tx, m.tournamentId);
  const changed = wrapEngine(() => (winner ? completeMatch(matches, m.id, winner) : completeDraw(matches, m.id)));
  await persist(tx, matches, changed);
  await refreshTournamentStatus(tx, m.tournamentId);
}

type MatchRow = Prisma.MatchGetPayload<object>;

/** A frame-list match's rules and the two pairs' players, or null for a plain race. */
async function frameContext(tx: Tx, m: MatchRow) {
  const t = await tx.tournament.findUniqueOrThrow({ where: { id: m.tournamentId } });
  const fmt = frameFormat(t, m.bracket);
  if (!fmt) return null;
  const entries = await tx.entry.findMany({ where: { id: { in: [m.entry1Id!, m.entry2Id!] } } });
  const members = (id: string | null): [string, string] => {
    const e = entries.find((x) => x.id === id);
    if (!e?.partnerId) throw new ServiceError("Both pairs need two players");
    return [e.playerId, e.partnerId];
  };
  return { fmt, lineupMode: t.lineupMode, side1: members(m.entry1Id), side2: members(m.entry2Id) };
}
type FrameContext = NonNullable<Awaited<ReturnType<typeof frameContext>>>;

/** The order of play a frame-list match starts with: drawn at random, chosen by the pairs, or picked frame by frame. */
function startingLineup(ctx: FrameContext, chosen: Lineup | null | undefined): Lineup | null {
  if (ctx.lineupMode === "PICK_FRAME") return null;
  if (ctx.lineupMode === "PICK_MATCH") {
    if (!chosen) throw new ServiceError("Choose each pair's Player A and Player B first");
    const valid = (side: { A: string; B: string }, members: [string, string]) =>
      side.A !== side.B && members.includes(side.A) && members.includes(side.B);
    if (!valid(chosen[1], ctx.side1) || !valid(chosen[2], ctx.side2)) throw new ServiceError("Each pair's Player A and B must be its two players");
    return chosen;
  }
  return drawLineup(ctx.side1, ctx.side2);
}

/** Who plays the next frame: from the lineup, or as picked at the table (with each player's singles capped). */
async function nextFramePlayers(
  tx: Tx,
  m: MatchRow,
  ctx: FrameContext,
  lineup: Lineup | null,
  played: number,
  picked?: { player1Id?: string; player2Id?: string },
) {
  const { kind } = frameAt(ctx.fmt, played);
  if (!isSingles(kind)) return { player1Id: null, player2Id: null };
  if (ctx.lineupMode !== "PICK_FRAME") return framePlayers(kind, lineup);

  const p1 = picked?.player1Id;
  const p2 = picked?.player2Id;
  if (!p1 || !p2) throw new ServiceError("Choose who is playing this frame for each pair");
  if (!ctx.side1.includes(p1) || !ctx.side2.includes(p2)) throw new ServiceError("Those players aren't in this match");
  const previous = await tx.frame.findMany({ where: { matchId: m.id }, select: { player1Id: true, player2Id: true } });
  const quota = singlesQuota(ctx.fmt);
  if (previous.filter((f) => f.player1Id === p1).length >= quota || previous.filter((f) => f.player2Id === p2).length >= quota) {
    throw new ServiceError(`Each player plays ${quota} singles frame${quota === 1 ? "" : "s"}: pick their partner`);
  }
  return { player1Id: p1, player2Id: p2 };
}

/**
 * Score one rack/frame for a side. Completes the match when it's decided: a race reached,
 * or for frame-list matches, a majority won or every frame played (possibly a draw).
 * `dish` records a rack won in one visit; `picked` names the singles players when the pairs choose frame by frame.
 */
export async function addFrame(
  matchId: string,
  slot: 1 | 2,
  dish: Dish | null = null,
  picked?: { player1Id?: string; player2Id?: string },
) {
  const match = await db.$transaction(async (tx) => {
    const m = await tx.match.findUniqueOrThrow({ where: { id: matchId }, include: { _count: { select: { frames: true } } } });
    if (m.status !== "READY" && m.status !== "LIVE") throw new ServiceError("This match can't be scored right now");
    if (!m.entry1Id || !m.entry2Id) throw new ServiceError("Both players must be known");
    const ctx = await frameContext(tx, m);
    if (dish) {
      const { breakRule } = await tx.tournament.findUniqueOrThrow({ where: { id: m.tournamentId }, select: { breakRule: true } });
      const previous = await tx.frame.findMany({ where: { matchId }, orderBy: { number: "asc" }, select: { winner: true } });
      if (!dishAllowed(dish, slot, nextBreaker(breakRule, m.breakSlot, previous))) {
        throw new ServiceError(dish === "BREAK" ? "A break & run goes to the player who broke" : "A reverse dish goes to the player who didn't break");
      }
    }

    // Scoring the first rack of a ready match starts it, which fixes its handicap (and order of play).
    const start = m.status === "READY" ? handicapColumns(await handicapFor(tx, m), m.raceTo) : null;
    const { target1, target2 } = matchTargets(start ? { ...start, raceTo: m.raceTo } : m);
    const lineup = ctx ? (start ? startingLineup(ctx, null) : parseLineup(m.lineup)) : null;
    const played = m._count.frames;
    const players = ctx ? await nextFramePlayers(tx, m, ctx, lineup, played, picked) : {};

    await tx.frame.create({
      data: { matchId, number: played + 1, winner: slot, breakAndRun: dish === "BREAK", reverseDish: dish === "REVERSE", ...players },
    });
    const score1 = (start ? start.handicap1 : m.score1) + (slot === 1 ? 1 : 0);
    const score2 = (start ? start.handicap2 : m.score2) + (slot === 2 ? 1 : 0);
    await tx.match.update({
      where: { id: matchId },
      data: {
        ...(start ?? {}),
        ...(start && lineup ? { lineup } : {}),
        score1,
        score2,
        status: "LIVE",
        startedAt: m.startedAt ?? new Date(),
      },
    });

    const outcome = ctx
      ? frameOutcome(ctx.fmt, { score1, score2, played: played + 1, target1, target2 })
      : score1 >= target1 || score2 >= target2
        ? ({ done: true, winner: score1 >= target1 ? 1 : 2 } as const)
        : ({ done: false } as const);
    if (outcome.done) await finishMatch(tx, m, outcome.winner);
    return { ...m, finished: outcome.done };
  });
  publish(match.tournamentId, [match.tableId]);
  if (match.finished) await autoPilot(match.tournamentId);
}

/** Mark a ready match as started, recording who breaks first (and, for frame-list matches, the order of play). */
export async function startMatch(matchId: string, breakSlot?: 1 | 2, chosenLineup?: Lineup | null) {
  const m = await db.$transaction(async (tx) => {
    const m = await tx.match.findUniqueOrThrow({ where: { id: matchId } });
    if (m.status !== "READY") throw new ServiceError("This match isn't ready to start");
    if (!m.entry1Id || !m.entry2Id) throw new ServiceError("Both players must be known");
    const ctx = await frameContext(tx, m);
    const lineup = ctx ? startingLineup(ctx, chosenLineup) : null;
    const start = handicapColumns(await handicapFor(tx, m), m.raceTo);
    await tx.match.update({
      where: { id: matchId },
      data: {
        ...start,
        ...(lineup ? { lineup } : {}),
        score1: start.handicap1,
        score2: start.handicap2,
        status: "LIVE",
        startedAt: new Date(),
        breakSlot,
      },
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

/** Check a directly entered frame-list result is one the format can produce; returns the winner (null = draw). */
function frameResult(fmt: FrameFormat, s: { score1: number; score2: number; handicap1: number; handicap2: number; target1: number; target2: number }) {
  const played = s.score1 - s.handicap1 + (s.score2 - s.handicap2);
  const maxFrames = fmt.frames.length + (fmt.knockout ? 1 : 0);
  const outcome = frameOutcome(fmt, { ...s, played });
  const overshot = fmt.finish !== "ALL" && (s.score1 > s.target1 || s.score2 > s.target2 || (s.score1 >= s.target1 && s.score2 >= s.target2));
  if (!outcome.done || played > maxFrames || overshot) {
    const rule = fmt.finish === "ALL" ? `all ${fmt.frames.length} frames are played` : `first to ${s.target1 === s.target2 ? s.target1 : "their target"}`;
    throw new ServiceError(`That score doesn't finish the match (${rule}${fmt.knockout ? ", with a decider if level" : ""})`);
  }
  return outcome.winner;
}

export const WALKOVER_SCORING = {
  NO_FRAMES: "Win, no frames",
  FULL: "Win by the full score",
} as const;
export type WalkoverScoring = keyof typeof WALKOVER_SCORING;

/** The score a walkover gives the winner when it counts as won in full: every frame when all are played, else the race. */
export function fullScore(m: { raceTo: number; bracket: string }, t: { matchFrames: string[]; groupFinish: string; koFinish: string }) {
  const fmt = frameFormat(t, m.bracket);
  return fmt?.finish === "ALL" ? fmt.frames.length : m.raceTo;
}

/**
 * Organiser gives a match to one side without it being played (a no-show). It counts as a win;
 * frames are either not counted (0-0) or the winner's full score. Replaces any result or frames so far.
 */
export async function setWalkover(matchId: string, winner: 1 | 2, scoring: WalkoverScoring) {
  if (!(scoring in WALKOVER_SCORING)) throw new ServiceError("Choose how the walkover counts");
  const match = await db.$transaction(async (tx) => {
    const m = await tx.match.findUniqueOrThrow({ where: { id: matchId }, include: { tournament: true } });
    if (!m.entry1Id || !m.entry2Id || m.isBye) throw new ServiceError("Both sides must be known");
    const matches = await loadEngine(tx, m.tournamentId);
    if (m.status === "COMPLETED") {
      const changed = wrapEngine(() => reopenMatch(matches, matchId));
      await persist(tx, matches, changed);
    }
    const points = scoring === "FULL" ? fullScore(m, m.tournament) : 0;
    const score1 = winner === 1 ? points : 0;
    const score2 = winner === 2 ? points : 0;
    await tx.frame.deleteMany({ where: { matchId } });
    await tx.match.update({
      where: { id: matchId },
      data: { score1, score2, handicap1: 0, handicap2: 0, target1: null, target2: null, walkover: true, lineup: Prisma.DbNull, status: "LIVE" },
    });
    const fresh = matches.get(matchId)!;
    Object.assign(fresh, { score1, score2, status: "LIVE" });
    const changed = wrapEngine(() => completeMatch(matches, matchId, winner));
    await persist(tx, matches, changed);
    await refreshTournamentStatus(tx, m.tournamentId);
    return m;
  });
  publish(match.tournamentId, [match.tableId]);
  await autoPilot(match.tournamentId);
}

/** Take a walkover back: the match is ready to play again (only while nothing after it has started). */
export async function undoWalkover(matchId: string) {
  const match = await db.$transaction(async (tx) => {
    const m = await tx.match.findUniqueOrThrow({ where: { id: matchId } });
    if (!m.walkover) throw new ServiceError("This match wasn't a walkover");
    const matches = await loadEngine(tx, m.tournamentId);
    if (m.status === "COMPLETED") {
      const changed = wrapEngine(() => reopenMatch(matches, matchId));
      await persist(tx, matches, changed);
    }
    await tx.match.update({
      where: { id: matchId },
      data: { score1: 0, score2: 0, walkover: false, winnerId: null, status: "READY", startedAt: null, completedAt: null, breakSlot: null },
    });
    await refreshTournamentStatus(tx, m.tournamentId);
    return m;
  });
  publish(match.tournamentId, [match.tableId]);
  await autoPilot(match.tournamentId);
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
    if (score1 < h.handicap1 || score2 < h.handicap2) throw new ServiceError("A score can't be below the player's start");
    const ctx = await frameContext(tx, m);
    let winner: 1 | 2 | null;
    if (ctx) {
      winner = frameResult(ctx.fmt, { score1, score2, handicap1: h.handicap1, handicap2: h.handicap2, target1, target2 });
    } else {
      const won1 = score1 === target1 && score2 < target2;
      const won2 = score2 === target2 && score1 < target1;
      if (!won1 && !won2) {
        throw new ServiceError(
          target1 === target2 ? `The winner must reach ${target1}` : `Player 1 needs ${target1} or player 2 needs ${target2} to win`,
        );
      }
      winner = won1 ? 1 : 2;
    }
    const matches = await loadEngine(tx, m.tournamentId);
    if (m.status === "COMPLETED") {
      const changed = wrapEngine(() => reopenMatch(matches, matchId));
      await persist(tx, matches, changed);
    }
    await tx.frame.deleteMany({ where: { matchId } });
    await tx.match.update({
      where: { id: matchId },
      // An entered result replaces any walkover.
      data: { ...(start ?? {}), score1, score2, walkover: false, status: "LIVE", startedAt: m.startedAt ?? new Date() },
    });
    const fresh = matches.get(matchId)!;
    fresh.score1 = score1;
    fresh.score2 = score2;
    fresh.status = "LIVE";
    const changed = wrapEngine(() => (winner ? completeMatch(matches, matchId, winner) : completeDraw(matches, matchId)));
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
  // The call time restarts only when the match moves to a different table.
  const calledAt = !tableId ? null : tableId === m.tableId ? m.calledAt : new Date();
  await db.match.update({ where: { id: matchId }, data: { tableId, calledAt } });
  publish(m.tournamentId, [m.tableId, tableId]);
}

/**
 * Put the next ready matches on any free tables at the tournament's venue. A group with its
 * own table plays only there, in order; once its matches are done the table is free for others.
 */
export async function autoAssignTables(tournamentId: string) {
  const t = await db.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    include: { venue: { include: { tables: { orderBy: { sortOrder: "asc" } } } }, groups: true },
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
  });
  const groupOfTable = new Map(t.groups.filter((g) => g.tableId).map((g) => [g.tableId!, g.id]));
  const hasOwnTable = new Set(groupOfTable.values());
  const used = new Set<string>();
  const assigned: string[] = [];
  for (const table of free) {
    const groupId = groupOfTable.get(table.id);
    const pick =
      (groupId && waiting.find((m) => !used.has(m.id) && m.groupId === groupId)) ||
      waiting.find((m) => !used.has(m.id) && !(m.groupId && hasOwnTable.has(m.groupId)));
    if (!pick) continue;
    used.add(pick.id);
    await db.match.update({ where: { id: pick.id }, data: { tableId: table.id, calledAt: new Date() } });
    assigned.push(table.id);
  }
  publish(tournamentId, assigned);
  return assigned.length;
}
