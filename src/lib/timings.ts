// How long frames and matches take, per player and per table, and when the comp will finish.
// Pure functions over already-loaded rows, so they can be tested without a database.

export const DEFAULT_FRAME_MINUTES = 15;
/** Comps are run in the UK; times on the timings page are shown in UK time whatever the server's zone. */
export const TIME_ZONE = "Europe/London";
/** Frames longer than this are taken as a scoring slip (forgotten, caught up later) and left out. */
export const MAX_FRAME_MS = 45 * 60_000;
/** Shorter than this is a frame scored straight after the start (no real start time), so left out. */
export const MIN_FRAME_MS = 30_000;
/** Before any frames are known: time between one match ending and the next starting on that table. */
const DEFAULT_CHANGEOVER_MS = 3 * 60_000;
/** How many frames the baseline counts as, so the projection eases from it to the comp's real pace. */
const BASELINE_WEIGHT = 6;
const MAX_WAIT_MS = 30 * 60_000;

export type TimedFrame = { number: number; player1Id: string | null; player2Id: string | null; createdAt: Date };
export type TimedMatch = {
  id: string;
  bracket: string;
  round: number;
  position: number;
  groupId: string | null;
  status: string;
  isBye: boolean;
  walkover: boolean;
  raceTo: number;
  target1: number | null;
  target2: number | null;
  score1: number;
  score2: number;
  entry1Id: string | null;
  entry2Id: string | null;
  tableId: string | null;
  calledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  winnerToId: string | null;
  loserToId: string | null;
  frames: TimedFrame[];
};
export type TimingsInput = {
  now: Date;
  startsAt: Date | null;
  frameMinutes: number;
  format: string;
  raceTo: number;
  raceToFinal: number | null;
  matchFrames: string[];
  groupFinish: string;
  koFinish: string;
  qualifiersPerGroup: number | null;
  plateQualifiers: number | null;
  /** The venue's tables, in order. */
  tables: { id: string; name: string }[];
  groups: { id: string; tableId: string | null }[];
  entries: { id: string; playerId: string; partnerId: string | null }[];
  matches: TimedMatch[];
};

const isDone = (m: TimedMatch) => m.status === "COMPLETED" || m.status === "VOID";
const average = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Each scored frame's length: from the previous frame (or the match start) to when it was scored. */
export function frameDurations(m: Pick<TimedMatch, "startedAt" | "frames">) {
  const frames = [...m.frames].sort((a, b) => a.number - b.number);
  return frames.map((f, i) => {
    const from = i === 0 ? m.startedAt : frames[i - 1].createdAt;
    const ms = from ? +f.createdAt - +from : null;
    return { frame: f, ms: ms !== null && ms >= MIN_FRAME_MS && ms <= MAX_FRAME_MS ? ms : null };
  });
}

/** A played match's length, or null for walkovers, byes and results entered without frames. */
export function matchDuration(m: TimedMatch, now: Date) {
  if (m.walkover || m.isBye || !m.startedAt || !m.frames.length) return null;
  if (m.status === "LIVE") return +now - +m.startedAt;
  return m.completedAt ? +m.completedAt - +m.startedAt : null;
}

/** How long players took to start once the match was sent to their table. */
function waitToStart(m: TimedMatch) {
  if (!m.calledAt || !m.startedAt) return null;
  const ms = +m.startedAt - +m.calledAt;
  return ms >= 0 && ms <= MAX_WAIT_MS ? ms : null;
}

type Stat = { frames: number; totalMs: number; minMs: number; maxMs: number };
const addTo = (map: Map<string, Stat>, key: string, ms: number) => {
  const s = map.get(key) ?? { frames: 0, totalMs: 0, minMs: Infinity, maxMs: 0 };
  s.frames++;
  s.totalMs += ms;
  s.minMs = Math.min(s.minMs, ms);
  s.maxMs = Math.max(s.maxMs, ms);
  map.set(key, s);
};

