import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { playerName } from "@/lib/queries";
import { Card, CardHeader, EmptyState, PageSkeleton } from "@/components/ui";

export default function PlayerPage({ params }: PageProps<"/players/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Player params={params} />
    </Suspense>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </Card>
  );
}

async function Player({ params }: { params: PageProps<"/players/[id]">["params"] }) {
  const { id } = await params;
  const player = await db.player.findUnique({
    where: { id },
    include: {
      entries: {
        where: { tournament: { isPublic: true } },
        include: { tournament: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!player) notFound();

  const entryIds = player.entries.map((e) => e.id);
  const matches = await db.match.findMany({
    where: {
      status: "COMPLETED",
      isBye: false,
      OR: [{ entry1Id: { in: entryIds } }, { entry2Id: { in: entryIds } }],
    },
    include: { tournament: true },
    orderBy: { completedAt: "desc" },
  });
  const opponentEntryIds = matches.map((m) => (entryIds.includes(m.entry1Id!) ? m.entry2Id! : m.entry1Id!));
  const opponents = await db.entry.findMany({ where: { id: { in: opponentEntryIds } }, include: { player: true } });
  const opponentName = new Map(opponents.map((e) => [e.id, playerName(e.player)]));

  const rows = matches.map((m) => {
    const mine = entryIds.includes(m.entry1Id!) ? 1 : 2;
    const myScore = mine === 1 ? m.score1 : m.score2;
    const theirScore = mine === 1 ? m.score2 : m.score1;
    // Racks actually won, without handicap starts.
    const myRacks = myScore - (mine === 1 ? m.handicap1 : m.handicap2);
    const theirRacks = theirScore - (mine === 1 ? m.handicap2 : m.handicap1);
    const isWin = m.winnerId === (mine === 1 ? m.entry1Id : m.entry2Id);
    return { m, myScore, theirScore, myRacks, theirRacks, isWin, opponent: opponentName.get(mine === 1 ? m.entry2Id! : m.entry1Id!) };
  });
  const won = rows.filter((r) => r.isWin).length;
  const framesFor = rows.reduce((sum, r) => sum + r.myRacks, 0);
  const framesAgainst = rows.reduce((sum, r) => sum + r.theirRacks, 0);
  const winPct = matches.length ? Math.round((won / matches.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{playerName(player)}</h1>
        {(player.nickname || player.country) && (
          <p className="mt-1 text-muted">{[player.nickname && `“${player.nickname}”`, player.country].filter(Boolean).join(" · ")}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Tournaments" value={player.entries.length} />
        <Stat label="Matches" value={`${won}–${matches.length - won}`} />
        <Stat label="Win rate" value={`${winPct}%`} />
        <Stat label="Racks won" value={`${framesFor}–${framesAgainst}`} />
      </div>

      <Card>
        <CardHeader title="Recent matches" />
        {rows.length === 0 ? (
          <EmptyState title="No completed matches yet" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.slice(0, 30).map(({ m, myScore, theirScore, isWin, opponent }) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className={`w-6 font-bold ${isWin ? "text-accent" : "text-live"}`}>{isWin ? "W" : "L"}</span>
                <span className="w-14 font-semibold tabular-nums">
                  {myScore}–{theirScore}
                </span>
                <span className="flex-1">v {opponent}</span>
                <Link href={`/t/${m.tournament.slug}`} className="text-muted hover:text-accent">
                  {m.tournament.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
