import { NextResponse, type NextRequest } from "next/server";
import { SITE_HOST } from "@/lib/brand";

const PROTECTED = /^\/(admin|score)(\/|$)/;

export function proxy(request: NextRequest) {
  // The hosting provider's address serves the same site: send visitors to the real domain.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  if (host.endsWith(".onrender.com")) {
    return NextResponse.redirect(`https://${SITE_HOST}${request.nextUrl.pathname}${request.nextUrl.search}`, 308);
  }
  // Optimistic check only: bounce visitors without a session cookie to the login
  // page. Real authorisation happens in the data access layer (src/lib/auth.ts).
  if (PROTECTED.test(request.nextUrl.pathname) && !request.cookies.has("cs_session")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything but build assets and the health check (Render calls it on its own address).
  matcher: ["/((?!_next/static|_next/image|api/health).*)"],
};
