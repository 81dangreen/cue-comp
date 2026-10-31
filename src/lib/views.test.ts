import { describe, expect, it } from "vitest";
import { roundSections } from "./views";

const m = (id: string, bracket: string, round: number, position = 1) => ({ id, bracket, round, position });

describe("roundSections", () => {
  const labels = new Map([
    ["qf1", "Quarter Finals"],
    ["qf2", "Quarter Finals"],
    ["pqf", "Plate Quarter Finals"],
    ["sf", "Semi Finals"],
    ["psf", "Plate Semi Finals"],
  ]);

  it("splits by round, main draw before plate, earliest round first", () => {
    const sections = roundSections([m("psf", "PLATE", 2), m("sf", "WINNERS", 2), m("pqf", "PLATE", 1), m("qf2", "WINNERS", 1, 2), m("qf1", "WINNERS", 1, 1)], labels);
    expect(sections.map((s) => s.title)).toEqual(["Quarter Finals", "Plate Quarter Finals", "Semi Finals", "Plate Semi Finals"]);
    expect(sections[0].matches.map((x) => x.id)).toEqual(["qf1", "qf2"]);
    expect(sections.map((s) => s.plate)).toEqual([false, true, false, true]);
  });

  it("keeps group matches in one section", () => {
    const sections = roundSections([m("a", "GROUP", 1), m("b", "GROUP", 2)], new Map([["a", "Group A"], ["b", "Group B"]]));
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Group stage");
  });
});
