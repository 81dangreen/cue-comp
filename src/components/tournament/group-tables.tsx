import type { StandingRow } from "@/lib/standings";
import { cx } from "../ui";

export function GroupTable({
  name,
  rows,
  names,
  qualifiers = 0,
}: {
  name: string;
  rows: StandingRow[];
  names: Map<string, string>;
  qualifiers?: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="bg-header px-4 py-2.5 font-semibold text-header-fg">{name}</div>
      <table className="w-full text-[15px]">
        <thead className="bg-surface-2 text-xs text-muted">
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left font-medium">#</th>
            <th className="px-3 py-2 text-left font-medium">Player</th>
            <th className="px-2 py-2 text-right font-medium" title="Played">P</th>
            <th className="px-2 py-2 text-right font-medium" title="Won">W</th>
            <th className="px-2 py-2 text-right font-medium" title="Lost">L</th>
            <th className="px-2 py-2 text-right font-medium" title="Frames for–against">F–A</th>
            <th className="px-3 py-2 text-right font-medium" title="Frame difference">+/−</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.entryId} className={cx("border-b border-border last:border-0", i < qualifiers && "bg-accent-soft")}>
              <td className="px-3 py-2 text-muted">{i + 1}</td>
              <td className="px-3 py-2 font-medium">{names.get(r.entryId)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{r.played}</td>
              <td className="px-2 py-2 text-right tabular-nums">{r.won}</td>
              <td className="px-2 py-2 text-right tabular-nums">{r.lost}</td>
              <td className="px-2 py-2 text-right tabular-nums text-muted">
                {r.framesFor}–{r.framesAgainst}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.frameDiff > 0 ? `+${r.frameDiff}` : r.frameDiff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
