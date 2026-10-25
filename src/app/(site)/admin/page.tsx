import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { FORMATS, TOURNAMENT_STATUS, type Format, type TournamentStatus } from "@/lib/constants";
import { Badge, ButtonLink, Card, EmptyState, LiveBadge, PageHeader, PageSkeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Admin" };

export default function AdminHome() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const user = await requireUser();
  const tournaments = await db.tournament.findMany({
    where: { organizationId: user.organizationId },
    include: {
      _count: { select: { entries: true } },
      matches: { where: { status: "LIVE" }, select: { id: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return (
    <div>
      <PageHeader
        title="Tournaments"
        subtitle={user.organizationName}
        actions={<ButtonLink href="/admin/tournaments/new">New tournament</ButtonLink>}
      />
      <Card>
        {tournaments.length === 0 ? (
          <EmptyState title="No tournaments yet">
            Add some <Link href="/admin/players" className="text-accent hover:underline">players</Link> and a{" "}
            <Link href="/admin/venues" className="text-accent hover:underline">venue</Link>, then create your first tournament.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {tournaments.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/tournaments/${t.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-sm text-muted">
                      {t.startsAt?.toLocaleDateString("en-GB", { dateStyle: "medium" }) ?? "No date"} ·{" "}
                      {FORMATS[t.format as Format]} · {t._count.entries} entries
                    </div>
                  </div>
                  {t.matches.length > 0 && <LiveBadge />}
                  <Badge tone={t.status === "IN_PROGRESS" ? "accent" : "neutral"}>
                    {TOURNAMENT_STATUS[t.status as TournamentStatus]}
                  </Badge>
                  {!t.isPublic && <Badge tone="warn">Private</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
