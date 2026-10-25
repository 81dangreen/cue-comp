import type { Metadata } from "next";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { playerName } from "@/lib/queries";
import { LiveRefresher } from "@/components/live-refresher";

export const metadata: Metadata = { title: "Overlay" };

// Stream overlay: add this URL as a Browser Source in OBS (e.g. 1920×1080).
// Transparent background; shows whatever match is currently on the table.
export default function OverlayPage({ params }: PageProps<"/overlay/[tableId]">) {
  return (
    <>
      <style>{`html, body { background: transparent !important; }`}</style>
      <Suspense fallback={null}>
        <Overlay params={params} />
      </Suspense>
    </>
  );
}

async function Overlay({ params }: { params: PageProps<"/overlay/[tableId]">["params"] }) {
  const { tableId } = await params;
  const table = await db.table.findUnique({ where: { id: tableId } });
  if (!table) return null;

  const match = await db.match.findFirst({
    where: { tableId, status: { in: ["LIVE", "READY"] } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }], // LIVE sorts before READY
    include: { tournament: true },
  });
  const entries = match
    ? await db.entry.findMany({
        where: { id: { in: [match.entry1Id, match.entry2Id].filter((x): x is string => !!x) } },
        include: { player: true },
      })
    : [];
  const name = (id: string | null) => {
    const e = entries.find((x) => x.id === id);
    return e ? playerName(e.player) : "";
  };

  return (
    <div className="fixed inset-x-0 bottom-10 flex justify-center">
      <LiveRefresher tableId={tableId} quiet />
      {match && (
        <div className="overflow-hidden rounded-xl text-white shadow-2xl" style={{ fontFamily: "var(--font-geist-sans)" }}>
          <div className="flex items-stretch bg-black/85 text-2xl font-semibold">
            <div className="flex min-w-72 items-center justify-end px-5 py-3">{name(match.entry1Id)}</div>
            <div className="flex items-center bg-emerald-600 px-4 text-3xl font-black tabular-nums">{match.score1}</div>
            <div className="flex items-center bg-black px-3 text-sm font-medium text-white/70">({match.raceTo})</div>
            <div className="flex items-center bg-emerald-600 px-4 text-3xl font-black tabular-nums">{match.score2}</div>
            <div className="flex min-w-72 items-center px-5 py-3">{name(match.entry2Id)}</div>
          </div>
          <div className="bg-black/70 py-1 text-center text-xs tracking-wide text-white/70 uppercase">
            {match.tournament.name} · {table.name}
          </div>
        </div>
      )}
    </div>
  );
}
