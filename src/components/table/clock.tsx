"use client";

import { useEffect, useState } from "react";

export function Clock({ className }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className={className} suppressHydrationWarning>
      {now?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) ?? " "}
    </span>
  );
}
