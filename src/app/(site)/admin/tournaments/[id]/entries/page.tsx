import { notFound } from "next/navigation";
import { Suspense } from "react";
import { addEntries, addPair, confirmEntry, removeEntry, saveEntries } from "@/actions/tournaments";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { drawToSeedOrder, groupName, singleElimination } from "@/lib/bracket";
import { drawsIntoGroups, manualDrawOrder, manualDrawProblems, manualGroups } from "@/lib/manual-draw";
import { entryName, entryNames, getTournamentFull, playerName, type TournamentFull } from "@/lib/queries";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { PairPicker } from "@/components/tournament/pair-picker";
import { PlayerPicker } from "@/components/tournament/player-picker";
import { Badge, Card, CardHeader, EmptyState, Field, Input, PageSkeleton, Select } from "@/components/ui";

export default function EntriesPage({ params }: PageProps<"/admin/tournaments/[id]/entries">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Entries params={params} />
    </Suspense>
  );
}

async function Entries({ params }: { params: PageProps<"/admin/tournaments/[id]/entries">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  const t = await getTournamentFull({ id });
  if (!t || t.organizationId !== user.organizationId) notFound();
  const locked = t.matches.length > 0;
  const pairs = t.entryType === "PAIRS";
  const enteredIds = new Set(t.entries.flatMap((e) => (e.partnerId ? [e.playerId, e.partnerId] : [e.playerId])));
  const available = await db.player.findMany({
    where: { id: { notIn: [...enteredIds] } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, nickname: true, homeClub: true },
  });
  const manual = t.seeding === "MANUAL";
  // A draw entered by hand: knockouts take a draw number per entry, groups + knockout a group.
  const drawn = t.seeding === "DRAWN";
  const intoGroups = drawn && drawsIntoGroups(t.format);
  const groupCount = Math.max(1, t.groupCount ?? 2);
  const entries = [...t.entries].sort((a, b) =>
    intoGroups
      ? (a.drawGroup ?? 99) - (b.drawGroup ?? 99) || +a.createdAt - +b.createdAt
      : (a.seed ?? 999) - (b.seed ?? 999) || entryName(a).localeCompare(entryName(b)),
  );
  const handicapped = !!t.handicapStyle;
  // Before the draw, entries without a rank show the player's current rank for this discipline.
  const playerRanks = handicapped
    ? new Map(
        (
          await db.playerRank.findMany({
            where: { playerId: { in: t.entries.map((e) => e.playerId) }, discipline: t.discipline },
          })
        ).map((r) => [r.playerId, r.rank]),
      )
    : new Map<string, number>();
  const showSave = ((manual || drawn) && !locked) || handicapped;
  const option = (p: { id: string; firstName: string; lastName: string; nickname: string | null; homeClub: string | null }) => ({
    id: p.id,
    name: playerName(p),
    detail: [p.nickname && `“${p.nickname}”`, p.homeClub].filter(Boolean).join(" · ") || null,
  });
  const pickerOptions = available.map(option);
  const enteredOptions = t.entries.flatMap((e) => (e.partner ? [e.player, e.partner] : [e.player])).map(option);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Card>
        <CardHeader
          title={`${pairs ? "Pairs" : "Entries"} (${t.entries.length}${t.maxEntries ? ` / ${t.maxEntries}` : ""})`}
          subtitle={[
            locked
              ? "The draw has been made — reset it to change entries."
              : manual
                ? "Manual seeding: enter seeds then save."
                : intoGroups
                  ? "Enter the draw: choose each one's group as it's drawn, then save."
                  : drawn
                    ? "Enter the draw: number each one in the order drawn, then save. The bracket fills top to bottom: 1 v 2, 3 v 4, …"
                    : null,
            handicapped && pairs
              ? "Give each pair its handicap group (1 = strongest). The start between groups is set in the tournament settings."
              : handicapped
                ? "Ranks (1 = strongest) come from the player directory. Changing one here applies to this comp only, for matches that haven't started."
                : null,
          ]
            .filter(Boolean)
            .join(" ")}
        />
        {entries.length === 0 ? (
          <EmptyState title={pairs ? "No pairs entered yet" : "No players entered yet"} />
        ) : (
          <>
            {/* Seed and rank inputs belong to the form below via the `form` attribute, so the
                per-row Confirm/Remove buttons can have their own forms without nesting. Each is
                keyed by its saved value: React resets the form after saving, and the new key
                remounts the field with what was saved. */}
            <ul className="divide-y divide-border">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-2.5">
                  {(manual || (drawn && !intoGroups)) && (
                    <Input
                      key={`seed-${e.seed ?? ""}`}
                      form="entries-form"
                      name={`seed-${e.id}`}
                      type="number"
                      min={1}
                      defaultValue={e.seed ?? ""}
                      disabled={locked}
                      className="w-16 py-1 text-center"
                      aria-label={drawn ? "Draw number" : "Seed"}
                      placeholder={drawn ? "#" : "–"}
                    />
                  )}
                  {intoGroups && (
                    <Select
                      key={`group-${e.drawGroup ?? ""}`}
                      form="entries-form"
                      name={`group-${e.id}`}
                      defaultValue={e.drawGroup ?? ""}
                      disabled={locked}
                      className="w-28 py-1"
                      aria-label="Group"
                    >
                      <option value="">Group…</option>
                      {Array.from({ length: groupCount }, (_, i) => (
                        <option key={i} value={i}>
                          Group {groupName(i)}
                        </option>
                      ))}
                    </Select>
                  )}
                  <span className="flex-1 font-medium">
                    {entryName(e)}
                    {e.teamName && e.partner && (
                      <span className="ml-2 text-sm font-normal text-muted">
                        {playerName(e.player)} &amp; {playerName(e.partner)}
                      </span>
                    )}
                  </span>
                  {e.status === "REGISTERED" && (e.contactEmail || e.contactPhone) && (
                    <span className="text-xs text-muted">{[e.contactEmail, e.contactPhone].filter(Boolean).join(" · ")}</span>
                  )}
                  {handicapped && (
                    <label className="flex items-center gap-1.5 text-xs text-muted">
                      {pairs ? (
                        "Handicap group"
                      ) : e.rank && playerRanks.has(e.playerId) && e.rank !== playerRanks.get(e.playerId) ? (
                        <span className="font-semibold text-warn" title="Changed for this comp only">
                          Comp rank (ranked {playerRanks.get(e.playerId)})
                        </span>
                      ) : (
                        "Rank"
                      )}
                      <Input
                        key={`rank-${e.rank ?? ""}`}
                        form="entries-form"
                        name={`rank-${e.id}`}
                        type="number"
                        min={1}
                        defaultValue={e.rank ?? (pairs ? "" : playerRanks.get(e.playerId)) ?? ""}
                        className="w-16 py-1 text-center"
                        placeholder="–"
                      />
                    </label>
                  )}
                  {e.status === "REGISTERED" && <Badge tone="warn">Self-registered</Badge>}
                  {!locked && e.status === "REGISTERED" && (
                    <ActionButton action={confirmEntry.bind(null, t.id, e.id)} variant="secondary" className="px-2.5 py-1 text-xs">
                      Confirm
                    </ActionButton>
                  )}
                  {!locked && (
                    <ActionButton action={removeEntry.bind(null, t.id, e.id)} variant="ghost" className="px-2.5 py-1 text-xs text-live">
                      Remove
                    </ActionButton>
                  )}
                </li>
              ))}
            </ul>
            {showSave && (
              <ActionForm id="entries-form" action={saveEntries.bind(null, t.id)} className="border-t border-border p-4">
                <SubmitButton variant="secondary">
                  {handicapped
                    ? `Save ${manual && !locked ? "seeds & " : drawn && !locked ? "draw & " : ""}${pairs ? "handicap groups" : "ranks"}`
                    : drawn
                      ? "Save draw"
                      : "Save seeds"}
                </SubmitButton>
              </ActionForm>
            )}
          </>
        )}
      </Card>

      {drawn && !locked && entries.length > 0 && <DrawPreview t={t} groupCount={groupCount} word={pairs ? "pairs" : "players"} />}

      {!locked && pairs && (
        <Card className="h-fit">
          <CardHeader title="Add a pair" />
          <ActionForm action={addPair.bind(null, t.id)} className="space-y-4 p-5" resetOnSuccess>
            <PairPicker players={pickerOptions} entered={enteredOptions} />
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Field label="Team name (optional)">
                <Input name="teamName" placeholder="e.g. The Cue Balls" />
              </Field>
              {handicapped && (
                <Field label="Handicap group">
                  <Input name="rank" type="number" min={1} className="w-24" placeholder="–" />
                </Field>
              )}
            </div>
            <SubmitButton>Add pair</SubmitButton>
          </ActionForm>
        </Card>
      )}

      {!locked && !pairs && (
        <Card className="h-fit">
          <CardHeader title="Add players" />
          <ActionForm action={addEntries.bind(null, t.id)} className="space-y-4 p-5" resetOnSuccess>
            <PlayerPicker players={pickerOptions} entered={enteredOptions} />
            <p className="text-xs text-muted">New players are added to the shared player directory too.</p>
            <SubmitButton>Add to tournament</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}

/** What the hand-entered draw will make, so it can be checked against the draw in the room first. */
function DrawPreview({ t, groupCount, word }: { t: TournamentFull; groupCount: number; word: string }) {
  const confirmed = t.entries.filter((e) => e.status === "CONFIRMED");
  const names = entryNames(t.entries);
  const problems = manualDrawProblems(confirmed, t.format, groupCount, word);
  const groups = drawsIntoGroups(t.format);
  const round1 = groups
    ? []
    : singleElimination(drawToSeedOrder(manualDrawOrder(confirmed)), { raceTo: t.raceTo })
        .filter((m) => m.round === 1)
        .sort((a, b) => a.position - b.position)
        .map((m) => [m.slot1, m.slot2].map((s) => (s.type === "entry" && s.entryId ? names.get(s.entryId) : null)));
  return (
    <Card className="lg:col-start-1">
      <CardHeader
        title="Draw preview"
        subtitle={
          problems.length
            ? "Finish entering the draw to see what it makes."
            : "Check this against the draw in the room, then make the draw in the control room."
        }
      />
      {problems.length ? (
        <ul className="space-y-1 px-5 py-4 text-sm text-warn">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : groups ? (
        <div className="grid gap-px bg-border sm:grid-cols-2">
          {manualGroups(confirmed, groupCount).map((ids, i) => (
            <div key={i} className="bg-surface px-5 py-3">
              <div className="font-display text-lg font-bold uppercase">Group {groupName(i)}</div>
              <ol className="mt-1 space-y-0.5 text-sm">
                {ids.map((id) => (
                  <li key={id}>{names.get(id)}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ) : (
        <ol className="divide-y divide-border">
          {round1.map(([a, b], i) => (
            <li key={i} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-5 py-2 text-sm">
              <span className="font-display text-base font-bold text-muted">{i + 1}</span>
              <span className={a ? "text-right font-medium" : "text-right text-muted"}>{a ?? "Bye"}</span>
              <span className="text-muted">v</span>
              <span className={b ? "font-medium" : "text-muted"}>{b ?? "Bye"}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
