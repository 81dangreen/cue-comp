import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { TOURNAMENT_STATUS, FORMATS, type Format, type TournamentStatus } from "@/lib/constants";
import { getTournamentFull } from "@/lib/queries";
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
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={t.status === "IN_PROGRESS" ? "accent" : "neutral"}>{TOURNAMENT_STATUS[t.status as TournamentStatus]}</Badge>
            <Badge>{FORMATS[t.format as Format]}</Badge>
            <Badge>Race to {t.raceTo}</Badge>
            {t.registrationOpen && <Badge tone="accent">Registration open</Badge>}
            <LiveRefresher tournamentId={t.id} />
          </div>
        </div>
        <ButtonLink href={`/t/${t.slug}`} variant="secondary" target="_blank">
          Public page ↗
        </ButtonLink>
      </div>
      <div className="mt-5">
        <TabNav
          tabs={[
            { href: base, label: "Control room" },
            { href: `${base}/entries`, label: `Entries (${t.entries.length})` },
            ...(t.matches.length ? [{ href: `${base}/bracket`, label: "Bracket" }] : []),
            { href: `${base}/settings`, label: "Settings" },
          ]}
        />
      </div>
    </div>
  );
}
