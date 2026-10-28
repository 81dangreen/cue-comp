"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cx } from "./ui";

type Tab = { href: string; label: string; prefix?: boolean };

/**
 * Underlined tab bar. Each tab is active when the path matches exactly (or by prefix if `prefix`).
 * The pathname is runtime data on dynamic routes, so the static shell renders the
 * tabs unhighlighted and the active state streams in.
 */
export function TabNav({ tabs }: { tabs: Tab[] }) {
  return (
    <Suspense fallback={<Tabs tabs={tabs} pathname={null} />}>
      <ActiveTabs tabs={tabs} />
    </Suspense>
  );
}

function ActiveTabs({ tabs }: { tabs: Tab[] }) {
  return <Tabs tabs={tabs} pathname={usePathname()} />;
}

function Tabs({ tabs, pathname }: { tabs: Tab[]; pathname: string | null }) {
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const active = pathname !== null && (tab.prefix ? pathname.startsWith(tab.href) : pathname === tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cx(
              "whitespace-nowrap border-b-4 px-4 py-3 font-display text-lg font-bold tracking-wide uppercase transition",
              active ? "border-pop text-foreground" : "border-transparent text-muted hover:border-border hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
