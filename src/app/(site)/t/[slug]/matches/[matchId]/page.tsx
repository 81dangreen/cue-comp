import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { describeHandicap } from "@/lib/handicap";
import { frameAt, isSingles, parseLineup } from "@/lib/match-format";
import { entryName, getTournamentFull, playerName } from "@/lib/queries";
import { frameFormat, matchHandicap } from "@/lib/tournament-service";
import { matchLabels, raceText } from "@/lib/views";
import { StatusBadge } from "@/components/tournament/match-list";
import { Card, CardHeader, cx, EmptyState, PageSkeleton } from "@/components/ui";

export default function MatchPage({ params }: PageProps<"/t/[slug]/matches/[matchId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MatchDetail params={params} />
    </Suspense>
  );
}

/** One match: score, and every frame with who played it and who won it. */
async function MatchDetail({ params }: { params: PageProps<"/t/[slug]/matches/[matchId]">["params"] }) {
  const { slug, matchId } = await params;
  const t = await getTournamentFull({ slug });
  if (!t || !t.isPublic) notFound();
  const match = t.matches.find((m) => m.id === matchId);
  if (!match || match.isBye) notFound();
  const frames = await db.frame.findMany({ where: { matchId }, orderBy: { number: "asc" } });
  const entry = (id: string | null) => t.entries.find((e) => e.id === id);
  const e1 = entry(match.entry1Id);
  const e2 = entry(match.entry2Id);
  const team = (slot: 1 | 2) => {
    const e = slot === 1 ? e1 : e2;
    return e ? entryName(e) : "TBD";
  };
  const people = new Map(t.entries.flatMap((e) => [e.player, ...(e.partner ? [e.partner] : [])]).map((p) => [p.id, playerName(p)]));
  const fmt = frameFormat(t, match.bracket);
  const lineup = parseLineup(match.lineup);
  const handicap = await matchHandicap(match);
  const note = describeHandicap(handicap, team(1), team(2));
  const decided = match.status === "COMPLETED";
  const label = matchLabels(t.matches, t.groups).get(match.id);
  const scheduled = fmt ? Math.max(fmt.frames.length, frames.length) : frames.length;

  return (
    <div className="space-y-6">
      <Link href={`/t/${t.slug}/matches`} className="text-sm text-muted hover:text-accent">
        ← All matches
      </Link>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-5 py-2.5 text-sm text-muted">
          <span>
            {label} · {raceText(t)(match)}
            {match.table && ` · ${match.table.name}`}
          </span>
          <StatusBadge status={match.status} />
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-6">
          <TeamHeading name={team(1)} won={decided && match.winnerId === match.entry1Id} lineup={lineup?.[1]} people={people} />
          <span className="rounded-xl bg-surface-2 px-4 py-2 text-3xl font-black tabular-nums sm:text-5xl">
            {match.status === "READY" || match.status === "PENDING" ? "v" : `${match.score1} – ${match.score2}`}
          </span>
          <TeamHeading name={team(2)} won={decided && match.winnerId === match.entry2Id} lineup={lineup?.[2]} people={people} right />
        </div>
        {(note || (decided && !match.winnerId) || match.walkover) && (
          <p className="border-t border-border px-5 py-2.5 text-center text-sm text-muted">
            {match.walkover && <span className="font-semibold text-foreground">Walkover: not played. </span>}
            {decided && !match.winnerId && <span className="font-semibold text-foreground">Match drawn. </span>}
            {note && !match.walkover && `Handicap: ${note}`}
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title={fmt ? "Frames" : "Racks"} />
        {match.walkover ? (
          <EmptyState title="No frames: this match was a walkover" />
        ) : scheduled === 0 ? (
          <EmptyState title="No frames played yet" />
        ) : (
          <ol className="divide-y divide-border">
            {Array.from({ length: scheduled }, (_, i) => {
              const f = frames[i];
              const at = fmt ? frameAt(fmt, i) : null;
              const singles = at ? isSingles(at.kind) : false;
              const who = f && singles && f.player1Id && f.player2Id ? `${people.get(f.player1Id)} v ${people.get(f.player2Id)}` : null;
              return (
                <li key={i} className={cx("grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 px-5 py-2.5 text-[15px]", !f && "text-muted")}>
                  <span className="text-sm font-semibold">{at?.decider ? "Decider" : `Frame ${i + 1}`}</span>
                  <span>
                    {at && <span className="mr-2 text-sm text-muted">{singles ? "Singles" : "Doubles"}</span>}
                    {who}
                  </span>
                  <span className={cx("text-sm", f && "font-semibold")}>
                    {f ? (
                      <>
                        {team(f.winner as 1 | 2)}
                        {f.breakAndRun && <span className="ml-1 text-xs text-accent">(dish)</span>}
                        {f.reverseDish && <span className="ml-1 text-xs text-accent">(reverse dish)</span>}
                      </>
                    ) : (
                      "–"
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}

function TeamHeading({
  name,
  won,
  lineup,
  people,
  right,
}: {
  name: string;
  won: boolean;
  lineup?: { A: string; B: string };
  people: Map<string, string>;
  right?: boolean;
}) {
  return (
    <div className={cx("min-w-0", right && "text-right")}>
      <p className={cx("text-lg font-bold sm:text-2xl", won && "text-accent")}>{name}</p>
      {lineup && (
        <p className="mt-1 text-sm text-muted">
          A: {people.get(lineup.A)} · B: {people.get(lineup.B)}
        </p>
      )}
    </div>
  );
}
