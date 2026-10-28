"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  frameAt,
  frameKindShort,
  frameOutcome,
  framePlayers,
  isSingles,
  type FrameFormat,
  type Lineup,
} from "@/lib/match-format";
import type { FramePick } from "@/actions/matches";
import type { ActionResult } from "../forms";
import { cx } from "../ui";

type Member = { id: string; name: string };

export type FrameMatchProps = {
  tournamentName: string;
  roundName: string;
  tableName?: string | null;
  /** Omitted on table tablets, which have nowhere to go back to. */
  backHref?: string;
  team1: string;
  team2: string;
  members: { 1: Member[]; 2: Member[] };
  format: FrameFormat;
  lineupMode: string;
  lineup: Lineup | null;
  /** Most singles one player may play (frame-by-frame picks). */
  quota: number;
  status: string;
  score1: number;
  score2: number;
  target1: number;
  target2: number;
  handicapNote?: string | null;
  winnerSlot: 1 | 2 | null;
  breakSlot?: number | null;
  frames: { number: number; winner: number; player1Id: string | null; player2Id: string | null }[];
  /** Ask before saving the frame that decides the match (players score their own matches on tablets). */
  confirmFinish?: boolean;
  addFrame: (slot: 1 | 2, breakAndRun: boolean, picked?: FramePick) => Promise<ActionResult>;
  undo: () => Promise<ActionResult>;
};

const SIDE = {
  1: { dot: "bg-sky-300", chip: "bg-sky-400/25 text-sky-100", button: "border-sky-300/40 from-sky-400/25 to-sky-400/5" },
  2: { dot: "bg-amber-300", chip: "bg-amber-400/25 text-amber-100", button: "border-amber-300/40 from-amber-400/25 to-amber-400/5" },
} as const;

const screen = "flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,#1d3a6b_0%,#0d1d3b_45%,#060d1c_100%)] p-3 text-white sm:p-6";

/** Who breaks a frame: the first breaker, then alternating. */
const breakerOf = (breakSlot: number | null | undefined, frameNumber: number) =>
  breakSlot ? ((frameNumber % 2 === 1 ? breakSlot : 3 - breakSlot) as 1 | 2) : null;

