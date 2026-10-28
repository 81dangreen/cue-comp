import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { APP_NAME } from "@/lib/brand";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

const headerLink = "rounded-lg px-3 py-2 text-sm font-medium text-header-fg/85 transition hover:bg-white/10 hover:text-header-fg";

async function UserNav() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link href="/login" className={headerLink}>
        Log in
      </Link>
    );
  }
  return (
    <Link href="/admin" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-header transition hover:bg-white/90">
      Admin
      <span className="hidden sm:inline"> · {user.organizationName}</span>
    </Link>
  );
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="bg-felt border-b-4 border-pop shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4">
          <Link href="/" className="mr-4 flex items-center gap-2.5 font-display text-2xl font-bold tracking-wide uppercase">
            <LogoMark className="h-10 w-10" />
            {APP_NAME}
          </Link>
          <nav className="hidden sm:block">
            <Link href="/" className={headerLink}>
              Tournaments
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle className={`${headerLink} px-2.5`} />
            <Suspense fallback={<div className="h-9 w-20" />}>
              <UserNav />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-border py-6 text-center text-sm text-muted">
        {APP_NAME} · tournament management &amp; live scoring
      </footer>
    </>
  );
}
