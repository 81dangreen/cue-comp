import { describe, expect, it } from "vitest";
import { groupSizes, knockoutLines, manualDrawOrder, manualDrawProblems, manualGroups, type DrawEntry } from "./manual-draw";

const e = (id: string, seed: number | null, drawGroup: number | null = null, minute = 0): DrawEntry => ({
  id,
  seed,
  drawGroup,
  createdAt: new Date(Date.UTC(2026, 10, 14, 10, minute)),
});

describe("manual draw: knockouts", () => {
  it("orders entries by draw number", () => {
    expect(manualDrawOrder([e("a", 3), e("b", 1), e("c", 2)])).toEqual(["b", "c", "a"]);
  });

  it("is ready once every entry has a different number from 1 to N", () => {
    expect(manualDrawProblems([e("a", 2), e("b", 1)], "SINGLE_ELIM", 1, "pairs")).toEqual([]);
  });

  it("lists what's missing, out of range or repeated", () => {
    expect(manualDrawProblems([e("a", 1), e("b", 1), e("c", null), e("d", 9)], "DOUBLE_ELIM", 1, "pairs")).toEqual([
      "1 pair still needs a draw number",
      "Draw numbers go from 1 to 4",
      "Draw number 1 is given twice",
    ]);
  });
});

describe("manual draw: groups", () => {
  it("puts each entry in its chosen group, in the order added", () => {
    const entries = [e("a", null, 1, 0), e("b", null, 0, 1), e("c", null, 1, 2), e("d", null, 0, 3)];
    expect(manualGroups(entries, 2)).toEqual([
      ["b", "d"],
      ["a", "c"],
    ]);
    expect(manualDrawProblems(entries, "GROUPS_KO", 2, "pairs")).toEqual([]);
  });

  it("needs every entry in a group and at least two in each", () => {
    expect(manualDrawProblems([e("a", null, 0), e("b", null, 0), e("c", null, 1), e("d", null, null)], "GROUPS_KO", 2, "players")).toEqual([
      "1 player still needs a group",
      "Group B needs at least 2 players",
    ]);
  });
});

describe("draw lines for picking names into place", () => {
  it("16 players: 8 matches numbered down the lines", () => {
    expect(knockoutLines(16)).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
      [9, 10],
      [11, 12],
      [13, 14],
      [15, 16],
    ]);
  });

  it("6 players: byes spread out, matching the bracket the draw makes", () => {
    expect(knockoutLines(6)).toEqual([
      [1, null],
      [2, 3],
      [4, null],
      [5, 6],
    ]);
  });

  it("sizes groups as evenly as the automatic draw", () => {
    expect(groupSizes(16, 4)).toEqual([4, 4, 4, 4]);
    expect(groupSizes(10, 3).sort()).toEqual([3, 3, 4]);
  });

  it("keeps each group in the order its places were filled", () => {
    const entries = [e("a", 2, 0, 0), e("b", 1, 0, 1)];
    expect(manualGroups(entries, 1)).toEqual([["b", "a"]]);
  });
});
