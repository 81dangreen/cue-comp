import { generateDrawAction, saveEntries } from "@/actions/tournaments";
import { groupName } from "@/lib/bracket";
import { drawsIntoGroups, groupSizes, knockoutLines, manualDrawProblems, manualGroups } from "@/lib/manual-draw";
import { entryNames, type TournamentFull } from "@/lib/queries";
import { Card, CardHeader } from "../ui";
import { DrawBuilder, type DrawLayout } from "./draw-builder";

/**
 * Entering a draw done in the room: the first-round matches (or the groups) with a dropdown for
 * each place, then generating it. Shown in the control room once "Enter the draw yourself" is chosen.
 */
export function DrawCard({ t, word }: { t: TournamentFull; word: string }) {
  const confirmed = t.entries.filter((e) => e.status === "CONFIRMED");
  const names = entryNames(t.entries);
  const groupCount = Math.max(1, t.groupCount ?? 2);
  const groups = drawsIntoGroups(t.format);
  const problems = manualDrawProblems(confirmed, t.format, groupCount, word);
  const layout: DrawLayout = groups
    ? { kind: "groups", sizes: groupSizes(confirmed.length, groupCount), names: Array.from({ length: groupCount }, (_, i) => `Group ${groupName(i)}`) }
    : { kind: "knockout", lines: knockoutLines(confirmed.length) };
  // What's saved so far, as places in the layout.
  const initial: Record<string, string> = {};
  if (groups) {
    // Anyone beyond a group's places (from an earlier, uneven pick) is left to be placed again.
    const sizes = layout.kind === "groups" ? layout.sizes : [];
    manualGroups(confirmed, groupCount).forEach((ids, g) => ids.slice(0, sizes[g]).forEach((id, i) => (initial[`g${g}-${i + 1}`] = id)));
  } else {
    for (const e of confirmed) if (e.seed !== null && e.seed >= 1 && e.seed <= confirmed.length) initial[`d${e.seed}`] ??= e.id;
  }
  const options = confirmed.map((e) => ({ id: e.id, name: names.get(e.id) ?? "?" })).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Card>
      <CardHeader
        title="Enter the draw"
        subtitle={
          groups
            ? `Pick each ${word.replace(/s$/, "")} into their group as they come out of the draw. A name picked once drops out of the other lists.`
            : `Pick each ${word.replace(/s$/, "")} into the first-round matches as they come out of the draw. A name picked once drops out of the other lists.`
        }
      />
      <DrawBuilder
        entries={options}
        layout={layout}
        initial={initial}
        save={saveEntries.bind(null, t.id)}
        generate={generateDrawAction.bind(null, t.id)}
        savedReady={problems.length === 0}
        word={word}
      />
    </Card>
  );
}
