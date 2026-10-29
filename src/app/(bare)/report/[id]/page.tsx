import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { APP_NAME } from "@/lib/brand";
import { db } from "@/lib/db";
import { entryNames, getTournamentFull, playerName } from "@/lib/queries";
import { eliminationPlacings, ordinal } from "@/lib/results";
import {
  computeTimings,
  frameDurations,
  plannedFinish,
  TIME_ZONE,
} from "@/lib/timings";
import { loadTimingsInput } from "@/lib/timings-data";
import {
  formatSummary,
  matchLabels,
  placings,
  sectionMatches,
} from "@/lib/views";
import { PrintButton } from "@/components/print-button";
import { cx } from "@/components/ui";

export const metadata: Metadata = { title: "End-of-day report" };

export default function ReportPage({ params }: PageProps<"/report/[id]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <Report params={params} />
    </Suspense>
  );
}

// ---- Formatting (UK time, whatever the server's zone)

const mmss = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const hm = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m < 60
    ? `${m}m`
    : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};
const clock = (d: Date) =>
  d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
const longDate = (d: Date) =>
  d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  });
/** "+1h 15m later" / "20m earlier" against a plan or baseline. */
const versus = (ms: number, later = "later", earlier = "earlier") =>
  Math.abs(ms) < 60_000
    ? "on time"
    : `${hm(Math.abs(ms))} ${ms > 0 ? later : earlier}`;
/** A frame-sized difference: +1:04 / −0:30. */
const signed = (ms: number) =>
  Math.abs(ms) < 1000 ? "±0" : `${ms > 0 ? "+" : "−"}${mmss(Math.abs(ms))}`;
/** Fewer frames than this and a player's average isn't worth singling out. */
const MIN_FRAMES = 5;

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="bg-surface p-3.5 break-inside-avoid">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 font-display text-2xl leading-tight font-bold tabular-nums">
        {value}
      </div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="break-inside-avoid-page">
      <h2 className="mb-2 flex items-center gap-2 font-display text-xl font-bold tracking-wide uppercase">
        <span
          className="h-5 w-1.5 rounded-full bg-pop print:bg-accent"
          aria-hidden
        />
        {title}
      </h2>
      {children}
    </section>
  );
}

const box = "border border-border bg-surface";

