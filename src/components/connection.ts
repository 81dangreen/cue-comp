"use client";

import { useSyncExternalStore } from "react";

// Whether this screen can safely send scores. Set by LiveRefresher from the live-update
// connection: "offline" while it's down, "syncing" from reconnecting until the page has
// reloaded the real score, then "online". Scoreboards lock their buttons unless online,
// so a tap can't be lost (sent while offline) or doubled (re-tapped after a dropped reply).

export type ConnectionStatus = "online" | "offline" | "syncing";

let status: ConnectionStatus = "online";
const listeners = new Set<() => void>();

export function setConnection(next: ConnectionStatus) {
  if (next === status) return;
  status = next;
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useConnection(): ConnectionStatus {
  return useSyncExternalStore(subscribe, () => status, () => "online");
}

/** What a locked scoreboard tells players. */
export const LOCKED_MESSAGE: Record<Exclude<ConnectionStatus, "online">, string> = {
  offline: "Connection lost. Scoring is paused until it's back, so no frames go missing.",
  syncing: "Reconnected. Loading the latest score…",
};
