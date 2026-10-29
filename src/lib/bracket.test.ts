import { describe, expect, it } from "vitest";
import {
  distributeIntoGroups,
  drawToSeedOrder,
  doubleElimination,
  orderQualifiers,
  resolveInitialState,
  roundLabel,
  roundRobinPairings,
  seedPositions,
  singleElimination,
} from "./bracket";
import { canReopen, completeMatch, EngineMatch, reopenMatch } from "./engine-core";

function toEngine(specs: ReturnType<typeof resolveInitialState>) {
  const map = new Map<string, EngineMatch>();
  for (const s of specs) {
    map.set(s.key, {
      id: s.key,
      bracket: s.bracket,
      round: s.round,
      entry1Id: s.entry1Id,
      entry2Id: s.entry2Id,
      score1: 0,
      score2: 0,
      winnerId: s.winnerId,
      status: s.status,
      isBye: s.isBye,
      raceTo: s.raceTo,
      winnerToId: s.winnerTo?.key ?? null,
      winnerToSlot: s.winnerTo?.slot ?? null,
      loserToId: s.loserTo?.key ?? null,
      loserToSlot: s.loserTo?.slot ?? null,
      startedAt: null,
      completedAt: null,
    });
  }
  return map;
}

// Deterministic pseudo-random so failures are reproducible.
function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

