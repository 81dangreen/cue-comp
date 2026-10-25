import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { entryNames, getTournamentFull } from "@/lib/queries";
import { groupsWithStandings } from "@/lib/views";
import { BracketView } from "@/components/tournament/bracket";
import { GroupTable } from "@/components/tournament/group-tables";
import { MatchList } from "@/components/tournament/match-list";
import { Card, CardHeader, PageSkeleton } from "@/components/ui";

export default function AdminBracketPage({ params }: PageProps<"/admin/tournaments/[id]/bracket">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminBracket params={params} />
    </Suspense>
  );
}

async function AdminBracket({ params }: { params: PageProps<"/admin/tournaments/[id]/bracket">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  const t = await getTournamentFull({ id });
  if (!t || t.organizationId !== user.organizationId) notFound();
  const names = entryNames(t.entries);
  const groups = groupsWithStandings(t);
  const ko = t.matches.filter((m) => m.bracket !== "GROUP");
  const linkFor = (m: { id: string; entry1Id: string | null; entry2Id: string | null; isBye: boolean }) =>
    m.entry1Id && m.entry2Id && !m.isBye ? `/score/${m.id}` : undefined;

  return (
    <div className="space-y-8">
      {groups.map(({ group, rows, matches }) => (
        <div key={group.id} className="grid gap-4 lg:grid-cols-2">
          <GroupTable name={group.name} rows={rows} names={names} qualifiers={t.format === "GROUPS_KO" ? t.qualifiersPerGroup ?? 2 : 0} />
          <Card>
            <CardHeader title={`${group.name} matches`} />
            <MatchList matches={matches} names={names} linkFor={linkFor} />
          </Card>
        </div>
      ))}
      {ko.length > 0 && <BracketView matches={ko} names={names} linkFor={linkFor} />}
    </div>
  );
}
