"use client";

import { useState } from "react";
import { Input } from "../ui";

/**
 * Checkbox list of directory players with a filter box. Filtered-out rows are hidden,
 * not removed, so ticks survive changing the search.
 */
export function PlayerPicker({ players }: { players: { id: string; name: string; detail?: string | null }[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = (p: (typeof players)[number]) => !q || `${p.name} ${p.detail ?? ""}`.toLowerCase().includes(q);
  const shown = players.filter(matches).length;

  return (
    <div className="space-y-2">
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the player directory…"
        aria-label="Search players"
      />
      <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
        {players.map((p) => (
          <label
            key={p.id}
            className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-surface-2"
            style={matches(p) ? undefined : { display: "none" }}
          >
            <input type="checkbox" name="playerId" value={p.id} />
            <span>{p.name}</span>
            {p.detail && <span className="text-muted">· {p.detail}</span>}
          </label>
        ))}
        {shown === 0 && <p className="px-2 py-1 text-sm text-muted">No match. Add them as a new player below.</p>}
      </div>
    </div>
  );
}
