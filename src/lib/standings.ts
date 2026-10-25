// Round-robin / group table. Pure so it can be shared by pages and the engine.

export interface StandingMatch {
  entry1Id: string | null;
  entry2Id: string | null;
  score1: number;
  score2: number;
  winnerId: string | null;
  status: string;
}

export interface StandingRow {
  entryId: string;
  played: number;
  won: number;
  lost: number;
  framesFor: number;
  framesAgainst: number;
  frameDiff: number;
}

/**
 * Order: matches won, then frame difference, then frames won, then head-to-head
 * (only meaningful between two tied players), then the original seed order.
 */
export function computeStandings(entryIds: string[], matches: StandingMatch[]): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    entryIds.map((id) => [id, { entryId: id, played: 0, won: 0, lost: 0, framesFor: 0, framesAgainst: 0, frameDiff: 0 }]),
  );
  const finished = matches.filter((m) => m.status === "COMPLETED" && m.entry1Id && m.entry2Id);
  for (const m of finished) {
    const a = rows.get(m.entry1Id!);
    const b = rows.get(m.entry2Id!);
    if (!a || !b) continue;
    a.played++;
    b.played++;
    a.framesFor += m.score1;
    a.framesAgainst += m.score2;
    b.framesFor += m.score2;
    b.framesAgainst += m.score1;
    if (m.winnerId === a.entryId) {
      a.won++;
      b.lost++;
    } else if (m.winnerId === b.entryId) {
      b.won++;
      a.lost++;
    }
  }
  for (const r of rows.values()) r.frameDiff = r.framesFor - r.framesAgainst;

  const headToHead = (x: string, y: string) => {
    const m = finished.find(
      (f) => (f.entry1Id === x && f.entry2Id === y) || (f.entry1Id === y && f.entry2Id === x),
    );
    if (!m?.winnerId) return 0;
    return m.winnerId === x ? -1 : 1;
  };
  const seedOrder = new Map(entryIds.map((id, i) => [id, i]));

  return [...rows.values()].sort(
    (x, y) =>
      y.won - x.won ||
      y.frameDiff - x.frameDiff ||
      y.framesFor - x.framesFor ||
      headToHead(x.entryId, y.entryId) ||
      seedOrder.get(x.entryId)! - seedOrder.get(y.entryId)!,
  );
}
