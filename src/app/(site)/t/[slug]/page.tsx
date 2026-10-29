import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { registerForTournament } from "@/actions/tournaments";
import { entryNames, getTournamentFull } from "@/lib/queries";
import { estimatedStarts } from "@/lib/timings";
import { loadTimingsInput } from "@/lib/timings-data";
import { ordinal } from "@/lib/results";
import { matchLabels, orderOfPlay, placings } from "@/lib/views";
import { ActionForm, SubmitButton } from "@/components/forms";
import { MatchRows, OrderOfPlay } from "@/components/tournament/order-of-play";
import { Card, CardHeader, cx, EmptyState, Field, Input, PageSkeleton, panel, SectionTitle } from "@/components/ui";

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
  // Estimated start times for what's coming up (worked out at request time, as they depend on the clock).
  await connection();
  const now = new Date();
  const starts = t.showStartTimes && (order.tables.length || order.queue.length) ? estimatedStarts(await loadTimingsInput(t, now)) : undefined;
  // Matches on a group's own table appear in that table's running order instead.
  const onGroupTables = new Set(order.tables.flatMap((g) => g.matches.map((m) => m.id)));
  const live = t.matches.filter((m) => m.status === "LIVE" && !onGroupTables.has(m.id));
  const recent = t.matches
    .filter((m) => m.status === "COMPLETED" && !m.isBye)
    .sort((a, b) => +(b.completedAt ?? 0) - +(a.completedAt ?? 0))
    .slice(0, 6);
  const ranks = t.status === "COMPLETED" ? placings(t) : new Map<string, number>();
  const podium = [...ranks.entries()].filter(([, r]) => r <= 4).sort((a, b) => a[1] - b[1]);

  return (
    <div className={t.registrationOpen ? "grid gap-6 lg:grid-cols-[1fr_20rem]" : "space-y-6"}>
      <div className="space-y-6">
        {podium.length > 0 && (
          <section>
            <SectionTitle>Final standings</SectionTitle>
            <ol className={cx(panel, "divide-y divide-border")}>
              {podium.map(([entryId, rank]) => (
                <li key={entryId} className="flex items-center gap-3 px-4 py-3">
                  <span className={`w-10 font-display text-lg font-bold ${rank === 1 ? "text-accent" : "text-muted"}`}>{ordinal(rank)}</span>
                  <span className="font-medium">{names.get(entryId)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {live.length > 0 && (
          <section>
            <SectionTitle>Live now</SectionTitle>
            <MatchRows matches={live} names={names} labels={labels} hrefFor={(m) => `/t/${t.slug}/matches/${m.id}`} />
          </section>
        )}

        {(order.tables.length > 0 || order.queue.length > 0) && (
          <section>
            <SectionTitle>Order of play</SectionTitle>
            <OrderOfPlay
              order={order}
              names={names}
              labels={labels}
              hrefFor={(m) => `/t/${t.slug}/matches/${m.id}`}
              starts={starts}
              now={now}
            />
          </section>
        )}

        {recent.length > 0 && (
          <section>
            <SectionTitle>Latest results</SectionTitle>
            <MatchRows matches={recent} names={names} labels={labels} hrefFor={(m) => `/t/${t.slug}/matches/${m.id}`} />
          </section>
        )}

        {t.description && (
          <section>
            <SectionTitle>About</SectionTitle>
            <p className={cx(panel, "px-4 py-4 text-sm whitespace-pre-line")}>{t.description}</p>
          </section>
        )}

        {!t.matches.length && !t.description && (
          <div className={panel}>
            <EmptyState title="The draw hasn't been made yet">
              <Link href={`/t/${t.slug}/players`} className="text-accent hover:underline">
                See who&apos;s entered
              </Link>
            </EmptyState>
          </div>
        )}
      </div>

      {/* Progress and venue live in the header; a sidebar appears only for signing up. */}
      {t.registrationOpen && (
        <aside className="space-y-6">
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
        </aside>
      )}
    </div>
  );
}
