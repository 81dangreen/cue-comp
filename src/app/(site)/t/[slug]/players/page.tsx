import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTournamentFull, playerName } from "@/lib/queries";
import { ordinal } from "@/lib/results";
import { placings } from "@/lib/views";
import { Badge, Card, EmptyState, PageSkeleton } from "@/components/ui";

export default function PlayersPage({ params }: PageProps<"/t/[slug]/players">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Players params={params} />
    </Suspense>
  );
}

async function Players({ params }: { params: PageProps<"/t/[slug]/players">["params"] }) {
  const { slug } = await params;
  const t = await getTournamentFull({ slug });
  if (!t || !t.isPublic) notFound();
  const ranks = placings(t);
  const entries = t.entries
    .filter((e) => e.status !== "WITHDRAWN")
    .sort((a, b) => (ranks.get(a.id) ?? 999) - (ranks.get(b.id) ?? 999) || playerName(a.player).localeCompare(playerName(b.player)));

  if (!entries.length) {
    return (
      <Card>
        <EmptyState title="No players have entered yet" />
      </Card>
    );
  }

  return (
    <Card>
      <ul className="divide-y divide-border">
        {entries.map((e) => (
          <li key={e.id} className="flex items-center gap-3 px-5 py-3">
            <span className="w-12 text-sm text-muted">{ranks.has(e.id) ? ordinal(ranks.get(e.id)!) : ""}</span>
            <Link href={`/players/${e.player.id}`} className="font-medium hover:text-accent">
              {playerName(e.player)}
            </Link>
            {e.player.nickname && <span className="text-sm text-muted">“{e.player.nickname}”</span>}
            {e.seed && <Badge>Seed {e.seed}</Badge>}
            {e.status === "REGISTERED" && <Badge tone="warn">Awaiting confirmation</Badge>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
