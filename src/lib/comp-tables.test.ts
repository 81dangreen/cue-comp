import { describe, expect, it } from "vitest";
import { compTables } from "./comp-tables";

const venue = [{ id: "t1" }, { id: "t2" }, { id: "t3" }, { id: "t4" }];

describe("compTables", () => {
  it("uses every table when none are picked", () => {
    expect(compTables(venue, [])).toEqual(venue);
  });
  it("keeps venue order for the picked tables", () => {
    expect(compTables(venue, ["t4", "t3"]).map((t) => t.id)).toEqual(["t3", "t4"]);
  });
  it("ignores tables no longer at the venue, falling back to all", () => {
    expect(compTables(venue, ["gone", "t2"]).map((t) => t.id)).toEqual(["t2"]);
    expect(compTables(venue, ["gone"])).toEqual(venue);
  });
});
