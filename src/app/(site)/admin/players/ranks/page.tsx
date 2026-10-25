import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { saveDisciplineRanks } from "@/actions/players";
import { requireUser } from "@/lib/auth";
import { DISCIPLINES, type Discipline } from "@/lib/constants";
import { db } from "@/lib/db";
import { playerName } from "@/lib/queries";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, cx, EmptyState, Input, PageHeader, PageSkeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Handicap ranks" };

export default function RanksPage({ searchParams }: PageProps<"/admin/players/ranks">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Ranks searchParams={searchParams} />
    </Suspense>
  );
}

async function Ranks({ searchParams }: { searchParams: PageProps<"/admin/players/ranks">["searchParams"] }) {
  const user = await requireUser();
  if (!user.directoryAdmin) {
    return (
      <Card className="max-w-xl">
        <EmptyState title="Rankings are managed by directory admins">
          To use a different rank in one of your comps, change it on that tournament&apos;s entries page.
        </EmptyState>
      </Card>
    );
  }
  const { discipline: raw, q } = await searchParams;
  const discipline: Discipline = typeof raw === "string" && raw in DISCIPLINES ? (raw as Discipline) : "EIGHT_BALL";
  const query = typeof q === "string" ? q.trim() : "";
  const contains = { contains: query, mode: "insensitive" as const };
  const players = await db.player.findMany({
    where: query ? { OR: [{ firstName: contains }, { lastName: contains }, { homeClub: contains }] } : {},
    include: { ranks: { where: { discipline } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const ranked = players.filter((p) => p.ranks.length).length;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Handicap ranks"
        subtitle="Rankings for the whole player directory. 1 is the strongest; handicapped comps use the rank for their discipline. Leave blank for unranked players."
      />
      <nav className="mb-4 flex flex-wrap gap-2">
        {Object.entries(DISCIPLINES).map(([key, label]) => (
          <Link
            key={key}
            href={`/admin/players/ranks?discipline=${key}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
            className={cx(
              "rounded-full border px-3 py-1 text-sm font-medium",
              key === discipline ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface hover:bg-surface-2",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form className="mb-4">
        <input type="hidden" name="discipline" value={discipline} />
        <Input name="q" defaultValue={query} placeholder="Filter by name or home club…" />
      </form>
      <Card>
        {players.length === 0 ? (
          <EmptyState title={query ? "No players match" : "No players yet"}>
            {query ? "Try a different search." : "Add players first, then rank them here."}
          </EmptyState>
        ) : (
          // Keyed by discipline so switching tabs resets the boxes to that discipline's saved ranks.
          <ActionForm key={discipline + query} action={saveDisciplineRanks.bind(null, discipline)} className="p-5">
            <p className="mb-3 text-sm text-muted">
              {DISCIPLINES[discipline]}: {ranked} of {players.length} {query ? "matching " : ""}players ranked
            </p>
            <ul className="divide-y divide-border">
              {players.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-4 py-2">
                  <label htmlFor={`rank-${p.id}`} className="font-medium">
                    {playerName(p)}
                    {p.homeClub && <span className="ml-2 text-sm font-normal text-muted">{p.homeClub}</span>}
                  </label>
                  <Input
                    id={`rank-${p.id}`}
                    name={`rank-${p.id}`}
                    type="number"
                    min={1}
                    max={999}
                    defaultValue={p.ranks[0]?.rank ?? ""}
                    className="w-24 text-center"
                    aria-label={`${playerName(p)} rank`}
                  />
                </li>
              ))}
            </ul>
            <SubmitButton className="mt-4">Save {DISCIPLINES[discipline]} ranks</SubmitButton>
          </ActionForm>
        )}
      </Card>
    </div>
  );
}
