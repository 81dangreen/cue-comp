"use client";

import { useEffect, useState } from "react";

const BACKGROUND = "#060d1c";

/**
 * The window's height in pixels, kept up to date through rotation and full screen, for a scoreboard
 * that fills the screen. Some tablet browsers leave viewport units at a stale height after rotating or
 * going full screen (leaving a band of page below the board), so the board is sized from this once
 * mounted. Also darkens the page behind the board while it's open, so any gap isn't white.
 */
export function useFillScreen() {
  const [height, setHeight] = useState<number>();
  useEffect(() => {
    const update = () => setHeight(window.visualViewport?.height ?? window.innerHeight);
    update();
    const root = document.documentElement;
    const before = root.style.backgroundColor;
    root.style.backgroundColor = BACKGROUND;
    const events = ["resize", "orientationchange", "fullscreenchange"] as const;
    for (const e of events) window.addEventListener(e, update);
    window.visualViewport?.addEventListener("resize", update);
    // Rotation can report the old size first; check again once it has settled.
    const settle = () => setTimeout(update, 300);
    window.addEventListener("orientationchange", settle);
    return () => {
      root.style.backgroundColor = before;
      for (const e of events) window.removeEventListener(e, update);
      window.visualViewport?.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", settle);
    };
  }, []);
  return height === undefined ? undefined : { height };
}
