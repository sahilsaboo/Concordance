import { NextResponse, type NextRequest } from "next/server";
import { ACCEPT_API_PATH, ACCEPT_PATH, CONSENT_COOKIE, consentSecret, isValidConsent } from "@/lib/consent";

/**
 * Server-side gate: every page (and every client-side navigation/prefetch, which also hits the server)
 * requires a valid, signed acknowledgment cookie. Without one, the visitor gets the accept page instead.
 * No page content is ever sent first, so disabling JavaScript, editing the DOM, or deep-linking can't bypass it.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === ACCEPT_PATH || pathname === ACCEPT_API_PATH) return NextResponse.next();

  const ok = await isValidConsent(request.cookies.get(CONSENT_COOKIE)?.value, consentSecret());
  if (ok) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = ACCEPT_PATH;
  url.search = "";
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  const res = NextResponse.redirect(url, 307);
  // Don't let a stale or forged cookie linger.
  if (request.cookies.has(CONSENT_COOKIE)) res.cookies.delete(CONSENT_COOKIE);
  return res;
}

export const config = {
  matcher: [
    // Everything except build assets and the site icon (they contain no content).
    "/((?!_next/static|_next/image|icon\\.svg|favicon\\.ico).*)",
  ],
};
