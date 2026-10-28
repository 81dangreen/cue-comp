import { describe, expect, it } from "vitest";
import { computeHandicap, describeHandicap, matrixSize, parseMatrixForm, parseStartTable, startForGap } from "./handicap";

const base = { starts: [1, 1, 2], raceTo: 3 };

describe("startForGap", () => {
  it("uses the table, with the last entry covering larger gaps", () => {
    expect([0, 1, 2, 3, 4, 9].map((g) => startForGap([1, 1, 2], g))).toEqual([0, 1, 1, 2, 2, 2]);
    expect(startForGap([], 3)).toBe(0);
  });
});

describe("computeHandicap", () => {
  it("gives the weaker player a head start", () => {
    // Player 1 is rank 1 (strongest), player 2 is rank 2.
    expect(computeHandicap({ ...base, style: "HEAD_START", rank1: 1, rank2: 2 })).toEqual({
      handicap1: 0,
      handicap2: 1,
      target1: 3,
      target2: 3,
    });
  });

  it("puts the stronger player on a minus start", () => {
    expect(computeHandicap({ ...base, style: "MINUS_START", rank1: 5, rank2: 1 })).toEqual({
      handicap1: 0,
      handicap2: -2,
      target1: 3,
      target2: 3,
    });
  });

  it("makes the stronger player race further, starting 0-0", () => {
    expect(computeHandicap({ ...base, style: "LONGER_RACE", rank1: 1, rank2: 2 })).toEqual({
      handicap1: 0,
      handicap2: 0,
      target1: 4,
      target2: 3,
    });
  });

  it("is level for equal ranks, missing ranks, or no style", () => {
    const level = { handicap1: 0, handicap2: 0, target1: 3, target2: 3 };
    expect(computeHandicap({ ...base, style: "HEAD_START", rank1: 3, rank2: 3 })).toEqual(level);
    expect(computeHandicap({ ...base, style: "HEAD_START", rank1: 3, rank2: null })).toEqual(level);
    expect(computeHandicap({ ...base, style: null, rank1: 1, rank2: 4 })).toEqual(level);
  });

  it("never lets a head start win the match on its own", () => {
    expect(computeHandicap({ starts: [5], raceTo: 3, style: "HEAD_START", rank1: 1, rank2: 2 }).handicap2).toBe(2);
  });
});

describe("describeHandicap", () => {
  it("summarises the start for the scoreboard", () => {
    expect(describeHandicap({ handicap1: 0, handicap2: 1, target1: 3, target2: 3 }, "Alex", "Sam")).toBe("Sam starts 1 up");
    expect(describeHandicap({ handicap1: -1, handicap2: 0, target1: 3, target2: 3 }, "Alex", "Sam")).toBe("Alex starts on -1");
    expect(describeHandicap({ handicap1: 0, handicap2: 0, target1: 4, target2: 3 }, "Alex", "Sam")).toBe(
      "Alex races to 4, Sam races to 3",
    );
    expect(describeHandicap({ handicap1: 0, handicap2: 0, target1: 3, target2: 3 }, "Alex", "Sam")).toBeNull();
  });
});

describe("pairing table", () => {
  const matrix = { "1-2": 1, "1-3": 3, "2-3": 1 };
  it("takes each pairing's start from the table, not the gap", () => {
    const start = (rank1: number, rank2: number) =>
      computeHandicap({ style: "HEAD_START", starts: [], matrix, raceTo: 6, rank1, rank2 });
    expect(start(1, 3)).toMatchObject({ handicap1: 0, handicap2: 3 });
    expect(start(3, 2)).toMatchObject({ handicap1: 1, handicap2: 0 });
    // Ranks outside the table play level.
    expect(start(1, 4)).toMatchObject({ handicap1: 0, handicap2: 0 });
  });

  it("reads the settings form", () => {
    const form: Record<string, string> = { "pair-1-2": "1", "pair-1-3": "3", "pair-2-3": "" };
    expect(parseMatrixForm(3, (k) => form[k])).toEqual({ "1-2": 1, "1-3": 3 });
    expect(matrixSize({ "1-2": 1, "2-4": 2 })).toBe(4);
    expect(parseMatrixForm(2, () => "")).toBeNull();
    expect(() => parseMatrixForm(3, (k) => (k === "pair-1-2" ? "x" : ""))).toThrow();
  });
});

describe("parseStartTable", () => {
  const table = (values: Record<string, string>) => parseStartTable((k) => values[k]);
  it("fills blanks from the previous gap and trims repeats", () => {
    expect(table({ "start-1": "1", "start-3": "2" })).toEqual([1, 1, 2]);
    expect(table({ "start-1": "1", "start-2": "1", "start-3": "1" })).toEqual([1]);
    expect(table({})).toEqual([]);
  });
  it("rejects nonsense", () => {
    expect(() => table({ "start-1": "-1" })).toThrow();
    expect(() => table({ "start-2": "1.5" })).toThrow();
  });
});
