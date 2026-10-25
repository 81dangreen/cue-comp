import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deletePlayer, updatePlayer } from "@/actions/players";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { playerName } from "@/lib/queries";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { ButtonLink, Card, CardHeader, Field, Input, PageHeader, PageSkeleton } from "@/components/ui";

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
  const player = await db.player.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { entries: { include: { tournament: true }, orderBy: { createdAt: "desc" } } },
  });
  if (!player) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={playerName(player)}
        actions={
          <ButtonLink href={`/players/${player.id}`} variant="secondary">
            Public profile
          </ButtonLink>
        }
      />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Details" />
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
            <Field label="Country">
              <Input name="country" defaultValue={player.country ?? ""} />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" defaultValue={player.email ?? ""} />
            </Field>
            <Field label="Phone">
              <Input name="phone" defaultValue={player.phone ?? ""} />
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton>Save</SubmitButton>
            </div>
          </ActionForm>
        </Card>

        <Card>
          <CardHeader title="Tournaments" />
          {player.entries.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">Not entered in any tournaments.</p>
          ) : (
            <ul className="divide-y divide-border">
              {player.entries.map((e) => (
                <li key={e.id} className="px-5 py-2.5 text-sm">
                  <Link href={`/admin/tournaments/${e.tournamentId}`} className="hover:text-accent">
                    {e.tournament.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {player.entries.length === 0 && (
          <form action={deletePlayer.bind(null, player.id)}>
            <ConfirmButton variant="danger" message={`Delete ${playerName(player)}?`}>
              Delete player
            </ConfirmButton>
          </form>
        )}
      </div>
    </div>
  );
}
