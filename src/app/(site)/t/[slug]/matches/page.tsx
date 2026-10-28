import { notFound } from "next/navigation";
import { Suspense } from "react";
import { entryNames, getTournamentFull } from "@/lib/queries";
import { sectionMatches } from "@/lib/views";
import { MatchList } from "@/components/tournament/match-list";
import { Card, CardHeader, PageSkeleton } from "@/components/ui";

export default function MatchesPage({ params }: PageProps<"/t/[slug]/matches">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Matches params={params} />
    </Suspense>
  );
}

async function Matches({ params }: { params: PageProps<"/t/[slug]/matches">["params"] }) {
  const { slug } = await params;
  const t = await getTournamentFull({ slug });
  if (!t || !t.isPublic) notFound();
  const names = entryNames(t.entries);
  const sections = sectionMatches(t.matches, t.groups);

  return (
    <div className="space-y-4">
      {sections.map((s) => (
        <Card key={s.title}>
          <CardHeader title={s.title} />
          <MatchList matches={s.matches} names={names} linkFor={(m) => `/t/${t.slug}/matches/${m.id}`} />
        </Card>
      ))}
    </div>
  );
}
