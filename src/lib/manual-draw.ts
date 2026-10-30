// A draw entered by hand (e.g. done in the room on a spin-the-wheel, then picked into place on the
// entries page): knockouts store each entry's draw number (its line, top to bottom), groups each
// entry's group and its place in it. Shared by the entries page and the draw.

import { distributeIntoGroups, groupName, nextPowerOfTwo, seedPositions } from "./bracket";

export type DrawEntry = { id: string; seed: number | null; drawGroup: number | null; createdAt: Date };

/** Groups + knockout draws are entered as groups; every other format as a numbered draw. */
export const drawsIntoGroups = (format: string) => format === "GROUPS_KO";

/** Entries in the order drawn (by draw number). */
export function manualDrawOrder(entries: DrawEntry[]) {
  return [...entries].sort((a, b) => (a.seed ?? Infinity) - (b.seed ?? Infinity)).map((e) => e.id);
}

/**
 * The first round of a knockout for n entries, as the draw numbers on each side of each match
 * (null = a bye): [[1, 2], [3, null], ...]. Byes sit where the automatic draw puts them; draw numbers
 * run down the lines in order (see drawToSeedOrder, which turns them back into the bracket).
 */
export function knockoutLines(n: number): [number | null, number | null][] {
  const size = Math.max(2, nextPowerOfTwo(n));
  const order = seedPositions(size);
  let next = 0;
  const line = (seed: number) => (seed <= n ? ++next : null);
  return Array.from({ length: size / 2 }, (_, p) => {
    const a = line(order[2 * p]);
    const b = line(order[2 * p + 1]);
    return [a, b];
  });
}

/** How many places each group has for n entries (as the automatic draw would size them). */
export function groupSizes(n: number, groupCount: number) {
  return distributeIntoGroups(Array.from({ length: n }, (_, i) => String(i)), groupCount).map((g) => g.length);
}

/** Entries per group, in their place in the group (then the order they were added). */
export function manualGroups(entries: DrawEntry[], groupCount: number) {
  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  for (const e of [...entries].sort((a, b) => (a.seed ?? Infinity) - (b.seed ?? Infinity) || +a.createdAt - +b.createdAt)) {
    if (e.drawGroup !== null && e.drawGroup < groupCount) groups[e.drawGroup].push(e.id);
  }
  return groups;
}

/** A group's entries in draw order: as picked for a draw entered by hand, else as added. */
export function groupOrder<E extends { seed: number | null; createdAt: Date }>(entries: E[], seeding: string) {
  return [...entries].sort((a, b) => (seeding === "DRAWN" ? (a.seed ?? Infinity) - (b.seed ?? Infinity) : 0) || +a.createdAt - +b.createdAt);
}

/** What still needs fixing before the draw can be made (empty when it's ready). */
export function manualDrawProblems(entries: DrawEntry[], format: string, groupCount: number, word: string) {
  const problems: string[] = [];
  if (drawsIntoGroups(format)) {
    const missing = entries.filter((e) => e.drawGroup === null || e.drawGroup >= groupCount).length;
    if (missing) problems.push(`${missing} ${missing === 1 ? word.replace(/s$/, "") : word} still need${missing === 1 ? "s" : ""} a group`);
    manualGroups(entries, groupCount).forEach((g, i) => {
      if (g.length < 2) problems.push(`Group ${groupName(i)} needs at least 2 ${word}`);
    });
    return problems;
  }
  const n = entries.length;
  const missing = entries.filter((e) => e.seed === null).length;
  if (missing) problems.push(`${missing} ${missing === 1 ? word.replace(/s$/, "") : word} still need${missing === 1 ? "s" : ""} a draw number`);
  if (entries.some((e) => e.seed !== null && (e.seed < 1 || e.seed > n))) problems.push(`Draw numbers go from 1 to ${n}`);
  const seen = new Map<number, number>();
  for (const e of entries) if (e.seed !== null) seen.set(e.seed, (seen.get(e.seed) ?? 0) + 1);
  const twice = [...seen].filter(([, c]) => c > 1).map(([s]) => s).sort((a, b) => a - b);
  if (twice.length) problems.push(`Draw number${twice.length > 1 ? "s" : ""} ${twice.join(", ")} ${twice.length > 1 ? "are" : "is"} given twice`);
  return problems;
}
