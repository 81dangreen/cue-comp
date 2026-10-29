"use client";

import { useState } from "react";
import { PickChip, useClearOnSuccess, type Pick } from "./pair-picker";
import { PlayerSearch, type PlayerOption } from "./player-search";

/**
 * Singles entries: type a name, pick them (or add them as new), and the box is ready for the next.
 * Everyone picked is listed above the box and added together. Clears itself once its form succeeds.
 */
export function PlayerPicker({ players, entered }: { players: PlayerOption[]; entered: PlayerOption[] }) {
  const [chosen, setChosen] = useState<Pick[]>([]);
  const ref = useClearOnSuccess(() => setChosen([]));
  const taken = new Set(chosen.map((c) => ("player" in c ? c.player.id : null)));
  const newNames = new Set(chosen.map((c) => ("newName" in c ? c.newName.toLowerCase() : null)));

  return (
    <div ref={ref} className="space-y-2">
      {chosen.map((c, i) => (
        <div key={"player" in c ? c.player.id : `new-${c.newName}`}>
          {"player" in c ? (
            <input type="hidden" name="playerId" value={c.player.id} />
          ) : (
            <input type="hidden" name="newPlayer" value={c.newName} />
          )}
          <PickChip pick={c} onRemove={() => setChosen(chosen.filter((_, j) => j !== i))} removeLabel="Remove" />
        </div>
      ))}
      <span className="block pt-1 text-sm font-medium">{chosen.length ? "Add another" : "Player"}</span>
      <PlayerSearch
        label="Find or add a player"
        players={players}
        exclude={taken}
        entered={entered}
        onPick={(player) => setChosen([...chosen, { player }])}
        onNew={(newName) => !newNames.has(newName.toLowerCase()) && setChosen([...chosen, { newName }])}
      />
    </div>
  );
}
