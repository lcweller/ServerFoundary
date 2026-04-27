import { NextRequest, NextResponse } from "next/server";

/**
 * Dashboard-wide HTTP security headers (PROJECT.md §3.9).
 *
 * Kept narrow on purpose: HSTS only when the request comes in over
 * HTTPS (so dev on plain http://localhost:3000 isn't permanently
 * pinned), X-Frame-Options to deny embedding the dashboard, and a
 * Referrer-Policy that doesn't leak full URLs. CSP is intentionally
 * absent here — the dashboard pulls Geist over <link> from
 * fonts.googleapis.com and the in-browser xterm.js terminal connects
 * over wss; locking down a Next App Router build with a strict CSP
 * needs more legwork than this phase has time for.
 */
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "interest-cohort=()");
  // Only emit HSTS on HTTPS so a dev hitting http://localhost doesn't
  // brick their browser's first-load behaviour. Cloudflare in front of
  // production sets x-forwarded-proto=https.
  const proto =
    req.headers.get("x-forwarded-proto") ??
    req.nextUrl.protocol.replace(":", "");
  if (proto === "https") {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  return res;
}

export const config = {
  // Skip static assets, _next internals, and the public agent bundle.
  // The /agent.cjs download must not be DENIED by X-Frame, but it also
  // doesn't need any of these; running middleware would only slow it.
  matcher: ["/((?!_next/|agent.cjs|favicon\\.ico|install\\.sh).*)"],
};
