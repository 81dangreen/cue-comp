import { notFound } from "next/navigation";
import { Suspense } from "react";
import { addEntries, confirmEntry, removeEntry, saveSeeds } from "@/actions/tournaments";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getTournamentFull, playerName } from "@/lib/queries";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
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
    where: { organizationId: user.organizationId, id: { notIn: [...enteredIds] } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const entries = [...t.entries].sort(
    (a, b) => (a.seed ?? 999) - (b.seed ?? 999) || playerName(a.player).localeCompare(playerName(b.player)),
  );
  const manual = t.seeding === "MANUAL";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Card>
        <CardHeader
          title={`Entries (${t.entries.length}${t.maxEntries ? ` / ${t.maxEntries}` : ""})`}
          subtitle={locked ? "The draw has been made — reset it to change entries." : manual ? "Manual seeding: enter seeds then save." : undefined}
        />
        {entries.length === 0 ? (
          <EmptyState title="No players entered yet" />
        ) : (
          <>
            {/* Seed inputs belong to the form below via the `form` attribute, so the
                per-row Confirm/Remove buttons can have their own forms without nesting. */}
            <ul className="divide-y divide-border">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-2.5">
                  {manual && (
                    <Input
                      form="seeds-form"
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
            {manual && !locked && (
              <ActionForm id="seeds-form" action={saveSeeds.bind(null, t.id)} className="border-t border-border p-4">
                <SubmitButton variant="secondary">Save seeds</SubmitButton>
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
              <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                {available.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-surface-2">
                    <input type="checkbox" name="playerId" value={p.id} />
                    {playerName(p)}
                  </label>
                ))}
              </div>
            )}
            <Field label="Or add a new player" hint="Creates the player in your database too">
              <Input name="newPlayer" placeholder="First Last" />
            </Field>
            <SubmitButton>Add to tournament</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
