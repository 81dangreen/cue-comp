import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  autoAssignTablesAction,
  setAutoPilotAction,
  generateDrawAction,
  generateKnockoutAction,
  resetDrawAction,
  setRegistration,
} from "@/actions/tournaments";
import { assignTableAction } from "@/actions/matches";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { entryNames, getTournamentFull, type MatchWithTable } from "@/lib/queries";
import { matchCounts } from "@/lib/views";
import { ActionButton } from "@/components/forms";
import { MatchList } from "@/components/tournament/match-list";
import { TableSelect } from "@/components/tournament/table-select";
import { ButtonLink, Card, CardHeader, EmptyState, PageSkeleton } from "@/components/ui";

export default function ControlRoomPage({ params }: PageProps<"/admin/tournaments/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ControlRoom params={params} />
    </Suspense>
  );
}

async function ControlRoom({ params }: { params: PageProps<"/admin/tournaments/[id]">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  const t = await getTournamentFull({ id });
  if (!t || t.organizationId !== user.organizationId) notFound();

  const names = entryNames(t.entries);
  const counts = matchCounts(t);
  const confirmed = t.entries.filter((e) => e.status === "CONFIRMED").length;
  const awaiting = t.entries.filter((e) => e.status === "REGISTERED").length;
  const hasDraw = t.matches.length > 0;
  const groupMatches = t.matches.filter((m) => m.bracket === "GROUP");
  const koMatches = t.matches.filter((m) => m.bracket !== "GROUP");
  const groupsDone = groupMatches.length > 0 && groupMatches.every((m) => m.status === "COMPLETED" || m.status === "VOID");
  const canKnockout = t.format === "GROUPS_KO" && groupsDone && koMatches.length === 0;

  // Tables in use anywhere in the organisation, so two events at one venue don't clash.
  const busy = await db.match.findMany({
    where: { tableId: { not: null }, status: { in: ["READY", "LIVE"] }, tournament: { organizationId: user.organizationId } },
    select: { tableId: true },
  });
  const busyIds = new Set(busy.map((b) => b.tableId));
  const tables = (t.venue?.tables ?? []).map((tb) => ({ id: tb.id, name: tb.name, busy: busyIds.has(tb.id) }));

  const live = t.matches.filter((m) => m.status === "LIVE");
  const ready = t.matches.filter((m) => m.status === "READY");
  const finished = t.matches
    .filter((m) => m.status === "COMPLETED" && !m.isBye)
    .sort((a, b) => +(b.completedAt ?? 0) - +(a.completedAt ?? 0));
  const waiting = t.matches.filter((m) => m.status === "PENDING");

  const scoreLink = (m: MatchWithTable) => `/score/${m.id}`;
  const matchActions = (m: MatchWithTable) => (
    <>
      {tables.length > 0 && <TableSelect action={assignTableAction.bind(null, m.id)} tables={tables} value={m.tableId} />}
      <ButtonLink href={scoreLink(m)} variant={m.status === "LIVE" ? "primary" : "secondary"} className="px-2.5 py-1 text-xs">
        {m.status === "LIVE" ? "Score" : "Start"}
      </ButtonLink>
    </>
  );

  return (
    <div className="space-y-6">
      {/* Setup / stage actions */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="text-xs text-muted">Confirmed players</div>
            <div className="text-xl font-bold tabular-nums">{confirmed}</div>
          </div>
          {hasDraw && (
            <div>
              <div className="text-xs text-muted">Matches played</div>
              <div className="text-xl font-bold tabular-nums">
                {counts.completed}/{counts.total}
              </div>
            </div>
          )}
          {awaiting > 0 && (
            <Link href={`/admin/tournaments/${t.id}/entries`} className="text-sm text-warn hover:underline">
              {awaiting} registration{awaiting === 1 ? "" : "s"} awaiting confirmation →
            </Link>
          )}
          <div className="ml-auto flex flex-wrap items-start gap-2">
            {!hasDraw && (
              <ActionButton action={setRegistration.bind(null, t.id, !t.registrationOpen)} variant="secondary">
                {t.registrationOpen ? "Close registration" : "Open registration"}
              </ActionButton>
            )}
            {!hasDraw && (
              <ActionButton action={generateDrawAction.bind(null, t.id)} disabled={confirmed < 2}>
                Generate draw
              </ActionButton>
            )}
            {canKnockout && (
              <ActionButton action={generateKnockoutAction.bind(null, t.id)}>Generate knockout stage</ActionButton>
            )}
            {tables.length > 0 && (
              <ActionButton
                action={setAutoPilotAction.bind(null, t.id, !t.autoAssignTables)}
                variant={t.autoAssignTables ? "primary" : "secondary"}
                title="Automatically put the next ready match on each table as it frees up"
              >
                Auto-pilot: {t.autoAssignTables ? "on" : "off"}
              </ActionButton>
            )}
            {hasDraw && tables.length > 0 && t.status === "IN_PROGRESS" && !t.autoAssignTables && (
              <ActionButton action={autoAssignTablesAction.bind(null, t.id)} variant="secondary">
                Auto-assign tables
              </ActionButton>
            )}
            {hasDraw && (
              <ActionButton
                action={resetDrawAction.bind(null, t.id)}
                variant="danger"
                confirm="Reset the draw? All matches and results in this tournament will be deleted."
              >
                Reset draw
              </ActionButton>
            )}
          </div>
        </div>
        {!t.venue && hasDraw && (
          <p className="mt-3 text-sm text-muted">
            Tip: set a venue in <Link href={`/admin/tournaments/${t.id}/settings`} className="text-accent hover:underline">settings</Link> to
            assign matches to tables.
          </p>
        )}
      </Card>

      {!hasDraw ? (
        <Card>
          <EmptyState title="No draw yet">
            Add players on the <Link href={`/admin/tournaments/${t.id}/entries`} className="text-accent hover:underline">entries</Link> tab,
            then generate the draw.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_18rem]">
          <div className="space-y-6">
            <Card>
              <CardHeader title={`Live (${live.length})`} />
              {live.length ? (
                <MatchList matches={live} names={names} linkFor={scoreLink} actions={matchActions} />
              ) : (
                <p className="px-5 py-4 text-sm text-muted">No matches in play.</p>
              )}
            </Card>
            <Card>
              <CardHeader title={`Ready to play (${ready.length})`} subtitle="Both players known — assign a table and start" />
              {ready.length ? (
                <MatchList matches={ready} names={names} linkFor={scoreLink} actions={matchActions} />
              ) : (
                <p className="px-5 py-4 text-sm text-muted">Nothing waiting.</p>
              )}
            </Card>
            {finished.length > 0 && (
              <Card>
                <CardHeader title={`Finished (${finished.length})`} subtitle="Open a match to correct its result" />
                <MatchList matches={finished} names={names} linkFor={scoreLink} />
              </Card>
            )}
            {waiting.length > 0 && (
              <Card>
                <CardHeader title={`Waiting for players (${waiting.length})`} />
                <MatchList matches={waiting} names={names} />
              </Card>
            )}
          </div>

          {tables.length > 0 && (
            <Card className="h-fit">
              <CardHeader title="Tables" subtitle={t.venue?.name} />
              <ul className="divide-y divide-border">
                {t.venue!.tables.map((tb) => {
                  const current = t.matches.find((m) => m.tableId === tb.id && (m.status === "LIVE" || m.status === "READY"));
                  return (
                    <li key={tb.id} className="px-5 py-2.5 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{tb.name}</span>
                        {current ? (
                          <Link href={scoreLink(current)} className={current.status === "LIVE" ? "text-live" : "text-accent"}>
                            {current.code} {current.status === "LIVE" ? `${current.score1}–${current.score2}` : "· starting"}
                          </Link>
                        ) : busyIds.has(tb.id) ? (
                          <span className="text-muted">Other event</span>
                        ) : (
                          <span className="text-muted">Free</span>
                        )}
                      </div>
                      {current && (
                        <div className="truncate text-xs text-muted">
                          {names.get(current.entry1Id!)} v {names.get(current.entry2Id!)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
