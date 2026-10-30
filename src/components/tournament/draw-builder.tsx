"use client";

import { useState } from "react";
import { ActionButton, ActionForm, SubmitButton, type ActionResult, type FormAction } from "../forms";
import { Button, cx, Select } from "../ui";

type Entry = { id: string; name: string };
export type DrawLayout =
  /** First-round matches: the draw number on each side (null = a bye). */
  | { kind: "knockout"; lines: [number | null, number | null][] }
  /** Places per group (Group A, B, ...). */
  | { kind: "groups"; sizes: number[]; names: string[] };

/** Slot keys: "d3" = draw line 3 (knockout); "g1-2" = Group B, place 2. */
type Slots = Record<string, string>;

/**
 * Entering a draw done in the room: a dropdown on each side of each first-round match (or each
 * place in each group). A name picked in one dropdown drops out of the others. Saves each entry's
 * draw number (or group and place) through the entries form.
 */
export function DrawBuilder({
  entries,
  layout,
  initial,
  save,
  generate,
  savedReady,
  word,
}: {
  entries: Entry[];
  layout: DrawLayout;
  initial: Slots;
  save: FormAction;
  generate: () => Promise<ActionResult>;
  /** The saved draw is complete (so it can be generated). */
  savedReady: boolean;
  word: string;
}) {
  const [slots, setSlots] = useState<Slots>(initial);
  const used = new Set(Object.values(slots).filter(Boolean));
  const placed = used.size;
  const dirty = JSON.stringify(clean(slots)) !== JSON.stringify(clean(initial));
  const set = (key: string, id: string) => setSlots({ ...slots, [key]: id });

  const pick = (key: string, label: string) => (
    <Select value={slots[key] ?? ""} onChange={(e) => set(key, e.target.value)} aria-label={label} className={cx("w-full py-1.5", !slots[key] && "text-muted")}>
      <option value="">Choose…</option>
      {entries
        .filter((e) => e.id === slots[key] || !used.has(e.id))
        .map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
    </Select>
  );

  // What gets saved: every entry's draw number (or group and place); unplaced entries clear theirs.
  const hidden: { name: string; value: string }[] = [];
  const where = new Map<string, string>();
  for (const [key, id] of Object.entries(slots)) if (id) where.set(id, key);
  for (const e of entries) {
    const key = where.get(e.id);
    if (layout.kind === "knockout") {
      hidden.push({ name: `seed-${e.id}`, value: key ? key.slice(1) : "" });
    } else {
      const [group, place] = key ? key.slice(1).split("-") : ["", ""];
      hidden.push({ name: `group-${e.id}`, value: group }, { name: `seed-${e.id}`, value: place });
    }
  }

  return (
    <div>
      <ActionForm action={save}>
        {hidden.map((h) => (
          <input key={h.name} type="hidden" name={h.name} value={h.value} />
        ))}
        {layout.kind === "knockout" ? (
          <ol className="divide-y divide-border">
            {layout.lines.map(([a, b], i) => (
              <li key={i} className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 px-4 py-2.5 sm:grid-cols-[2rem_minmax(0,1fr)_1.5rem_minmax(0,1fr)] sm:px-5">
                <span className="row-span-3 font-display text-lg font-bold text-muted sm:row-span-1">{i + 1}</span>
                {a ? pick(`d${a}`, `Match ${i + 1}, first ${word.replace(/s$/, "")}`) : <Bye />}
                <span className="text-center text-sm text-muted">v</span>
                {b ? pick(`d${b}`, `Match ${i + 1}, second ${word.replace(/s$/, "")}`) : <Bye />}
              </li>
            ))}
          </ol>
        ) : (
          <div className="grid gap-px bg-border sm:grid-cols-2">
            {layout.sizes.map((size, g) => (
              <div key={g} className="space-y-2 bg-surface px-4 py-3 sm:px-5">
                <div className="font-display text-lg font-bold uppercase">{layout.names[g]}</div>
                {Array.from({ length: size }, (_, p) => (
                  <div key={p} className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2">
                    <span className="text-sm text-muted">{p + 1}</span>
                    {pick(`g${g}-${p + 1}`, `${layout.names[g]}, place ${p + 1}`)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 sm:px-5">
          <SubmitButton variant={savedReady && !dirty ? "secondary" : "primary"}>Save draw</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setSlots({})} disabled={!placed}>
            Clear
          </Button>
          <span className="text-sm text-muted">
            {placed} of {entries.length} {word} placed
            {dirty && <span className="ml-2 font-semibold text-warn">· not saved yet</span>}
          </span>
        </div>
      </ActionForm>
      {savedReady && !dirty && (
        <div className="border-t border-border px-4 py-3 sm:px-5">
          <ActionButton action={generate}>Generate this draw</ActionButton>
        </div>
      )}
    </div>
  );
}

function Bye() {
  return <span className="rounded-lg border border-dashed border-border px-3 py-1.5 text-sm text-muted">Bye</span>;
}

/** Slots without the empty ones, for comparing with what's saved. */
function clean(slots: Slots) {
  return Object.fromEntries(
    Object.entries(slots)
      .filter(([, v]) => v)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}
