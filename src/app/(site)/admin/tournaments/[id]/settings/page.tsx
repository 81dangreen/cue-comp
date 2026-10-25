import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deleteTournament, updateTournament } from "@/actions/tournaments";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ConfirmButton } from "@/components/forms";
import { TournamentForm } from "@/components/tournament/tournament-form";
import { Card, CardHeader, PageSkeleton } from "@/components/ui";

export default function SettingsPage({ params }: PageProps<"/admin/tournaments/[id]/settings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings params={params} />
    </Suspense>
  );
}

/** Format a Date for <input type="datetime-local"> in server local time. */
function toLocalInput(d: Date | null) {
  if (!d) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function Settings({ params }: { params: PageProps<"/admin/tournaments/[id]/settings">["params"] }) {
  const user = await requireUser("ADMIN");
  const { id } = await params;
  const t = await db.tournament.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { _count: { select: { matches: true } } },
  });
  if (!t) notFound();
  const venues = await db.venue.findMany({
    where: { organizationId: user.organizationId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <Card className="p-6">
        <TournamentForm
          action={updateTournament.bind(null, t.id)}
          venues={venues}
          submitLabel="Save settings"
          lockStructure={t._count.matches > 0}
          defaults={{ ...t, startsAt: toLocalInput(t.startsAt) }}
        />
      </Card>
      {user.role === "OWNER" && (
        <Card>
          <CardHeader title="Danger zone" />
          <form action={deleteTournament.bind(null, t.id)} className="p-5">
            <ConfirmButton variant="danger" message={`Permanently delete “${t.name}” and all its results?`}>
              Delete tournament
            </ConfirmButton>
          </form>
        </Card>
      )}
    </div>
  );
}
