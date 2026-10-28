// Round-robin / group table. Pure so it can be shared by pages and the engine.

export interface StandingMatch {
  entry1Id: string | null;
  entry2Id: string | null;
  score1: number;
  score2: number;
  winnerId: string | null;
  status: string;
  /** Handicap starts are part of the score but weren't won at the table, so they don't count as frames. */
  handicap1?: number;
  handicap2?: number;
}

export interface StandingRow {
  entryId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  framesFor: number;
  framesAgainst: number;
  frameDiff: number;
  /** Other rows this one is still level with after every tiebreaker (placed by seed order for now). */
  tiedWith: string[];
}

export const TIEBREAKERS = {
  FRAME_DIFF: "Frame difference",
  FRAMES_FOR: "Frames won",
  HEAD_TO_HEAD: "Head-to-head result",
  SHOOTOUT: "Shootout (result entered by the organiser)",
} as const;
export type Tiebreaker = keyof typeof TIEBREAKERS;

export const DEFAULT_TIEBREAKERS: Tiebreaker[] = ["FRAME_DIFF", "FRAMES_FOR", "HEAD_TO_HEAD"];

export interface StandingRules {
  win: number;
  draw: number;
  loss: number;
  tiebreakers: string[];
  /** Shootout order among tied entries (lower is better), as entered by the organiser. */
  shootout?: Map<string, number | null>;
}

export const DEFAULT_RULES: StandingRules = { win: 2, draw: 1, loss: 0, tiebreakers: DEFAULT_TIEBREAKERS };

const isDraw = (m: StandingMatch) => m.status === "COMPLETED" && !m.winnerId;

/**
 * Order: points, then the tiebreakers in the order given, then the original seed order.
 * Tiebreakers apply only within a set of rows that are still level, so head-to-head
 * between three tied rows is a mini-table of the matches among them.
 */
export function computeStandings(
  entryIds: string[],
  matches: StandingMatch[],
  rules: StandingRules = DEFAULT_RULES,
): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    entryIds.map((id) => [
      id,
      { entryId: id, played: 0, won: 0, drawn: 0, lost: 0, points: 0, framesFor: 0, framesAgainst: 0, frameDiff: 0, tiedWith: [] },
    ]),
  );
  const finished = matches.filter((m) => m.status === "COMPLETED" && m.entry1Id && m.entry2Id);
  const pointsFor = (m: StandingMatch, id: string) =>
    isDraw(m) ? rules.draw : m.winnerId === id ? rules.win : rules.loss;
  for (const m of finished) {
    const a = rows.get(m.entry1Id!);
    const b = rows.get(m.entry2Id!);
    if (!a || !b) continue;
    a.played++;
    b.played++;
    const won1 = m.score1 - (m.handicap1 ?? 0);
    const won2 = m.score2 - (m.handicap2 ?? 0);
    a.framesFor += won1;
    a.framesAgainst += won2;
    b.framesFor += won2;
    b.framesAgainst += won1;
    if (isDraw(m)) {
      a.drawn++;
      b.drawn++;
    } else if (m.winnerId === a.entryId) {
      a.won++;
      b.lost++;
    } else {
      b.won++;
      a.lost++;
    }
    a.points += pointsFor(m, a.entryId);
    b.points += pointsFor(m, b.entryId);
  }
  for (const r of rows.values()) r.frameDiff = r.framesFor - r.framesAgainst;

  // Each criterion scores the rows of a tied set (higher is better).
  const criteria: Record<string, (ids: string[]) => Map<string, number>> = {
    FRAME_DIFF: (ids) => new Map(ids.map((id) => [id, rows.get(id)!.frameDiff])),
    FRAMES_FOR: (ids) => new Map(ids.map((id) => [id, rows.get(id)!.framesFor])),
    HEAD_TO_HEAD: (ids) => {
      const tied = new Set(ids);
      const score = new Map(ids.map((id) => [id, 0]));
      for (const m of finished) {
        if (!tied.has(m.entry1Id!) || !tied.has(m.entry2Id!)) continue;
        score.set(m.entry1Id!, score.get(m.entry1Id!)! + pointsFor(m, m.entry1Id!));
        score.set(m.entry2Id!, score.get(m.entry2Id!)! + pointsFor(m, m.entry2Id!));
      }
      return score;
    },
    SHOOTOUT: (ids) =>
      new Map(
        ids.map((id) => {
          const order = rules.shootout?.get(id);
          return [id, order == null ? -Infinity : -order];
        }),
      ),
  };
  const order = rules.tiebreakers.filter((c) => c in criteria);
  const seedOrder = new Map(entryIds.map((id, i) => [id, i]));

  /** Split a tied set by the next criterion, recursing into any sets still tied. */
  const rank = (ids: string[], level: number): string[] => {
    if (ids.length === 1) return ids;
    if (level >= order.length) {
      for (const id of ids) rows.get(id)!.tiedWith = ids.filter((other) => other !== id);
      return [...ids].sort((x, y) => seedOrder.get(x)! - seedOrder.get(y)!);
    }
    const score = criteria[order[level]](ids);
    // A shootout only separates rows once every one of them has an order entered.
    if (order[level] === "SHOOTOUT" && ids.some((id) => score.get(id) === -Infinity)) return rank(ids, level + 1);
    return splitBy(ids, (id) => score.get(id)!).flatMap((set) => rank(set, level + 1));
  };
  const byPoints = splitBy([...rows.keys()], (id) => rows.get(id)!.points);
  return byPoints.flatMap((set) => rank(set, 0)).map((id) => rows.get(id)!);
}

/** Group ids by a score, best first. */
function splitBy(ids: string[], score: (id: string) => number): string[][] {
  const sets = new Map<number, string[]>();
  for (const id of ids) {
    const s = score(id);
    sets.set(s, [...(sets.get(s) ?? []), id]);
  }
  return [...sets.entries()].sort((a, b) => b[0] - a[0]).map(([, set]) => set);
}

/** Sets of rows level after every tiebreaker, for "shootout needed" prompts. */
export function unresolvedTies(rows: StandingRow[]): StandingRow[][] {
  const seen = new Set<string>();
  const sets: StandingRow[][] = [];
  for (const r of rows) {
    if (!r.tiedWith.length || seen.has(r.entryId)) continue;
    const set = rows.filter((x) => x.entryId === r.entryId || r.tiedWith.includes(x.entryId));
    for (const x of set) seen.add(x.entryId);
    sets.push(set);
  }
  return sets;
}
