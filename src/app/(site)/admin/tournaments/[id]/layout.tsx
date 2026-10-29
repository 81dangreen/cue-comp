import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { TOURNAMENT_STATUS, FORMATS, type Format, type TournamentStatus } from "@/lib/constants";
import { getTournamentFull } from "@/lib/queries";
import { formatSummary } from "@/lib/views";
import { LiveRefresher } from "@/components/live-refresher";
import { TabNav } from "@/components/tab-nav";
import { Badge, ButtonLink, Skeleton } from "@/components/ui";

export default function AdminTournamentLayout({ children, params }: LayoutProps<"/admin/tournaments/[id]">) {
  return (
    <div>
      <Suspense fallback={<Skeleton className="mb-6 h-20 w-full" />}>
        <Header params={params} />
      </Suspense>
      <div className="mt-6">{children}</div>
    </div>
  );
}

async function Header({ params }: { params: LayoutProps<"/admin/tournaments/[id]">["params"] }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const t = await getTournamentFull({ id });
  if (!t || !user || t.organizationId !== user.organizationId) notFound();
  const base = `/admin/tournaments/${t.id}`;

  return (
    // Full-width bands like the public page: the tournament in a felt header, then its tabs.
    <div className="-mt-6">
      <div className="bg-felt full-bleed">
        <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-4 px-4 py-5 sm:py-6">
          <div className="min-w-0">
            <h1 className="font-display text-3xl leading-none font-bold tracking-tight sm:text-4xl">{t.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Badge tone={t.status === "IN_PROGRESS" ? "pop" : "neutral"}>{TOURNAMENT_STATUS[t.status as TournamentStatus]}</Badge>
              <Badge>{FORMATS[t.format as Format]}</Badge>
              {t.entryType === "PAIRS" && <Badge>Pairs</Badge>}
              <Badge>{formatSummary(t)}</Badge>
              {t.registrationOpen && <Badge tone="pop">Registration open</Badge>}
              <LiveRefresher tournamentId={t.id} onDark />
            </div>
          </div>
          <ButtonLink href={`/t/${t.slug}`} variant="secondary" target="_blank">
            Public page ↗
          </ButtonLink>
        </div>
      </div>
      <div className="full-bleed border-b border-border bg-surface">
        <div className="mx-auto max-w-7xl px-4 [&_nav]:border-b-0">
          <TabNav
            tabs={[
              { href: base, label: "Control room" },
              { href: `${base}/entries`, label: `${t.entryType === "PAIRS" ? "Pairs" : "Entries"} (${t.entries.length})` },
              ...(t.matches.length
                ? [
                    { href: `${base}/bracket`, label: "Bracket" },
                    { href: `${base}/timings`, label: "Timings" },
                  ]
                : []),
              { href: `${base}/settings`, label: "Settings" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
