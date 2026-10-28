import "server-only";
import { cache } from "react";
import { db } from "./db";

export const playerInclude = { player: true, partner: true } as const;

/** Everything a tournament page needs, loaded in one go. */
export const getTournamentFull = cache(async (where: { slug: string } | { id: string }) => {
  return db.tournament.findUnique({
    where,
    include: {
      organization: true,
      venue: { include: { tables: { orderBy: { sortOrder: "asc" } } } },
      entries: { include: playerInclude, orderBy: { createdAt: "asc" } },
      groups: { orderBy: { index: "asc" }, include: { table: true } },
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

type NamePart = { firstName: string; lastName: string };

/** An entry's display name: the player, or for a pair its team name or "Ann Lee & Bob Day". */
export function entryName(e: { player: NamePart; partner?: NamePart | null; teamName?: string | null }) {
  if (e.teamName) return e.teamName;
  return e.partner ? `${playerName(e.player)} & ${playerName(e.partner)}` : playerName(e.player);
}

/** entryId → display name, for rendering matches. */
export function entryNames(entries: (Parameters<typeof entryName>[0] & { id: string })[]) {
  return new Map(entries.map((e) => [e.id, entryName(e)]));
}
