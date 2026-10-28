// Who breaks each rack/frame. Pure, so the tablets and the service agree.
//
// The first break is chosen when the match starts (breakSlot). After that the
// tournament's rule decides: breaks alternate, or the winner of a rack breaks the next.

export const BREAK_RULES = {
  ALTERNATE: "Alternate breaks",
  WINNER: "Winner breaks",
} as const;
export type BreakRule = keyof typeof BREAK_RULES;

/** Who breaks the next rack, given the racks so far (null when the first breaker wasn't recorded). */
export function nextBreaker(rule: string, breakSlot: number | null | undefined, frames: { winner: number }[]): 1 | 2 | null {
  if (breakSlot !== 1 && breakSlot !== 2) return null;
  const last = frames.at(-1);
  if (!last) return breakSlot;
  if (rule === "WINNER") return last.winner === 2 ? 2 : 1;
  return (frames.length % 2 === 0 ? breakSlot : 3 - breakSlot) as 1 | 2;
}

/** A break & run can only go to the breaker, and a reverse dish only to the other player. */
export function dishAllowed(dish: string | null | undefined, winner: 1 | 2, breaker: 1 | 2 | null) {
  if (!dish || breaker === null) return true;
  return dish === "BREAK" ? winner === breaker : winner !== breaker;
}
