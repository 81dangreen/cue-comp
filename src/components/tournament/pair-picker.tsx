"use client";

import { useEffect, useRef, useState } from "react";
import { FORM_SUCCESS_EVENT } from "../forms";
import { Button, Field, Input } from "../ui";

type Option = { id: string; name: string; detail?: string | null };

/**
 * Choose the two players of a pair from the directory: tap a name to fill Player 1, then Player 2.
 * Either slot can instead take a new player's name. Clears itself once its form succeeds.
 */
export function PairPicker({ players }: { players: Option[] }) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<[Option | null, Option | null]>([null, null]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    const clear = () => {
      setChosen([null, null]);
      setQuery("");
    };
    form?.addEventListener(FORM_SUCCESS_EVENT, clear);
    return () => form?.removeEventListener(FORM_SUCCESS_EVENT, clear);
  }, []);

  const q = query.trim().toLowerCase();
  const taken = new Set(chosen.map((c) => c?.id));
  const shown = players.filter((p) => !taken.has(p.id) && (!q || `${p.name} ${p.detail ?? ""}`.toLowerCase().includes(q)));
  /**
   * Which slot a picked player fills: an open slot with nothing typed in it, else the open slot
   * whose typed name matches them (e.g. after "Player 2 is already in the directory"), else the first open one.
   */
  const targetSlot = (p: Option): 0 | 1 => {
    const typed = (i: number) =>
      (ref.current?.querySelector<HTMLInputElement>(`input[name="newPlayer${i + 1}"]`)?.value ?? "").trim().toLowerCase();
    const open = ([0, 1] as const).filter((i) => !chosen[i]);
    const name = p.name.toLowerCase();
    return (
      open.find((i) => typed(i) && (name.includes(typed(i)) || typed(i).includes(name))) ??
      open.find((i) => !typed(i)) ??
      open[0]
    );
  };
  const pick = (p: Option) => {
    const slot = targetSlot(p);
    setChosen(slot === 0 ? [p, chosen[1]] : [chosen[0], p]);
    setQuery("");
  };

  return (
    <div ref={ref} className="space-y-3">
      {[0, 1].map((i) => {
        const c = chosen[i];
        return (
          <div key={i}>
            <input type="hidden" name={`player${i + 1}Id`} value={c?.id ?? ""} />
            {c ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-sm">
                <span>
                  <span className="text-muted">Player {i + 1}:</span> <span className="font-semibold">{c.name}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  className="px-2 py-0.5 text-xs"
                  onClick={() => setChosen(i === 0 ? [null, chosen[1]] : [chosen[0], null])}
                >
                  Change
                </Button>
              </div>
            ) : (
              <Field label={`Player ${i + 1}`} hint="Pick from the list below, or type a new player's name">
                <Input name={`newPlayer${i + 1}`} placeholder="New player: First Last" />
              </Field>
            )}
          </div>
        );
      })}
      {(!chosen[0] || !chosen[1]) && (
        <>
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the player directory…"
            aria-label="Search players"
          />
          <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1.5">
            {shown.slice(0, 100).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2"
              >
                <span>{p.name}</span>
                {p.detail && <span className="text-muted">· {p.detail}</span>}
              </button>
            ))}
            {shown.length === 0 && <p className="px-2 py-1 text-sm text-muted">No match. Type them in as a new player above.</p>}
          </div>
        </>
      )}
    </div>
  );
}
