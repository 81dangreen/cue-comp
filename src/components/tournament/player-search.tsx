"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { cx, Input } from "../ui";

export type PlayerOption = { id: string; name: string; detail?: string | null };

const MAX_SHOWN = 8;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * One box that searches the player directory as you type. Matching players appear underneath
 * to tap; the last row adds the typed name as a new player, unless someone of that exact name
 * is already listed (then they're the one to pick: a namesake is added from the directory page).
 */
export function PlayerSearch({
  players,
  entered = [],
  exclude,
  onPick,
  onNew,
  label,
  autoFocus,
}: {
  players: PlayerOption[];
  /** Players already in this comp: shown, but not pickable. */
  entered?: PlayerOption[];
  /** Ids already picked in this form: left out of the matches, but still count as taken names. */
  exclude?: Set<string | null>;
  onPick: (p: PlayerOption) => void;
  onNew: (name: string) => void;
  label: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const q = norm(query);
  const words = q.split(" ").filter(Boolean);
  const hit = (p: PlayerOption) => {
    const text = norm(`${p.name} ${p.detail ?? ""}`);
    return words.every((w) => text.includes(w));
  };
  // Names starting with what's typed come first; otherwise keep the directory's order.
  const rank = (p: PlayerOption) => (norm(p.name).startsWith(q) ? 0 : 1);
  const found = q ? players.filter((p) => !exclude?.has(p.id) && hit(p)).sort((a, b) => rank(a) - rank(b)) : [];
  const shown = found.slice(0, MAX_SHOWN);
  const alreadyIn = q ? entered.filter(hit).slice(0, 3) : [];
  const exact = [...players, ...entered].some((p) => norm(p.name) === q);
  const canAdd = words.length >= 2 && !exact;
  // Keyboard choices: the shown players, then "add new".
  const choices = shown.length + (canAdd ? 1 : 0);

  const clear = () => {
    setQuery("");
    setActive(0);
  };
  const choose = (i: number) => {
    if (i < shown.length) onPick(shown[i]);
    else if (canAdd) onNew(query.trim().replace(/\s+/g, " "));
    else return;
    clear();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // Never submit the form from the search box; Enter takes the highlighted row.
      e.preventDefault();
      if (choices) choose(Math.min(active, choices - 1));
    } else if (e.key === "ArrowDown" && choices) {
      e.preventDefault();
      setActive((a) => (a + 1) % choices);
    } else if (e.key === "ArrowUp" && choices) {
      e.preventDefault();
      setActive((a) => (a - 1 + choices) % choices);
    } else if (e.key === "Escape") {
      clear();
    }
  };
  const row = (i: number) =>
    cx(
      "flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm",
      i === Math.min(active, choices - 1) ? "bg-accent-soft" : "hover:bg-surface-2",
    );

  return (
    <div>
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        placeholder="Type a name…"
        aria-label={label}
        role="combobox"
        aria-expanded={!!q}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        autoFocus={autoFocus}
        className="w-full"
      />
      {q && (
        <ul id={listId} role="listbox" className="mt-1 space-y-0.5 rounded-lg border border-border bg-surface p-1">
          {shown.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button type="button" onClick={() => choose(i)} onMouseEnter={() => setActive(i)} className={row(i)}>
                <span className="font-medium">{p.name}</span>
                {p.detail && <span className="truncate text-muted">· {p.detail}</span>}
              </button>
            </li>
          ))}
          {found.length > MAX_SHOWN && (
            <li className="px-2.5 py-1 text-xs text-muted">{found.length - MAX_SHOWN} more: keep typing to narrow it down</li>
          )}
          {alreadyIn.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-2.5 py-2 text-sm text-muted">
              <span>{p.name}</span>
              <span className="text-xs">· already in this comp</span>
            </li>
          ))}
          {canAdd ? (
            <li role="option" aria-selected={active >= shown.length}>
              <button
                type="button"
                onClick={() => choose(shown.length)}
                onMouseEnter={() => setActive(shown.length)}
                className={cx(row(shown.length), "text-accent")}
              >
                <span className="font-semibold">+ Add “{query.trim()}” as a new player</span>
              </button>
            </li>
          ) : exact ? (
            <li className="px-2.5 py-1.5 text-xs text-muted">
              A different person with this name? Add them in the player directory with something to tell them apart.
            </li>
          ) : (
            !shown.length && !alreadyIn.length && <li className="px-2.5 py-1.5 text-xs text-muted">No match. Type their first and last name to add them.</li>
          )}
        </ul>
      )}
    </div>
  );
}
