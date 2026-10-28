import type { StandingRow } from "@/lib/standings";
import { cx } from "../ui";

export function GroupTable({
  name,
  rows,
  names,
  qualifiers = 0,
  plate = 0,
  showDraws = false,
  entity = "Player",
  tableName,
  shootoutNeeded = false,
}: {
  name: string;
  rows: StandingRow[];
  names: Map<string, string>;
  /** Places that go through to the knockout, and after them to the plate. */
  qualifiers?: number;
  plate?: number;
  showDraws?: boolean;
  entity?: string;
  /** The group's own table, if it has one. */
  tableName?: string | null;
  /** Rows still level after every tiebreaker are waiting for a shootout result. */
  shootoutNeeded?: boolean;
}) {
  const draws = showDraws || rows.some((r) => r.drawn > 0);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="bg-felt flex items-center justify-between gap-2 px-4 py-2.5">
        <span className="font-display text-xl font-bold tracking-wide uppercase">{name}</span>
        {tableName && <span className="rounded-full bg-white/15 px-3 py-0.5 text-sm font-semibold">{tableName}</span>}
      </div>
      <table className="w-full text-[15px] whitespace-nowrap">
        <thead className="bg-surface-2 text-xs text-muted">
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left font-medium">#</th>
            <th className="px-3 py-2 text-left font-medium">{entity}</th>
            <th className="px-2 py-2 text-right font-medium" title="Played">P</th>
            <th className="px-2 py-2 text-right font-medium" title="Won">W</th>
            {draws && <th className="px-2 py-2 text-right font-medium" title="Drawn">D</th>}
            <th className="px-2 py-2 text-right font-medium" title="Lost">L</th>
            <th className="px-2 py-2 text-right font-medium" title="Frames for–against">F–A</th>
            <th className="px-2 py-2 text-right font-medium" title="Frame difference">+/−</th>
            <th className="px-3 py-2 text-right font-semibold text-foreground" title="Points">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.entryId}
              className={cx(
                "border-b border-border last:border-0",
                i < qualifiers && "bg-accent-soft",
                i >= qualifiers && i < qualifiers + plate && "bg-warn/10",
              )}
            >
              <td className="px-3 py-2 text-muted">{i + 1}</td>
              <td className="w-full px-3 py-2 font-medium whitespace-normal">
                {names.get(r.entryId)}
                {shootoutNeeded && r.tiedWith.length > 0 && (
                  <span className="ml-2 rounded bg-warn/15 px-1.5 py-0.5 text-xs font-semibold text-warn">Shootout</span>
                )}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{r.played}</td>
              <td className="px-2 py-2 text-right tabular-nums">{r.won}</td>
              {draws && <td className="px-2 py-2 text-right tabular-nums">{r.drawn}</td>}
              <td className="px-2 py-2 text-right tabular-nums">{r.lost}</td>
              <td className="px-2 py-2 text-right tabular-nums text-muted">
                {r.framesFor}–{r.framesAgainst}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{r.frameDiff > 0 ? `+${r.frameDiff}` : r.frameDiff}</td>
              <td className="px-3 py-2 text-right font-display text-xl font-bold tabular-nums">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(qualifiers > 0 || plate > 0) && (
        <div className="flex gap-4 border-t border-border px-4 py-2 text-xs text-muted">
          {qualifiers > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-accent-soft ring-1 ring-accent/40" /> Knockout
            </span>
          )}
          {plate > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-warn/20 ring-1 ring-warn/40" /> Plate
            </span>
          )}
        </div>
      )}
    </div>
  );
}
