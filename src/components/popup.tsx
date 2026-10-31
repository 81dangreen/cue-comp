"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * A button that opens a small panel next to it (a <details>). The panel is pinned to the screen
 * rather than its card, so a short card (e.g. the last few matches) can't cut it off; it opens
 * upwards when there's more room above, and follows the button on scroll.
 */
export function Popup({
  label,
  summaryClassName,
  panelClassName,
  children,
}: {
  label: ReactNode;
  summaryClassName: string;
  panelClassName: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ position: "fixed", visibility: "hidden" });

  const place = useCallback(() => {
    const summary = ref.current?.querySelector("summary");
    if (!summary || !panel.current) return;
    const r = summary.getBoundingClientRect();
    const height = panel.current.scrollHeight;
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const up = below < height && above > below;
    setStyle({
      position: "fixed",
      right: Math.max(8, window.innerWidth - r.right),
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      maxHeight: (up ? above : below) - 4,
      overflowY: "auto",
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  return (
    <details
      ref={ref}
      onToggle={(e) => {
        const isOpen = e.currentTarget.open;
        if (!isOpen) setStyle({ position: "fixed", visibility: "hidden" });
        setOpen(isOpen);
      }}
    >
      <summary className={summaryClassName}>{label}</summary>
      <div ref={panel} style={style} className={panelClassName}>
        {children}
      </div>
    </details>
  );
}
