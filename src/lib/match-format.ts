// Frame-list matches (pairs comps): a match is a fixed list of frames, each either
// doubles or a singles frame between named members of the two pairs. Pure, so the
// rules can be tested and shared by the service, tablets and settings previews.
//
// Each pair has a Player A and a Player B for the match (drawn at random or picked
// by the players). A singles frame says which of them plays for each side, e.g.
// "AB" = side 1's Player A v side 2's Player B.

export const FRAME_KINDS = {
  D: "Doubles",
  AA: "Singles: A v A",
  BB: "Singles: B v B",
  AB: "Singles: A v B",
  BA: "Singles: B v A",
} as const;
export type FrameKind = keyof typeof FRAME_KINDS;

/** Doubles, then singles in a rotating pattern, so no one plays two singles in a row. */
export const DEFAULT_FRAMES: FrameKind[] = ["D", "AA", "BB", "D", "BB", "AA", "D", "AA", "BB", "D"];

export const FINISH_RULES = {
  FIRST_TO: "First to a majority (stop once it's won)",
  ALL: "Play every frame",
} as const;
export type FinishRule = keyof typeof FINISH_RULES;

export const LINEUP_MODES = {
  RANDOM: "Random draw when the match starts",
  PICK_MATCH: "Pairs choose their Player A and B when the match starts",
  PICK_FRAME: "Pairs choose who plays before each singles frame",
} as const;
export type LineupMode = keyof typeof LINEUP_MODES;

export const MAX_FRAMES = 25;

export interface FrameFormat {
  frames: string[];
  finish: string;
  /** Knockout matches can't be drawn: a doubles decider is played when level. */
  knockout: boolean;
}

/** Each pair's Player A and Player B for one match. */
export type Lineup = { 1: { A: string; B: string }; 2: { A: string; B: string } };

export function isFrameKind(k: string): k is FrameKind {
  return k in FRAME_KINDS;
}

export const isSingles = (kind: string) => kind !== "D";

/** Frames needed to win outright: a majority of the scheduled frames. */
export function majority(frameCount: number) {
  return Math.floor(frameCount / 2) + 1;
}

/** The frame to play after `played` frames: a scheduled one, or a doubles decider in a level knockout. */
export function frameAt(fmt: FrameFormat, index: number): { number: number; kind: FrameKind; decider: boolean } {
  const kind = fmt.frames[index];
  if (kind && isFrameKind(kind)) return { number: index + 1, kind, decider: false };
  return { number: index + 1, kind: "D", decider: true };
}

export type Outcome = { done: false } | { done: true; winner: 1 | 2 | null };

/**
 * Has the match finished, and who won (null = draw)? Scores include handicap starts;
 * targets are the frames each side needs (a longer-race handicap raises one).
 */
export function frameOutcome(
  fmt: FrameFormat,
  s: { score1: number; score2: number; played: number; target1: number; target2: number },
): Outcome {
  const n = fmt.frames.length;
  if (fmt.finish !== "ALL") {
    if (s.score1 >= s.target1) return { done: true, winner: 1 };
    if (s.score2 >= s.target2) return { done: true, winner: 2 };
  }
  if (s.played < n) return { done: false };
  // Every scheduled frame played: whoever is closer to their target wins.
  const need1 = s.target1 - s.score1;
  const need2 = s.target2 - s.score2;
  if (need1 < need2) return { done: true, winner: 1 };
  if (need2 < need1) return { done: true, winner: 2 };
  return fmt.knockout ? { done: false } : { done: true, winner: null };
}

/** Who plays a frame for each side (null = both players, in doubles). */
export function framePlayers(kind: string, lineup: Lineup | null): { player1Id: string | null; player2Id: string | null } {
  if (!isSingles(kind) || !lineup || kind.length !== 2) return { player1Id: null, player2Id: null };
  return { player1Id: lineup[1][kind[0] as "A" | "B"], player2Id: lineup[2][kind[1] as "A" | "B"] };
}

/** Most singles frames one player may play, so both members of a pair share them evenly. */
export function singlesQuota(fmt: FrameFormat) {
  return Math.ceil(fmt.frames.filter(isSingles).length / 2);
}

/** Random A/B order for each pair. */
export function drawLineup(side1: [string, string], side2: [string, string], random = Math.random): Lineup {
  const order = ([x, y]: [string, string]) => (random() < 0.5 ? { A: x, B: y } : { A: y, B: x });
  return { 1: order(side1), 2: order(side2) };
}

export function parseLineup(value: unknown): Lineup | null {
  const v = value as Lineup | null;
  return v && v[1]?.A && v[1]?.B && v[2]?.A && v[2]?.B ? v : null;
}

/** "Doubles", or "A v B" style labels, for the settings editor and frame strips. */
export function frameKindShort(kind: string) {
  return isSingles(kind) ? `${kind[0]} v ${kind[1]}` : "Doubles";
}

/** e.g. "10 frames, first to 6" or "10 frames, all played". */
export function describeFormat(frames: string[], finish: string) {
  const n = frames.length;
  const doubles = frames.filter((f) => !isSingles(f)).length;
  const mix = doubles === n ? "all doubles" : doubles === 0 ? "all singles" : `${doubles} doubles, ${n - doubles} singles`;
  return `${n} frames (${mix}), ${finish === "ALL" ? "all played" : `first to ${majority(n)}`}`;
}
