import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DISCIPLINES, FORMATS, TOURNAMENT_STATUS, type Discipline, type Format, type TournamentStatus } from "@/lib/constants";
import { HANDICAP_STYLES, type HandicapStyle } from "@/lib/handicap";
import { getTournamentFull } from "@/lib/queries";
import { formatSummary } from "@/lib/views";
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
  const facts: [string, string][] = [
    ["Discipline", DISCIPLINES[t.discipline as Discipline] ?? t.discipline],
    ["Format", `${FORMATS[t.format as Format] ?? t.format}${pairs ? " · pairs" : ""}${t.plateQualifiers ? " + plate" : ""}`],
    ["Matches", formatSummary(t)],
    [pairs ? "Pairs" : "Players", t.maxEntries ? `${confirmed} / ${t.maxEntries}` : String(confirmed)],
    ["Entry fee", t.entryFee || "None"],
    ...(t.handicapStyle ? ([["Handicap", HANDICAP_STYLES[t.handicapStyle as HandicapStyle] ?? "Yes"]] as [string, string][]) : []),
  ];

  const live = t.matches.filter((m) => m.status === "LIVE").length;

  return (
    <div>
      <div className="bg-felt overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/10">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-7">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-[0.18em] text-pop uppercase">{t.organization.name}</p>
            <h1 className="mt-1 font-display text-4xl leading-none font-bold tracking-tight sm:text-6xl">{t.name}</h1>
            <p className="mt-3 text-[15px] text-white/80">
              {t.startsAt?.toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" }) ?? "Date TBC"}
              {t.venue && ` · ${t.venue.name}`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
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
        <dl className="grid grid-cols-2 border-t border-white/10 bg-black/20 sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none">
          {facts.map(([label, value]) => (
            <div key={label} className="px-5 py-3 sm:px-7">
              <dt className="text-[11px] font-semibold tracking-[0.14em] text-white/60 uppercase">{label}</dt>
              <dd className="mt-0.5 font-semibold text-white">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-4">
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
  );
}
