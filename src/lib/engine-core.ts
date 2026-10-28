// Pure match-progression rules. Works on an in-memory map of a tournament's
// matches and reports which ones changed, so the DB layer only has to persist them.

export type MatchStatus = "PENDING" | "READY" | "LIVE" | "COMPLETED" | "VOID";

export interface EngineMatch {
  id: string;
  bracket: string;
  round: number;
  entry1Id: string | null;
  entry2Id: string | null;
  score1: number;
  score2: number;
  winnerId: string | null;
  status: string;
  isBye: boolean;
  raceTo: number;
  winnerToId: string | null;
  winnerToSlot: number | null;
  loserToId: string | null;
  loserToSlot: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export class EngineError extends Error {}

type Matches = Map<string, EngineMatch>;

function findResetMatch(matches: Matches) {
  for (const m of matches.values()) if (m.bracket === "FINAL" && m.round === 2) return m;
  return undefined;
}

function placeInto(matches: Matches, changed: Set<string>, id: string, slot: number, entryId: string | null) {
  const target = matches.get(id);
  if (!target) throw new EngineError(`Linked match ${id} not found`);
  if (slot === 1) target.entry1Id = entryId;
  else target.entry2Id = entryId;
  changed.add(id);

  if (entryId && target.isBye && target.status === "PENDING") {
    // The other side can never be filled — advance straight through.
    finish(matches, changed, target, entryId);
  } else if (target.status === "PENDING" && target.entry1Id && target.entry2Id) {
    target.status = "READY";
  }
}

function finish(matches: Matches, changed: Set<string>, m: EngineMatch, winnerId: string) {
  const loserId = m.isBye ? null : winnerId === m.entry1Id ? m.entry2Id : m.entry1Id;
  m.winnerId = winnerId;
  m.status = "COMPLETED";
  m.completedAt = new Date();
  changed.add(m.id);

  if (m.winnerToId && m.winnerToSlot) placeInto(matches, changed, m.winnerToId, m.winnerToSlot, winnerId);
  if (m.loserToId && m.loserToSlot && loserId) placeInto(matches, changed, m.loserToId, m.loserToSlot, loserId);

  if (m.bracket === "FINAL" && m.round === 1) {
    const reset = findResetMatch(matches);
    if (reset) {
      if (winnerId === m.entry1Id) {
        // Winners-bracket champion won: no reset needed.
        reset.status = "VOID";
        reset.entry1Id = reset.entry2Id = null;
      } else {
        reset.entry1Id = m.entry1Id;
        reset.entry2Id = m.entry2Id;
        reset.status = "READY";
      }
      changed.add(reset.id);
    }
  }
}

/** Mark a match finished with the given winning slot. */
export function completeMatch(matches: Matches, id: string, winnerSlot: 1 | 2): Set<string> {
  const m = matches.get(id);
  if (!m) throw new EngineError("Match not found");
  if (m.status === "COMPLETED" || m.status === "VOID") throw new EngineError("Match is already finished");
  const winnerId = winnerSlot === 1 ? m.entry1Id : m.entry2Id;
  if (!m.entry1Id || !m.entry2Id || !winnerId) throw new EngineError("Both players must be known");
  const changed = new Set<string>();
  finish(matches, changed, m, winnerId);
  return changed;
}

/** Finish a match level (group stages only: a draw can't feed a bracket). */
export function completeDraw(matches: Matches, id: string): Set<string> {
  const m = matches.get(id);
  if (!m) throw new EngineError("Match not found");
  if (m.status === "COMPLETED" || m.status === "VOID") throw new EngineError("Match is already finished");
  if (m.winnerToId || m.loserToId) throw new EngineError("A knockout match can't end in a draw");
  m.winnerId = null;
  m.status = "COMPLETED";
  m.completedAt = new Date();
  return new Set([id]);
}

function isUntouched(m: EngineMatch) {
  return (m.status === "PENDING" || m.status === "READY") && m.score1 === 0 && m.score2 === 0;
}

/** Can the slot fed by a finished match be cleared without disturbing a played match? */
function downstreamClear(matches: Matches, id: string | null): boolean {
  if (!id) return true;
  const t = matches.get(id);
  if (!t) return true;
  if (isUntouched(t)) return true;
  // An auto-advanced bye is fine as long as what *it* fed is also untouched.
  if (t.isBye && t.status === "COMPLETED") return downstreamClear(matches, t.winnerToId);
  return false;
}

function clearSlot(matches: Matches, changed: Set<string>, id: string, slot: number) {
  const t = matches.get(id)!;
  if (t.isBye && t.status === "COMPLETED") {
    if (t.winnerToId && t.winnerToSlot) clearSlot(matches, changed, t.winnerToId, t.winnerToSlot);
    t.winnerId = null;
    t.completedAt = null;
    t.status = "PENDING";
  }
  if (slot === 1) t.entry1Id = null;
  else t.entry2Id = null;
  if (t.status === "READY") t.status = "PENDING";
  changed.add(id);
}

export function canReopen(matches: Matches, id: string): boolean {
  const m = matches.get(id);
  if (!m || m.status !== "COMPLETED" || m.isBye) return false;
  if (m.bracket === "FINAL" && m.round === 1) {
    const reset = findResetMatch(matches);
    if (reset && reset.status !== "VOID" && !isUntouched(reset)) return false;
  }
  return downstreamClear(matches, m.winnerToId) && downstreamClear(matches, m.loserToId);
}

/** Undo a result so it can be corrected. The match goes back to LIVE with its score kept. */
export function reopenMatch(matches: Matches, id: string): Set<string> {
  if (!canReopen(matches, id)) {
    throw new EngineError("A later match involving these players has already started");
  }
  const m = matches.get(id)!;
  const changed = new Set<string>([id]);
  if (m.winnerToId && m.winnerToSlot) clearSlot(matches, changed, m.winnerToId, m.winnerToSlot);
  if (m.loserToId && m.loserToSlot) clearSlot(matches, changed, m.loserToId, m.loserToSlot);
  if (m.bracket === "FINAL" && m.round === 1) {
    const reset = findResetMatch(matches);
    if (reset) {
      reset.entry1Id = reset.entry2Id = null;
      reset.status = "PENDING";
      changed.add(reset.id);
    }
  }
  m.winnerId = null;
  m.completedAt = null;
  m.status = "LIVE";
  return changed;
}
