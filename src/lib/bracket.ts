// Pure bracket generation — no database access, so it is easy to unit test.
//
// Every generator returns a list of MatchSpecs whose links (winnerTo/loserTo)
// refer to other specs by `key`. `resolveInitialState` then works out byes:
// a slot that can never be filled is "empty", and a match with one empty slot
// is a bye that auto-advances whoever arrives in the other slot.

export type Bracket = "WINNERS" | "LOSERS" | "FINAL" | "GROUP";

export type SlotSource =
  | { type: "entry"; entryId: string | null }
  | { type: "winner"; key: string }
  | { type: "loser"; key: string }
  | { type: "none" }; // filled later by special rules (grand-final reset)

export interface MatchSpec {
  key: string;
  bracket: Bracket;
  round: number;
  position: number;
  code: string;
  raceTo: number;
  groupKey?: string;
  slot1: SlotSource;
  slot2: SlotSource;
  winnerTo?: { key: string; slot: 1 | 2 };
  loserTo?: { key: string; slot: 1 | 2 };
}

export interface ResolvedMatch extends MatchSpec {
  entry1Id: string | null;
  entry2Id: string | null;
  winnerId: string | null;
  isBye: boolean;
  status: "PENDING" | "READY" | "COMPLETED" | "VOID";
}

export interface RaceOptions {
  raceTo: number;
  raceToFinal?: number | null;
}

/** Standard seeding order for a bracket of `size` (power of two): [1, 16, 8, 9, ...]. */
export function seedPositions(size: number): number[] {
  let positions = [1];
  while (positions.length < size) {
    const len = positions.length * 2;
    positions = positions.flatMap((p) => [p, len + 1 - p]);
  }
  return positions;
}

export function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

function link(specs: Map<string, MatchSpec>, from: string, kind: "winner" | "loser", to: string, slot: 1 | 2) {
  const source = specs.get(from)!;
  if (kind === "winner") source.winnerTo = { key: to, slot };
  else source.loserTo = { key: to, slot };
  const target = specs.get(to)!;
  const value: SlotSource = { type: kind, key: from };
  if (slot === 1) target.slot1 = value;
  else target.slot2 = value;
}

/**
 * Winners-bracket skeleton shared by single and double elimination.
 * `entryIds` must already be in seed order (index 0 = top seed).
 */
function buildWinnersBracket(entryIds: string[], race: RaceOptions, finalIsLast: boolean) {
  const size = Math.max(2, nextPowerOfTwo(entryIds.length));
  const rounds = Math.log2(size);
  const specs = new Map<string, MatchSpec>();
  const order = seedPositions(size);

  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r;
    for (let p = 1; p <= count; p++) {
      const key = `W${r}-${p}`;
      specs.set(key, {
        key,
        bracket: "WINNERS",
        round: r,
        position: p,
        code: key,
        raceTo: finalIsLast && r === rounds && race.raceToFinal ? race.raceToFinal : race.raceTo,
        slot1: { type: "none" },
        slot2: { type: "none" },
      });
      if (r === 1) {
        const s1 = order[(p - 1) * 2];
        const s2 = order[(p - 1) * 2 + 1];
        const m = specs.get(key)!;
        m.slot1 = { type: "entry", entryId: entryIds[s1 - 1] ?? null };
        m.slot2 = { type: "entry", entryId: entryIds[s2 - 1] ?? null };
      }
    }
  }
  for (let r = 1; r < rounds; r++) {
    const count = size / 2 ** r;
    for (let p = 1; p <= count; p++) {
      link(specs, `W${r}-${p}`, "winner", `W${r + 1}-${Math.ceil(p / 2)}`, p % 2 === 1 ? 1 : 2);
    }
  }
  return { specs, size, rounds };
}

export function singleElimination(entryIds: string[], race: RaceOptions): MatchSpec[] {
  const { specs } = buildWinnersBracket(entryIds, race, true);
  return [...specs.values()];
}

