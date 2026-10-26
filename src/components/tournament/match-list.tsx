import Link from "next/link";
import type { ReactNode } from "react";
import type { MatchWithTable } from "@/lib/queries";
import { Badge, cx, LiveBadge } from "../ui";

export function StatusBadge({ status }: { status: string }) {
  if (status === "LIVE") return <LiveBadge />;
  if (status === "COMPLETED") return <Badge>Finished</Badge>;
  if (status === "READY") return <Badge tone="accent">Ready</Badge>;
  return <Badge>Waiting</Badge>;
}

/**
 * Compact one-line list of matches. `labels` (matchId → round name) adds a round column for lists
 * that mix rounds; `actions` renders an extra column per match.
 */
export function MatchList({
  matches,
  names,
  labels,
  linkFor,
  actions,
}: {
  matches: MatchWithTable[];
  names: Map<string, string>;
  labels?: Map<string, string>;
  linkFor?: (m: MatchWithTable) => string | undefined;
  actions?: (m: MatchWithTable) => ReactNode;
}) {
  return (
    <div className="divide-y divide-border">
      {matches.map((m) => {
        const n1 = m.entry1Id ? names.get(m.entry1Id) : "TBD";
        const n2 = m.entry2Id ? names.get(m.entry2Id) : "TBD";
        const done = m.status === "COMPLETED";
        const href = linkFor?.(m);
        const row = (
          <div className={cx("grid items-center gap-3", labels ? "grid-cols-[9rem_1fr_auto_1fr]" : "grid-cols-[1fr_auto_1fr]")}>
            {labels && <span className="truncate text-xs text-muted">{labels.get(m.id)}</span>}
            <span className={cx("truncate text-right text-[15px]", done && (m.winnerId === m.entry1Id ? "font-semibold" : "text-muted"))}>{n1}</span>
            <span className="min-w-16 rounded-md border border-border bg-surface-2 px-2 py-1 text-center text-[15px] font-bold tabular-nums">
              {m.status === "PENDING" || m.status === "READY" ? "v" : `${m.score1} – ${m.score2}`}
            </span>
            <span className={cx("truncate text-[15px]", done && (m.winnerId === m.entry2Id ? "font-semibold" : "text-muted"))}>{n2}</span>
          </div>
        );
        return (
          <div key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">{href ? <Link href={href} className="block hover:opacity-80">{row}</Link> : row}</div>
            <div className="flex items-center gap-2 text-sm text-muted">
              {m.table && <span>{m.table.name}</span>}
              <StatusBadge status={m.status} />
              {actions?.(m)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
