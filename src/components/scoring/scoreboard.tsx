"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import type { Dish } from "@/lib/constants";
import type { ActionResult } from "../forms";
import { cx } from "../ui";

type Props = {
  roundName: string;
  tournamentName: string;
  /** Omitted on table tablets, which have nowhere to go back to. */
  backHref?: string;
  raceTo: number;
  status: string;
  tableName?: string | null;
  player1: string;
  player2: string;
  score1: number;
  score2: number;
  winnerSlot: 1 | 2 | null;
  breakSlot?: number | null;
  /** Handicap: each side's race target (defaults to raceTo), starting score and rank. */
  target1?: number;
  target2?: number;
  handicap1?: number;
  handicap2?: number;
  rank1?: number | null;
  rank2?: number | null;
  /** e.g. "Sam starts 1 up"; shown under the header. */
  handicapNote?: string | null;
  canUndo: boolean;
  frames: { winner: number; breakAndRun: boolean; reverseDish: boolean }[];
  /** Ask before saving the rack that wins the match (players score their own matches on tablets). */
  confirmFinish?: boolean;
  addFrame: (slot: 1 | 2, dish: Dish | null) => Promise<ActionResult>;
  undo: () => Promise<ActionResult>;
};

const SIDE = {
  1: { chip: "bg-sky-400/25 text-sky-100", ring: "ring-sky-300/60" },
  2: { chip: "bg-amber-400/25 text-amber-100", ring: "ring-amber-300/60" },
} as const;

