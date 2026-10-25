// Rank-based handicaps. Pure, so the rules can be tested and shared by the
// service (when a match starts) and the UI (previews in tournament settings).
//
// Ranks: 1 is the strongest player; higher numbers are weaker. The tournament's
// start table gives the size of the start for each rank gap: starts[0] is for a
// gap of 1, starts[1] for a gap of 2, and the last entry applies to any larger gap.

export const HANDICAP_STYLES = {
  HEAD_START: "Head start for the weaker player",
  MINUS_START: "Minus start for the stronger player",
  LONGER_RACE: "Longer race for the stronger player",
} as const;
export type HandicapStyle = keyof typeof HANDICAP_STYLES;

/** Rank gaps the settings form shows; the last one means "this gap or more". */
export const HANDICAP_GAPS = 5;

export type MatchHandicap = {
  /** Starting score for each side (negative for a minus start). */
  handicap1: number;
  handicap2: number;
  /** Score each side must reach to win. */
  target1: number;
  target2: number;
};

export function noHandicap(raceTo: number): MatchHandicap {
  return { handicap1: 0, handicap2: 0, target1: raceTo, target2: raceTo };
}

/** Size of the start for a rank gap, from the tournament's table (0 = none). */
export function startForGap(starts: number[], gap: number): number {
  if (gap <= 0 || starts.length === 0) return 0;
  return Math.max(0, starts[Math.min(gap, starts.length) - 1] ?? 0);
}

export function computeHandicap(opts: {
  style: string | null | undefined;
  starts: number[];
  raceTo: number;
  rank1: number | null | undefined;
  rank2: number | null | undefined;
}): MatchHandicap {
  const { style, starts, raceTo, rank1, rank2 } = opts;
  const none = noHandicap(raceTo);
  if (!style || !(style in HANDICAP_STYLES) || !rank1 || !rank2) return none;
  const start = startForGap(starts, Math.abs(rank1 - rank2));
  if (start === 0) return none;

  const stronger: 1 | 2 = rank1 < rank2 ? 1 : 2;
  const weaker: 1 | 2 = stronger === 1 ? 2 : 1;
  const result = { ...none };
  switch (style as HandicapStyle) {
    case "HEAD_START":
      // The weaker player still has to reach the race, so the start can't win the match outright.
      result[`handicap${weaker}`] = Math.min(start, raceTo - 1);
      break;
    case "MINUS_START":
      result[`handicap${stronger}`] = -start;
      break;
    case "LONGER_RACE":
      result[`target${stronger}`] = raceTo + start;
      break;
  }
  return result;
}

/** Racks still needed by each side. */
export function racksNeeded(h: MatchHandicap, score1: number, score2: number) {
  return { need1: h.target1 - score1, need2: h.target2 - score2 };
}

/** One-line description for scoreboards, e.g. "Sam starts 1 up" or "Alex races to 4". */
export function describeHandicap(h: MatchHandicap, name1: string, name2: string): string | null {
  const parts: string[] = [];
  for (const [slot, name] of [
    [1, name1],
    [2, name2],
  ] as const) {
    const start = slot === 1 ? h.handicap1 : h.handicap2;
    if (start > 0) parts.push(`${name} starts ${start} up`);
    if (start < 0) parts.push(`${name} starts on ${start}`);
  }
  if (h.target1 !== h.target2) {
    parts.push(`${name1} races to ${h.target1}, ${name2} races to ${h.target2}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

/** Blank boxes in the start table inherit the previous gap's start (NaN = blank). */
export function fillBlankStarts(values: number[]): number[] {
  return values.reduce<number[]>((out, v) => [...out, Number.isNaN(v) ? (out.at(-1) ?? 0) : v], []);
}

/** Parse the settings form's start table ("start-1" … "start-N") into a trimmed list. */
export function parseStartTable(get: (key: string) => string | undefined): number[] {
  const values: number[] = [];
  for (let gap = 1; gap <= HANDICAP_GAPS; gap++) {
    const raw = get(`start-${gap}`)?.trim();
    const n = raw ? Number(raw) : NaN;
    if (raw && (!Number.isInteger(n) || n < 0 || n > 20)) throw new Error(`Start for a gap of ${gap} must be 0–20`);
    values.push(raw ? n : NaN);
  }
  // Trailing repeats are dropped (the last value covers larger gaps).
  const filled = fillBlankStarts(values);
  while (filled.length > 1 && filled.at(-1) === filled.at(-2)) filled.pop();
  return filled.every((v) => v === 0) ? [] : filled;
}
