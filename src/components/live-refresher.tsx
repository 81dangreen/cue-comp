"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { setConnection } from "./connection";

/** The server pings every 25 seconds; this long without a word means the connection has quietly died. */
const HEARTBEAT_TIMEOUT_MS = 40_000;

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
  onDark,
}: {
  tournamentId?: string;
  tableId?: string;
  quiet?: boolean;
  banner?: boolean;
  /** Light text for use on felt headers. */
  onDark?: boolean;
}) {
  const router = useRouter();
  // null until the first connection attempt resolves, so nothing flashes on load.
  const [connected, setConnected] = useState<boolean | null>(null);
  // After a reconnect, scoring stays locked until the refreshed page (the real score) has arrived.
  const [refreshing, startRefresh] = useTransition();
  const resyncing = useRef(false);
  useEffect(() => {
    if (resyncing.current && !refreshing) {
      resyncing.current = false;
      setConnection("online");
    }
  }, [refreshing]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (tournamentId) params.set("tournament", tournamentId);
    if (tableId) params.set("table", tableId);
    let source: EventSource;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dropped = false;
    let lastHeard = Date.now();
    const refreshSoon = () => {
      // Coalesce bursts (e.g. a result that advances several matches).
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 150);
    };
    const lost = () => {
      setConnected(false);
      setConnection("offline");
      dropped = true;
    };
    const connect = () => {
      lastHeard = Date.now();
      source = new EventSource(`/api/live?${params}`);
      source.onopen = () => {
        lastHeard = Date.now();
        setConnected(true);
        if (dropped) {
          // Changes may have been missed: reload the page, and keep scoring locked until it arrives.
          setConnection("syncing");
          resyncing.current = true;
          startRefresh(() => router.refresh());
        }
        dropped = false;
      };
      source.onerror = lost;
      source.addEventListener("ping", () => (lastHeard = Date.now()));
      source.addEventListener("change", () => {
        lastHeard = Date.now();
        refreshSoon();
      });
    };
    const reconnect = () => {
      source.close();
      connect();
    };
    connect();

    // The browser often knows the network has gone (or come back) before the live connection
    // does, and a connection can die without any error, so listen for both and watch the heartbeat.
    const wentOffline = lost;
    const cameBack = () => dropped && reconnect();
    const watchdog = setInterval(() => {
      if (Date.now() - lastHeard > HEARTBEAT_TIMEOUT_MS) {
        lost();
        reconnect();
      }
    }, 5_000);
    window.addEventListener("offline", wentOffline);
    window.addEventListener("online", cameBack);
    return () => {
      clearTimeout(timer);
      clearInterval(watchdog);
      source.close();
      window.removeEventListener("offline", wentOffline);
      window.removeEventListener("online", cameBack);
    };
  }, [tournamentId, tableId, router]);

  if (banner) {
    if (connected !== false) return null;
    return (
      <div className="fixed inset-x-0 top-0 z-50 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-black">
        Connection lost: reconnecting… Scoring is paused until it&apos;s back.
      </div>
    );
  }
  if (quiet) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${onDark ? "text-white/75" : "text-muted"}`}
      title={connected ? "Live updates on" : "Reconnecting…"}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? (onDark ? "bg-pop" : "bg-accent") : "bg-muted"}`} />
      {connected ? "Live" : connected === null ? "Connecting" : "Offline"}
    </span>
  );
}
