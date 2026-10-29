"use client";

import { useEffect, useRef, useState } from "react";
import { FORM_SUCCESS_EVENT } from "../forms";
import { Button } from "../ui";
import { PlayerSearch, type PlayerOption } from "./player-search";

/** A chosen player: someone from the directory, or a new name to add with the pair. */
export type Pick = { player: PlayerOption } | { newName: string };

/** Clears picker state once the surrounding ActionForm succeeds. */
export function useClearOnSuccess(clear: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(clear);
  useEffect(() => {
    latest.current = clear;
  });
  useEffect(() => {
    const form = ref.current?.closest("form");
    const onSuccess = () => latest.current();
    form?.addEventListener(FORM_SUCCESS_EVENT, onSuccess);
    return () => form?.removeEventListener(FORM_SUCCESS_EVENT, onSuccess);
  }, []);
  return ref;
}

export function PickChip({ pick, prefix, onRemove, removeLabel }: { pick: Pick; prefix?: string; onRemove: () => void; removeLabel: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-sm">
      <span className="min-w-0">
        {prefix && <span className="text-muted">{prefix}</span>}{" "}
        <span className="font-semibold">{"player" in pick ? pick.player.name : pick.newName}</span>
        {"newName" in pick && <span className="ml-1.5 text-xs text-muted">(new player)</span>}
      </span>
      <Button type="button" variant="ghost" className="shrink-0 px-2 py-0.5 text-xs" onClick={onRemove}>
        {removeLabel}
      </Button>
    </div>
  );
}

/**
 * The two players of a pair, each found by typing in their own box: pick them from the directory
 * or add the typed name as a new player. Clears itself once its form succeeds.
 */
export function PairPicker({ players, entered }: { players: PlayerOption[]; entered: PlayerOption[] }) {
  const [chosen, setChosen] = useState<[Pick | null, Pick | null]>([null, null]);
  const ref = useClearOnSuccess(() => setChosen([null, null]));
  const set = (i: number, pick: Pick | null) => setChosen(i === 0 ? [pick, chosen[1]] : [chosen[0], pick]);
  const taken = new Set(chosen.map((c) => (c && "player" in c ? c.player.id : null)));

  return (
    <div ref={ref} className="space-y-3">
      {[0, 1].map((i) => {
        const c = chosen[i];
        return (
          <div key={i}>
            <input type="hidden" name={`player${i + 1}Id`} value={c && "player" in c ? c.player.id : ""} />
            <input type="hidden" name={`newPlayer${i + 1}`} value={c && "newName" in c ? c.newName : ""} />
            {c ? (
              <PickChip pick={c} prefix={`Player ${i + 1}:`} onRemove={() => set(i, null)} removeLabel="Change" />
            ) : (
              <>
                <span className="mb-1 block text-sm font-medium">Player {i + 1}</span>
                <PlayerSearch
                  label={`Player ${i + 1}`}
                  players={players}
                  exclude={taken}
                  entered={entered}
                  onPick={(player) => set(i, { player })}
                  onNew={(newName) => set(i, { newName })}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
