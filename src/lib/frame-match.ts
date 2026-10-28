import "server-only";
import type { Frame, Match, Tournament } from "@prisma/client";
import { db } from "./db";
import { describeHandicap } from "./handicap";
import { parseLineup, singlesQuota } from "./match-format";
import { entryName, playerName } from "./queries";
import { frameFormat, matchHandicap } from "./tournament-service";

/**
 * Everything a frame-list match's scoreboard needs (pairs, order of play, frames so far),
 * or null when the match is a plain race.
 */
export async function frameMatchData(match: Match & { tournament: Tournament; frames: Frame[] }) {
  const format = frameFormat(match.tournament, match.bracket);
  if (!format || !match.entry1Id || !match.entry2Id) return null;
  const entries = await db.entry.findMany({
    where: { id: { in: [match.entry1Id, match.entry2Id] } },
    include: { player: true, partner: true },
  });
  const entry = (id: string) => entries.find((e) => e.id === id)!;
  const members = (id: string) => {
    const e = entry(id);
    return [e.player, ...(e.partner ? [e.partner] : [])].map((p) => ({ id: p.id, name: playerName(p) }));
  };
  const handicap = await matchHandicap(match);
  const team1 = entryName(entry(match.entry1Id));
  const team2 = entryName(entry(match.entry2Id));
  const notStarted = match.status === "READY";
  return {
    tournamentName: match.tournament.name,
    team1,
    team2,
    members: { 1: members(match.entry1Id), 2: members(match.entry2Id) },
    format,
    lineupMode: match.tournament.lineupMode,
    lineup: parseLineup(match.lineup),
    quota: singlesQuota(format),
    status: match.status,
    // Before the first frame, show the starting scores the handicap will give.
    score1: notStarted ? handicap.handicap1 : match.score1,
    score2: notStarted ? handicap.handicap2 : match.score2,
    target1: handicap.target1,
    target2: handicap.target2,
    handicapNote: describeHandicap(handicap, team1, team2),
    winnerSlot: match.winnerId ? (match.winnerId === match.entry1Id ? 1 : 2) : null,
    breakSlot: match.breakSlot,
    breakRule: match.tournament.breakRule,
    frames: match.frames.map((f) => ({ number: f.number, winner: f.winner, player1Id: f.player1Id, player2Id: f.player2Id })),
  } as const;
}
