import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { DISCIPLINES, FORMATS, type Discipline, type Format } from "@/lib/constants";
import { APP_NAME } from "@/lib/brand";
import { LogoMark } from "@/components/logo";
import { Badge, ButtonLink, Card, cx, EmptyState, PageSkeleton, panel, SectionTitle } from "@/components/ui";

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
    <div className="space-y-8">
      <div className="bg-felt full-bleed relative -mt-8 overflow-hidden">
        <LogoMark className="pointer-events-none absolute -top-6 right-[max(-1.5rem,calc(50%-40rem))] h-48 w-48 opacity-20 sm:h-64 sm:w-64" />
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:py-12">
          <p className="text-sm font-semibold tracking-[0.2em] text-pop uppercase">Live scores · brackets · results</p>
          <h1 className="mt-2 font-display text-5xl leading-none font-bold tracking-tight uppercase sm:text-7xl">Tournaments</h1>
          {live.length > 0 && (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-live px-3 py-1 text-sm font-bold text-live-fg">
              <span className="live-dot h-2 w-2 rounded-full bg-white" />
              {live.length} in progress now
            </p>
          )}
        </div>
      </div>
      {sections.length === 0 && (
        <Card>
          <EmptyState title="No public tournaments yet">Organisers can create one from the admin area.</EmptyState>
        </Card>
      )}
      {sections.map((section) => (
        <section key={section.title}>
          <SectionTitle>{section.title}</SectionTitle>
          {/* One row per tournament: name and club, then when and where, then what it is. */}
          <ul className={cx(panel, "divide-y divide-border")}>
            {section.items.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/t/${t.slug}`}
                  className="grid gap-x-6 gap-y-1.5 px-4 py-3.5 hover:bg-surface-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold tracking-[0.12em] text-accent uppercase">{t.organization.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="truncate font-display text-xl leading-tight font-bold sm:text-2xl">{t.name}</span>
                      {t.matches.length > 0 && (
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-live px-2 py-0.5 text-[11px] font-bold text-live-fg">
                          <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" /> LIVE
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="text-sm text-muted">
                    {formatDate(t.startsAt)}
                    {t.venue && ` · ${t.venue.name}`}
                  </span>
                  <span className="flex flex-wrap gap-1.5 md:justify-end">
                    <Badge>{DISCIPLINES[t.discipline as Discipline] ?? t.discipline}</Badge>
                    <Badge>{FORMATS[t.format as Format] ?? t.format}</Badge>
                    <Badge>
                      {t._count.entries} {t.entryType === "PAIRS" ? "pairs" : "players"}
                    </Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
