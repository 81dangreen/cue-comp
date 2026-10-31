import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  autoAssignTablesAction,
  chooseDrawAction,
  setAutoPilotAction,
  setCompTablesAction,
  generateKnockoutAction,
  resetDrawAction,
  setGroupTableAction,
  setRegistration,
  setShootoutAction,
} from "@/actions/tournaments";
import { assignTableAction } from "@/actions/matches";
import { fullScore } from "@/lib/tournament-service";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { compTables } from "@/lib/comp-tables";
import { manualDrawProblems } from "@/lib/manual-draw";
import { ordinal } from "@/lib/results";
import { entryNames, getTournamentFull, type MatchWithTable } from "@/lib/queries";
import { groupsWithStandings, matchCounts, matchLabels, roundSections } from "@/lib/views";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { MatchList, PlateTag } from "@/components/tournament/match-list";
import { TableSelect } from "@/components/tournament/table-select";
import { DrawCard } from "@/components/tournament/draw-card";
import { WalkoverControl } from "@/components/tournament/walkover-control";
import { ButtonLink, Card, CardHeader, cx, EmptyState, PageSkeleton, Select } from "@/components/ui";

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
  const labels = matchLabels(t.matches, t.groups);
  const counts = matchCounts(t);
  const confirmed = t.entries.filter((e) => e.status === "CONFIRMED").length;
  const awaiting = t.entries.filter((e) => e.status === "REGISTERED").length;
  const hasDraw = t.matches.length > 0;
  const groupMatches = t.matches.filter((m) => m.bracket === "GROUP");
  const koMatches = t.matches.filter((m) => m.bracket !== "GROUP");
  const groupsDone = groupMatches.length > 0 && groupMatches.every((m) => m.status === "COMPLETED" || m.status === "VOID");
  const canKnockout = t.format === "GROUPS_KO" && groupsDone && koMatches.length === 0;
  const word = t.entryType === "PAIRS" ? "pairs" : "players";
  // A draw done in the room and typed in on the entries page.
  const ownDraw = t.seeding === "DRAWN";
  const drawProblems =
    ownDraw && !hasDraw
      ? manualDrawProblems(
          t.entries.filter((e) => e.status === "CONFIRMED"),
          t.format,
          t.format === "ROUND_ROBIN" ? 1 : Math.max(1, t.groupCount ?? 2),
          word,
        )
      : [];
  const groups = groupsWithStandings(t);
  const shootouts = koMatches.length === 0 ? groups.flatMap((g) => g.shootouts.map((set) => ({ group: g.group, set }))) : [];
  const showGroupPanel = groups.length > 0 && koMatches.length === 0 && (t.tablePerGroup || shootouts.length > 0);

  // Tables in use anywhere in the organisation, so two events at one venue don't clash.
  const busy = await db.match.findMany({
    where: { tableId: { not: null }, status: { in: ["READY", "LIVE"] }, tournament: { organizationId: user.organizationId } },
    select: { tableId: true, tournamentId: true, tournament: { select: { name: true } } },
  });
  const busyIds = new Set(busy.map((b) => b.tableId));
  const otherEvent = new Map(busy.filter((b) => b.tournamentId !== t.id).map((b) => [b.tableId!, b.tournament.name]));
  // The tables picked for this comp (all of them unless some went to another comp, e.g. a plate),
  // plus any it still has a match on: those finish where they are.
  const venueTables = t.venue?.tables ?? [];
  const ownIds = new Set(compTables(venueTables, t.tableIds).map((tb) => tb.id));
  const onTable = (tb: { id: string }) => t.matches.some((m) => m.tableId === tb.id && (m.status === "LIVE" || m.status === "READY"));
  const shownTables = venueTables.filter((tb) => ownIds.has(tb.id) || onTable(tb));
  const tables = shownTables.map((tb) => ({ id: tb.id, name: tb.name, busy: busyIds.has(tb.id) }));

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
      <WalkoverControl
        matchId={m.id}
        side1={names.get(m.entry1Id!) ?? "Side 1"}
        side2={names.get(m.entry2Id!) ?? "Side 2"}
        fullScore={`${fullScore(m, t)}–0`}
      />
    </>
  );

  const tablesCard = venueTables.length > 0 && (
    <Card className="h-fit">
      <CardHeader
        title="Tables"
        subtitle={ownIds.size < venueTables.length ? `${t.venue?.name} · ${ownIds.size} of ${venueTables.length} tables` : t.venue?.name}
      />
      <ul className="divide-y divide-border">
        {shownTables.map((tb) => {
          const current = t.matches.find((m) => m.tableId === tb.id && (m.status === "LIVE" || m.status === "READY"));
          return (
            <li key={tb.id} className="px-5 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{tb.name}</span>
                {current ? (
                  <Link href={scoreLink(current)} className={current.status === "LIVE" ? "text-live" : "text-accent"}>
                    {current.status === "LIVE" ? `Live ${current.score1}–${current.score2}` : "Waiting to start"}
                  </Link>
                ) : groups.some((g) => g.group.tableId === tb.id && !g.complete) ? (
                  <Link href={`/admin/tournaments/${t.id}/bracket`} className="text-muted">
                    {groups.find((g) => g.group.tableId === tb.id)!.group.name}
                  </Link>
                ) : otherEvent.has(tb.id) ? (
                  <span className="truncate text-muted">{otherEvent.get(tb.id)}</span>
                ) : (
                  <span className="text-muted">Free</span>
                )}
              </div>
              {current && (
                <div className="truncate text-xs text-muted">
                  {names.get(current.entry1Id!)} v {names.get(current.entry2Id!)}
                </div>
              )}
              {!ownIds.has(tb.id) && <div className="text-xs text-warn">Handed over once this match is done</div>}
            </li>
          );
        })}
      </ul>
      {venueTables.length > 1 && (
        <details className="border-t border-border">
          <summary className="cursor-pointer px-5 py-2.5 text-sm font-medium text-accent select-none">Choose this comp&apos;s tables</summary>
          <ActionForm action={setCompTablesAction.bind(null, t.id)} className="space-y-2 px-5 pb-4">
            <p className="text-xs text-muted">
              Untick tables to hand them to another comp at {t.venue?.name}, e.g. a plate. A match already on a table finishes there.
            </p>
            {venueTables.map((tb) => (
              <label key={tb.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="table" value={tb.id} defaultChecked={ownIds.has(tb.id)} />
                <span className="font-medium">{tb.name}</span>
                {otherEvent.has(tb.id) && <span className="truncate text-xs text-muted">{otherEvent.get(tb.id)}</span>}
              </label>
            ))}
            <SubmitButton variant="secondary">Save tables</SubmitButton>
          </ActionForm>
        </details>
      )}
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Setup / stage actions */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="text-xs text-muted">Confirmed {word}</div>
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
          {!hasDraw && ownDraw && (
            <div>
              <div className="text-xs text-muted">Your draw</div>
              <div className={drawProblems.length ? "text-sm font-semibold text-warn" : "text-sm font-semibold text-accent"}>
                {drawProblems.length ? `${drawProblems[0]} (below)` : "Entered and ready to generate (below)"}
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
            {!hasDraw && !ownDraw && (
              <>
                <ActionButton action={chooseDrawAction.bind(null, t.id, "DRAWN")} variant="secondary" disabled={confirmed < 2}>
                  Enter the draw yourself
                </ActionButton>
                <ActionButton action={chooseDrawAction.bind(null, t.id, t.seeding === "MANUAL" ? "MANUAL" : "RANDOM")} disabled={confirmed < 2}>
                  {t.seeding === "MANUAL" ? "Generate seeded draw" : "Generate random draw"}
                </ActionButton>
              </>
            )}
            {!hasDraw && ownDraw && (
              <>
                <ActionButton action={chooseDrawAction.bind(null, t.id, "RANDOM")} variant="ghost">
                  Random draw instead
                </ActionButton>
              </>
            )}
            {canKnockout && (
              <ActionButton action={generateKnockoutAction.bind(null, t.id)} disabled={shootouts.length > 0}>
                {t.plateQualifiers ? "Generate knockout & plate" : "Generate knockout stage"}
              </ActionButton>
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

      {showGroupPanel && (
        <Card>
          <CardHeader
            title="Group stage"
            subtitle={t.tablePerGroup ? "Each group plays on its own table. Auto-pilot keeps a group's matches there, in order." : undefined}
          />
          <div className="divide-y divide-border">
            {t.tablePerGroup &&
              tables.length > 0 &&
              groups.map(({ group }) => (
                <div key={group.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="font-medium">{group.name}</span>
                  <TableSelect
                    action={setGroupTableAction.bind(null, t.id, group.id)}
                    tables={tables.map((tb) => ({ ...tb, busy: false }))}
                    value={group.tableId}
                  />
                </div>
              ))}
            {shootouts.map(({ group, set }) => (
              <ActionForm
                key={set.map((r) => r.entryId).join()}
                action={setShootoutAction.bind(null, t.id)}
                className="flex flex-wrap items-end gap-4 bg-warn/5 px-5 py-4"
              >
                <div className="w-full text-sm">
                  <span className="font-semibold">{group.name}: shootout needed.</span>{" "}
                  <span className="text-muted">These are level after every tiebreaker. Enter where each finished in the shootout.</span>
                </div>
                {set.map((r) => (
                  <label key={r.entryId} className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{names.get(r.entryId)}</span>
                    <Select name={`place-${r.entryId}`} defaultValue="" required className="w-24 py-1">
                      <option value="" disabled>
                        Place
                      </option>
                      {set.map((_, i) => (
                        <option key={i} value={i + 1}>
                          {ordinal(i + 1)}
                        </option>
                      ))}
                    </Select>
                  </label>
                ))}
                <SubmitButton variant="secondary">Save shootout</SubmitButton>
              </ActionForm>
            ))}
          </div>
        </Card>
      )}

      {!hasDraw && ownDraw && confirmed >= 2 ? (
        <DrawCard t={t} word={word} />
      ) : !hasDraw ? (
        <Card>
          <EmptyState title="No draw yet">
            Add {word} on the <Link href={`/admin/tournaments/${t.id}/entries`} className="text-accent hover:underline">entries</Link> tab,
            then generate the draw.
          </EmptyState>
        </Card>
      ) : null}
      {!hasDraw && tablesCard && <div className="max-w-md">{tablesCard}</div>}
      {!hasDraw ? null : (
        <div className="grid gap-6 xl:grid-cols-[1fr_18rem]">
          <div className="space-y-6">
            <Card>
              <CardHeader title={`Live (${live.length})`} />
              {live.length ? (
                <MatchList matches={live} names={names} labels={labels} linkFor={scoreLink} actions={matchActions} />
              ) : (
                <p className="px-5 py-4 text-sm text-muted">No matches in play.</p>
              )}
            </Card>
            <Card>
              <CardHeader title={`Ready to play (${ready.length})`} subtitle={`Both ${word === "pairs" ? "pairs" : "players"} known — assign a table and start`} />
              {ready.length ? (
                <RoundSections matches={ready} names={names} labels={labels} linkFor={scoreLink} actions={matchActions} />
              ) : (
                <p className="px-5 py-4 text-sm text-muted">Nothing waiting.</p>
              )}
            </Card>
            {finished.length > 0 && (
              <Card>
                <CardHeader title={`Finished (${finished.length})`} subtitle="Open a match to correct its result" />
                <MatchList matches={finished} names={names} labels={labels} linkFor={scoreLink} />
              </Card>
            )}
            {waiting.length > 0 && (
              <Card>
                <CardHeader title={`Waiting for ${word} (${waiting.length})`} />
                <RoundSections matches={waiting} names={names} labels={labels} />
              </Card>
            )}
          </div>

          {tablesCard}
        </div>
      )}
    </div>
  );
}

/**
 * A match list split by round, in the order to call them, with a heading per round and plate rounds
 * marked, so the plate's matches aren't mistaken for the main draw's. One round: a plain list.
 */
function RoundSections(props: Parameters<typeof MatchList>[0] & { labels: Map<string, string> }) {
  const sections = roundSections(props.matches, props.labels);
  if (sections.length < 2) return <MatchList {...props} matches={sections[0]?.matches ?? []} />;
  return sections.map((s, i) => (
    <section key={s.title} className={cx(i > 0 && "border-t border-border")}>
      <h3
        className={cx(
          "flex items-center gap-2 border-b border-border px-5 py-2 text-sm font-semibold",
          s.plate ? "bg-warn/10" : "bg-surface-2",
        )}
      >
        {s.plate && <PlateTag />}
        {s.plate ? s.title.replace(/^Plate /, "") : s.title}
        <span className="font-normal text-muted">
          {s.matches.length} match{s.matches.length === 1 ? "" : "es"}
        </span>
      </h3>
      {/* The heading names the round; group matches keep their group's name. */}
      <MatchList {...props} matches={s.matches} labels={s.title === "Group stage" ? props.labels : undefined} />
    </section>
  ));
}
