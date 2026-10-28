import { describe, expect, it } from "vitest";
import { computeStandings, unresolvedTies, type StandingRules } from "./standings";

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
    const ab = computeStandings(["a", "b"], [done("b", "a", 3, 2), done("a", "b", 3, 2)]);
    // Completely level, including head-to-head: falls back to seed order and is flagged as unresolved.
    expect(ab.map((r) => r.entryId)).toEqual(["a", "b"]);
    expect(ab[0].tiedWith).toEqual(["b"]);
  });

  it("ignores unfinished matches", () => {
    const rows = computeStandings(["a", "b"], [{ ...done("a", "b", 2, 1), status: "LIVE", winnerId: null }]);
    expect(rows.every((r) => r.played === 0)).toBe(true);
  });
});

const draw = (entry1Id: string, entry2Id: string, score: number) => ({
  entry1Id,
  entry2Id,
  score1: score,
  score2: score,
  winnerId: null,
  status: "COMPLETED",
});

describe("points and tiebreakers", () => {
  const rules = (tiebreakers: string[], extra: Partial<StandingRules> = {}): StandingRules => ({
    win: 2,
    draw: 1,
    loss: 0,
    tiebreakers,
    ...extra,
  });

  it("awards the organiser's points for wins, draws and losses", () => {
    const rows = computeStandings(["a", "b", "c"], [draw("a", "b", 5), done("a", "c", 6, 2), done("b", "c", 6, 4)], rules([], { win: 3 }));
    expect(rows.map((r) => [r.entryId, r.points, r.won, r.drawn, r.lost])).toEqual([
      ["a", 4, 1, 1, 0],
      ["b", 4, 1, 1, 0],
      ["c", 0, 0, 0, 2],
    ]);
  });

  it("applies tiebreakers in the order chosen", () => {
    // a and b level on points. a has the better frame difference, but b won the meeting.
    const matches = [done("b", "a", 6, 5), done("a", "c", 6, 0), done("c", "b", 6, 4), draw("a", "d", 5), draw("b", "d", 5)];
    const ids = ["a", "b", "c", "d"];
    const top2 = (tb: string[]) => computeStandings(ids, matches, rules(tb)).slice(0, 2).map((r) => r.entryId);
    expect(top2(["FRAME_DIFF", "HEAD_TO_HEAD"])).toEqual(["a", "b"]);
    expect(top2(["HEAD_TO_HEAD", "FRAME_DIFF"])).toEqual(["b", "a"]);
  });

  it("uses a mini-table for head-to-head between three tied entries", () => {
    // A circle: a beat b, b beat c, c beat a, all 6-4, and each beat d. Head-to-head can't split them.
    const matches = [done("a", "b", 6, 4), done("b", "c", 6, 4), done("c", "a", 6, 4), done("a", "d", 6, 0), done("b", "d", 6, 0), done("c", "d", 6, 0)];
    const rows = computeStandings(["a", "b", "c", "d"], matches, rules(["HEAD_TO_HEAD"]));
    expect(rows.slice(0, 3).every((r) => r.tiedWith.length === 2)).toBe(true);
    expect(unresolvedTies(rows).map((set) => set.map((r) => r.entryId))).toEqual([["a", "b", "c"]]);
  });

  it("settles a tie with the shootout once every tied entry has a result", () => {
    const matches = [draw("a", "b", 5)];
    const partial = computeStandings(["a", "b"], matches, rules(["SHOOTOUT"], { shootout: new Map([["b", 1]]) }));
    expect(unresolvedTies(partial)).toHaveLength(1);
    const settled = computeStandings(["a", "b"], matches, rules(["SHOOTOUT"], { shootout: new Map([["b", 1], ["a", 2]]) }));
    expect(settled.map((r) => r.entryId)).toEqual(["b", "a"]);
    expect(unresolvedTies(settled)).toHaveLength(0);
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
