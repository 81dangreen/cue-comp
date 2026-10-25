"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Subscribes to live changes and re-renders the current page's server
 * components when something changes. After a dropped connection it refreshes
 * once on reconnect, since changes may have been missed meanwhile.
 *
 * `indicator` shows a small connection dot; `banner` shows a full-width
 * warning while disconnected (for unattended screens like table tablets).
 */
export function LiveRefresher({
  tournamentId,
  tableId,
  quiet,
  banner,
}: {
  tournamentId?: string;
  tableId?: string;
  quiet?: boolean;
  banner?: boolean;
}) {
  const router = useRouter();
  // null until the first connection attempt resolves, so nothing flashes on load.
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (tournamentId) params.set("tournament", tournamentId);
    if (tableId) params.set("table", tableId);
    const source = new EventSource(`/api/live?${params}`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dropped = false;
    const refreshSoon = () => {
      // Coalesce bursts (e.g. a result that advances several matches).
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 150);
    };
    source.onopen = () => {
      setConnected(true);
      if (dropped) refreshSoon();
      dropped = false;
    };
    source.onerror = () => {
      setConnected(false);
      dropped = true;
    };
    source.addEventListener("change", refreshSoon);
    return () => {
      clearTimeout(timer);
      source.close();
    };
  }, [tournamentId, tableId, router]);

  if (banner) {
    if (connected !== false) return null;
    return (
      <div className="fixed inset-x-0 top-0 z-50 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-black">
        Connection lost — reconnecting… Scores entered now may not save.
      </div>
    );
  }
  if (quiet) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={connected ? "Live updates on" : "Reconnecting…"}>
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-accent" : "bg-muted"}`} />
      {connected ? "Live" : connected === null ? "Connecting" : "Offline"}
    </span>
  );
}
