import { describe, expect, it } from "vitest";
import { computeStandings } from "./standings";

const done = (entry1Id: string, entry2Id: string, score1: number, score2: number) => ({
  entry1Id,
  entry2Id,
  score1,
  score2,
  winnerId: score1 > score2 ? entry1Id : entry2Id,
  status: "COMPLETED",
});

describe("computeStandings", () => {
  it("ranks by wins, then frame difference", () => {
    const rows = computeStandings(
      ["a", "b", "c"],
      [done("a", "b", 3, 1), done("b", "c", 3, 0), done("c", "a", 3, 2)],
    );
    // One win each. a 5-4 (+1), b 4-3 (+1), c 3-5 (-2); a edges b on frames won.
    expect(rows.map((r) => r.entryId)).toEqual(["a", "b", "c"]);
    expect(rows[2].frameDiff).toBe(-2);
  });

  it("uses head-to-head when otherwise level", () => {
    const rows = computeStandings(["a", "b"], [done("b", "a", 3, 2), done("a", "b", 3, 2)]);
    // Totally level: falls through to the first meeting found (b beat a), then seed.
    expect(rows[0].entryId).toBe("b");
  });

  it("ignores unfinished matches", () => {
    const rows = computeStandings(["a", "b"], [{ ...done("a", "b", 2, 1), status: "LIVE", winnerId: null }]);
    expect(rows.every((r) => r.played === 0)).toBe(true);
  });
});

describe("handicap starts", () => {
  it("don't count as frames won", () => {
    const rows = computeStandings(
      ["a", "b"],
      [{ entry1Id: "a", entry2Id: "b", score1: 3, score2: 2, handicap1: 0, handicap2: 1, winnerId: "a", status: "COMPLETED" }],
    );
    const a = rows.find((r) => r.entryId === "a")!;
    expect([a.framesFor, a.framesAgainst, a.frameDiff]).toEqual([3, 1, 2]);
  });
});