/** Everything the timings page shows. */
export function computeTimings(input: TimingsInput) {
  const { now, matches } = input;
  const baselineMs = input.frameMinutes * 60_000;
  const members = new Map(input.entries.map((e) => [e.id, e.partnerId ? [e.playerId, e.partnerId] : [e.playerId]]));
  const played = matches.filter((m) => !m.walkover && !m.isBye && m.status !== "VOID");

  // ---- Frames, matches, players
  const players = new Map<string, Stat>();
  const allFrameMs: number[] = [];
  const matchRows = played
    .filter((m) => m.startedAt || m.calledAt)
    .map((m) => {
      const frames = frameDurations(m);
      for (const { frame, ms } of frames) {
        if (ms === null) continue;
        allFrameMs.push(ms);
        // A singles frame belongs to the player who played it; otherwise to everyone on that side.
        const side1 = frame.player1Id ? [frame.player1Id] : (members.get(m.entry1Id ?? "") ?? []);
        const side2 = frame.player2Id ? [frame.player2Id] : (members.get(m.entry2Id ?? "") ?? []);
        for (const p of [...side1, ...side2]) addTo(players, p, ms);
      }
      const timed = frames.flatMap((f) => (f.ms === null ? [] : [f.ms]));
      const durationMs = matchDuration(m, now);
      return {
        match: m,
        durationMs,
        waitMs: waitToStart(m),
        framesPlayed: m.frames.length,
        frameMs: timed,
        avgFrameMs: average(timed),
        // What the frames played so far would have taken at the baseline.
        baselineMs: durationMs === null ? null : m.frames.length * baselineMs,
      };
    });

  const playerRows = [...players].map(([playerId, s]) => ({ playerId, ...s, avgMs: s.totalMs / s.frames }));

  // ---- Tables
  const tableRows = input.tables
    .map((table) => {
      const onTable = matchRows.filter((r) => r.match.tableId === table.id && r.durationMs !== null);
      const busyMs = sum(onTable.map((r) => r.durationMs!));
      const frames = sum(onTable.map((r) => r.framesPlayed));
      const timed = onTable.flatMap((r) => r.frameMs);
      const first = Math.min(...onTable.map((r) => +r.match.startedAt!));
      const anyLive = onTable.some((r) => r.match.status === "LIVE");
      const last = anyLive ? +now : Math.max(...onTable.map((r) => +(r.match.completedAt ?? now)));
      return {
        table,
        matches: onTable.length,
        frames,
        busyMs,
        // Between its first match starting and its last finishing (or now), time with nothing being played.
        idleMs: onTable.length ? Math.max(0, last - first - busyMs) : 0,
        framesPerHour: busyMs > 0 ? frames / (busyMs / 3_600_000) : null,
        avgFrameMs: average(timed),
      };
    })
    .filter((r) => r.matches > 0);

  // ---- Overview
  const starts = played.flatMap((m) => (m.startedAt ? [+m.startedAt] : []));
  const firstStart = starts.length ? new Date(Math.min(...starts)) : null;
  const counted = matches.filter((m) => !m.isBye && m.status !== "VOID");
  const completed = matchRows.filter((r) => r.match.status === "COMPLETED" && r.durationMs !== null);
  const waits = matchRows.flatMap((r) => (r.waitMs === null ? [] : [r.waitMs]));
  const actualTotal = sum(allFrameMs);
  const finished = matches.length > 0 && matches.every(isDone);
  const lastEnd = finished ? new Date(Math.max(...matches.flatMap((m) => (m.completedAt ? [+m.completedAt] : [0])))) : null;

  // The pace used for what's left: the baseline, eased towards the comp's real frame time as frames come in.
  const paceMs = (BASELINE_WEIGHT * baselineMs + actualTotal) / (BASELINE_WEIGHT + allFrameMs.length);
  const changeoverMs = waits.length >= 3 ? average(waits)! : DEFAULT_CHANGEOVER_MS;
  const projection = finished ? null : projectFinish(input, paceMs, changeoverMs);
  const baselineProjection = finished ? null : projectFinish(input, baselineMs, changeoverMs);

  return {
    baselineMs,
    overview: {
      firstStart,
      lastEnd,
      elapsedMs: firstStart ? +(lastEnd ?? now) - +firstStart : null,
      matchesDone: counted.filter(isDone).length,
      matchesTotal: counted.length,
      framesTimed: allFrameMs.length,
      avgFrameMs: average(allFrameMs),
      avgMatchMs: average(completed.map((r) => r.durationMs!)),
      avgWaitMs: average(waits),
      // Positive = the frames played so far took longer than the baseline.
      vsBaselineMs: allFrameMs.length ? actualTotal - allFrameMs.length * baselineMs : null,
      paceMs,
    },
    projection,
    baselineProjection,
    matches: matchRows,
    players: playerRows,
    tables: tableRows,
  };
}