export function doubleElimination(
  entryIds: string[],
  race: RaceOptions,
  opts: { grandFinalReset: boolean } = { grandFinalReset: true },
): MatchSpec[] {
  const { specs, size, rounds: k } = buildWinnersBracket(entryIds, race, false);
  const lbRounds = 2 * (k - 1);
  const lbCount = (j: number) => size / 2 ** (Math.ceil(j / 2) + 1);

  for (let j = 1; j <= lbRounds; j++) {
    for (let p = 1; p <= lbCount(j); p++) {
      const key = `L${j}-${p}`;
      specs.set(key, {
        key,
        bracket: "LOSERS",
        round: j,
        position: p,
        code: key,
        raceTo: race.raceTo,
        slot1: { type: "none" },
        slot2: { type: "none" },
      });
    }
  }

  for (let j = 1; j <= lbRounds; j++) {
    const count = lbCount(j);
    for (let p = 1; p <= count; p++) {
      const key = `L${j}-${p}`;
      if (j === 1) {
        link(specs, `W1-${2 * p - 1}`, "loser", key, 1);
        link(specs, `W1-${2 * p}`, "loser", key, 2);
      } else if (j % 2 === 0) {
        // Drop-down round: LB survivor vs a loser from the winners bracket.
        // Alternate the drop order so players don't immediately meet again.
        const wbRound = j / 2 + 1;
        const dropPos = (j / 2) % 2 === 1 ? count + 1 - p : p;
        link(specs, `L${j - 1}-${p}`, "winner", key, 1);
        link(specs, `W${wbRound}-${dropPos}`, "loser", key, 2);
      } else {
        link(specs, `L${j - 1}-${2 * p - 1}`, "winner", key, 1);
        link(specs, `L${j - 1}-${2 * p}`, "winner", key, 2);
      }
    }
  }

  const finalRace = race.raceToFinal ?? race.raceTo;
  specs.set("GF1", {
    key: "GF1",
    bracket: "FINAL",
    round: 1,
    position: 1,
    code: "GF1",
    raceTo: finalRace,
    slot1: { type: "none" },
    slot2: { type: "none" },
  });
  link(specs, `W${k}-1`, "winner", "GF1", 1);
  if (lbRounds > 0) link(specs, `L${lbRounds}-1`, "winner", "GF1", 2);
  else link(specs, `W${k}-1`, "loser", "GF1", 2);

  if (opts.grandFinalReset) {
    // Only played if the losers-bracket finalist wins GF1; the engine fills it.
    specs.set("GF2", {
      key: "GF2",
      bracket: "FINAL",
      round: 2,
      position: 1,
      code: "GF2",
      raceTo: finalRace,
      slot1: { type: "none" },
      slot2: { type: "none" },
    });
  }
  return [...specs.values()];
}