export function Scoreboard(props: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState<{ slot: 1 | 2; dish: Dish | null } | null>(null);
  const [score, addOptimistic] = useOptimistic(
    { s1: props.score1, s2: props.score2 },
    (state, delta: { slot: 1 | 2; by: number }) => ({
      s1: state.s1 + (delta.slot === 1 ? delta.by : 0),
      s2: state.s2 + (delta.slot === 2 ? delta.by : 0),
    }),
  );

  const finished = props.status === "COMPLETED";
  const scorable = props.status === "READY" || props.status === "LIVE";
  const name = (slot: 1 | 2) => (slot === 1 ? props.player1 : props.player2);
  const target = (slot: 1 | 2) => (slot === 1 ? props.target1 : props.target2) ?? props.raceTo;
  const evenRace = target(1) === target(2);

  function send(slot: 1 | 2, dish: Dish | null) {
    setError(null);
    startTransition(async () => {
      addOptimistic({ slot, by: 1 });
      const res = await props.addFrame(slot, dish);
      if (res?.error) setError(res.error);
    });
  }

  function scoreRack(slot: 1 | 2, dish: Dish | null = null) {
    if (!scorable || pending) return;
    const next = (slot === 1 ? score.s1 : score.s2) + 1;
    if (props.confirmFinish && next >= target(slot)) {
      setFinishing({ slot, dish });
      return;
    }
    send(slot, dish);
  }

  function undo() {
    const last = props.frames.at(-1);
    if (!last || pending) return;
    setError(null);
    startTransition(async () => {
      addOptimistic({ slot: last.winner as 1 | 2, by: -1 });
      const res = await props.undo();
      if (res?.error) setError(res.error);
    });
  }

  const panel = (slot: 1 | 2) => {
    const value = slot === 1 ? score.s1 : score.s2;
    const won = finished && props.winnerSlot === slot;
    const lost = finished && props.winnerSlot !== slot;
    const hill = !finished && value === target(slot) - 1;
    const start = (slot === 1 ? props.handicap1 : props.handicap2) ?? 0;
    const rank = slot === 1 ? props.rank1 : props.rank2;
    return (
      <div className={cx("relative flex flex-1 flex-col", lost && "opacity-40")}>
        <button
          type="button"
          onClick={() => scoreRack(slot)}
          disabled={!scorable}
          className={cx(
            "flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl border border-white/10 p-4 shadow-xl transition select-none",
            "bg-gradient-to-b from-white/[0.09] to-white/[0.03]",
            scorable && "active:scale-[0.985] active:from-white/15",
            won && "border-emerald-300/70 from-emerald-400/25 to-emerald-400/5",
          )}
        >
          <span className="flex max-w-full items-center gap-2">
            <span className={cx("h-3 w-3 shrink-0 rounded-full", slot === 1 ? "bg-sky-300" : "bg-amber-300")} />
            <span className="truncate text-2xl font-semibold sm:text-4xl">{name(slot)}</span>
            {rank && <span className="rounded-md bg-white/15 px-2 py-0.5 text-sm font-bold text-white/85">R{rank}</span>}
          </span>
          {(!evenRace || start !== 0) && (
            <span className="text-sm font-medium text-white/70">
              {!evenRace && <>Race to {target(slot)}</>}
              {!evenRace && start !== 0 && " · "}
              {start > 0 && <>Started {start} up</>}
              {start < 0 && <>Started on {start}</>}
            </span>
          )}
          <span className="text-[8rem] leading-none font-black tabular-nums drop-shadow-lg sm:text-[13rem]">{value}</span>
          <span className="flex h-7 items-center gap-2">
            {props.breakSlot === slot && !finished && (
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">Broke first</span>
            )}
            {hill && <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-bold text-black">HILL</span>}
            {won && <span className="rounded-full bg-emerald-300 px-4 py-1 text-sm font-bold text-black">WINNER</span>}
          </span>
        </button>
        {scorable && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => scoreRack(slot, "BREAK")}
              className="rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-white/75 active:bg-white/15"
            >
              + Break &amp; run
            </button>
            <button
              type="button"
              onClick={() => scoreRack(slot, "REVERSE")}
              className="rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-white/75 active:bg-white/15"
            >
              + Reverse dish
            </button>
          </div>
        )}
      </div>
    );
  };

  const confirmScore = finishing
    ? finishing.slot === 1
      ? [score.s1 + 1, score.s2]
      : [score.s1, score.s2 + 1]
    : null;

  return (
    <div className="flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,#1d3a6b_0%,#0d1d3b_45%,#060d1c_100%)] p-3 text-white sm:p-6">
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
          {evenRace ? (
            <>
              Race to <span className="text-lg font-bold text-white">{target(1)}</span>
            </>
          ) : (
            <span className="font-semibold text-white">Handicap race</span>
          )}
        </div>
      </header>
      {props.handicapNote && (
        <div className="mb-3 rounded-xl bg-amber-300/15 px-4 py-2 text-center text-sm font-semibold text-amber-100">
          Handicap: {props.handicapNote}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 sm:flex-row">
        {panel(1)}
        {panel(2)}
      </div>

      <footer className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full gap-1 overflow-x-auto" aria-label="Rack history">
          {props.frames.map((f, i) => (
            <span
              key={i}
              title={`Rack ${i + 1}: ${name(f.winner as 1 | 2)}${f.breakAndRun ? " (break & run)" : f.reverseDish ? " (reverse dish)" : ""}`}
              className={cx(
                "grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-bold",
                SIDE[f.winner as 1 | 2].chip,
                f.breakAndRun && "ring-2 ring-white/70",
                f.reverseDish && "outline-2 outline-offset-1 outline-dashed outline-white/70",
              )}
            >
              {i + 1}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-sm font-medium text-red-300">{error}</span>}
          {props.status === "READY" && <span className="text-sm text-white/70">Tap a player to score the first rack</span>}
          <button
            type="button"
            onClick={undo}
            disabled={!props.canUndo || pending || (props.confirmFinish && finished)}
            className="rounded-xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-semibold active:bg-white/20 disabled:opacity-30"
          >
            Undo last rack
          </button>
        </div>
      </footer>

      {finishing && confirmScore && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-6" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#0f2140] p-6 text-center shadow-2xl">
            <p className="text-sm font-medium tracking-wide text-white/60 uppercase">Confirm result</p>
            <p className="mt-3 text-3xl font-bold">{name(finishing.slot)} wins</p>
            <p className="mt-2 text-5xl font-black tabular-nums">
              {confirmScore[0]} – {confirmScore[1]}
            </p>
            <p className="mt-3 text-sm text-white/60">
              {props.player1} v {props.player2}
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
                  send(finishing.slot, finishing.dish);
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
