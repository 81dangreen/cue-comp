import { describe, expect, it } from "vitest";
import {
  DEFAULT_FRAMES,
  describeFormat,
  drawLineup,
  frameAt,
  frameOutcome,
  framePlayers,
  majority,
  singlesQuota,
  type FrameFormat,
} from "./match-format";

const group: FrameFormat = { frames: DEFAULT_FRAMES, finish: "FIRST_TO", knockout: false };
const level = (score1: number, score2: number, played = score1 + score2) => ({ score1, score2, played, target1: 6, target2: 6 });

describe("frame-list format", () => {
  it("is won by a majority of its frames", () => {
    expect(majority(10)).toBe(6);
    expect(majority(9)).toBe(5);
    expect(describeFormat(DEFAULT_FRAMES, "FIRST_TO")).toBe("10 frames (4 doubles, 6 singles), first to 6");
  });

  it("gives every player three singles, never two in a row, in the default order", () => {
    const lineup = { 1: { A: "a1", B: "b1" }, 2: { A: "a2", B: "b2" } };
    const singles = DEFAULT_FRAMES.map((k) => framePlayers(k, lineup).player1Id);
    expect(singles.filter((p) => p === "a1")).toHaveLength(3);
    expect(singles.filter((p) => p === "b1")).toHaveLength(3);
    expect(singles.some((p, i) => p && p === singles[i + 1])).toBe(false);
    expect(framePlayers("AB", lineup)).toEqual({ player1Id: "a1", player2Id: "b2" });
    expect(framePlayers("D", lineup)).toEqual({ player1Id: null, player2Id: null });
    expect(singlesQuota(group)).toBe(3);
  });

  it("first to six stops once someone has six, and 5-5 is a draw in groups", () => {
    expect(frameOutcome(group, level(6, 2))).toEqual({ done: true, winner: 1 });
    expect(frameOutcome(group, level(5, 4))).toEqual({ done: false });
    expect(frameOutcome(group, level(5, 5))).toEqual({ done: true, winner: null });
  });

  it("playing every frame keeps going after six, then the higher score wins", () => {
    const all = { ...group, finish: "ALL" };
    expect(frameOutcome(all, level(6, 2))).toEqual({ done: false });
    expect(frameOutcome(all, level(7, 3))).toEqual({ done: true, winner: 1 });
    expect(frameOutcome(all, level(5, 5))).toEqual({ done: true, winner: null });
  });

  it("knockouts play a doubles decider when level", () => {
    const ko = { ...group, knockout: true };
    expect(frameOutcome(ko, level(5, 5))).toEqual({ done: false });
    expect(frameAt(ko, 10)).toEqual({ number: 11, kind: "D", decider: true });
    expect(frameOutcome(ko, level(5, 6, 11))).toEqual({ done: true, winner: 2 });
    expect(frameAt(ko, 1)).toEqual({ number: 2, kind: "AA", decider: false });
  });

  it("counts handicap starts and longer races", () => {
    // Side 2 started 1 up: 5-5 on frames is 5-6, so side 2 wins in a group.
    expect(frameOutcome(group, { score1: 5, score2: 6, played: 10, target1: 6, target2: 6 })).toEqual({ done: true, winner: 2 });
    // Side 1 races to 7: after ten frames, whoever is closer to their target wins.
    expect(frameOutcome(group, { score1: 6, score2: 4, played: 10, target1: 7, target2: 6 })).toEqual({ done: true, winner: 1 });
    expect(frameOutcome(group, { score1: 4, score2: 6, played: 10, target1: 7, target2: 6 })).toEqual({ done: true, winner: 2 });    expect(frameOutcome({ ...group, finish: "ALL" }, { score1: 6, score2: 4, played: 10, target1: 7, target2: 6 })).toEqual({
      done: true,
      winner: 1,
    });
  });

  it("draws each pair's A and B at random", () => {
    expect(drawLineup(["a", "b"], ["c", "d"], () => 0.1)).toEqual({ 1: { A: "a", B: "b" }, 2: { A: "c", B: "d" } });
    expect(drawLineup(["a", "b"], ["c", "d"], () => 0.9)).toEqual({ 1: { A: "b", B: "a" }, 2: { A: "d", B: "c" } });
  });
});
