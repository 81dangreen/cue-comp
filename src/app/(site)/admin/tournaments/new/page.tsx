import type { Metadata } from "next";
import { Suspense } from "react";
import { createTournament } from "@/actions/tournaments";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TournamentForm } from "@/components/tournament/tournament-form";
import { Card, PageHeader, PageSkeleton } from "@/components/ui";

export const metadata: Metadata = { title: "New tournament" };

export default function NewTournamentPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewTournament />
    </Suspense>
  );
}

async function NewTournament() {
  const user = await requireUser("ADMIN");
  const venues = await db.venue.findMany({
    where: { organizationId: user.organizationId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return (
    <div className="max-w-3xl">
      <PageHeader title="New tournament" />
      <Card className="p-6">
        <TournamentForm action={createTournament} venues={venues} submitLabel="Create tournament" defaults={{ venueId: venues[0]?.id }} />
      </Card>
    </div>
  );
}
