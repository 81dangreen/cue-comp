import { describe, expect, it } from "vitest";
import { dishAllowed, nextBreaker } from "./breaks";

const racks = (...winners: number[]) => winners.map((winner) => ({ winner }));

describe("nextBreaker", () => {
  it("alternates from the first breaker", () => {
    expect([0, 1, 2, 3].map((n) => nextBreaker("ALTERNATE", 2, racks(...Array(n).fill(1))))).toEqual([2, 1, 2, 1]);
  });

  it("gives the next break to the winner under winner breaks", () => {
    expect(nextBreaker("WINNER", 1, racks())).toBe(1);
    expect(nextBreaker("WINNER", 1, racks(2))).toBe(2);
    expect(nextBreaker("WINNER", 1, racks(2, 2, 1))).toBe(1);
  });

  it("is unknown when the first break wasn't recorded", () => {
    expect(nextBreaker("ALTERNATE", null, racks(1))).toBeNull();
  });
});

describe("dishAllowed", () => {
  it("credits a break & run to the breaker and a reverse dish to the other player", () => {
    expect(dishAllowed("BREAK", 1, 1)).toBe(true);
    expect(dishAllowed("BREAK", 2, 1)).toBe(false);
    expect(dishAllowed("REVERSE", 2, 1)).toBe(true);
    expect(dishAllowed("REVERSE", 1, 1)).toBe(false);
    expect(dishAllowed(null, 2, 1)).toBe(true);
    expect(dishAllowed("BREAK", 2, null)).toBe(true);
  });
});