function playOut(matches: Map<string, EngineMatch>, rand: () => number, withReopens = false) {
  const losses = new Map<string, number>();
  for (let guard = 0; guard < 10_000; guard++) {
    const ready = [...matches.values()].filter((m) => m.status === "READY");
    if (!ready.length) break;
    const m = ready[Math.floor(rand() * ready.length)];
    const slot = rand() < 0.5 ? 1 : 2;
    completeMatch(matches, m.id, slot);
    // Occasionally undo and replay the other way, as an organiser correcting a result would.
    if (withReopens && rand() < 0.3 && canReopen(matches, m.id)) {
      reopenMatch(matches, m.id);
      completeMatch(matches, m.id, slot === 1 ? 2 : 1);
    }
  }
  for (const m of matches.values()) {
    if (m.status === "COMPLETED" && !m.isBye) {
      const loser = m.winnerId === m.entry1Id ? m.entry2Id! : m.entry1Id!;
      losses.set(loser, (losses.get(loser) ?? 0) + 1);
    }
  }
  return losses;
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe("seedPositions", () => {
  it("produces the standard order", () => {
    expect(seedPositions(4)).toEqual([1, 4, 2, 3]);
    expect(seedPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
});

describe("single elimination", () => {
  it("gives byes to top seeds", () => {
    const resolved = resolveInitialState(singleElimination(ids(5), { raceTo: 3 }));
    const r1 = resolved.filter((m) => m.round === 1);
    expect(r1.filter((m) => m.isBye)).toHaveLength(3);
    expect(r1.find((m) => m.key === "W1-1")!.winnerId).toBe("p1");
  });

  for (let n = 2; n <= 40; n++) {
    it(`plays out with ${n} players`, () => {
      const matches = toEngine(resolveInitialState(singleElimination(ids(n), { raceTo: 3 })));
      const losses = playOut(matches, rng(n), true);
      expect([...matches.values()].every((m) => m.status === "COMPLETED" || m.status === "VOID")).toBe(true);
      const losers = [...losses.keys()];
      expect(losers).toHaveLength(n - 1);
      expect([...losses.values()].every((l) => l === 1)).toBe(true);
    });
  }
});

describe("double elimination", () => {
  for (let n = 2; n <= 40; n++) {
    for (const reset of [true, false]) {
      it(`plays out with ${n} players (reset=${reset})`, () => {
        const specs = doubleElimination(ids(n), { raceTo: 3 }, { grandFinalReset: reset });
        const matches = toEngine(resolveInitialState(specs));
        const losses = playOut(matches, rng(n * 7 + (reset ? 1 : 0)), true);
        const unfinished = [...matches.values()].filter((m) => m.status !== "COMPLETED" && m.status !== "VOID");
        expect(unfinished.map((m) => m.id)).toEqual([]);
        // Everyone is out on two losses except the champion — and, without a reset,
        // the winners-bracket finalist who can lose the single grand final.
        const gf1 = matches.get("GF1")!;
        const champion = matches.get("GF2")?.winnerId ?? gf1.winnerId;
        const gfLoser = gf1.winnerId === gf1.entry1Id ? gf1.entry2Id : gf1.entry1Id;
        for (const id of ids(n)) {
          const l = losses.get(id) ?? 0;
          if (id === champion) expect(l).toBeLessThanOrEqual(1);
          else if (!reset && id === gfLoser) expect(l).toBeGreaterThanOrEqual(1);
          else expect(l).toBe(2);
        }
      });
    }
  }
});

describe("round robin", () => {
  it("everyone plays everyone exactly once", () => {
    for (const n of [3, 4, 5, 8]) {
      const pairs = roundRobinPairings(ids(n)).flat();
      expect(pairs).toHaveLength((n * (n - 1)) / 2);
      const keys = new Set(pairs.map(([a, b]) => [a, b].sort().join("-")));
      expect(keys.size).toBe(pairs.length);
    }
  });

  it("snake-distributes seeds into groups", () => {
    expect(distributeIntoGroups(ids(8), 4)).toEqual([
      ["p1", "p8"],
      ["p2", "p7"],
      ["p3", "p6"],
      ["p4", "p5"],
    ]);
  });

  it("orders qualifiers winners first", () => {
    expect(orderQualifiers([["A1", "A2"], ["B1", "B2"]], 2)).toEqual(["A1", "B1", "A2", "B2"]);
  });
});

describe("plate", () => {
  it("draws the next finishers from each group into a separate bracket", () => {
    const standings = [["A1", "A2", "A3", "A4"], ["B1", "B2", "B3", "B4"], ["C1", "C2", "C3", "C4"], ["D1", "D2", "D3", "D4"]];
    const plate = orderQualifiers(standings, 1, 2);
    expect(plate).toEqual(["A3", "B3", "C3", "D3"]);
    const specs = singleElimination(plate, { raceTo: 6 }, { plate: true });
    expect(specs.every((s) => s.bracket === "PLATE" && s.key.startsWith("P"))).toBe(true);
    expect(specs).toHaveLength(3);
    expect(roundLabel("PLATE", 1, 2)).toBe("Plate Semi Finals");
    expect(roundLabel("PLATE", 2, 2)).toBe("Plate Final");
  });
});

describe("roundLabel", () => {
  it("names knockout rounds by players remaining", () => {
    // 64-player single elimination has 6 rounds.
    expect([1, 2, 3, 4, 5, 6].map((r) => roundLabel("WINNERS", r, 6))).toEqual([
      "Round of 64",
      "Round of 32",
      "Last 16",
      "Quarter Finals",
      "Semi Finals",
      "Final",
    ]);
    expect(roundLabel("WINNERS", 1, 7)).toBe("Round of 128");
  });

  it("calls the last winners round the Winners Final in double elimination", () => {
    expect(roundLabel("WINNERS", 3, 3, { doubleElim: true })).toBe("Winners Final");
    expect(roundLabel("WINNERS", 2, 3, { doubleElim: true })).toBe("Semi Finals");
    expect(roundLabel("FINAL", 1, 2)).toBe("Grand Final");
  });
});

describe("drawToSeedOrder (a draw entered by hand)", () => {
  const firstRound = (draw: string[]) =>
    singleElimination(drawToSeedOrder(draw), { raceTo: 3 })
      .filter((m) => m.round === 1)
      .sort((a, b) => a.position - b.position)
      .map((m) => [m.slot1, m.slot2].map((s) => (s.type === "entry" ? (s.entryId ?? "bye") : "?")).join(" v "));

  it("pairs the draw in order: 1st v 2nd, 3rd v 4th", () => {
    const draw = ["a", "b", "c", "d", "e", "f", "g", "h"];
    expect(firstRound(draw)).toEqual(["a v b", "c v d", "e v f", "g v h"]);
  });

  it("reads top to bottom with byes spread through the bracket", () => {
    const rows = firstRound(["a", "b", "c", "d", "e", "f"]);
    expect(rows.join(", ")).toBe("a v bye, b v c, d v bye, e v f");
  });

  it("works for double elimination too", () => {
    const specs = doubleElimination(drawToSeedOrder(["a", "b", "c", "d"]), { raceTo: 3 });
    const w1 = specs.filter((m) => m.bracket === "WINNERS" && m.round === 1).sort((a, b) => a.position - b.position);
    expect(w1.map((m) => [m.slot1, m.slot2].map((s) => (s.type === "entry" ? s.entryId : "?")).join(" v "))).toEqual(["a v b", "c v d"]);
  });
});
