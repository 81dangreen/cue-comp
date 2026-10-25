"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the page periodically, e.g. to notice a tablet finishing pairing. */
export function PollRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
