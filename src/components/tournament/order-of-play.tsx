import Link from "next/link";
import type { MatchWithTable } from "@/lib/queries";
import type { orderOfPlay } from "@/lib/views";
import { cx } from "../ui";

type Props = {
  order: ReturnType<typeof orderOfPlay>;
  names: Map<string, string>;
  labels: Map<string, string>;
  hrefFor: (m: MatchWithTable) => string;
};

const QUEUE_LIMIT = 12;

/**
 * A fixture: first pair right-aligned, the score (or "v") in a fixed middle column, second pair
 * left-aligned, so the scores line up down the list. Long names wrap within their own column.
 */
function Fixture({ m, names }: { m: MatchWithTable; names: Map<string, string> }) {
  const live = m.status === "LIVE";
  return (
    <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_3.75rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] sm:gap-3">
      <span className="text-right text-sm leading-snug font-medium break-words sm:text-base">
        <SideName name={names.get(m.entry1Id!)} />
      </span>
      <span
        className={cx(
          "justify-self-center rounded-md px-2 py-0.5 text-center tabular-nums",
          live ? "bg-surface-2 font-display text-xl font-bold text-foreground ring-1 ring-border" : "text-sm text-muted",
        )}
      >
        {live ? `${m.score1} – ${m.score2}` : "v"}
      </span>
      <span className="text-sm leading-snug font-medium break-words sm:text-base">
        <SideName name={names.get(m.entry2Id!)} />
      </span>
    </span>
  );
}

/** A pair's name breaks at the "&" on phones (one player per line) rather than mid-name. */
function SideName({ name = "" }: { name?: string }) {
  const parts = name.split(" & ");
  if (parts.length !== 2) return <>{name}</>;
  return (
    <>
      <span className="block sm:inline">{parts[0]}&nbsp;&amp;</span> <span className="block sm:inline">{parts[1]}</span>
    </>
  );
}

/**
 * Upcoming matches as plain running orders, so players can see when they're on: one list per
 * table for groups with their own table, and a numbered queue for everything else.
 */
export function OrderOfPlay({ order, names, labels, hrefFor }: Props) {
  const { tables, queue } = order;
  return (
    <div className="space-y-4">
      {tables.length > 0 && (
        <div className="space-y-4">
          {tables.map(({ table, group, matches }) => (
            <div key={table.id} className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
              <div className="bg-felt flex items-center gap-3 px-4 py-2.5">
                <span className="font-display text-2xl font-bold tracking-wide uppercase">{table.name}</span>
                <span className="ml-auto rounded-full bg-white/15 px-3 py-0.5 text-sm font-semibold">{group.name}</span>
              </div>
              {matches.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted">Nothing left to play.</p>
              ) : (
                <ol className="divide-y divide-border">
                  {matches.map((m, i) => {
                    const live = m.status === "LIVE";
                    const next = i === matches.findIndex((x) => x.status !== "LIVE");
                    return (
                      <li key={m.id}>
                        <Link
                          href={hrefFor(m)}
                          className={cx(
                            "grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-2 px-3 py-3 text-base hover:bg-surface-2 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:gap-3 sm:px-4",
                            live && "bg-live/5",
                            next && "bg-pop/10",
                          )}
                        >
                          <span
                            className={cx(
                              "w-fit rounded-md px-2 py-0.5 text-xs font-bold",
                              live ? "bg-live text-live-fg" : next ? "bg-pop text-pop-fg" : "text-muted",
                            )}
                          >
                            {live ? "Now" : next ? "Next" : `${i + 1}`}
                          </span>
                          <Fixture m={m} names={names} />
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}

      {queue.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          {tables.length > 0 && <div className="bg-felt px-4 py-2.5 font-display text-xl font-bold tracking-wide uppercase">Other matches</div>}
          <table className="w-full text-[15px]">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr className="border-b border-border">
                <th className="w-12 px-4 py-2 text-left font-medium">#</th>
                <th className="px-2 py-2 text-center font-medium">Match</th>
                <th className="hidden px-2 py-2 text-left font-medium sm:table-cell">Round</th>
                <th className="px-4 py-2 text-right font-medium">Table</th>
              </tr>
            </thead>
            <tbody>
              {queue.slice(0, QUEUE_LIMIT).map((m, i) => (
                <tr key={m.id} className={cx("border-b border-border last:border-0", m.table && "bg-pop/10")}>
                  <td className="px-4 py-2.5 font-display text-lg font-bold text-muted tabular-nums">{i + 1}</td>
                  <td className="px-2 py-2.5">
                    <Link href={hrefFor(m)} className="block hover:text-accent">
                      <Fixture m={m} names={names} />
                    </Link>
                    <span className="block text-center text-xs text-muted sm:hidden">{labels.get(m.id)}</span>
                  </td>
                  <td className="hidden px-2 py-2.5 text-sm text-muted sm:table-cell">{labels.get(m.id)}</td>
                  <td className="px-4 py-2.5 text-right text-sm whitespace-nowrap">
                    {m.table ? (
                      <span className="font-semibold">{m.table.name}</span>
                    ) : (
                      <span className="text-muted">Awaiting table</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {queue.length > QUEUE_LIMIT && (
            <p className="border-t border-border px-4 py-2 text-sm text-muted">+{queue.length - QUEUE_LIMIT} more after these</p>
          )}
        </div>
      )}
    </div>
  );
}
