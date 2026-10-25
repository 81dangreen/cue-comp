import { notFound } from "next/navigation";
import { Suspense } from "react";
import { addEntries, confirmEntry, removeEntry, saveEntries } from "@/actions/tournaments";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getTournamentFull, playerName } from "@/lib/queries";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { PlayerPicker } from "@/components/tournament/player-picker";
import { Badge, Card, CardHeader, EmptyState, Field, Input, PageSkeleton } from "@/components/ui";

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
  const enteredIds = new Set(t.entries.map((e) => e.playerId));
  const available = await db.player.findMany({
    where: { id: { notIn: [...enteredIds] } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, nickname: true, homeClub: true },
  });
  const entries = [...t.entries].sort(
    (a, b) => (a.seed ?? 999) - (b.seed ?? 999) || playerName(a.player).localeCompare(playerName(b.player)),
  );
  const manual = t.seeding === "MANUAL";
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
  const showSave = (manual && !locked) || handicapped;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Card>
        <CardHeader
          title={`Entries (${t.entries.length}${t.maxEntries ? ` / ${t.maxEntries}` : ""})`}
          subtitle={[
            locked ? "The draw has been made — reset it to change entries." : manual ? "Manual seeding: enter seeds then save." : null,
            handicapped
              ? "Ranks (1 = strongest) come from the player directory. Changing one here applies to this comp only, for matches that haven't started."
              : null,
          ]
            .filter(Boolean)
            .join(" ")}
        />
        {entries.length === 0 ? (
          <EmptyState title="No players entered yet" />
        ) : (
          <>
            {/* Seed and rank inputs belong to the form below via the `form` attribute, so the
                per-row Confirm/Remove buttons can have their own forms without nesting. */}
            <ul className="divide-y divide-border">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-2.5">
                  {manual && (
                    <Input
                      form="entries-form"
                      name={`seed-${e.id}`}
                      type="number"
                      min={1}
                      defaultValue={e.seed ?? ""}
                      disabled={locked}
                      className="w-16 py-1 text-center"
                      aria-label="Seed"
                      placeholder="–"
                    />
                  )}
                  <span className="flex-1 font-medium">{playerName(e.player)}</span>
                  {e.status === "REGISTERED" && (e.contactEmail || e.contactPhone) && (
                    <span className="text-xs text-muted">{[e.contactEmail, e.contactPhone].filter(Boolean).join(" · ")}</span>
                  )}
                  {handicapped && (
                    <label className="flex items-center gap-1.5 text-xs text-muted">
                      {e.rank && playerRanks.has(e.playerId) && e.rank !== playerRanks.get(e.playerId) ? (
                        <span className="font-semibold text-warn" title="Changed for this comp only">
                          Comp rank (ranked {playerRanks.get(e.playerId)})
                        </span>
                      ) : (
                        "Rank"
                      )}
                      <Input
                        form="entries-form"
                        name={`rank-${e.id}`}
                        type="number"
                        min={1}
                        defaultValue={e.rank ?? playerRanks.get(e.playerId) ?? ""}
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
                <SubmitButton variant="secondary">{handicapped ? (manual && !locked ? "Save seeds & ranks" : "Save ranks") : "Save seeds"}</SubmitButton>
              </ActionForm>
            )}
          </>
        )}
      </Card>

      {!locked && (
        <Card className="h-fit">
          <CardHeader title="Add players" />
          <ActionForm action={addEntries.bind(null, t.id)} className="space-y-4 p-5" resetOnSuccess>
            {available.length > 0 && (
              <PlayerPicker
                players={available.map((p) => ({
                  id: p.id,
                  name: playerName(p),
                  detail: [p.nickname && `“${p.nickname}”`, p.homeClub].filter(Boolean).join(" · ") || null,
                }))}
              />
            )}
            <Field label="Or add a new player" hint="Adds them to the shared player directory too">
              <Input name="newPlayer" placeholder="First Last" />
            </Field>
            <SubmitButton>Add to tournament</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
