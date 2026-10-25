import { describe, expect, it } from "vitest";
import { doubleElimination, resolveInitialState, singleElimination } from "./bracket";
import { completeMatch, EngineMatch } from "./engine-core";
import { eliminationPlacings, ordinal } from "./results";

function play(specs: ReturnType<typeof singleElimination>, pickSlot: (m: EngineMatch) => 1 | 2) {
  const matches = new Map<string, EngineMatch>(
    resolveInitialState(specs).map((s) => [
      s.key,
      {
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
        raceTo: 1,
        winnerToId: s.winnerTo?.key ?? null,
        winnerToSlot: s.winnerTo?.slot ?? null,
        loserToId: s.loserTo?.key ?? null,
        loserToSlot: s.loserTo?.slot ?? null,
        startedAt: null,
        completedAt: null,
      },
    ]),
  );
  for (;;) {
    const ready = [...matches.values()].find((m) => m.status === "READY");
    if (!ready) break;
    completeMatch(matches, ready.id, pickSlot(ready));
  }
  return [...matches.values()];
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
// Lower number always wins: p1 should be champion.
const favourite = (m: EngineMatch): 1 | 2 => (Number(m.entry1Id!.slice(1)) < Number(m.entry2Id!.slice(1)) ? 1 : 2);

describe("eliminationPlacings", () => {
  it("ranks a single-elimination bracket", () => {
    const placings = eliminationPlacings(play(singleElimination(ids(8), { raceTo: 1 }), favourite));
    expect(placings.get("p1")).toBe(1);
    expect(placings.get("p2")).toBe(2);
    expect(placings.get("p3")).toBe(3);
    expect(placings.get("p4")).toBe(3);
    expect(placings.get("p8")).toBe(5);
  });

  it("ranks a double-elimination bracket", () => {
    const placings = eliminationPlacings(play(doubleElimination(ids(8), { raceTo: 1 }), favourite));
    expect(placings.get("p1")).toBe(1);
    expect(placings.get("p2")).toBe(2);
    expect(placings.get("p3")).toBe(3);
    expect([...placings.values()].filter((p) => p === 1)).toHaveLength(1);
    expect(placings.size).toBe(8);
  });

  it("ranks eliminated players below those still in mid-event", () => {
    const all = play(singleElimination(ids(8), { raceTo: 1 }), favourite);
    // Pretend only round 1 has been played.
    const partial = all.map((m) => (m.round > 1 ? { ...m, status: "READY", winnerId: null } : m));
    const placings = eliminationPlacings(partial);
    expect(placings.get("p8")).toBe(5);
    expect(placings.has("p1")).toBe(false);
  });
});

describe("ordinal", () => {
  it("formats", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st",
    ]);
  });
});
