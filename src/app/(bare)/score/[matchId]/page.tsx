import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { addFrameAction, assignTableAction, setResultAction, undoFrameAction } from "@/actions/matches";
import { requireUser } from "@/lib/auth";
import { roundLabel } from "@/lib/bracket";
import { describeHandicap } from "@/lib/handicap";
import { matchHandicap } from "@/lib/tournament-service";
import { db } from "@/lib/db";
import { playerName } from "@/lib/queries";
import { ActionForm, SubmitButton } from "@/components/forms";
import { LiveRefresher } from "@/components/live-refresher";
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
    include: { player: true },
  });
  const name = (id: string | null) => {
    const e = entries.find((x) => x.id === id);
    return e ? playerName(e.player) : "TBD";
  };
  const totalRounds = await db.match.aggregate({
    where: { tournamentId: match.tournamentId, bracket: match.bracket },
    _max: { round: true },
  });
  const roundName =
    match.bracket === "GROUP"
      ? "Group stage"
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

  return (
    <>
      <LiveRefresher tournamentId={match.tournamentId} quiet />
      <Scoreboard
        roundName={roundName}
        tournamentName={match.tournament.name}
        backHref={isAdmin ? `/admin/tournaments/${match.tournamentId}` : `/t/${match.tournament.slug}`}
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
        canUndo={match.frames.length > 0}
        frames={match.frames.map((f) => ({ winner: f.winner, breakAndRun: f.breakAndRun }))}
        addFrame={addFrameAction.bind(null, match.id)}
        undo={undoFrameAction.bind(null, match.id)}
      />
      {isAdmin && (
        <div className="flex flex-wrap items-start gap-6 border-t border-white/10 bg-[#0b0f0d] px-6 py-4 text-sm text-white/80">
          <ActionForm action={setResultAction.bind(null, match.id)} className="flex flex-wrap items-center gap-2">
            <span>Enter result directly:</span>
            <Input name="score1" type="number" min={0} max={handicap.target1} defaultValue={match.score1} className="w-16 bg-transparent text-white" aria-label={`${name(match.entry1Id)} score`} />
            <span>–</span>
            <Input name="score2" type="number" min={0} max={handicap.target2} defaultValue={match.score2} className="w-16 bg-transparent text-white" aria-label={`${name(match.entry2Id)} score`} />
            <SubmitButton variant="secondary" className="bg-transparent text-white">
              {match.status === "COMPLETED" ? "Correct result" : "Save result"}
            </SubmitButton>
          </ActionForm>
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
