import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { entryNames, getTournamentFull, playerName } from "@/lib/queries";
import { computeTimings, TIME_ZONE, type Timings } from "@/lib/timings";
import { loadTimingsInput } from "@/lib/timings-data";
import { matchLabels } from "@/lib/views";
import { cx, EmptyState, PageSkeleton, panel, SectionTitle } from "@/components/ui";

export default function TimingsPage({ params }: PageProps<"/admin/tournaments/[id]/timings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TimingsView params={params} />
    </Suspense>
  );
}

// ---- Formatting

/** A frame-sized length: 14:05. */
const mmss = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
/** A match- or day-sized length: 48m, 2h 05m. */
const hm = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};
const clock = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE });
const ukDay = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: TIME_ZONE });
/** A time later today, or with its day if it isn't today: "Sat 14:14". */
const when = (d: Date, now: Date) =>
  ukDay(d) === ukDay(now) ? clock(d) : `${d.toLocaleDateString("en-GB", { weekday: "short", timeZone: TIME_ZONE })} ${clock(d)}`;
/** Fewer timed frames than this and a player's average is only a rough guide. */
const FEW_FRAMES = 3;
const dash = <span className="text-muted">–</span>;

/** Difference from the baseline: slower in amber with a +, quicker in blue with a −. */
function Delta({ ms, format = mmss }: { ms: number | null; format?: (ms: number) => string }) {
  if (ms === null) return dash;
  if (Math.abs(ms) < 1000) return <span className="text-muted">±0</span>;
  return (
    <span className={cx("font-semibold tabular-nums", ms > 0 ? "text-warn" : "text-accent")}>
      {ms > 0 ? "+" : "−"}
      {format(Math.abs(ms))}
    </span>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-display text-3xl leading-tight font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

const th = "px-3 py-2 text-right font-medium";
const td = "px-3 py-2 text-right tabular-nums";

// ---- Page

async function TimingsView({ params }: { params: PageProps<"/admin/tournaments/[id]/timings">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  const t = await getTournamentFull({ id });
  if (!t || t.organizationId !== user.organizationId) notFound();

  const now = new Date();
  const input = await loadTimingsInput(t, now);
  const tables = input.tables;
  const timings = computeTimings(input);

  const names = entryNames(t.entries);
  const people = new Map(t.entries.flatMap((e) => (e.partner ? [e.player, e.partner] : [e.player])).map((p) => [p.id, playerName(p)]));
  const labels = matchLabels(t.matches, t.groups);

  if (!t.matches.length) {
    return (
      <div className={panel}>
        <EmptyState title="Make the draw to see timings">Frame and match times appear here as matches are scored.</EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Overview timings={timings} now={now} doubleElim={t.format === "DOUBLE_ELIM" && t.grandFinalReset} />
      <TablesSection timings={timings} />
      <PlayersSection timings={timings} people={people} />
      <MatchesSection timings={timings} names={names} labels={labels} tableName={new Map(tables.map((x) => [x.id, x.name]))} />
    </div>
  );
}

function Overview({ timings, now, doubleElim }: { timings: Timings; now: Date; doubleElim: boolean }) {
  const { overview: o, projection: p, baselineProjection: b, baselineMs } = timings;
  const late = p && b ? +p.finishAt - +b.finishAt : null;
  return (
    <section>
      <SectionTitle>How it&apos;s running</SectionTitle>
      <div className={cx(panel, "grid grid-cols-2 gap-px bg-border md:grid-cols-4")}>
        {o.lastEnd ? (
          <Stat label="Finished" value={clock(o.lastEnd)} sub={o.elapsedMs !== null ? `after ${hm(o.elapsedMs)}` : undefined} />
        ) : (
          <Stat
            label="Projected finish"
            value={p ? when(p.finishAt, now) : dash}
            sub={p ? (late !== null && Math.abs(late) >= 60_000 ? <><Delta ms={late} format={hm} /> on baseline pace</> : "at the current pace") : undefined}
          />
        )}
        <Stat
          label="Vs baseline so far"
          value={<Delta ms={o.vsBaselineMs} format={hm} />}
          sub={o.framesTimed ? `over ${o.framesTimed} timed frame${o.framesTimed === 1 ? "" : "s"}` : "no frames timed yet"}
        />
        <Stat label="Average frame" value={o.avgFrameMs !== null ? mmss(o.avgFrameMs) : dash} sub={`baseline ${mmss(baselineMs)}`} />
        <Stat label="Average match" value={o.avgMatchMs !== null ? hm(o.avgMatchMs) : dash} />
        <Stat label="Matches played" value={`${o.matchesDone} / ${o.matchesTotal}`} sub={p ? `${p.matchesLeft} to go, about ${p.framesLeft} frames` : undefined} />
        <Stat
          label="Running for"
          value={o.elapsedMs !== null ? hm(o.elapsedMs) : dash}
          sub={o.firstStart ? `first break ${clock(o.firstStart)}` : "not started"}
        />
        <Stat label="Time to start" value={o.avgWaitMs !== null ? mmss(o.avgWaitMs) : dash} sub="sent to table → first break" />
        <Stat
          label="At baseline pace"
          value={b ? when(b.finishAt, now) : dash}
          sub={b ? `if every frame from now took ${mmss(baselineMs)}` : undefined}
        />
      </div>
      {p && (
        <p className="mt-2 text-xs text-muted">
          The projection plays out the matches left on {p.tables} table{p.tables === 1 ? "" : "s"} (the ones this comp is using, or all the
          venue&apos;s before any are assigned), in bracket order, at{" "}
          {mmss(o.paceMs)} a frame: the comp&apos;s average so far, eased in from the {mmss(baselineMs)} baseline.
          {p.estimatedKnockout && " The knockout stage isn't drawn yet, so it's estimated from the qualifier numbers."}
          {doubleElim && " A grand final reset isn't included until it's needed."}
        </p>
      )}
    </section>
  );
}

function TablesSection({ timings }: { timings: Timings }) {
  if (!timings.tables.length) return null;
  return (
    <section>
      <SectionTitle>Tables</SectionTitle>
      <div className={cx(panel, "overflow-x-auto")}>
        <table className="w-full text-[15px] whitespace-nowrap">
          <thead className="bg-surface-2 text-xs text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Table</th>
              <th className={th}>Matches</th>
              <th className={th}>Frames</th>
              <th className={th}>Avg frame</th>
              <th className={th}>Vs baseline</th>
              <th className={th} title="Frames per hour of play">Frames / hr</th>
              <th className={th}>In play</th>
              <th className={th} title="Time between matches since its first one started">Idle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {timings.tables.map((r) => (
              <tr key={r.table.id}>
                <td className="w-full px-3 py-2 font-medium">{r.table.name}</td>
                <td className={td}>{r.matches}</td>
                <td className={td}>{r.frames}</td>
                <td className={td}>{r.avgFrameMs !== null ? mmss(r.avgFrameMs) : dash}</td>
                <td className={td}>
                  <Delta ms={r.avgFrameMs !== null ? r.avgFrameMs - timings.baselineMs : null} />
                </td>
                <td className={td}>{r.framesPerHour !== null ? r.framesPerHour.toFixed(1) : dash}</td>
                <td className={td}>{hm(r.busyMs)}</td>
                <td className={td}>{hm(r.idleMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PlayersSection({ timings, people }: { timings: Timings; people: Map<string, string> }) {
  const rows = [...timings.players].sort((a, b) => b.avgMs - a.avgMs);
  if (!rows.length) return null;
  // Bars share one scale: the slowest average (or the baseline, if everyone's quicker).
  const scale = Math.max(timings.baselineMs, ...rows.map((r) => r.avgMs));
  const baselinePct = (timings.baselineMs / scale) * 100;
  return (
    <section>
      <SectionTitle>Players</SectionTitle>
      <div className={cx(panel, "overflow-x-auto")}>
        <table className="w-full text-[15px] whitespace-nowrap">
          <thead className="bg-surface-2 text-xs text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Player (slowest first)</th>
              <th className={th}>Frames</th>
              <th className={th}>Average</th>
              <th className={th}>Vs baseline</th>
              <th className={th}>Quickest</th>
              <th className={th}>Longest</th>
              <th className="hidden w-48 px-3 py-2 text-left font-medium md:table-cell">
                <span className="sr-only">Average against the baseline</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.playerId} className={cx(r.frames < FEW_FRAMES && "text-muted")}>
                <td className="w-full px-3 py-2 font-medium">{people.get(r.playerId) ?? "Unknown player"}</td>
                <td className={td}>{r.frames}</td>
                <td className={cx(td, "font-semibold")}>{mmss(r.avgMs)}</td>
                <td className={td}>
                  <Delta ms={r.avgMs - timings.baselineMs} />
                </td>
                <td className={td}>{mmss(r.minMs)}</td>
                <td className={td}>{mmss(r.maxMs)}</td>
                <td className="hidden px-3 py-2 md:table-cell">
                  {/* The bar is the player's average; the tick is the baseline. */}
                  <div className="relative h-2.5 w-40 rounded-full bg-surface-2">
                    <div
                      className={cx("h-full rounded-full", r.avgMs > timings.baselineMs ? "bg-warn/70" : "bg-accent/70")}
                      style={{ width: `${(r.avgMs / scale) * 100}%` }}
                    />
                    <div className="absolute -top-1 -bottom-1 w-0.5 bg-foreground" style={{ left: `${baselinePct}%` }} title="Baseline" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        A frame counts for everyone who played in it: all four players in a doubles frame, the two players in a singles frame. Players with fewer than{" "}
        {FEW_FRAMES} timed frames are greyed out, as their average is only a rough guide. Frames over 45 minutes are left out as scoring slips.
      </p>
    </section>
  );
}

function MatchesSection({
  timings,
  names,
  labels,
  tableName,
}: {
  timings: Timings;
  names: Map<string, string>;
  labels: Map<string, string>;
  tableName: Map<string, string>;
}) {
  // Live matches first, then the most recently started.
  const rows = timings.matches
    .filter((r) => r.match.startedAt)
    .sort((a, b) => Number(b.match.status === "LIVE") - Number(a.match.status === "LIVE") || +b.match.startedAt! - +a.match.startedAt!);
  if (!rows.length) return null;
  const side = (id: string | null) => (id ? (names.get(id) ?? "?") : "TBC");
  return (
    <section>
      <SectionTitle>Matches</SectionTitle>
      <div className={cx(panel, "overflow-x-auto")}>
        <table className="w-full text-[15px] whitespace-nowrap">
          <thead className="bg-surface-2 text-xs text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Match</th>
              <th className="px-3 py-2 text-left font-medium">Table</th>
              <th className={th}>Started</th>
              <th className={th} title="From being sent to the table to the first break">To start</th>
              <th className={th}>Length</th>
              <th className={th}>Frames</th>
              <th className={th}>Avg frame</th>
              <th className={th} title="Length against the frames played at the baseline">Vs baseline</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const live = r.match.status === "LIVE";
              return (
                <tr key={r.match.id}>
                  <td className="w-full min-w-64 px-3 py-2 whitespace-normal">
                    <div className="text-xs text-muted">
                      {labels.get(r.match.id)}
                      {live && <span className="ml-2 font-bold text-live">● LIVE</span>}
                    </div>
                    <div className="font-medium">
                      {side(r.match.entry1Id)} <span className="text-muted">v</span> {side(r.match.entry2Id)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted">{r.match.tableId ? tableName.get(r.match.tableId) : "–"}</td>
                  <td className={td}>{clock(r.match.startedAt!)}</td>
                  <td className={td}>{r.waitMs !== null ? mmss(r.waitMs) : dash}</td>
                  <td className={cx(td, "font-semibold")}>{r.durationMs !== null ? hm(r.durationMs) : dash}</td>
                  <td className={td}>{r.framesPlayed}</td>
                  <td className={td}>{r.avgFrameMs !== null ? mmss(r.avgFrameMs) : dash}</td>
                  <td className={td}>
                    <Delta ms={r.durationMs !== null && r.baselineMs !== null && !live ? r.durationMs - r.baselineMs : null} format={hm} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
