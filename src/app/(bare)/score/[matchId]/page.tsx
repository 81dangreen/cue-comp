import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  addFrameAction,
  assignTableAction,
  setResultAction,
  startMatchAction,
  undoFrameAction,
  undoWalkoverAction,
} from "@/actions/matches";
import { requireUser } from "@/lib/auth";
import { roundLabel } from "@/lib/bracket";
import { frameMatchData } from "@/lib/frame-match";
import { describeHandicap } from "@/lib/handicap";
import { fullScore, matchHandicap } from "@/lib/tournament-service";
import { db } from "@/lib/db";
import { entryName } from "@/lib/queries";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { WalkoverControl } from "@/components/tournament/walkover-control";
import { LiveRefresher } from "@/components/live-refresher";
import { FrameMatchStart, FrameScoreboard } from "@/components/scoring/frame-scoreboard";
import { Scoreboard } from "@/components/scoring/scoreboard";
import { TableSelect } from "@/components/tournament/table-select";
import { Input } from "@/components/ui";

export const metadata: Metadata = { title: "Scoring" };

export default function ScorePage({ params }: PageProps<"/score/[matchId]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[#0b0f0d]" />}>
      <Score params={params} />
    </Suspense>
  );
}

async function Score({ params }: { params: PageProps<"/score/[matchId]">["params"] }) {
  const user = await requireUser();
  const { matchId } = await params;
  const match = await db.match.findFirst({
    where: { id: matchId, tournament: { organizationId: user.organizationId } },
    include: {
      table: true,
      frames: { orderBy: { number: "asc" } },
      tournament: { include: { venue: { include: { tables: { orderBy: { sortOrder: "asc" } } } } } },
    },
  });
  if (!match) notFound();

  const entries = await db.entry.findMany({
    where: { id: { in: [match.entry1Id, match.entry2Id].filter((x): x is string => !!x) } },
    include: { player: true, partner: true },
  });
  const name = (id: string | null) => {
    const e = entries.find((x) => x.id === id);
    return e ? entryName(e) : "TBD";
  };
  const totalRounds = await db.match.aggregate({
    where: { tournamentId: match.tournamentId, bracket: match.bracket },
    _max: { round: true },
  });
  const roundName =
    match.bracket === "GROUP"
      ? (match.groupId && (await db.group.findUnique({ where: { id: match.groupId } }))?.name) || "Group stage"
      : roundLabel(match.bracket, match.round, totalRounds._max.round ?? match.round, {
          doubleElim: match.tournament.format === "DOUBLE_ELIM",
        });
  const isAdmin = user.role !== "SCORER";
  const handicap = await matchHandicap(match);
  const rank = (id: string | null) => (match.tournament.handicapStyle ? entries.find((x) => x.id === id)?.rank : null);
  // Before the first rack, show the starting scores the handicap will give.
  const notStarted = match.status === "READY";

  if (!match.entry1Id || !match.entry2Id || match.isBye) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#0b0f0d] p-6 text-center text-white">
        <div>
          <p className="text-lg font-semibold">This match isn&apos;t ready yet</p>
          <p className="mt-1 text-white/60">Both players need to be known before it can be scored.</p>
        </div>
      </div>
    );
  }

  const busy = await db.match.findMany({
    where: { tableId: { not: null }, status: { in: ["READY", "LIVE"] }, tournament: { organizationId: user.organizationId } },
    select: { tableId: true },
  });
  const busyIds = new Set(busy.map((b) => b.tableId));
  const tables = (match.tournament.venue?.tables ?? []).map((t) => ({ id: t.id, name: t.name, busy: busyIds.has(t.id) }));
  const frameMatch = await frameMatchData(match);
  const backHref = isAdmin ? `/admin/tournaments/${match.tournamentId}` : `/t/${match.tournament.slug}`;

  return (
    <>
      <LiveRefresher tournamentId={match.tournamentId} quiet />
      {frameMatch && notStarted ? (
        <div className="flex min-h-dvh flex-col items-center gap-[3vh] bg-[radial-gradient(ellipse_at_top,#1d3a6b_0%,#0d1d3b_45%,#060d1c_100%)] p-3 text-white sm:p-6">
          <Link href={backHref} className="self-start rounded-lg px-2 py-1 text-sm text-white/70 hover:bg-white/10">
            ← Back
          </Link>
          <div className="text-center">
            <p className="text-sm font-semibold tracking-[0.2em] text-sky-300 uppercase">{roundName}</p>
            <p className="mt-2 text-2xl font-bold sm:text-4xl">
              {frameMatch.team1} <span className="text-white/50">v</span> {frameMatch.team2}
            </p>
            {frameMatch.handicapNote && (
              <p className="mx-auto mt-4 w-fit rounded-xl bg-amber-300/15 px-4 py-2 font-semibold text-amber-100">
                Handicap: {frameMatch.handicapNote}
              </p>
            )}
          </div>
          <FrameMatchStart
            team1={frameMatch.team1}
            team2={frameMatch.team2}
            members={frameMatch.members}
            lineupMode={frameMatch.lineupMode}
            start={startMatchAction.bind(null, match.id)}
          />
        </div>
      ) : frameMatch ? (
        <FrameScoreboard
          {...frameMatch}
          roundName={roundName}
          tableName={match.table?.name}
          backHref={backHref}
          addFrame={addFrameAction.bind(null, match.id)}
          undo={undoFrameAction.bind(null, match.id)}
        />
      ) : (
      <Scoreboard
        roundName={roundName}
        tournamentName={match.tournament.name}
        backHref={backHref}
        raceTo={match.raceTo}
        status={match.status}
        tableName={match.table?.name}
        player1={name(match.entry1Id)}
        player2={name(match.entry2Id)}
        score1={notStarted ? handicap.handicap1 : match.score1}
        score2={notStarted ? handicap.handicap2 : match.score2}
        target1={handicap.target1}
        target2={handicap.target2}
        handicap1={handicap.handicap1}
        handicap2={handicap.handicap2}
        rank1={rank(match.entry1Id)}
        rank2={rank(match.entry2Id)}
        handicapNote={describeHandicap(handicap, name(match.entry1Id), name(match.entry2Id))}
        winnerSlot={match.winnerId ? (match.winnerId === match.entry1Id ? 1 : 2) : null}
        breakSlot={match.breakSlot}
        breakRule={match.tournament.breakRule}
        canUndo={match.frames.length > 0}
        frames={match.frames.map((f) => ({ winner: f.winner, breakAndRun: f.breakAndRun, reverseDish: f.reverseDish }))}
        addFrame={addFrameAction.bind(null, match.id)}
        undo={undoFrameAction.bind(null, match.id)}
      />
      )}
      {isAdmin && (
        <div className="flex flex-wrap items-start gap-6 border-t border-white/10 bg-[#0b0f0d] px-6 py-4 text-sm text-white/80">
          <ActionForm action={setResultAction.bind(null, match.id)} className="flex flex-wrap items-center gap-2">
            <span>Enter result directly:</span>
            <Input name="score1" type="number" min={-20} max={frameMatch ? 50 : handicap.target1} defaultValue={match.score1} className="w-16 bg-transparent text-white" aria-label={`${name(match.entry1Id)} score`} />
            <span>–</span>
            <Input name="score2" type="number" min={-20} max={frameMatch ? 50 : handicap.target2} defaultValue={match.score2} className="w-16 bg-transparent text-white" aria-label={`${name(match.entry2Id)} score`} />
            <SubmitButton variant="secondary" className="bg-transparent text-white">
              {match.status === "COMPLETED" ? "Correct result" : "Save result"}
            </SubmitButton>
          </ActionForm>
          {match.walkover ? (
            <div className="flex items-center gap-3">
              <span className="font-semibold text-amber-200">Walkover</span>
              <ActionButton action={undoWalkoverAction.bind(null, match.id)} variant="secondary" className="bg-transparent px-2.5 py-1 text-xs text-white">
                Undo walkover
              </ActionButton>
            </div>
          ) : (
            <WalkoverControl
              matchId={match.id}
              side1={name(match.entry1Id)}
              side2={name(match.entry2Id)}
              fullScore={`${fullScore(match, match.tournament)}–0`}
              dark
            />
          )}
          {tables.length > 0 && match.status !== "COMPLETED" && (
            <div className="flex items-center gap-2">
              <span>Table:</span>
              <TableSelect action={assignTableAction.bind(null, match.id)} tables={tables} value={match.tableId} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
