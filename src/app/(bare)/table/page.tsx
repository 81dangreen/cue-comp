import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { tableAddFrameAction, tableUndoFrameAction, unpairTabletAction } from "@/actions/table";
import { APP_NAME } from "@/lib/brand";
import { roundLabel } from "@/lib/bracket";
import { db } from "@/lib/db";
import { getDevice } from "@/lib/device";
import { playerName } from "@/lib/queries";
import { ConfirmButton } from "@/components/forms";
import { LiveRefresher } from "@/components/live-refresher";
import { LogoMark } from "@/components/logo";
import { Scoreboard } from "@/components/scoring/scoreboard";
import { Clock } from "@/components/table/clock";
import { PairForm } from "@/components/table/pair-form";
import { StartMatch } from "@/components/table/start-match";
import { WakeLock } from "@/components/table/wake-lock";

export const metadata: Metadata = {
  title: "Table scoreboard",
  manifest: "/table.webmanifest",
  appleWebApp: { capable: true, title: `${APP_NAME} table`, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0a2a1f" };

/** Results stay on screen this long after a match ends. */
const RESULT_DISPLAY_MS = 10 * 60 * 1000;
const resultCutoff = () => new Date(Date.now() - RESULT_DISPLAY_MS);

const screen = "min-h-dvh bg-[radial-gradient(ellipse_at_top,#14513c_0%,#0a2a1f_45%,#05120d_100%)] text-white";

export default function TablePage({ searchParams }: PageProps<"/table">) {
  return (
    <Suspense fallback={<div className={screen} />}>
      <TableScreen searchParams={searchParams} />
    </Suspense>
  );
}

async function TableScreen({ searchParams }: { searchParams: PageProps<"/table">["searchParams"] }) {
  const device = await getDevice();
  if (!device) {
    const { code } = await searchParams;
    return <PairScreen code={typeof code === "string" ? code : undefined} />;
  }

  const tableId = device.tableId;
  const [current, last] = await Promise.all([
    db.match.findFirst({
      where: { tableId, status: { in: ["LIVE", "READY"] }, entry1Id: { not: null }, entry2Id: { not: null } },
      orderBy: [{ status: "asc" }, { updatedAt: "asc" }], // LIVE sorts before READY
      include: { tournament: true, group: true, frames: { orderBy: { number: "asc" } } },
    }),
    db.match.findFirst({
      where: { tableId, status: "COMPLETED", isBye: false, completedAt: { gt: resultCutoff() } },
      orderBy: { completedAt: "desc" },
    }),
  ]);
  const names = await entryNameMap([current?.entry1Id, current?.entry2Id, last?.entry1Id, last?.entry2Id]);
  const name = (id: string | null | undefined) => (id && names.get(id)) || "TBD";

  const chrome = (
    <>
      <LiveRefresher tableId={tableId} banner />
      <WakeLock />
    </>
  );

  if (current?.status === "LIVE") {
    return (
      <>
        {chrome}
        <Scoreboard
          roundName={await matchRoundName(current)}
          tournamentName={current.tournament.name}
          raceTo={current.raceTo}
          status={current.status}
          tableName={device.table.name}
          player1={name(current.entry1Id)}
          player2={name(current.entry2Id)}
          score1={current.score1}
          score2={current.score2}
          winnerSlot={null}
          breakSlot={current.breakSlot}
          canUndo={current.frames.length > 0}
          frames={current.frames.map((f) => ({ winner: f.winner, breakAndRun: f.breakAndRun }))}
          confirmFinish
          addFrame={tableAddFrameAction.bind(null, current.id)}
          undo={tableUndoFrameAction.bind(null, current.id)}
        />
      </>
    );
  }

  const lastResult = last && (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-center">
      <p className="text-xs font-semibold tracking-wide text-white/50 uppercase">Last result on this table</p>
      <p className="mt-2 text-xl">
        <span className={last.winnerId === last.entry1Id ? "font-bold" : "text-white/60"}>{name(last.entry1Id)}</span>
        <span className="mx-3 font-black tabular-nums">
          {last.score1} – {last.score2}
        </span>
        <span className={last.winnerId === last.entry2Id ? "font-bold" : "text-white/60"}>{name(last.entry2Id)}</span>
      </p>
    </div>
  );

  if (current) {
    return (
      <main className={`${screen} flex flex-col p-6`}>
        {chrome}
        <TopBar tableName={device.table.name} venueName={device.table.venue.name} />
        <div className="flex flex-1 flex-col items-center justify-center gap-10 py-8 text-center">
          <div>
            <p className="text-sm font-semibold tracking-[0.2em] text-emerald-300 uppercase">Next match</p>
            <p className="mt-2 text-lg text-white/75">
              {current.tournament.name} · {await matchRoundName(current)} · Race to {current.raceTo}
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-8">
            <span className="text-4xl font-bold sm:text-6xl">{name(current.entry1Id)}</span>
            <span className="text-2xl font-semibold text-white/50">v</span>
            <span className="text-4xl font-bold sm:text-6xl">{name(current.entry2Id)}</span>
          </div>
          <StartMatch matchId={current.id} player1={name(current.entry1Id)} player2={name(current.entry2Id)} />
        </div>
        {lastResult}
      </main>
    );
  }

  return (
    <main className={`${screen} flex flex-col p-6`}>
      {chrome}
      <TopBar tableName={device.table.name} venueName={device.table.venue.name} />
      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <div>
          <p className="text-[clamp(4rem,14vw,10rem)] leading-none font-black tracking-tight">{device.table.name}</p>
          <p className="mt-4 text-xl text-white/70">Waiting for the next match…</p>
          <p className="mt-1 text-white/50">It will appear here as soon as it&apos;s assigned to this table.</p>
        </div>
        {lastResult}
      </div>
      <footer className="flex items-center justify-between text-sm text-white/40">
        <span>{device.name}</span>
        <form action={unpairTabletAction}>
          <ConfirmButton
            variant="ghost"
            message="Unpair this tablet? It will stop showing this table until it is paired again."
            className="font-normal text-white/40 hover:bg-white/10 hover:text-white/70"
          >
            Unpair this tablet
          </ConfirmButton>
        </form>
      </footer>
    </main>
  );
}

function TopBar({ tableName, venueName }: { tableName: string; venueName: string }) {
  return (
    <header className="flex items-center justify-between text-white/70">
      <span className="rounded-lg bg-white/10 px-3 py-1 font-semibold text-white">{tableName}</span>
      <span className="truncate px-3">{venueName}</span>
      <Clock className="text-xl font-semibold tabular-nums text-white" />
    </header>
  );
}

function PairScreen({ code }: { code?: string }) {
  return (
    <main className={`${screen} grid place-items-center p-6`}>
      <div className="w-full max-w-md text-center">
        <LogoMark className="mx-auto h-20 w-20" />
        <h1 className="mt-5 text-3xl font-bold">Set up this tablet</h1>
        <p className="mt-2 text-white/70">
          In {APP_NAME}, go to <span className="font-semibold text-white">Admin → Venues</span>, choose a table and press{" "}
          <span className="font-semibold text-white">Pair a tablet</span>. Then enter the code shown, or scan its QR code.
        </p>
        <PairForm code={code} />
      </div>
    </main>
  );
}

async function entryNameMap(ids: (string | null | undefined)[]) {
  const wanted = ids.filter((id): id is string => !!id);
  if (!wanted.length) return new Map<string, string>();
  const entries = await db.entry.findMany({ where: { id: { in: wanted } }, include: { player: true } });
  return new Map(entries.map((e) => [e.id, playerName(e.player)]));
}

async function matchRoundName(m: {
  tournamentId: string;
  bracket: string;
  round: number;
  group: { name: string } | null;
  tournament: { format: string };
}) {
  if (m.bracket === "GROUP") return m.group?.name ?? "Group stage";
  const total = await db.match.aggregate({ where: { tournamentId: m.tournamentId, bracket: m.bracket }, _max: { round: true } });
  return roundLabel(m.bracket, m.round, total._max.round ?? m.round, { doubleElim: m.tournament.format === "DOUBLE_ELIM" });
}
