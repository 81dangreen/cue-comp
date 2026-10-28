import "server-only";
import { db } from "./db";

// The shared player directory: lookups that guard against duplicate people, and
// merging duplicates that slip through.

export class DirectoryError extends Error {}

/** Players with the same name (case-insensitive), for "is this the same person?" checks. */
export function sameNamePlayers(firstName: string, lastName: string) {
  return db.player.findMany({
    where: {
      firstName: { equals: firstName.trim(), mode: "insensitive" },
      lastName: { equals: lastName.trim(), mode: "insensitive" },
    },
    select: { id: true, firstName: true, lastName: true, homeClub: true, nickname: true },
  });
}

/** Describe existing same-name players so an organiser can tell them apart. */
export function describeMatches(players: { firstName: string; lastName: string; homeClub: string | null; nickname: string | null }[]) {
  return players
    .map((p) => [`${p.firstName} ${p.lastName}`, p.nickname && `“${p.nickname}”`, p.homeClub && `(${p.homeClub})`].filter(Boolean).join(" "))
    .join(", ");
}

/**
 * Merge `sourceId` into `targetId`: the source's tournament entries and any ranks the
 * target lacks move across, blank details on the target are filled from the source,
 * then the source record is deleted.
 */
export async function mergePlayers(sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new DirectoryError("Choose a different player to merge");
  await db.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.player.findUnique({
        where: { id: sourceId },
        include: { entries: { include: { tournament: true } }, partnerEntries: { include: { tournament: true } }, ranks: true },
      }),
      tx.player.findUnique({ where: { id: targetId }, include: { entries: true, partnerEntries: true, ranks: true } }),
    ]);
    if (!source || !target) throw new DirectoryError("Player not found");

    const targetTournaments = new Set([...target.entries, ...target.partnerEntries].map((e) => e.tournamentId));
    const clash = [...source.entries, ...source.partnerEntries].find((e) => targetTournaments.has(e.tournamentId));
    if (clash) {
      throw new DirectoryError(`Both records are entered in “${clash.tournament.name}”. Remove one of those entries first.`);
    }
    await tx.entry.updateMany({ where: { playerId: sourceId }, data: { playerId: targetId } });
    await tx.entry.updateMany({ where: { partnerId: sourceId }, data: { partnerId: targetId } });
    await tx.frame.updateMany({ where: { player1Id: sourceId }, data: { player1Id: targetId } });
    await tx.frame.updateMany({ where: { player2Id: sourceId }, data: { player2Id: targetId } });

    const targetDisciplines = new Set(target.ranks.map((r) => r.discipline));
    for (const rank of source.ranks) {
      if (!targetDisciplines.has(rank.discipline)) await tx.playerRank.update({ where: { id: rank.id }, data: { playerId: targetId } });
    }

    await tx.player.update({
      where: { id: targetId },
      data: {
        nickname: target.nickname ?? source.nickname,
        email: target.email ?? source.email,
        phone: target.phone ?? source.phone,
        country: target.country ?? source.country,
        homeClub: target.homeClub ?? source.homeClub,
      },
    });
    // Remaining source ranks (disciplines the target already had) go with the record.
    await tx.player.delete({ where: { id: sourceId } });
  });
}