/** Scoring for frame-list matches: a strip of every frame and big "who won this frame" buttons. */
export function FrameScoreboard(props: FrameMatchProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [breakAndRun, setBreakAndRun] = useState(false);
  const [picked, setPicked] = useState<FramePick>({});
  const [finishing, setFinishing] = useState<1 | 2 | null>(null);

  const name = new Map([...props.members[1], ...props.members[2]].map((m) => [m.id, m.name]));
  const finished = props.status === "COMPLETED";
  const scorable = props.status === "LIVE";
  const played = props.frames.length;
  const next = frameAt(props.format, played);
  const singles = isSingles(next.kind);
  const pickEach = props.lineupMode === "PICK_FRAME" && singles;
  const fromLineup = framePlayers(next.kind, props.lineup);
  const nextPlayers = pickEach ? { player1Id: picked.player1Id ?? null, player2Id: picked.player2Id ?? null } : fromLineup;
  const ready = !pickEach || (picked.player1Id && picked.player2Id);
  const sideLabel = (slot: 1 | 2) => {
    const id = slot === 1 ? nextPlayers.player1Id : nextPlayers.player2Id;
    return singles && id ? name.get(id) : slot === 1 ? props.team1 : props.team2;
  };
  const singlesPlayed = (id: string, slot: 1 | 2) => props.frames.filter((f) => (slot === 1 ? f.player1Id : f.player2Id) === id).length;

  function outcomeIf(slot: 1 | 2) {
    return frameOutcome(props.format, {
      score1: props.score1 + (slot === 1 ? 1 : 0),
      score2: props.score2 + (slot === 2 ? 1 : 0),
      played: played + 1,
      target1: props.target1,
      target2: props.target2,
    });
  }

  function send(slot: 1 | 2) {
    setError(null);
    startTransition(async () => {
      const res = await props.addFrame(slot, breakAndRun, pickEach ? picked : undefined);
      if (res?.error) setError(res.error);
      else {
        setBreakAndRun(false);
        setPicked({});
      }
    });
  }

  function tap(slot: 1 | 2) {
    if (!scorable || pending || !ready) return;
    if (props.confirmFinish && outcomeIf(slot).done) {
      setFinishing(slot);
      return;
    }
    send(slot);
  }

  function undo() {
    if (!played || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await props.undo();
      if (res?.error) setError(res.error);
    });
  }

  const resultLine =
    finished && props.winnerSlot
      ? `${props.winnerSlot === 1 ? props.team1 : props.team2} win`
      : finished
        ? "Match drawn"
        : null;
  const preview = finishing ? outcomeIf(finishing) : null;

  return (
    <div className={screen}>
      <header className="mb-3 flex items-center justify-between gap-3 text-sm text-white/70">
        {props.backHref ? (
          <Link href={props.backHref} className="rounded-lg px-2 py-1 hover:bg-white/10">
            ← Back
          </Link>
        ) : (
          <span className="rounded-lg bg-white/10 px-3 py-1 font-semibold text-white">{props.tableName}</span>
        )}
        <div className="min-w-0 truncate text-center">
          <span className="font-semibold text-white">{props.tournamentName}</span> · {props.roundName}
        </div>
        <div className="text-right whitespace-nowrap">
          {props.backHref && props.tableName && <span className="mr-2">{props.tableName}</span>}
          {props.format.finish === "ALL" ? (
            <span className="font-semibold text-white">{props.format.frames.length} frames</span>
          ) : (
            <>
              First to <span className="text-lg font-bold text-white">{props.target1 === props.target2 ? props.target1 : "target"}</span>
            </>
          )}
        </div>
      </header>
      {props.handicapNote && (
        <div className="mb-3 rounded-xl bg-amber-300/15 px-4 py-2 text-center text-sm font-semibold text-amber-100">
          Handicap: {props.handicapNote}
        </div>
      )}

      {/* Match score */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.06] px-4 py-3 sm:px-6">
        <TeamScore slot={1} team={props.team1} score={props.score1} members={props.members[1]} lineup={props.lineup} won={props.winnerSlot === 1} />
        <span className="text-xl font-semibold text-white/40">v</span>
        <TeamScore slot={2} team={props.team2} score={props.score2} members={props.members[2]} lineup={props.lineup} won={props.winnerSlot === 2} />
      </div>

      {/* Current frame */}
      <div className="mt-3 flex flex-1 flex-col justify-center gap-3">
        {finished ? (
          <div className="grid flex-1 place-items-center text-center">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-sky-300 uppercase">Final result</p>
              <p className="mt-2 text-4xl font-bold sm:text-5xl">{resultLine}</p>
              <p className="mt-2 text-6xl font-black tabular-nums">
                {props.score1} – {props.score2}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="text-center">
              <p className="text-sm font-semibold tracking-[0.2em] text-sky-300 uppercase">
                Frame {next.number}
                {!next.decider && ` of ${props.format.frames.length}`} · {next.decider ? "Deciding frame · Doubles" : singles ? "Singles" : "Doubles"}
              </p>
              {breakerOf(props.breakSlot, next.number) && (
                <p className="mt-1 text-sm text-white/60">{breakerOf(props.breakSlot, next.number) === 1 ? props.team1 : props.team2} to break</p>
              )}
            </div>

            {pickEach && (
              <div className="grid gap-3 sm:grid-cols-2">
                {([1, 2] as const).map((slot) => (
                  <div key={slot} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <p className="mb-2 text-center text-sm text-white/70">Who plays for {slot === 1 ? props.team1 : props.team2}?</p>
                    <div className="grid grid-cols-2 gap-2">
                      {props.members[slot].map((m) => {
                        const used = singlesPlayed(m.id, slot) >= props.quota;
                        const on = (slot === 1 ? picked.player1Id : picked.player2Id) === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            disabled={used}
                            onClick={() => setPicked({ ...picked, [slot === 1 ? "player1Id" : "player2Id"]: m.id })}
                            className={cx(
                              "rounded-xl border px-3 py-3 text-lg font-semibold disabled:opacity-30",
                              on ? "border-white bg-white text-black" : "border-white/15 bg-white/10 active:bg-white/20",
                            )}
                          >
                            {m.name}
                            {used && <span className="block text-xs font-normal">played {props.quota}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-center text-white/70">{ready ? "Tap the winner of this frame" : "Choose both players first"}</p>
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              {([1, 2] as const).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  disabled={!scorable || !ready || pending}
                  onClick={() => tap(slot)}
                  className={cx(
                    "flex min-h-32 flex-col items-center justify-center gap-2 rounded-3xl border bg-gradient-to-b p-4 shadow-xl transition select-none",
                    SIDE[slot].button,
                    "active:scale-[0.985] disabled:opacity-40",
                  )}
                >
                  <span className="flex max-w-full items-center gap-2">
                    <span className={cx("h-3 w-3 shrink-0 rounded-full", SIDE[slot].dot)} />
                    <span className="truncate text-2xl font-bold sm:text-4xl">{sideLabel(slot)}</span>
                  </span>
                  {singles && nextPlayers[slot === 1 ? "player1Id" : "player2Id"] && (
                    <span className="text-sm text-white/60">{slot === 1 ? props.team1 : props.team2}</span>
                  )}
                  <span className="text-sm font-semibold text-white/80">won the frame</span>
                </button>
              ))}
            </div>
            <label className="mx-auto flex items-center gap-2 text-sm text-white/75">
              <input type="checkbox" checked={breakAndRun} onChange={(e) => setBreakAndRun(e.target.checked)} className="h-5 w-5" />
              Break &amp; run (dish)
            </label>
          </>
        )}
      </div>

      {/* Every frame */}
      <footer className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <ol className="flex max-w-full gap-1.5 overflow-x-auto pb-1" aria-label="Frames">
          {Array.from({ length: Math.max(props.format.frames.length, played) }, (_, i) => {
            const f = props.frames[i];
            const at = frameAt(props.format, i);
            const who = f ? { player1Id: f.player1Id, player2Id: f.player2Id } : framePlayers(at.kind, props.lineup);
            const label = isSingles(at.kind)
              ? who.player1Id && who.player2Id
                ? `${firstName(name.get(who.player1Id))} v ${firstName(name.get(who.player2Id))}`
                : frameKindShort(at.kind)
              : "Doubles";
            return (
              <li
                key={i}
                title={label}
                className={cx(
                  "flex w-[4.5rem] shrink-0 flex-col items-center rounded-lg px-1 py-1 text-center",
                  f ? SIDE[f.winner as 1 | 2].chip : i === played && !finished ? "bg-white/20 ring-2 ring-white" : "bg-white/5 text-white/50",
                )}
              >
                <span className="text-xs font-bold">{at.decider ? "Decider" : i + 1}</span>
                <span className="w-full truncate text-[11px]">{label}</span>
              </li>
            );
          })}
        </ol>
        <div className="flex items-center gap-3">
          {error && <span className="text-sm font-medium text-red-300">{error}</span>}
          <button
            type="button"
            onClick={undo}
            disabled={!played || pending || (props.confirmFinish && finished)}
            className="rounded-xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-semibold active:bg-white/20 disabled:opacity-30"
          >
            Undo last frame
          </button>
        </div>
      </footer>

      {finishing && preview?.done && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-6" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#0f2140] p-6 text-center shadow-2xl">
            <p className="text-sm font-medium tracking-wide text-white/60 uppercase">Confirm result</p>
            <p className="mt-3 text-3xl font-bold">
              {preview.winner ? `${preview.winner === 1 ? props.team1 : props.team2} win` : "Match drawn"}
            </p>
            <p className="mt-2 text-5xl font-black tabular-nums">
              {props.score1 + (finishing === 1 ? 1 : 0)} – {props.score2 + (finishing === 2 ? 1 : 0)}
            </p>
            <p className="mt-3 text-sm text-white/60">
              {props.team1} v {props.team2}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFinishing(null)}
                className="rounded-xl border border-white/15 bg-white/5 py-4 text-lg font-semibold active:bg-white/15"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  send(finishing);
                  setFinishing(null);
                }}
                className="rounded-xl bg-emerald-400 py-4 text-lg font-bold text-black active:bg-emerald-300"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const firstName = (full?: string) => full?.split(" ")[0] ?? "";

function TeamScore({
  slot,
  team,
  score,
  members,
  lineup,
  won,
}: {
  slot: 1 | 2;
  team: string;
  score: number;
  members: Member[];
  lineup: Lineup | null;
  won: boolean;
}) {
  const letter = (id: string) => (lineup ? (lineup[slot].A === id ? "A" : lineup[slot].B === id ? "B" : null) : null);
  const ordered = lineup ? [...members].sort((a, b) => (letter(a.id) ?? "").localeCompare(letter(b.id) ?? "")) : members;
  return (
    <div className={cx("flex min-w-0 items-center gap-4", slot === 2 && "flex-row-reverse text-right")}>
      <span className={cx("text-6xl leading-none font-black tabular-nums sm:text-8xl", won && "text-emerald-300")}>{score}</span>
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate text-lg font-bold sm:text-2xl">
          <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", SIDE[slot].dot, slot === 2 && "order-last")} />
          <span className="truncate">{team}</span>
        </p>
        <p className="truncate text-sm text-white/65">
          {ordered.map((m, i) => (
            <span key={m.id}>
              {i > 0 && " · "}
              {letter(m.id) && <span className="mr-1 rounded bg-white/15 px-1 text-xs font-bold">{letter(m.id)}</span>}
              {m.name}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

/**
 * Before a frame-list match: who breaks the first frame, and (when the pairs choose) each pair's
 * Player A and Player B. With a random draw the order is revealed once the match starts.
 */
export function FrameMatchStart({
  team1,
  team2,
  members,
  lineupMode,
  start,
}: {
  team1: string;
  team2: string;
  members: { 1: Member[]; 2: Member[] };
  lineupMode: string;
  start: (breakSlot: 1 | 2, lineup: Lineup | null) => Promise<ActionResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [playerA, setPlayerA] = useState<{ 1?: string; 2?: string }>({});
  const choose = lineupMode === "PICK_MATCH";
  const lineup: Lineup | null =
    choose && playerA[1] && playerA[2]
      ? {
          1: { A: playerA[1], B: members[1].find((m) => m.id !== playerA[1])!.id },
          2: { A: playerA[2], B: members[2].find((m) => m.id !== playerA[2])!.id },
        }
      : null;
  const ready = !choose || !!lineup;
  const go = (slot: 1 | 2) =>
    startTransition(async () => {
      setError(null);
      const res = await start(slot, lineup);
      if (res?.error) setError(res.error);
    });

  return (
    <div className="w-full max-w-3xl space-y-6">
      {choose && (
        <div className="grid gap-4 sm:grid-cols-2">
          {([1, 2] as const).map((slot) => (
            <div key={slot} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="mb-3 text-center text-white/75">
                Who is <span className="font-bold text-white">Player A</span> for {slot === 1 ? team1 : team2}?
              </p>
              <div className="grid grid-cols-2 gap-2">
                {members[slot].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPlayerA({ ...playerA, [slot]: m.id })}
                    className={cx(
                      "rounded-xl border px-3 py-3 text-lg font-semibold",
                      playerA[slot] === m.id ? "border-white bg-white text-black" : "border-white/15 bg-white/10 active:bg-white/20",
                    )}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {lineupMode === "RANDOM" && <p className="text-center text-white/70">The order of play (Player A and B) is drawn when the match starts.</p>}
      {lineupMode === "PICK_FRAME" && <p className="text-center text-white/70">You&apos;ll choose who plays before each singles frame.</p>}
      <div>
        <p className="mb-4 text-center text-lg font-medium text-white/75">{ready ? "Who breaks the first frame?" : "Choose both Player As first"}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {([1, 2] as const).map((slot) => (
            <button
              key={slot}
              type="button"
              disabled={pending || !ready}
              onClick={() => go(slot)}
              className="rounded-2xl border border-white/15 bg-white/10 px-6 py-6 text-2xl font-bold shadow-lg active:scale-[0.98] active:bg-white/20 disabled:opacity-40"
            >
              <span className={cx("mr-3 inline-block h-3 w-3 rounded-full", SIDE[slot].dot)} />
              {slot === 1 ? team1 : team2}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-center text-red-300">{error}</p>}
    </div>
  );
}
