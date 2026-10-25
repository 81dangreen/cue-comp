import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deletePlayer, mergePlayer, savePlayerRanks, updatePlayer } from "@/actions/players";
import { requireUser } from "@/lib/auth";
import { DISCIPLINES, type Discipline } from "@/lib/constants";
import { db } from "@/lib/db";
import { playerName } from "@/lib/queries";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { Badge, ButtonLink, Card, CardHeader, Field, Input, PageHeader, PageSkeleton, Select } from "@/components/ui";

export default function EditPlayerPage({ params }: PageProps<"/admin/players/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditPlayer params={params} />
    </Suspense>
  );
}

async function EditPlayer({ params }: { params: PageProps<"/admin/players/[id]">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  const player = await db.player.findUnique({
    where: { id },
    include: {
      entries: { include: { tournament: { include: { organization: true } } }, orderBy: { createdAt: "desc" } },
      ranks: true,
      organization: true,
    },
  });
  if (!player) notFound();
  const admin = user.directoryAdmin;
  // Merge candidates: others sharing the surname, the usual shape of a duplicate.
  const duplicates = admin
    ? await db.player.findMany({
        where: { id: { not: player.id }, lastName: { equals: player.lastName, mode: "insensitive" } },
        orderBy: { firstName: "asc" },
        include: { _count: { select: { entries: true } } },
      })
    : [];
  const subtitle = [player.nickname && `“${player.nickname}”`, player.homeClub, player.country].filter(Boolean).join(" · ");

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={playerName(player)}
        subtitle={subtitle || undefined}
        actions={
          <ButtonLink href={`/players/${player.id}`} variant="secondary">
            Public profile
          </ButtonLink>
        }
      />
      <div className="space-y-6">
        {admin ? (
          <Card>
            <CardHeader title="Details" subtitle="Contact details are visible to directory admins only." />
            <ActionForm action={updatePlayer.bind(null, player.id)} className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="First name">
                <Input name="firstName" defaultValue={player.firstName} required />
              </Field>
              <Field label="Last name">
                <Input name="lastName" defaultValue={player.lastName} required />
              </Field>
              <Field label="Nickname">
                <Input name="nickname" defaultValue={player.nickname ?? ""} />
              </Field>
              <Field label="Home club">
                <Input name="homeClub" defaultValue={player.homeClub ?? ""} />
              </Field>
              <Field label="Country">
                <Input name="country" defaultValue={player.country ?? ""} />
              </Field>
              <div />
              <Field label="Email">
                <Input name="email" type="email" defaultValue={player.email ?? ""} />
              </Field>
              <Field label="Phone">
                <Input name="phone" defaultValue={player.phone ?? ""} />
              </Field>
              <div className="flex items-center justify-between gap-4 sm:col-span-2">
                <SubmitButton>Save</SubmitButton>
                {player.organization && <span className="text-xs text-muted">First added by {player.organization.name}</span>}
              </div>
            </ActionForm>
          </Card>
        ) : (
          <Card className="p-5 text-sm text-muted">
            Player records and rankings are shared across all organisers and managed by directory admins. To use a different rank
            in one of your comps, change it on that tournament&apos;s entries page: it won&apos;t affect the player&apos;s ranking.
          </Card>
        )}

        <Card>
          <CardHeader title="Handicap ranks" subtitle="1 is the strongest. Used by handicapped comps in each discipline." />
          {admin ? (
            <ActionForm action={savePlayerRanks.bind(null, player.id)} className="p-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Object.entries(DISCIPLINES).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <Input
                      name={`rank-${key}`}
                      type="number"
                      min={1}
                      max={999}
                      defaultValue={player.ranks.find((r) => r.discipline === key)?.rank ?? ""}
                    />
                  </Field>
                ))}
              </div>
              <SubmitButton className="mt-4">Save ranks</SubmitButton>
            </ActionForm>
          ) : (
            <div className="flex flex-wrap gap-2 p-5">
              {player.ranks.length === 0 && <span className="text-sm text-muted">Not ranked yet.</span>}
              {player.ranks.map((r) => (
                <Badge key={r.discipline} tone="accent">
                  {DISCIPLINES[r.discipline as Discipline] ?? r.discipline}: Rank {r.rank}
                </Badge>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Competitions" subtitle="Every comp this player has entered, with any organiser." />
          {player.entries.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">Not entered in any competitions yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {player.entries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                  {e.tournament.organizationId === user.organizationId ? (
                    <Link href={`/admin/tournaments/${e.tournamentId}`} className="font-medium hover:text-accent">
                      {e.tournament.name}
                    </Link>
                  ) : e.tournament.isPublic ? (
                    <Link href={`/t/${e.tournament.slug}`} className="font-medium hover:text-accent">
                      {e.tournament.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{e.tournament.name}</span>
                  )}
                  <span className="text-muted">{e.tournament.organization.name}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Always mounted for admins, so the result message survives the last duplicate disappearing. */}
        {admin && (
          <Card>
            <CardHeader
              title="Merge a duplicate into this player"
              subtitle="Moves the other record's competitions and any ranks this player lacks onto this one, then deletes it."
            />
            <ActionForm action={mergePlayer.bind(null, player.id)} className="flex flex-wrap items-end gap-3 p-5">
              {duplicates.length === 0 ? (
                <p className="text-sm text-muted">No other players share this surname.</p>
              ) : (
                <>
                  <Field label="Duplicate record">
                    <Select name="sourceId" required defaultValue="">
                      <option value="" disabled>
                        Choose…
                      </option>
                      {duplicates.map((d) => (
                        <option key={d.id} value={d.id}>
                          {playerName(d)}
                          {d.homeClub ? ` (${d.homeClub})` : ""} · {d._count.entries} comps
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <SubmitButton variant="secondary">Merge into {player.firstName}</SubmitButton>
                </>
              )}
            </ActionForm>
          </Card>
        )}

        {admin && player.entries.length === 0 && (
          <form action={deletePlayer.bind(null, player.id)}>
            <ConfirmButton variant="danger" message={`Delete ${playerName(player)} from the directory?`}>
              Delete player
            </ConfirmButton>
          </form>
        )}
      </div>
    </div>
  );
}