/** Circle-method round robin. Returns pairs per round; null = sit-out. */
export function roundRobinPairings<T>(items: T[]): [T, T][][] {
  const list: (T | null)[] = [...items];
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds: [T, T][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [T, T][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a !== null && b !== null) pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    // Keep the first element fixed, rotate the rest.
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

/** Snake-distribute seeded entries into groups: A B C D D C B A ... */
export function distributeIntoGroups(entryIds: string[], groupCount: number): string[][] {
  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  entryIds.forEach((id, i) => {
    const lap = Math.floor(i / groupCount);
    const idx = i % groupCount;
    groups[lap % 2 === 0 ? idx : groupCount - 1 - idx].push(id);
  });
  return groups;
}

export function groupName(index: number): string {
  return String.fromCharCode(65 + index);
}

export function roundRobinGroup(groupKey: string, label: string, entryIds: string[], raceTo: number): MatchSpec[] {
  const specs: MatchSpec[] = [];
  let n = 0;
  roundRobinPairings(entryIds).forEach((pairs, r) => {
    pairs.forEach(([a, b], p) => {
      n++;
      specs.push({
        key: `${groupKey}-${n}`,
        bracket: "GROUP",
        round: r + 1,
        position: p + 1,
        code: `${label}${n}`,
        raceTo,
        groupKey,
        slot1: { type: "entry", entryId: a },
        slot2: { type: "entry", entryId: b },
      });
    });
  });
  return specs;
}

/**
 * Order group qualifiers for a knockout so group-mates are kept apart in round 1:
 * all group winners first, then all runners-up, etc. With standard seeding that
 * pairs A1 v D2, B1 v C2, C1 v B2, D1 v A2.
 */
export function orderQualifiers(standingsByGroup: string[][], perGroup: number): string[] {
  const ordered: string[] = [];
  for (let place = 0; place < perGroup; place++) {
    for (const group of standingsByGroup) {
      if (group[place]) ordered.push(group[place]);
    }
  }
  return ordered;
}

/** Work out byes and initial players by simulating everything that is already decided. */
export function resolveInitialState(specs: MatchSpec[]): ResolvedMatch[] {
  type Slot = { empty: boolean; entryId: string | null };
  const byKey = new Map(specs.map((s) => [s.key, s]));
  const done = new Map<string, ResolvedMatch>();
  const outcome = new Map<string, { winner: Slot; loser: Slot }>();

  const resolveSlot = (src: SlotSource): Slot | undefined => {
    switch (src.type) {
      case "entry":
        return { empty: src.entryId === null, entryId: src.entryId };
      case "none":
        return { empty: false, entryId: null };
      default: {
        const o = outcome.get(src.key);
        if (!o) return undefined; // source not resolved yet
        return src.type === "winner" ? o.winner : o.loser;
      }
    }
  };

  // Specs are not guaranteed to be topologically ordered, so iterate until stable.
  let pending = [...specs];
  while (pending.length) {
    const next: MatchSpec[] = [];
    for (const spec of pending) {
      const s1 = resolveSlot(spec.slot1);
      const s2 = resolveSlot(spec.slot2);
      if (!s1 || !s2) {
        next.push(spec);
        continue;
      }
      const tbd: Slot = { empty: false, entryId: null };
      const empty: Slot = { empty: true, entryId: null };
      let resolved: ResolvedMatch;
      if (s1.empty && s2.empty) {
        resolved = { ...spec, entry1Id: null, entry2Id: null, winnerId: null, isBye: true, status: "VOID" };
        outcome.set(spec.key, { winner: empty, loser: empty });
      } else if (s1.empty || s2.empty) {
        const present = s1.empty ? s2 : s1;
        const winnerId = present.entryId;
        resolved = {
          ...spec,
          entry1Id: s1.entryId,
          entry2Id: s2.entryId,
          winnerId,
          isBye: true,
          status: winnerId ? "COMPLETED" : "PENDING",
        };
        outcome.set(spec.key, { winner: winnerId ? { empty: false, entryId: winnerId } : tbd, loser: empty });
      } else {
        resolved = {
          ...spec,
          entry1Id: s1.entryId,
          entry2Id: s2.entryId,
          winnerId: null,
          isBye: false,
          status: s1.entryId && s2.entryId ? "READY" : "PENDING",
        };
        outcome.set(spec.key, { winner: tbd, loser: tbd });
      }
      done.set(spec.key, resolved);
    }
    if (next.length === pending.length) {
      throw new Error(`Bracket has unresolvable links: ${next.map((s) => s.key).join(", ")}`);
    }
    pending = next;
  }
  return specs.map((s) => done.get(s.key)!).filter((m) => byKey.has(m.key));
}

/** Human-readable round name for an elimination round. */
export function roundLabel(
  bracket: string,
  round: number,
  totalRounds: number,
  opts: { doubleElim?: boolean } = {},
): string {
  if (bracket === "FINAL") return round === 1 ? "Grand Final" : "Grand Final (reset)";
  if (bracket === "LOSERS") return totalRounds === round ? "Losers Final" : `Losers Round ${round}`;
  if (bracket === "GROUP") return `Round ${round}`;
  const fromEnd = totalRounds - round;
  // In double elimination the last winners-bracket match isn't the final: the grand final is.
  if (fromEnd === 0) return opts.doubleElim ? "Winners Final" : "Final";
  if (fromEnd === 1) return "Semi Finals";
  if (fromEnd === 2) return "Quarter Finals";
  if (fromEnd === 3) return "Last 16";
  return `Round of ${2 ** (fromEnd + 1)}`;
}
