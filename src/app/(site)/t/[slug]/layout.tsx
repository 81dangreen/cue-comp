import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DISCIPLINES, FORMATS, TOURNAMENT_STATUS, type Discipline, type Format, type TournamentStatus } from "@/lib/constants";
import { HANDICAP_STYLES, type HandicapStyle } from "@/lib/handicap";
import { getTournamentFull } from "@/lib/queries";
import { formatSummary, matchCounts } from "@/lib/views";
import { LiveRefresher } from "@/components/live-refresher";
import { TabNav } from "@/components/tab-nav";
import { cx, Skeleton } from "@/components/ui";

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
  const pairs = t.entryType === "PAIRS";
  const counts = matchCounts(t);
  const facts: [string, string][] = [
    ...(hasDraw ? ([["Played", `${counts.completed} / ${counts.total} matches`]] as [string, string][]) : []),
    ["Discipline", DISCIPLINES[t.discipline as Discipline] ?? t.discipline],
    ["Format", `${FORMATS[t.format as Format] ?? t.format}${pairs ? " · pairs" : ""}${t.plateQualifiers ? " + plate" : ""}`],
    ["Matches", formatSummary(t)],
    [pairs ? "Pairs" : "Players", t.maxEntries ? `${confirmed} / ${t.maxEntries}` : String(confirmed)],
    ...(t.entryFee ? ([["Entry fee", t.entryFee]] as [string, string][]) : []),
    ...(t.handicapStyle ? ([["Handicap", HANDICAP_STYLES[t.handicapStyle as HandicapStyle] ?? "Yes"]] as [string, string][]) : []),
  ];

  const live = t.matches.filter((m) => m.status === "LIVE").length;

  return (
    // Header and tabs are full-width bands; their content lines up with the page's content column.
    <div className="-mt-8">
      <div className="bg-felt full-bleed">
        <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3 px-4 py-5 sm:gap-4 sm:py-8">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-[0.18em] text-pop uppercase">{t.organization.name}</p>
            <h1 className="mt-1 font-display text-4xl leading-none font-bold tracking-tight sm:text-6xl">{t.name}</h1>
            <p className="mt-3 text-[15px] text-white/80">
              {t.startsAt?.toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" }) ?? "Date TBC"}
              {t.venue && ` · ${t.venue.name}`}
              {t.venue?.address && <span className="text-white/60">, {t.venue.address}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
            {live > 0 ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-live px-3 py-1 text-sm font-bold text-live-fg shadow">
                <span className="live-dot h-2 w-2 rounded-full bg-white" /> {live} live now
              </span>
            ) : (
              <span
                className={cx(
                  "rounded-full px-3 py-1 text-sm font-bold",
                  t.status === "IN_PROGRESS" || t.status === "REGISTRATION" ? "bg-pop text-pop-fg" : "bg-white/15 text-white",
                )}
              >
                {TOURNAMENT_STATUS[t.status as TournamentStatus] ?? t.status}
              </span>
            )}
            {t.status === "IN_PROGRESS" && <LiveRefresher tournamentId={t.id} onDark />}
          </div>
        </div>
        <div className="border-t border-white/10 bg-black/20">
          <dl className="mx-auto grid max-w-7xl grid-cols-2 px-4 sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none">
            {facts.map(([label, value]) => (
              <div key={label} className="py-2 pr-4 sm:py-3">
                <dt className="text-[10px] font-semibold tracking-[0.14em] text-white/60 uppercase sm:text-[11px]">{label}</dt>
                <dd className="mt-0.5 text-sm leading-snug font-semibold text-white sm:text-base">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        {/* How far through the event we are, as a bar along the bottom edge. */}
        {hasDraw && (
          <div className="h-1.5 bg-black/30" role="progressbar" aria-label="Matches played" aria-valuenow={counts.completed} aria-valuemax={counts.total}>
            <div className="h-full bg-pop transition-[width]" style={{ width: `${counts.total ? (counts.completed / counts.total) * 100 : 0}%` }} />
          </div>
        )}
      </div>
      <div className="full-bleed border-b border-border bg-surface">
        <div className="mx-auto max-w-7xl px-4 [&_nav]:border-b-0">
          <TabNav
          tabs={[
            { href: base, label: "Overview" },
            ...(hasDraw ? [{ href: `${base}/bracket`, label: t.groups.length ? "Groups & bracket" : "Bracket" }] : []),
            ...(hasDraw ? [{ href: `${base}/matches`, label: "Matches" }] : []),
            { href: `${base}/players`, label: pairs ? "Pairs" : "Players" },
          ]}
          />
        </div>
      </div>
    </div>
  );
}
