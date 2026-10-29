"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { nextBreaker } from "@/lib/breaks";
import type { Dish } from "@/lib/constants";
import { LOCKED_MESSAGE, useConnection } from "../connection";
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
  /** ALTERNATE | WINNER: with the first break, decides who breaks each rack. */
  breakRule?: string;
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

const dishButton =
  "flex-1 truncate rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-xs font-medium text-white/75 active:bg-white/15 disabled:opacity-40 sm:rounded-xl sm:py-3 sm:text-sm";

const SIDE = {
  1: { chip: "bg-sky-400/25 text-sky-100", ring: "ring-sky-300/60" },
  2: { chip: "bg-amber-400/25 text-amber-100", ring: "ring-amber-300/60" },
} as const;

export function Scoreboard(props: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  // Scoring waits while the connection is down or the real score is reloading after it.
  const connection = useConnection();
  const locked = connection !== "online";
  const busy = pending || locked;
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
  // Who breaks this rack; unknown when the match was started without choosing the first breaker.
  const breaker = nextBreaker(props.breakRule ?? "ALTERNATE", props.breakSlot, props.frames);

  function send(slot: 1 | 2, dish: Dish | null) {
    setError(null);
    startTransition(async () => {
      addOptimistic({ slot, by: 1 });
      const res = await props.addFrame(slot, dish);
      if (res?.error) {
        setError(res.error);
        router.refresh();
      }
    });
  }

  function scoreRack(slot: 1 | 2, dish: Dish | null = null) {
    if (!scorable || busy) return;
    const next = (slot === 1 ? score.s1 : score.s2) + 1;
    if (props.confirmFinish && next >= target(slot)) {
      setFinishing({ slot, dish });
      return;
    }
    send(slot, dish);
  }

  function undo() {
    const last = props.frames.at(-1);
    if (!last || busy) return;
    setError(null);
    startTransition(async () => {
      addOptimistic({ slot: last.winner as 1 | 2, by: -1 });
      const res = await props.undo();
      if (res?.error) {
        setError(res.error);
        router.refresh();
      }
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
      <div className={cx("relative flex min-h-0 min-w-0 flex-1 flex-col gap-2", lost && "opacity-40")}>
        <button
          type="button"
          onClick={() => scoreRack(slot)}
          disabled={!scorable || locked}
          className={cx(
            "flex min-h-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 p-2 shadow-xl transition select-none sm:gap-3 sm:rounded-3xl sm:p-4",
            "bg-gradient-to-b from-white/[0.09] to-white/[0.03]",
            scorable && "active:scale-[0.985] active:from-white/15",
            won && "border-emerald-300/70 from-emerald-400/25 to-emerald-400/5",
          )}
        >
          <span className="flex max-w-full items-center gap-2">
            <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full sm:h-3 sm:w-3", slot === 1 ? "bg-sky-300" : "bg-amber-300")} />
            <span className="line-clamp-3 text-center text-[clamp(1rem,min(6.5vw,4.5vh),2.25rem)] leading-tight font-semibold break-words">
              {name(slot)}
            </span>
            {rank && <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-xs font-bold text-white/85 sm:text-sm">R{rank}</span>}
          </span>
          {(!evenRace || start !== 0) && (
            <span className="text-xs font-medium text-white/70 sm:text-sm">
              {!evenRace && <>Race to {target(slot)}</>}
              {!evenRace && start !== 0 && " · "}
              {start > 0 && <>Started {start} up</>}
              {start < 0 && <>Started on {start}</>}
            </span>
          )}
          {/* The score grows with the screen but always leaves room for the rest of the panel. */}
          <span className="text-[clamp(4rem,min(38vw,32vh),13rem)] leading-none font-black tabular-nums drop-shadow-lg">{value}</span>
          <span className="flex min-h-6 flex-wrap items-center justify-center gap-1.5">
            {breaker === slot && !finished && (
              <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-black uppercase sm:px-3 sm:py-1 sm:text-xs">
                Breaking
              </span>
            )}
            {hill && <span className="rounded-full bg-amber-300 px-2.5 py-0.5 text-[11px] font-bold text-black sm:px-3 sm:py-1 sm:text-xs">HILL</span>}
            {won && <span className="rounded-full bg-emerald-300 px-3 py-0.5 text-xs font-bold text-black sm:px-4 sm:py-1 sm:text-sm">WINNER</span>}
          </span>
        </button>
        {scorable && (
          // A break & run belongs to the breaker and a reverse dish to the other player; offer only those.
          <div className="flex flex-col gap-2 sm:flex-row">
            {(breaker === null || breaker === slot) && (
              <button type="button" onClick={() => scoreRack(slot, "BREAK")} disabled={locked} className={dishButton}>
                + Break &amp; run
              </button>
            )}
            {(breaker === null || breaker !== slot) && (
              <button type="button" onClick={() => scoreRack(slot, "REVERSE")} disabled={locked} className={dishButton}>
                + Reverse dish
              </button>
            )}
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
    // Fills the screen exactly (no scrolling) from a 6" phone up; players stay side by side.
    <div className="flex h-dvh flex-col gap-2 overflow-hidden bg-[radial-gradient(ellipse_at_top,#1d3a6b_0%,#0d1d3b_45%,#060d1c_100%)] p-2 text-white sm:gap-3 sm:p-4">
      <header className="flex items-center justify-between gap-2 text-xs text-white/70 sm:text-sm">
        {props.backHref ? (
          <Link href={props.backHref} className="rounded-lg px-2 py-1 hover:bg-white/10">
            ← Back
          </Link>
        ) : (
          <span className="shrink-0 rounded-lg bg-white/10 px-2.5 py-1 font-semibold text-white">{props.tableName}</span>
        )}
        <div className="min-w-0 truncate text-center">
          <span className="font-semibold text-white">{props.tournamentName}</span> · {props.roundName}
        </div>
        <div className="shrink-0 text-right whitespace-nowrap">
          {props.backHref && props.tableName && <span className="mr-2">{props.tableName}</span>}
          {evenRace ? (
            <>
              Race to <span className="font-bold text-white sm:text-lg">{target(1)}</span>
            </>
          ) : (
            <span className="font-semibold text-white">Handicap race</span>
          )}
        </div>
      </header>
      {props.handicapNote && (
        <p className="truncate rounded-lg bg-amber-300/15 px-3 py-1 text-center text-xs font-semibold text-amber-100 sm:text-sm">
          Handicap: {props.handicapNote}
        </p>
      )}

      <div className="flex min-h-0 flex-1 gap-2 sm:gap-3">
        {panel(1)}
        {panel(2)}
      </div>

      <footer className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" aria-label="Rack history">
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
        <div className="flex shrink-0 items-center gap-2">
          {locked && <span className="text-xs font-semibold text-amber-200 sm:text-sm">{LOCKED_MESSAGE[connection as "offline"]}</span>}
          {error && <span className="max-w-40 text-xs font-medium text-red-300 sm:text-sm">{error}</span>}
          {props.status === "READY" && <span className="hidden text-sm text-white/70 sm:inline">Tap a player to score the first rack</span>}
          <button
            type="button"
            onClick={undo}
            disabled={!props.canUndo || busy || (props.confirmFinish && finished)}
            className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold whitespace-nowrap active:bg-white/20 disabled:opacity-30 sm:px-5 sm:py-3 sm:text-sm"
          >
            Undo
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
