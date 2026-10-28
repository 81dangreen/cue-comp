import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { registerForTournament } from "@/actions/tournaments";
import { entryNames, getTournamentFull } from "@/lib/queries";
import { ordinal } from "@/lib/results";
import { matchCounts, matchLabels, orderOfPlay, placings, raceText } from "@/lib/views";
import { ActionForm, SubmitButton } from "@/components/forms";
import { MatchCard } from "@/components/tournament/match-card";
import { OrderOfPlay } from "@/components/tournament/order-of-play";
import { Card, CardHeader, EmptyState, Field, Input, PageSkeleton, SectionTitle } from "@/components/ui";

export async function generateMetadata({ params }: PageProps<"/t/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTournamentFull({ slug });
  return { title: t?.name ?? "Tournament" };
}

export default function TournamentOverview({ params }: PageProps<"/t/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: PageProps<"/t/[slug]">["params"] }) {
  const { slug } = await params;
  const t = await getTournamentFull({ slug });
  if (!t || !t.isPublic) notFound();
  const names = entryNames(t.entries);
  const labels = matchLabels(t.matches, t.groups);
  const order = orderOfPlay(t);
  // Matches on a group's own table appear in that table's running order instead.
  const onGroupTables = new Set(order.tables.flatMap((g) => g.matches.map((m) => m.id)));
  const live = t.matches.filter((m) => m.status === "LIVE" && !onGroupTables.has(m.id));
  const recent = t.matches
    .filter((m) => m.status === "COMPLETED" && !m.isBye)
    .sort((a, b) => +(b.completedAt ?? 0) - +(a.completedAt ?? 0))
    .slice(0, 6);
  const counts = matchCounts(t);
  const ranks = t.status === "COMPLETED" ? placings(t) : new Map<string, number>();
  const podium = [...ranks.entries()].filter(([, r]) => r <= 4).sort((a, b) => a[1] - b[1]);
  const card = (m: (typeof t.matches)[number]) => (
    <MatchCard key={m.id} match={m} names={names} label={labels.get(m.id)} fluid raceText={raceText(t)} href={`/t/${t.slug}/matches/${m.id}`} />
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        {podium.length > 0 && (
          <Card>
            <CardHeader title="Final standings" />
            <ol className="divide-y divide-border">
              {podium.map(([entryId, rank]) => (
                <li key={entryId} className="flex items-center gap-3 px-5 py-3">
                  <span className={`w-10 font-bold ${rank === 1 ? "text-accent" : "text-muted"}`}>{ordinal(rank)}</span>
                  <span className="font-medium">{names.get(entryId)}</span>
                </li>
              ))}
            </ol>
          </Card>
        )}

        {live.length > 0 && (
          <section>
            <SectionTitle>Live now</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{live.map(card)}</div>
          </section>
        )}

        {(order.tables.length > 0 || order.queue.length > 0) && (
          <section>
            <SectionTitle>Order of play</SectionTitle>
            <OrderOfPlay order={order} names={names} labels={labels} hrefFor={(m) => `/t/${t.slug}/matches/${m.id}`} />
          </section>
        )}

        {recent.length > 0 && (
          <section>
            <SectionTitle>Latest results</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{recent.map(card)}</div>
          </section>
        )}

        {t.description && (
          <Card>
            <CardHeader title="About" />
            <p className="whitespace-pre-line px-5 py-4 text-sm">{t.description}</p>
          </Card>
        )}

        {!t.matches.length && !t.description && (
          <Card>
            <EmptyState title="The draw hasn't been made yet">
              <Link href={`/t/${t.slug}/players`} className="text-accent hover:underline">
                See who&apos;s entered
              </Link>
            </EmptyState>
          </Card>
        )}
      </div>

      <aside className="space-y-6">
        {t.matches.length > 0 && (
          <Card className="p-5">
            <div className="text-sm text-muted">Progress</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {counts.completed}/{counts.total}
              <span className="ml-1 text-sm font-normal text-muted">matches</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-accent" style={{ width: `${counts.total ? (counts.completed / counts.total) * 100 : 0}%` }} />
            </div>
          </Card>
        )}

        {t.registrationOpen && (
          <Card>
            <CardHeader title="Register" subtitle={t.entryFee ? `Entry fee: ${t.entryFee}` : undefined} />
            <ActionForm action={registerForTournament.bind(null, t.slug)} className="space-y-3 p-5" resetOnSuccess>
              <div className="grid grid-cols-2 gap-3">
                <Field label="First name">
                  <Input name="firstName" required autoComplete="given-name" />
                </Field>
                <Field label="Last name">
                  <Input name="lastName" required autoComplete="family-name" />
                </Field>
              </div>
              <Field label="Email">
                <Input name="email" type="email" required autoComplete="email" />
              </Field>
              <Field label="Phone (optional)">
                <Input name="phone" type="tel" autoComplete="tel" />
              </Field>
              <SubmitButton className="w-full" pendingText="Registering…">
                Register
              </SubmitButton>
            </ActionForm>
          </Card>
        )}

        {t.venue && (
          <Card className="p-5">
            <div className="text-sm text-muted">Venue</div>
            <div className="mt-1 font-medium">{t.venue.name}</div>
            {t.venue.address && <div className="text-sm text-muted">{t.venue.address}</div>}
          </Card>
        )}
      </aside>
    </div>
  );
}
