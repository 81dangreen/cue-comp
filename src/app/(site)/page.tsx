import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { DISCIPLINES, FORMATS, type Discipline, type Format } from "@/lib/constants";
import { APP_NAME } from "@/lib/brand";
import { LogoMark } from "@/components/logo";
import { Badge, ButtonLink, Card, EmptyState, PageSkeleton, SectionTitle } from "@/components/ui";

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
      <div className="bg-felt relative overflow-hidden rounded-2xl px-6 py-8 shadow-lg ring-1 ring-black/10 sm:px-10 sm:py-12">
        <LogoMark className="pointer-events-none absolute -top-6 -right-6 h-48 w-48 opacity-20 sm:h-64 sm:w-64" />
        <p className="text-sm font-semibold tracking-[0.2em] text-pop uppercase">Live scores · brackets · results</p>
        <h1 className="mt-2 font-display text-5xl leading-none font-bold tracking-tight uppercase sm:text-7xl">Tournaments</h1>
        {live.length > 0 && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-live px-3 py-1 text-sm font-bold text-live-fg">
            <span className="live-dot h-2 w-2 rounded-full bg-white" />
            {live.length} in progress now
          </p>
        )}
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
              <Link key={t.id} href={`/t/${t.slug}`} className="group">
                <Card className="h-full overflow-hidden transition group-hover:-translate-y-0.5 group-hover:shadow-lg">
                  <div className="bg-felt flex items-start justify-between gap-2 px-5 py-4">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold tracking-[0.14em] text-pop uppercase">{t.organization.name}</p>
                      <h3 className="mt-0.5 font-display text-2xl leading-tight font-bold">{t.name}</h3>
                    </div>
                    {t.matches.length > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-live px-2.5 py-0.5 text-xs font-bold text-live-fg">
                        <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" /> LIVE
                      </span>
                    )}
                  </div>
                  <div className="p-5 pt-4">
                    <p className="text-sm text-muted">
                      {formatDate(t.startsAt)}
                      {t.venue && ` · ${t.venue.name}`}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Badge>{DISCIPLINES[t.discipline as Discipline] ?? t.discipline}</Badge>
                      <Badge>{FORMATS[t.format as Format] ?? t.format}</Badge>
                      <Badge>
                        {t._count.entries} {t.entryType === "PAIRS" ? "pairs" : "players"}
                      </Badge>
                    </div>
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
