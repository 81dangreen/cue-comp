// Derived data for rendering a fully loaded tournament (no extra queries).
import { computeStandings, unresolvedTies } from "./standings";
import { eliminationPlacings } from "./results";
import { roundLabel } from "./bracket";
import { describeFormat, majority } from "./match-format";
import type { MatchWithTable, TournamentFull } from "./queries";

/** Group tables with the tournament's points and tiebreakers, plus any ties a shootout must settle. */
export function groupsWithStandings(t: TournamentFull) {
  const rules = {
    win: t.pointsWin,
    draw: t.pointsDraw,
    loss: t.pointsLoss,
    tiebreakers: t.tiebreakers,
    shootout: new Map(t.entries.map((e) => [e.id, e.tiebreak])),
  };
  return t.groups.map((g) => {
    const entryIds = t.entries.filter((e) => e.groupId === g.id).map((e) => e.id);
    const matches = t.matches.filter((m) => m.groupId === g.id);
    const rows = computeStandings(entryIds, matches, rules);
    const complete = matches.length > 0 && matches.every((m) => m.status === "COMPLETED" || m.status === "VOID");
    const shootouts = complete && t.tiebreakers.includes("SHOOTOUT") ? unresolvedTies(rows) : [];
    return { group: g, matches, rows, complete, shootouts };
  });
}

/** How a match is won, for card headers: "Race to 5", "First to 6" or "10 frames". */
export function raceText(t: { matchFrames: string[]; groupFinish: string; koFinish: string }) {
  return (m: { raceTo: number; bracket: string }) => {
    if (!t.matchFrames.length) return `Race to ${m.raceTo}`;
    const finish = m.bracket === "GROUP" ? t.groupFinish : t.koFinish;
    return finish === "ALL" ? `${t.matchFrames.length} frames` : `First to ${majority(t.matchFrames.length)}`;
  };
}

/** The tournament's match length for headers and fact lists. */
export function formatSummary(t: TournamentFull) {
  if (!t.matchFrames.length) return t.raceToFinal ? `Race to ${t.raceTo} (final ${t.raceToFinal})` : `Race to ${t.raceTo}`;
  const group = describeFormat(t.matchFrames, t.groupFinish);
  if (t.format === "SINGLE_ELIM" || t.format === "DOUBLE_ELIM") return describeFormat(t.matchFrames, t.koFinish);
  return t.format === "GROUPS_KO" && t.koFinish !== t.groupFinish
    ? `${group}; knockouts ${t.koFinish === "ALL" ? "all played" : `first to ${majority(t.matchFrames.length)}`}`
    : group;
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
    // The plate field ranks next, by how far they got in the plate.
    const plate = eliminationPlacings(t.matches, { plate: true });
    const offset = result.size;
    for (const [id, place] of plate) result.set(id, offset + place);
    // Everyone else ranks below, ordered by group position.
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

/**
 * The order auto-pilot calls ready matches to tables: earliest round first, then bracket
 * (winners before plate, losers and groups), then position. Mirrors `autoAssignTables`.
 */
export function callOrder(a: { round: number; bracket: string; position: number }, b: { round: number; bracket: string; position: number }) {
  return a.round - b.round || (a.bracket < b.bracket ? 1 : a.bracket > b.bracket ? -1 : 0) || a.position - b.position;
}

/**
 * What's coming up, for players watching the public page. Groups with their own table get a
 * running order for that table (what's on now, then each match still to play, in order); every
 * other ready match joins one queue, those already called to a table first.
 */
export function orderOfPlay(t: TournamentFull) {
  const tableOrder = new Map((t.venue?.tables ?? []).map((tb, i) => [tb.id, i]));
  const groups = groupsWithStandings(t).filter((g) => g.group.table && !g.complete);
  const ownTable = new Set(groups.map((g) => g.group.id));
  const tables = groups
    .map(({ group, matches }) => ({
      table: group.table!,
      group,
      matches: [
        ...matches.filter((m) => m.status === "LIVE"),
        ...matches
          .filter((m) => m.status === "READY")
          .sort((a, b) => Number(b.tableId === group.tableId) - Number(a.tableId === group.tableId) || callOrder(a, b)),
      ],
    }))
    .sort((a, b) => (tableOrder.get(a.table.id) ?? 99) - (tableOrder.get(b.table.id) ?? 99));
  const queue = t.matches
    .filter((m) => m.status === "READY" && !(m.groupId && ownTable.has(m.groupId)))
    .sort((a, b) => {
      const ta = a.tableId ? (tableOrder.get(a.tableId) ?? 98) : 99;
      const tb = b.tableId ? (tableOrder.get(b.tableId) ?? 98) : 99;
      return ta - tb || callOrder(a, b);
    });
  return { tables, queue };
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
  for (const bracket of ["WINNERS", "LOSERS", "FINAL", "PLATE"]) {
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
