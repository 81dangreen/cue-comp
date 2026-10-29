"use client";

import { useState, useTransition } from "react";
import { tableStartMatchAction } from "@/actions/table";
import { useConnection } from "../connection";

/** "Who breaks?" — starting the match from the tablet records the first break. */
export function StartMatch({ matchId, player1, player2 }: { matchId: string; player1: string; player2: string }) {
  const [pending, startTransition] = useTransition();
  const locked = useConnection() !== "online";
  const [error, setError] = useState<string | null>(null);
  const start = (slot: 1 | 2) =>
    startTransition(async () => {
      setError(null);
      const res = await tableStartMatchAction(matchId, slot);
      if (res?.error) setError(res.error);
    });
  return (
    <div className="w-full max-w-3xl">
      <p className="mb-4 text-center text-lg font-medium text-white/75">Who breaks first?</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {([1, 2] as const).map((slot) => (
          <button
            key={slot}
            type="button"
            disabled={pending || locked}
            onClick={() => start(slot)}
            className="rounded-2xl border border-white/15 bg-white/10 px-4 py-[min(1.5rem,3vh)] text-xl sm:text-2xl font-bold shadow-lg active:scale-[0.98] active:bg-white/20 disabled:opacity-50"
          >
            <span className={`mr-3 inline-block h-3 w-3 rounded-full ${slot === 1 ? "bg-sky-300" : "bg-amber-300"}`} />
            {slot === 1 ? player1 : player2}
          </button>
        ))}
      </div>
      {error && <p className="mt-4 text-center text-red-300">{error}</p>}
    </div>
  );
}
