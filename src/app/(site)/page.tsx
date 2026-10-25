import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { DISCIPLINES, FORMATS, type Discipline, type Format } from "@/lib/constants";
import { APP_NAME } from "@/lib/brand";
import { Badge, ButtonLink, Card, EmptyState, LiveBadge, PageSkeleton, SectionTitle } from "@/components/ui";

export default function Home() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TournamentDirectory />
    </Suspense>
  );
}

function formatDate(d: Date | null) {
  return d ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Date TBC";
}

async function TournamentDirectory() {
  const userCount = await db.user.count();
  if (userCount === 0) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-2xl font-bold">Welcome to {APP_NAME}</h1>
        <p className="mt-2 text-muted">Set up your organisation to start running tournaments.</p>
        <ButtonLink href="/setup" className="mt-6">
          Get started
        </ButtonLink>
      </Card>
    );
  }

  const tournaments = await db.tournament.findMany({
    where: { isPublic: true, status: { not: "DRAFT" } },
    include: {
      venue: true,
      organization: true,
      _count: { select: { entries: { where: { status: "CONFIRMED" } } } },
      matches: { where: { status: "LIVE" }, select: { id: true } },
    },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  const live = tournaments.filter((t) => t.status === "IN_PROGRESS");
  const upcoming = tournaments.filter((t) => t.status === "REGISTRATION");
  const finished = tournaments.filter((t) => t.status === "COMPLETED");

  const sections = [
    { title: "In progress", items: live },
    { title: "Open for registration", items: upcoming },
    { title: "Results", items: finished },
  ].filter((s) => s.items.length);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tournaments</h1>
        <p className="mt-1 text-muted">Live scores, brackets and results.</p>
      </div>
      {sections.length === 0 && (
        <Card>
          <EmptyState title="No public tournaments yet">Organisers can create one from the admin area.</EmptyState>
        </Card>
      )}
      {sections.map((section) => (
        <section key={section.title}>
          <SectionTitle>{section.title}</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {section.items.map((t) => (
              <Link key={t.id} href={`/t/${t.slug}`}>
                <Card className="h-full p-5 transition hover:border-accent hover:ring-1 hover:ring-accent">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-lg font-semibold">{t.name}</h3>
                    {t.matches.length > 0 && <LiveBadge />}
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {formatDate(t.startsAt)}
                    {t.venue && ` · ${t.venue.name}`}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge>{DISCIPLINES[t.discipline as Discipline] ?? t.discipline}</Badge>
                    <Badge>{FORMATS[t.format as Format] ?? t.format}</Badge>
                    <Badge>{t._count.entries} players</Badge>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
