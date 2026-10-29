import "server-only";
import { db } from "./db";
import type { TournamentFull } from "./queries";
import type { TimingsInput } from "./timings";

/** Load a tournament's frames and build the input for the timings calculations. */
export async function loadTimingsInput(t: TournamentFull, now: Date): Promise<TimingsInput> {
  const frames = await db.frame.findMany({
    where: { match: { tournamentId: t.id } },
    select: { matchId: true, number: true, player1Id: true, player2Id: true, createdAt: true },
  });
  const framesOf = Map.groupBy(frames, (f) => f.matchId);
  // Once matches have been sent to tables, plan on the tables this comp is using (a venue may have
  // more than the organiser uses); before that, on all the venue's tables.
  const used = new Set([...t.matches.flatMap((m) => (m.tableId ? [m.tableId] : [])), ...t.groups.flatMap((g) => (g.tableId ? [g.tableId] : []))]);
  const venueTables = (t.venue?.tables ?? []).map((x) => ({ id: x.id, name: x.name }));
  const tables = used.size ? venueTables.filter((x) => used.has(x.id)) : venueTables;
  for (const m of t.matches) if (m.table && !tables.some((x) => x.id === m.table!.id)) tables.push({ id: m.table.id, name: m.table.name });
  return {
    now,
    startsAt: t.startsAt,
    frameMinutes: t.frameMinutes,
    format: t.format,
    raceTo: t.raceTo,
    raceToFinal: t.raceToFinal,
    matchFrames: t.matchFrames,
    groupFinish: t.groupFinish,
    koFinish: t.koFinish,
    qualifiersPerGroup: t.qualifiersPerGroup,
    plateQualifiers: t.plateQualifiers,
    tables,
    groups: t.groups,
    entries: t.entries,
    matches: t.matches.map((m) => ({ ...m, frames: framesOf.get(m.id) ?? [] })),
  };
}
