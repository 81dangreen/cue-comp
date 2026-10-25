import { notFound } from "next/navigation";
import { Suspense } from "react";
import { entryNames, getTournamentFull } from "@/lib/queries";
import { groupsWithStandings } from "@/lib/views";
import { BracketView } from "@/components/tournament/bracket";
import { GroupTable } from "@/components/tournament/group-tables";
import { Card, EmptyState, PageSkeleton } from "@/components/ui";

export default function BracketPage({ params }: PageProps<"/t/[slug]/bracket">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Bracket params={params} />
    </Suspense>
  );
}

async function Bracket({ params }: { params: PageProps<"/t/[slug]/bracket">["params"] }) {
  const { slug } = await params;
  const t = await getTournamentFull({ slug });
  if (!t || !t.isPublic) notFound();
  const names = entryNames(t.entries);
  const groups = groupsWithStandings(t);
  const ko = t.matches.filter((m) => m.bracket !== "GROUP");

  if (!t.matches.length) {
    return (
      <Card>
        <EmptyState title="The draw hasn't been made yet" />
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {groups.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map(({ group, rows }) => (
            <GroupTable
              key={group.id}
              name={group.name}
              rows={rows}
              names={names}
              qualifiers={t.format === "GROUPS_KO" ? t.qualifiersPerGroup ?? 2 : 0}
            />
          ))}
        </div>
      )}
      {ko.length > 0 && (
        <div>
          {groups.length > 0 && <h2 className="mb-4 text-lg font-semibold">Knockout</h2>}
          <BracketView matches={ko} names={names} />
        </div>
      )}
      {groups.length > 0 && !ko.length && t.format === "GROUPS_KO" && (
        <p className="text-sm text-muted">The knockout bracket will appear once the group stage is complete.</p>
      )}
    </div>
  );
}
