import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authRequired, verifySessionToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  if (!authRequired()) return NextResponse.next();
  const ok = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    // Everything except the login page, the version check, static files and PWA assets.
    "/((?!login|api/version|_next/static|_next/image|favicon.ico|icon-.*\\.png|apple-touch-icon\\.png|manifest\\.webmanifest|sw\\.js).*)",
  ],
};
