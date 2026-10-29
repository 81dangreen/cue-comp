import { describe, expect, it } from "vitest";
import { computeTimings, estimatedStarts, frameDurations, projectFinish, type TimedMatch, type TimingsInput } from "./timings";

const T0 = new Date("2026-11-14T10:00:00Z");
const at = (min: number) => new Date(+T0 + min * 60_000);
const MIN = 60_000;

function match(over: Partial<TimedMatch> & { id: string }): TimedMatch {
  return {
    bracket: "WINNERS",
    round: 1,
    position: 1,
    groupId: null,
    status: "PENDING",
    isBye: false,
    walkover: false,
    raceTo: 3,
    target1: null,
    target2: null,
    score1: 0,
    score2: 0,
    entry1Id: null,
    entry2Id: null,
    tableId: null,
    calledAt: null,
    startedAt: null,
    completedAt: null,
    winnerToId: null,
    loserToId: null,
    frames: [],
    ...over,
  };
}
const frames = (...mins: number[]) => mins.map((m, i) => ({ number: i + 1, player1Id: null, player2Id: null, createdAt: at(m) }));

function input(over: Partial<TimingsInput>): TimingsInput {
  return {
    now: at(60),
    startsAt: null,
    frameMinutes: 15,
    format: "SINGLE_ELIM",
    raceTo: 3,
    raceToFinal: null,
    matchFrames: [],
    groupFinish: "FIRST_TO",
    koFinish: "FIRST_TO",
    qualifiersPerGroup: null,
    plateQualifiers: null,
    tables: [{ id: "t1", name: "Table 1" }],
    groups: [],
    entries: [
      { id: "e1", playerId: "p1", partnerId: null },
      { id: "e2", playerId: "p2", partnerId: null },
    ],
    matches: [],
    ...over,
  };
}

describe("frameDurations", () => {
  it("times each frame from the previous one, the first from the match start", () => {
    const d = frameDurations({ startedAt: at(0), frames: frames(12, 30, 40) });
    expect(d.map((f) => f.ms)).toEqual([12 * MIN, 18 * MIN, 10 * MIN]);
  });

  it("leaves out slips: a frame scored at the start, or one over 45 minutes", () => {
    const d = frameDurations({ startedAt: at(0), frames: frames(0, 50, 60) });
    expect(d.map((f) => f.ms)).toEqual([null, null, 10 * MIN]);
  });
});

describe("computeTimings", () => {
  const done = match({
    id: "m1",
    status: "COMPLETED",
    entry1Id: "e1",
    entry2Id: "e2",
    tableId: "t1",
    calledAt: at(-4),
    startedAt: at(0),
    completedAt: at(50),
    frames: frames(15, 35, 50),
  });

  it("averages frame and match times and measures them against the baseline", () => {
    const t = computeTimings(input({ matches: [done] }));
    expect(t.overview.avgFrameMs).toBeCloseTo((50 / 3) * MIN);
    expect(t.overview.avgMatchMs).toBe(50 * MIN);
    expect(t.overview.vsBaselineMs).toBe(5 * MIN); // 50 minutes for three 15-minute frames
    expect(t.overview.avgWaitMs).toBe(4 * MIN);
    expect(t.overview.matchesDone).toBe(1);
  });

  it("gives every frame to both players in singles", () => {
    const t = computeTimings(input({ matches: [done] }));
    const p1 = t.players.find((p) => p.playerId === "p1")!;
    expect(p1.frames).toBe(3);
    expect(p1.minMs).toBe(15 * MIN);
    expect(p1.maxMs).toBe(20 * MIN);
  });

  it("gives a pairs singles frame to the two players who played it and doubles frames to all four", () => {
    const pairs = input({
      entries: [
        { id: "e1", playerId: "a1", partnerId: "b1" },
        { id: "e2", playerId: "a2", partnerId: "b2" },
      ],
      matchFrames: ["D", "AA"],
      matches: [
        match({
          ...done,
          frames: [
            { number: 1, player1Id: null, player2Id: null, createdAt: at(15) },
            { number: 2, player1Id: "a1", player2Id: "a2", createdAt: at(25) },
          ],
        }),
      ],
    });
    const t = computeTimings(pairs);
    const count = (id: string) => t.players.find((p) => p.playerId === id)?.frames;
    expect([count("a1"), count("b1"), count("a2"), count("b2")]).toEqual([2, 1, 2, 1]);
  });

  it("shows table busy and idle time", () => {
    const second = match({ ...done, id: "m2", position: 2, startedAt: at(55), completedAt: at(60), frames: frames(60) });
    const t = computeTimings(input({ matches: [done, second] }));
    expect(t.tables[0]).toMatchObject({ matches: 2, frames: 4, busyMs: 55 * MIN, idleMs: 5 * MIN });
  });

  it("skips walkovers and results entered without frames", () => {
    const wo = match({ id: "w", status: "COMPLETED", walkover: true, startedAt: at(0), completedAt: at(0) });
    const entered = match({ id: "x", status: "COMPLETED", startedAt: at(1), completedAt: at(1) });
    const t = computeTimings(input({ matches: [wo, entered] }));
    expect(t.overview.avgMatchMs).toBeNull();
    expect(t.matches.find((r) => r.match.id === "x")?.durationMs).toBeNull();
  });
});

