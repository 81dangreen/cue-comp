// Final placings for elimination brackets. Pure.
//
// A player is "eliminated" by the match they lose that sends them nowhere.
// Players eliminated at the same stage share a placing (e.g. joint 3rd for
// both losing semi-finalists); deeper stages rank higher.

export interface ResultMatch {
  bracket: string;
  round: number;
  entry1Id: string | null;
  entry2Id: string | null;
  winnerId: string | null;
  status: string;
  isBye: boolean;
  loserToId: string | null;
}

const depth = (m: ResultMatch) => (m.bracket === "FINAL" ? 1000 + m.round : m.round);

/** Placings within the main knockout (group matches and any plate are left out). */
export function eliminationPlacings(matches: ResultMatch[], opts: { plate?: boolean } = {}): Map<string, number> {
  const ko = matches.filter((m) => (opts.plate ? m.bracket === "PLATE" : m.bracket !== "GROUP" && m.bracket !== "PLATE"));
  const reset = ko.find((m) => m.bracket === "FINAL" && m.round === 2);
  const eliminatedAt = new Map<string, number>();
  const participants = new Set<string>();

  for (const m of ko) {
    if (m.entry1Id) participants.add(m.entry1Id);
    if (m.entry2Id) participants.add(m.entry2Id);
    if (m.status !== "COMPLETED" || m.isBye || !m.winnerId) continue;
    const loser = m.winnerId === m.entry1Id ? m.entry2Id : m.entry1Id;
    if (!loser) continue;
    const goesToReset = m.bracket === "FINAL" && m.round === 1 && reset && reset.status !== "VOID";
    if (!m.loserToId && !goesToReset) eliminatedAt.set(loser, depth(m));
  }

  const placings = new Map<string, number>();
  const stillIn = [...participants].filter((id) => !eliminatedAt.has(id));
  const finished = ko.length > 0 && ko.every((m) => m.status === "COMPLETED" || m.status === "VOID");
  if (finished && stillIn.length === 1) placings.set(stillIn[0], 1);

  // Everyone still in the event ranks above anyone already out.
  const stages = [...new Set(eliminatedAt.values())].sort((a, b) => b - a);
  let place = stillIn.length + 1;
  for (const stage of stages) {
    const group = [...eliminatedAt.entries()].filter(([, d]) => d === stage).map(([id]) => id);
    for (const id of group) placings.set(id, place);
    place += group.length;
  }
  return placings;
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
