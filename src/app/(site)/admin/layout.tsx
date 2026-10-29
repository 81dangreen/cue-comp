import Link from "next/link";
import { logoutAction } from "@/actions/auth";
import { TabNav } from "@/components/tab-nav";
import { Button } from "@/components/ui";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <TabNav
            tabs={[
              { href: "/admin", label: "Tournaments" },
              { href: "/admin/players", label: "Player directory", prefix: true },
              { href: "/admin/venues", label: "Venues & tables", prefix: true },
              { href: "/admin/team", label: "Team" },
            ]}
          />
        </div>
        <div className="flex items-center gap-1">
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
      {children}
    </div>
  );
}
