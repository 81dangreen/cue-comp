import Link from "next/link";
import { logoutAction } from "@/actions/auth";
import { TabNav } from "@/components/tab-nav";
import { Button } from "@/components/ui";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      {/* The admin menu is a full-width band under the site header. */}
      <div className="full-bleed -mt-8 mb-6 border-b border-border bg-surface">
        {/* On phones, Account and Log out sit on their own row above the (scrollable) tabs. */}
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 px-4 [&_nav]:border-b-0">
          <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
            <TabNav
              tabs={[
                { href: "/admin", label: "Tournaments" },
                { href: "/admin/players", label: "Player directory", prefix: true },
                { href: "/admin/venues", label: "Venues & tables", prefix: true },
                { href: "/admin/team", label: "Team" },
              ]}
            />
          </div>
          <div className="order-first ml-auto flex shrink-0 items-center gap-1 sm:order-none">
            <Link href="/admin/account" className="rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-2">
              Account
            </Link>
            <form action={logoutAction}>
              <Button variant="ghost" type="submit" className="text-muted">
                Log out
              </Button>
            </form>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
