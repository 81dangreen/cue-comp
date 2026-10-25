import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: bounce visitors without a session cookie to the login
// page. Real authorisation happens in the data access layer (src/lib/auth.ts).
export function proxy(request: NextRequest) {
  if (!request.cookies.has("cs_session")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/score/:path*"],
};
