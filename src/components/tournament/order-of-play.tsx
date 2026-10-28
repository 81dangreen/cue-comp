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

function Teams({ m, names, stacked }: { m: MatchWithTable; names: Map<string, string>; stacked?: boolean }) {
  if (stacked) {
    // One pair per line: long pair names stay readable in a narrow column.
    return (
      <span className="min-w-0 leading-snug">
        <span className="block font-medium">{names.get(m.entry1Id!)}</span>
        <span className="block">
          <span className="mr-1.5 text-muted">v</span>
          <span className="font-medium">{names.get(m.entry2Id!)}</span>
        </span>
      </span>
    );
  }
  return (
    <span className="min-w-0">
      <span className="font-medium">{names.get(m.entry1Id!)}</span>
      <span className="mx-1.5 text-muted">v</span>
      <span className="font-medium">{names.get(m.entry2Id!)}</span>
    </span>
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
        <div className="grid gap-4 md:grid-cols-2">
          {tables.map(({ table, group, matches }) => (
            <div key={table.id} className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
              <div className="flex items-center justify-between bg-header px-4 py-2.5 text-header-fg">
                <span className="font-semibold">{table.name}</span>
                <span className="text-sm text-header-fg/75">{group.name}</span>
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
                          className={cx("grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 px-4 py-2.5 text-[15px] hover:bg-surface-2", live && "bg-live/5")}
                        >
                          <span
                            className={cx(
                              "w-fit rounded-md px-2 py-0.5 text-xs font-bold",
                              live ? "bg-live text-live-fg" : next ? "bg-accent-soft text-accent" : "text-muted",
                            )}
                          >
                            {live ? "Now" : next ? "Next" : `${i + 1}`}
                          </span>
                          <Teams m={m} names={names} stacked />
                          {live && (
                            <span className="font-bold tabular-nums">
                              {m.score1}–{m.score2}
                            </span>
                          )}
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
          {tables.length > 0 && <div className="bg-header px-4 py-2.5 font-semibold text-header-fg">Other matches</div>}
          <table className="w-full text-[15px]">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr className="border-b border-border">
                <th className="w-12 px-4 py-2 text-left font-medium">#</th>
                <th className="px-2 py-2 text-left font-medium">Match</th>
                <th className="hidden px-2 py-2 text-left font-medium sm:table-cell">Round</th>
                <th className="px-4 py-2 text-right font-medium">Table</th>
              </tr>
            </thead>
            <tbody>
              {queue.slice(0, QUEUE_LIMIT).map((m, i) => (
                <tr key={m.id} className={cx("border-b border-border last:border-0", m.table && "bg-accent-soft/60")}>
                  <td className="px-4 py-2.5 text-muted tabular-nums">{i + 1}</td>
                  <td className="px-2 py-2.5">
                    <Link href={hrefFor(m)} className="hover:text-accent">
                      <Teams m={m} names={names} />
                    </Link>
                    <span className="block text-xs text-muted sm:hidden">{labels.get(m.id)}</span>
                  </td>
                  <td className="hidden px-2 py-2.5 text-sm text-muted sm:table-cell">{labels.get(m.id)}</td>
                  <td className="px-4 py-2.5 text-right text-sm whitespace-nowrap">
                    {m.table ? <span className="font-semibold text-accent">{m.table.name}</span> : <span className="text-muted">Awaiting table</span>}
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
