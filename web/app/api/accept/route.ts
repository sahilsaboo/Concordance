import { NextResponse, type NextRequest } from "next/server";
import {
  ACCEPT_PATH,
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_S,
  consentSecret,
  safeNextPath,
  signConsent,
} from "@/lib/consent";

/**
 * Receives the accept form. A plain HTML form POST, so it works with JavaScript turned off.
 * Sets the signed cookie only if the checkbox was ticked AND the request came from this site.
 */
export async function POST(request: NextRequest) {
  // Block other websites from accepting on someone's behalf (cross-site form posts).
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if ((origin && origin !== request.nextUrl.origin) || (fetchSite && fetchSite !== "same-origin")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const next = safeNextPath(form?.get("next")?.toString());

  if (form?.get("acknowledge") !== "yes") {
    const back = new URL(ACCEPT_PATH, request.nextUrl.origin);
    back.searchParams.set("error", "1");
    if (next !== "/") back.searchParams.set("next", next);
    return NextResponse.redirect(back, 303);
  }

  const secret = consentSecret();
  if (!secret) {
    console.error("CONSENT_SECRET is missing or shorter than 32 characters; refusing to issue consent.");
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  const res = NextResponse.redirect(new URL(next, request.nextUrl.origin), 303);
  res.cookies.set(CONSENT_COOKIE, await signConsent(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CONSENT_MAX_AGE_S,
  });
  return res;
}
