import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DISCIPLINES, FORMATS, TOURNAMENT_STATUS, type Discipline, type Format, type TournamentStatus } from "@/lib/constants";
import { HANDICAP_STYLES, type HandicapStyle } from "@/lib/handicap";
import { getTournamentFull } from "@/lib/queries";
import { LiveRefresher } from "@/components/live-refresher";
import { TabNav } from "@/components/tab-nav";
import { Badge, Card, Skeleton } from "@/components/ui";

export default function TournamentLayout({ children, params }: LayoutProps<"/t/[slug]">) {
  return (
    <div>
      <Suspense fallback={<Skeleton className="mb-6 h-48 w-full" />}>
        <Header params={params} />
      </Suspense>
      <div className="mt-6">{children}</div>
    </div>
  );
}

async function Header({ params }: { params: LayoutProps<"/t/[slug]">["params"] }) {
  const { slug } = await params;
  const t = await getTournamentFull({ slug });
  if (!t || !t.isPublic) notFound();
  const base = `/t/${t.slug}`;
  const confirmed = t.entries.filter((e) => e.status === "CONFIRMED").length;
  const hasDraw = t.matches.length > 0;
  const facts: [string, string][] = [
    ["Discipline", DISCIPLINES[t.discipline as Discipline] ?? t.discipline],
    ["Format", FORMATS[t.format as Format] ?? t.format],
    ["Race to", t.raceToFinal ? `${t.raceTo} (final ${t.raceToFinal})` : String(t.raceTo)],
    ["Players", t.maxEntries ? `${confirmed} / ${t.maxEntries}` : String(confirmed)],
    ["Entry fee", t.entryFee || "None"],
    ...(t.handicapStyle ? ([["Handicap", HANDICAP_STYLES[t.handicapStyle as HandicapStyle] ?? "Yes"]] as [string, string][]) : []),
  ];

  return (
    <div>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted">{t.organization.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.name}</h1>
              <Badge tone={t.status === "IN_PROGRESS" ? "accent" : t.status === "REGISTRATION" ? "warn" : "neutral"}>
                {TOURNAMENT_STATUS[t.status as TournamentStatus] ?? t.status}
              </Badge>
            </div>
            <p className="mt-2 text-[15px] text-muted">
              {t.startsAt?.toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" }) ?? "Date TBC"}
              {t.venue && ` · ${t.venue.name}`}
            </p>
          </div>
          {t.status === "IN_PROGRESS" && <LiveRefresher tournamentId={t.id} />}
        </div>
        <dl className="grid grid-cols-2 border-t border-border bg-surface-2 sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none">
          {facts.map(([label, value]) => (
            <div key={label} className="px-5 py-3 sm:px-6">
              <dt className="text-xs font-medium text-muted">{label}</dt>
              <dd className="mt-0.5 font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <div className="mt-4">
        <TabNav
          tabs={[
            { href: base, label: "Overview" },
            ...(hasDraw ? [{ href: `${base}/bracket`, label: t.groups.length ? "Groups & bracket" : "Bracket" }] : []),
            ...(hasDraw ? [{ href: `${base}/matches`, label: "Matches" }] : []),
            { href: `${base}/players`, label: "Players" },
          ]}
        />
      </div>
    </div>
  );
}
