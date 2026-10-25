import "server-only";
import { EventEmitter } from "node:events";

// In-process pub/sub for live updates. Fine for a single server; swap for
// Redis or Postgres LISTEN/NOTIFY when running more than one instance.

export type LiveEvent = { tournamentId: string; tableIds: string[]; at: number };

const globalForEvents = globalThis as unknown as { liveEvents?: EventEmitter };
const emitter = globalForEvents.liveEvents ?? new EventEmitter();
emitter.setMaxListeners(0);
globalForEvents.liveEvents = emitter;

export function publish(tournamentId: string, tableIds: (string | null | undefined)[] = []) {
  const event: LiveEvent = {
    tournamentId,
    tableIds: tableIds.filter((t): t is string => !!t),
    at: Date.now(),
  };
  emitter.emit("change", event);
}

export function subscribe(listener: (event: LiveEvent) => void) {
  emitter.on("change", listener);
  return () => {
    emitter.off("change", listener);
  };
}
