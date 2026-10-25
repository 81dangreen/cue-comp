// Derived data for rendering a fully loaded tournament (no extra queries).
import { computeStandings } from "./standings";
import { eliminationPlacings } from "./results";
import { roundLabel } from "./bracket";
import type { MatchWithTable, TournamentFull } from "./queries";

export function groupsWithStandings(t: TournamentFull) {
  return t.groups.map((g) => {
    const entryIds = t.entries.filter((e) => e.groupId === g.id).map((e) => e.id);
    const matches = t.matches.filter((m) => m.groupId === g.id);
    return { group: g, matches, rows: computeStandings(entryIds, matches) };
  });
}

/** entryId → final (or current) placing. */
export function placings(t: TournamentFull): Map<string, number> {
  if (t.format === "ROUND_ROBIN") {
    const [only] = groupsWithStandings(t);
    if (!only) return new Map();
    return new Map(only.rows.map((r, i) => [r.entryId, i + 1]));
  }
  const result = eliminationPlacings(t.matches);
  if (t.format === "GROUPS_KO" && result.size) {
    // Non-qualifiers rank below the knockout field, ordered by group position.
    const groups = groupsWithStandings(t);
    let place = result.size + 1;
    const maxRows = Math.max(0, ...groups.map((g) => g.rows.length));
    for (let pos = 0; pos < maxRows; pos++) {
      const atPos = groups.map((g) => g.rows[pos]?.entryId).filter((id): id is string => !!id && !result.has(id));
      for (const id of atPos) result.set(id, place);
      place += atPos.length;
    }
  }
  return result;
}

export function matchCounts(t: TournamentFull) {
  const real = t.matches.filter((m) => !m.isBye);
  return {
    total: real.length,
    completed: real.filter((m) => m.status === "COMPLETED").length,
    live: real.filter((m) => m.status === "LIVE").length,
    ready: real.filter((m) => m.status === "READY").length,
  };
}

/** Round name with bracket context, e.g. "Semi Finals" or "Winners · Semi Finals" in double elimination. */
function contextLabel(bracket: string, round: number, total: number, doubleElim: boolean) {
  const label = roundLabel(bracket, round, total, { doubleElim });
  return doubleElim && bracket === "WINNERS" && !label.startsWith("Winners") ? `Winners · ${label}` : label;
}

function bracketTotals(matches: MatchWithTable[]) {
  const totals = new Map<string, number>();
  for (const m of matches) totals.set(m.bracket, Math.max(totals.get(m.bracket) ?? 0, m.round));
  return totals;
}

/** matchId → human round name ("Quarter Finals", "Group A", "Losers Round 3"). */
export function matchLabels(matches: MatchWithTable[], groups: { id: string; name: string }[]) {
  const totals = bracketTotals(matches);
  const doubleElim = matches.some((m) => m.bracket === "FINAL");
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  return new Map(
    matches.map((m) => [
      m.id,
      m.bracket === "GROUP"
        ? (m.groupId && groupName.get(m.groupId)) || "Group stage"
        : contextLabel(m.bracket, m.round, totals.get(m.bracket) ?? m.round, doubleElim),
    ]),
  );
}

/** Group matches into titled sections: by group for round robin, by round for brackets. */
export function sectionMatches(matches: MatchWithTable[], groups: { id: string; name: string }[]) {
  const real = matches.filter((m) => !m.isBye);
  const totals = bracketTotals(matches);
  const doubleElim = matches.some((m) => m.bracket === "FINAL");
  const sections: { title: string; matches: MatchWithTable[] }[] = [];
  for (const g of groups) {
    const ms = real.filter((m) => m.groupId === g.id);
    if (ms.length) sections.push({ title: g.name, matches: ms });
  }
  for (const bracket of ["WINNERS", "LOSERS", "FINAL"]) {
    const inBracket = real.filter((m) => m.bracket === bracket);
    const rounds = [...new Set(inBracket.map((m) => m.round))].sort((a, b) => a - b);
    for (const r of rounds) {
      sections.push({
        title: contextLabel(bracket, r, totals.get(bracket) ?? r, doubleElim),
        matches: inBracket.filter((m) => m.round === r),
      });
    }
  }
  return sections;
}