async function Report({
  params,
}: {
  params: PageProps<"/report/[id]">["params"];
}) {
  const user = await requireUser();
  const { id } = await params;
  const t = await getTournamentFull({ id });
  if (!t || t.organizationId !== user.organizationId) notFound();

  const now = new Date();
  const input = await loadTimingsInput(t, now);
  const timings = computeTimings(input);
  const o = timings.overview;
  const planned = o.firstStart ? plannedFinish(input, o.firstStart) : null;
  const finished = t.status === "COMPLETED";
  const names = entryNames(t.entries);
  const labels = matchLabels(t.matches, t.groups);
  const people = new Map(
    t.entries
      .flatMap((e) => (e.partner ? [e.player, e.partner] : [e.player]))
      .map((p) => [p.id, playerName(p)]),
  );
  const members = new Map(
    t.entries.map((e) => [
      e.id,
      e.partnerId ? [e.playerId, e.partnerId] : [e.playerId],
    ]),
  );

  // ---- Results
  const ranks =
    t.format === "ROUND_ROBIN" ? placings(t) : eliminationPlacings(t.matches);
  const plate =
    t.format === "GROUPS_KO"
      ? eliminationPlacings(t.matches, { plate: true })
      : new Map<string, number>();
  const podium = [1, 2, 3, 4]
    .map((rank) => ({
      rank,
      ids: [...ranks].filter(([, r]) => r === rank).map(([id]) => id),
    }))
    .filter((p) => p.ids.length);
  const plateWinner = [...plate].find(([, r]) => r === 1)?.[0];
  const placeName = (rank: number, count: number) =>
    rank === 1
      ? "Winner"
      : rank === 2
        ? "Runner-up"
        : count > 1
          ? "Semi-finalists"
          : `${ordinal(rank)} place`;

  // ---- Frames: dishes and the longest frame
  const frames = await db.frame.findMany({
    where: { match: { tournamentId: t.id } },
    select: {
      matchId: true,
      winner: true,
      breakAndRun: true,
      reverseDish: true,
      player1Id: true,
      player2Id: true,
    },
  });
  const matchOf = new Map(t.matches.map((m) => [m.id, m]));
  const dishCounts = (pick: (f: (typeof frames)[number]) => boolean) => {
    const counts = new Map<string, number>();
    for (const f of frames.filter(pick)) {
      const m = matchOf.get(f.matchId)!;
      const solo = f.winner === 1 ? f.player1Id : f.player2Id;
      const who = solo
        ? [solo]
        : (members.get((f.winner === 1 ? m.entry1Id : m.entry2Id) ?? "") ?? []);
      for (const p of who) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1]);
  };
  const breakRuns = frames.filter((f) => f.breakAndRun).length;
  const reverseDishes = frames.filter((f) => f.reverseDish).length;
  const topBreakRuns = dishCounts((f) => f.breakAndRun);
  const topReverse = dishCounts((f) => f.reverseDish);
  const leaders = (rows: [string, number][]) => {
    const best = rows[0]?.[1];
    return best
      ? `${rows
          .filter(([, c]) => c === best)
          .map(([p]) => people.get(p))
          .join(", ")} (${best})`
      : null;
  };

  let longestFrame: { ms: number; matchId: string; number: number } | null =
    null;
  for (const m of input.matches) {
    for (const { frame, ms } of frameDurations(m)) {
      if (ms !== null && (!longestFrame || ms > longestFrame.ms))
        longestFrame = { ms, matchId: m.id, number: frame.number };
    }
  }

  // ---- Matches
  const timed = timings.matches.filter(
    (r) => r.match.status === "COMPLETED" && r.durationMs !== null,
  );
  const longest = timed.reduce<(typeof timed)[number] | null>(
    (a, r) => (!a || r.durationMs! > a.durationMs! ? r : a),
    null,
  );
  const quickest = timed.reduce<(typeof timed)[number] | null>(
    (a, r) => (!a || r.durationMs! < a.durationMs! ? r : a),
    null,
  );
  const fixture = (m: {
    entry1Id: string | null;
    entry2Id: string | null;
    score1: number;
    score2: number;
  }) =>
    `${names.get(m.entry1Id ?? "") ?? "?"} ${m.score1}–${m.score2} ${names.get(m.entry2Id ?? "") ?? "?"}`;
  const played = t.matches.filter((m) => m.status === "COMPLETED" && !m.isBye);
  const walkovers = played.filter((m) => m.walkover).length;
  const lengthOf = new Map(
    timings.matches.map((r) => [r.match.id, r.durationMs]),
  );

  // ---- Players with enough frames to compare
  const regulars = timings.players.filter((p) => p.frames >= MIN_FRAMES);
  const quickPlayers = [...regulars]
    .sort((a, b) => a.avgMs - b.avgMs)
    .slice(0, 3);
  const slowPlayers = [...regulars]
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 3);

  const day = o.firstStart ?? t.startsAt;

  return (
    <div className="min-h-dvh bg-background text-foreground print:bg-white">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 print:max-w-none print:px-0 print:py-0">
        <div className="flex items-center justify-between gap-3 print:hidden">
          <Link
            href={`/admin/tournaments/${t.id}/timings`}
            className="text-sm text-muted hover:text-foreground"
          >
            ← Back to the comp
          </Link>
          <PrintButton />
        </div>

        <header className="bg-felt rounded-none px-5 py-5 text-white print:bg-none print:px-0 print:text-foreground">
          <p className="text-xs font-semibold tracking-[0.2em] text-pop uppercase print:text-accent">
            {APP_NAME} · End-of-day report{finished ? "" : " (so far)"}
          </p>
          <h1 className="mt-1 font-display text-4xl leading-none font-bold tracking-tight">
            {t.name}
          </h1>
          <p className="mt-2 text-sm text-white/80 print:text-muted">
            {[
              day && longDate(day),
              t.venue?.name,
              formatSummary(t),
              `${t.entries.length} ${t.entryType === "PAIRS" ? "pairs" : "players"}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </header>

        {!finished && (
          <p className="border border-warn/40 bg-warn/10 px-4 py-2 text-sm text-warn">
            The comp is still in progress, so this is the report so far.
          </p>
        )}

        {podium.length > 0 && (
          <Section title="Results">
            <ol className={cx(box, "divide-y divide-border")}>
              {podium.map(({ rank, ids }) => (
                <li
                  key={rank}
                  className="flex items-baseline gap-4 px-4 py-2.5"
                >
                  <span
                    className={cx(
                      "w-32 shrink-0 text-sm",
                      rank === 1 ? "font-bold text-accent" : "text-muted",
                    )}
                  >
                    {placeName(rank, ids.length)}
                  </span>
                  <span
                    className={
                      rank === 1
                        ? "font-display text-xl font-bold"
                        : "font-medium"
                    }
                  >
                    {ids.map((id) => names.get(id)).join(" · ")}
                  </span>
                </li>
              ))}
              {plateWinner && (
                <li className="flex items-baseline gap-4 px-4 py-2.5">
                  <span className="w-32 shrink-0 text-sm text-muted">
                    Plate winner
                  </span>
                  <span className="font-medium">{names.get(plateWinner)}</span>
                </li>
              )}
            </ol>
          </Section>
        )}

        <Section title="The day">
          <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
            <Stat
              label="First break"
              value={o.firstStart ? clock(o.firstStart) : "–"}
            />
            <Stat
              label={finished ? "Last ball" : "Now"}
              value={clock(o.lastEnd ?? now)}
            />
            <Stat
              label="Duration"
              value={o.elapsedMs !== null ? hm(o.elapsedMs) : "–"}
            />
            <Stat
              label="Planned finish"
              value={planned ? clock(planned) : "–"}
              sub={
                planned && o.lastEnd
                  ? `finished ${versus(+o.lastEnd - +planned)}`
                  : `at ${mmss(timings.baselineMs)} a frame`
              }
            />
            <Stat
              label="Matches played"
              value={played.length - walkovers}
              sub={
                walkovers
                  ? `plus ${walkovers} walkover${walkovers === 1 ? "" : "s"}`
                  : undefined
              }
            />
            <Stat
              label="Frames played"
              value={frames.length}
              sub={`${o.framesTimed} timed`}
            />
            <Stat
              label="Average frame"
              value={o.avgFrameMs !== null ? mmss(o.avgFrameMs) : "–"}
              sub={
                o.avgFrameMs !== null
                  ? `${signed(o.avgFrameMs - timings.baselineMs)} on the ${mmss(timings.baselineMs)} baseline`
                  : undefined
              }
            />
            <Stat
              label="Average match"
              value={o.avgMatchMs !== null ? hm(o.avgMatchMs) : "–"}
              sub={
                o.avgWaitMs !== null
                  ? `${mmss(o.avgWaitMs)} to get started`
                  : undefined
              }
            />
          </div>
          {o.vsBaselineMs !== null && (
            <p className="mt-2 text-sm text-muted">
              Altogether the frames took{" "}
              {versus(o.vsBaselineMs, "longer", "less")} than{" "}
              {mmss(timings.baselineMs)} frames would have.
            </p>
          )}
        </Section>

        <Section title="Highlights">
          <dl className={cx(box, "divide-y divide-border text-sm")}>
            {[
              longest && [
                "Longest match",
                `${hm(longest.durationMs!)} · ${fixture(longest.match)} (${labels.get(longest.match.id)})`,
              ],
              quickest &&
                quickest !== longest && [
                  "Quickest match",
                  `${hm(quickest.durationMs!)} · ${fixture(quickest.match)} (${labels.get(quickest.match.id)})`,
                ],
              longestFrame && [
                "Longest frame",
                `${mmss(longestFrame.ms)} · frame ${longestFrame.number} of ${fixture(matchOf.get(longestFrame.matchId)!)}`,
              ],
              [
                "Break & runs",
                breakRuns
                  ? `${breakRuns}${leaders(topBreakRuns) ? `, most by ${leaders(topBreakRuns)}` : ""}`
                  : "None",
              ],
              [
                "Reverse dishes",
                reverseDishes
                  ? `${reverseDishes}${leaders(topReverse) ? `, most by ${leaders(topReverse)}` : ""}`
                  : "None",
              ],
              quickPlayers.length > 0 && [
                "Quickest players",
                quickPlayers
                  .map((p) => `${people.get(p.playerId)} ${mmss(p.avgMs)}`)
                  .join(" · "),
              ],
              slowPlayers.length > 0 && [
                "Longest frames",
                slowPlayers
                  .map((p) => `${people.get(p.playerId)} ${mmss(p.avgMs)}`)
                  .join(" · "),
              ],
            ]
              .filter((row): row is [string, string] => !!row)
              .map(([label, value]) => (
                <div
                  key={label}
                  className="grid gap-x-4 px-4 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)]"
                >
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
          </dl>
          {regulars.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Player averages count players with at least {MIN_FRAMES} timed
              frames.
            </p>
          )}
        </Section>

        {timings.tables.length > 0 && (
          <Section title="Tables">
            <div className="overflow-x-auto">
              <table className={cx(box, "w-full text-sm whitespace-nowrap")}>
                <thead className="bg-surface-2 text-xs text-muted">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">Table</th>
                    <th className="px-3 py-1.5 text-right font-medium">
                      Matches
                    </th>
                    <th className="px-3 py-1.5 text-right font-medium">
                      Frames
                    </th>
                    <th className="px-3 py-1.5 text-right font-medium">
                      Avg frame
                    </th>
                    <th className="px-3 py-1.5 text-right font-medium">
                      Frames / hr
                    </th>
                    <th className="px-3 py-1.5 text-right font-medium">
                      In play
                    </th>
                    <th className="px-3 py-1.5 text-right font-medium">Idle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {timings.tables.map((r) => (
                    <tr key={r.table.id}>
                      <td className="w-full px-3 py-1.5 font-medium">
                        {r.table.name}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {r.matches}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {r.frames}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {r.avgFrameMs !== null ? mmss(r.avgFrameMs) : "–"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {r.framesPerHour?.toFixed(1) ?? "–"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {hm(r.busyMs)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {hm(r.idleMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        <Section title="All results">
          <div className="space-y-4">
            {sectionMatches(t.matches, t.groups).map((section) => {
              const done = section.matches.filter(
                (m) => m.status === "COMPLETED",
              );
              if (!done.length) return null;
              return (
                <div key={section.title} className="break-inside-avoid">
                  <h3 className="mb-1 text-sm font-semibold">
                    {section.title}
                  </h3>
                  <ol className={cx(box, "divide-y divide-border text-sm")}>
                    {done.map((m) => {
                      const won1 = m.winnerId === m.entry1Id;
                      const won2 = m.winnerId === m.entry2Id;
                      const length = lengthOf.get(m.id);
                      return (
                        <li
                          key={m.id}
                          className="grid grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 px-3 py-1.5"
                        >
                          <span
                            className={cx(
                              "text-right",
                              won1 ? "font-bold" : "text-muted",
                            )}
                          >
                            {names.get(m.entry1Id ?? "")}
                          </span>
                          <span className="text-center font-semibold tabular-nums">
                            {m.walkover && m.score1 + m.score2 === 0
                              ? "W/O"
                              : `${m.score1}–${m.score2}`}
                          </span>
                          <span className={won2 ? "font-bold" : "text-muted"}>
                            {names.get(m.entry2Id ?? "")}
                          </span>
                          <span className="text-right text-xs text-muted tabular-nums">
                            {length ? hm(length) : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </div>
        </Section>

        <p className="pt-2 text-center text-xs text-muted">
          {APP_NAME} · report made {longDate(now)} at {clock(now)}
        </p>
      </div>
    </div>
  );
}