export type Timings = ReturnType<typeof computeTimings>;

// ---------------------------------------------------------------------------------------------
// Projected finish

type Task = {
  id: string;
  order: [number, number, number];
  deps: string[];
  /** Frames still to play (0 = nothing to play, e.g. a bye). */
  frames: number;
  /** Must be played on this table (its group's table, or the one it's already on). */
  tableId: string | null;
  /** Under way now: it holds its table from the start of the plan. */
  live?: boolean;
  /** Already sent to its table at this time (the changeover started then). */
  calledAt?: number;
};

/** Typical frames a match takes: this comp's average for similar matches, else an estimate from its format. */
function expectedFrames(input: TimingsInput, knockout: boolean, raceTo: number) {
  const frameList = input.matchFrames.length > 0;
  const finish = knockout ? input.koFinish : input.groupFinish;
  if (frameList && finish === "ALL") return input.matchFrames.length;
  const similar = input.matches.filter(
    (m) =>
      m.status === "COMPLETED" &&
      !m.walkover &&
      m.frames.length > 0 &&
      (m.bracket !== "GROUP") === knockout &&
      (frameList || m.raceTo === raceTo),
  );
  if (similar.length >= 2) return average(similar.map((m) => m.frames.length))!;
  // A race to N between evenly matched players runs to about 1.6N frames; a first-to-majority frame list to most of its frames.
  return frameList ? input.matchFrames.length * 0.85 : Math.max(1, 1.6 * raceTo - 0.5);
}

/** Frames left in a match that's under way: what's typical, but at least what the leader still needs. */
function framesLeft(input: TimingsInput, m: TimedMatch) {
  const expected = expectedFrames(input, m.bracket !== "GROUP", m.raceTo);
  const minNeeded = input.matchFrames.length ? 1 : Math.max(1, Math.min((m.target1 ?? m.raceTo) - m.score1, (m.target2 ?? m.raceTo) - m.score2));
  return Math.max(expected - m.frames.length, minNeeded);
}

/** Single-elimination rounds for n entrants: matches per round (first round allows for byes). */
function knockoutRounds(n: number) {
  if (n < 2) return [];
  const size = 2 ** Math.ceil(Math.log2(n));
  const rounds = [n - size / 2];
  for (let r = size / 4; r >= 1; r /= 2) rounds.push(r);
  return rounds;
}

/** Matches still to be played, with what each waits for. Includes a not-yet-drawn knockout stage. */
function remainingTasks(input: TimingsInput): { tasks: Task[]; estimatedKnockout: boolean } {
  const byId = new Map(input.matches.map((m) => [m.id, m]));
  const feeders = new Map<string, string[]>();
  for (const m of input.matches) {
    for (const to of [m.winnerToId, m.loserToId]) if (to) feeders.set(to, [...(feeders.get(to) ?? []), m.id]);
  }
  const groupTable = new Map(input.groups.map((g) => [g.id, g.tableId]));
  const tasks: Task[] = [];
  for (const m of input.matches) {
    if (isDone(m)) continue;
    // A grand final reset only happens if the losers' side wins the first one; leave it out until it's on.
    if (m.bracket === "FINAL" && m.round === 2 && m.status === "PENDING") continue;
    const order: Task["order"] = [m.bracket === "GROUP" ? 0 : 1, m.round, m.position];
    const deps = (feeders.get(m.id) ?? []).filter((id) => !isDone(byId.get(id)!));
    if (m.isBye) {
      tasks.push({ id: m.id, order, deps, frames: 0, tableId: null });
      continue;
    }
    const pinned = m.tableId ?? (m.groupId ? (groupTable.get(m.groupId) ?? null) : null);
    if (m.status === "LIVE") {
      tasks.push({ id: m.id, order, deps: [], frames: framesLeft(input, m), tableId: m.tableId, live: true });
    } else {
      const frames = expectedFrames(input, m.bracket !== "GROUP", m.raceTo);
      tasks.push({ id: m.id, order, deps, frames, tableId: pinned, calledAt: m.tableId && m.calledAt ? +m.calledAt : undefined });
    }
  }

  // Groups + knockout before the knockout is drawn: estimate its rounds from the qualifier counts.
  const estimatedKnockout = input.format === "GROUPS_KO" && !input.matches.some((m) => m.bracket !== "GROUP") && input.groups.length > 0;
  if (estimatedKnockout) {
    const groupTasks = tasks.filter((t) => t.order[0] === 0).map((t) => t.id);
    const brackets = [
      { key: "ko", entrants: input.groups.length * Math.max(1, input.qualifiersPerGroup ?? 2) },
      { key: "plate", entrants: input.groups.length * (input.plateQualifiers ?? 0) },
    ];
    for (const b of brackets) {
      const rounds = knockoutRounds(b.entrants);
      let previous = groupTasks;
      rounds.forEach((count, r) => {
        const last = r === rounds.length - 1;
        const raceTo = last && b.key === "ko" && input.raceToFinal ? input.raceToFinal : input.raceTo;
        const ids = Array.from({ length: count }, (_, i) => `${b.key}-${r}-${i}`);
        for (const [i, id] of ids.entries()) {
          tasks.push({ id, order: [1, r + 1, i], deps: previous, frames: expectedFrames(input, true, raceTo), tableId: null });
        }
        if (ids.length) previous = ids;
      });
    }
  }
  return { tasks, estimatedKnockout };
}