describe("projectFinish", () => {
  // A 4-player knockout: two semis feeding a final.
  const semi1 = match({ id: "s1", winnerToId: "f" });
  const semi2 = match({ id: "s2", position: 2, winnerToId: "f" });
  const final = match({ id: "f", round: 2 });

  it("plays matches side by side on two tables, then the final after both", () => {
    const p = projectFinish(input({ now: at(0), tables: [{ id: "t1", name: "1" }, { id: "t2", name: "2" }], matches: [semi1, semi2, final] }), 10 * MIN, 0)!;
    // Race to 3 ≈ 4.3 frames each: semis together (43 min), then the final (43 min).
    expect(+p.finishAt - +at(0)).toBeCloseTo(2 * 4.3 * 10 * MIN, -4);
    expect(p.matchesLeft).toBe(3);
  });

  it("takes longer with one table", () => {
    const two = projectFinish(input({ now: at(0), tables: [{ id: "t1", name: "1" }, { id: "t2", name: "2" }], matches: [semi1, semi2, final] }), 10 * MIN, 0)!;
    const one = projectFinish(input({ now: at(0), matches: [semi1, semi2, final] }), 10 * MIN, 0)!;
    expect(+one.finishAt).toBeGreaterThan(+two.finishAt);
  });

  it("lets a live match finish first, needing at least what the leader still needs", () => {
    const live = match({ id: "l", status: "LIVE", tableId: "t1", startedAt: at(0), score1: 2, score2: 2, frames: frames(10, 20, 30, 40) });
    const p = projectFinish(input({ now: at(40), matches: [live] }), 10 * MIN, 0)!;
    expect(+p.finishAt - +at(40)).toBe(10 * MIN); // one deciding frame
  });

  it("plans from the advertised start before anything is played", () => {
    const p = projectFinish(input({ now: at(-120), startsAt: at(0), matches: [semi1] }), 10 * MIN, 0)!;
    expect(+p.finishAt).toBeGreaterThan(+at(0));
  });

  it("estimates a knockout that hasn't been drawn yet", () => {
    const g = (id: string, groupId: string) => match({ id, bracket: "GROUP", groupId });
    const p = projectFinish(
      input({ now: at(0), format: "GROUPS_KO", qualifiersPerGroup: 2, groups: [{ id: "A", tableId: null }, { id: "B", tableId: null }], matches: [g("a", "A"), g("b", "B")] }),
      10 * MIN,
      0,
    )!;
    expect(p.estimatedKnockout).toBe(true);
    expect(p.matchesLeft).toBe(2 + 3); // 4 qualifiers: two semis and a final
  });

  it("leaves out a grand final reset that may not be needed", () => {
    const p = projectFinish(input({ now: at(0), matches: [match({ id: "gf", bracket: "FINAL" }), match({ id: "r", bracket: "FINAL", round: 2 })] }), 10 * MIN, 0)!;
    expect(p.matchesLeft).toBe(1);
  });
});

describe("estimatedStarts", () => {
  it("gives each match still to play a start: the final after both semis", () => {
    const semi1 = match({ id: "s1", winnerToId: "f", status: "READY", tableId: "t1", calledAt: at(-1) });
    const semi2 = match({ id: "s2", position: 2, winnerToId: "f", status: "READY" });
    const final = match({ id: "f", round: 2 });
    const live = match({ id: "l", status: "LIVE", startedAt: at(-20), tableId: "t2", frames: frames(-10) });
    const starts = estimatedStarts(input({ now: at(0), tables: [{ id: "t1", name: "1" }, { id: "t2", name: "2" }], matches: [live, semi1, semi2, final] }));
    expect(starts.has("l")).toBe(false); // already under way
    expect(+starts.get("s1")!).toBeLessThan(+starts.get("s2")!); // on its table already; s2 waits for the live match
    expect(+starts.get("f")!).toBeGreaterThan(+starts.get("s2")!);
  });

  it("has nothing to say before anything is played or a start time is set", () => {
    expect(estimatedStarts(input({ now: at(0), matches: [match({ id: "a", status: "READY" })] })).size).toBe(0);
  });
});
