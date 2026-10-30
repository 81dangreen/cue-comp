"use client";

import type { ReactNode } from "react";
import { useFillScreen } from "../scoring/use-fill-screen";

/** A table tablet screen at least as tall as the window, even where viewport units go stale. */
export function FillMain({ className, children }: { className: string; children: ReactNode }) {
  const fill = useFillScreen("minHeight");
  return (
    <main style={fill} className={className}>
      {children}
    </main>
  );
}