/**
 * Play out the rest of the comp on the venue's tables: each match starts once the matches it
 * depends on are done and a table is free, then takes its expected frames at `frameMs` each.
 */
export function projectFinish(input: TimingsInput, frameMs: number, changeoverMs: number) {
  const started = input.matches.some((m) => m.startedAt);
  // Before anything is played, plan from the advertised start (if it's still ahead).
  const from = Math.max(+input.now, !started && input.startsAt ? +input.startsAt : 0);
  const { tasks, estimatedKnockout } = remainingTasks(input);
  if (!tasks.length) return null;

  const tableIds = input.tables.length ? input.tables.map((t) => t.id) : ["_"];
  const free = new Map(tableIds.map((id) => [id, from]));
  const end = new Map<string, number>();
  const groupTables = new Set(input.groups.flatMap((g) => (g.tableId ? [g.tableId] : [])));

  // Matches already on a table hold it first.
  for (const t of tasks.filter((t) => t.live)) {
    const finish = from + t.frames * frameMs;
    end.set(t.id, finish);
    const table = t.tableId && free.has(t.tableId) ? t.tableId : null;
    if (table) free.set(table, Math.max(free.get(table)!, finish));
  }
  const pending = tasks.filter((t) => !end.has(t.id));
  const byOrder = (a: Task, b: Task) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2] - b.order[2];
  pending.sort(byOrder);

  while (pending.length) {
    const readyIdx = pending.findIndex((t) => t.deps.every((d) => end.has(d)));
    if (readyIdx === -1) break; // a dependency outside the plan; stop rather than loop
    // Of the matches that can go, take the one whose players are free soonest (bracket order breaks ties).
    let best = readyIdx;
    let bestReady = Infinity;
    pending.forEach((t, i) => {
      if (!t.deps.every((d) => end.has(d))) return;
      const ready = Math.max(from, ...t.deps.map((d) => end.get(d)!));
      if (ready < bestReady) {
        best = i;
        bestReady = ready;
      }
    });
    const task = pending.splice(best, 1)[0];
    if (task.frames === 0) {
      end.set(task.id, bestReady);
      continue;
    }
    const allowed = task.tableId && free.has(task.tableId) ? [task.tableId] : tableIds.filter((id) => !groupTables.has(id) || task.order[0] === 1);
    const options = allowed.length ? allowed : tableIds;
    // Already called to its table: the changeover started when it was called.
    const changeover = task.calledAt ? Math.max(0, task.calledAt + changeoverMs - from) : changeoverMs;
    let table = options[0];
    let start = Infinity;
    for (const id of options) {
      const s = Math.max(free.get(id)!, bestReady) + changeover;
      if (s < start) {
        start = s;
        table = id;
      }
    }
    const finish = start + task.frames * frameMs;
    free.set(table, finish);
    end.set(task.id, finish);
  }

  return {
    finishAt: new Date(Math.max(...end.values())),
    matchesLeft: tasks.filter((t) => t.frames > 0).length,
    framesLeft: Math.round(sum(tasks.map((t) => t.frames))),
    estimatedKnockout,
    tables: tableIds.length,
  };
}
