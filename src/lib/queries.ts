import "server-only";
import { cache } from "react";
import { db } from "./db";

export const playerInclude = { player: true } as const;

/** Everything a tournament page needs, loaded in one go. */
export const getTournamentFull = cache(async (where: { slug: string } | { id: string }) => {
  return db.tournament.findUnique({
    where,
    include: {
      organization: true,
      venue: { include: { tables: { orderBy: { sortOrder: "asc" } } } },
      entries: { include: playerInclude, orderBy: { createdAt: "asc" } },
      groups: { orderBy: { index: "asc" } },
      matches: {
        include: { table: true },
        orderBy: [{ bracket: "asc" }, { round: "asc" }, { position: "asc" }],
      },
    },
  });
});

export type TournamentFull = NonNullable<Awaited<ReturnType<typeof getTournamentFull>>>;
export type MatchWithTable = TournamentFull["matches"][number];
export type EntryWithPlayer = TournamentFull["entries"][number];

export function playerName(p: { firstName: string; lastName: string; nickname?: string | null }) {
  return `${p.firstName} ${p.lastName}`.trim();
}

/** entryId → display name, for rendering matches. */
export function entryNames(entries: EntryWithPlayer[]) {
  return new Map(entries.map((e) => [e.id, playerName(e.player)]));
}
