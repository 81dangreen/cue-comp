"use client";

import { useEffect } from "react";

/** Keeps an unattended tablet's screen on. Browsers release the lock when the tab is hidden, so re-acquire on return. */
export function WakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    async function acquire() {
      try {
        if (document.visibilityState === "visible" && "wakeLock" in navigator) {
          lock = await navigator.wakeLock.request("screen");
          if (cancelled) await lock.release();
        }
      } catch {
        // Not supported, or denied (e.g. low battery): the screen just follows the device's timeout.
      }
    }
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, []);
  return null;
}
