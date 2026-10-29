import { NextResponse, type NextRequest } from "next/server";
import { openSupabaseRequestSession } from "@/adapters/supabase/request-session";
import { sessionEnd, sessionLimitsFrom } from "@/domain/session-limits";
import {
  ACTIVITY_COOKIE,
  activitySecret,
  readActivity,
  signActivity,
} from "@/lib/session-activity";

/**
 * Session refresh, and the console's session limits (14zcqntnqpd).
 *
 * Refresh: the request's session is refreshed when its access token has expired, and the new
 * cookies are written here, the one place that can (`src/adapters/supabase/request-session.ts`).
 *
 * Limits: a console session ends 12 hours after sign-in, or after an hour with no request of
 * the person's own (`CONSOLE_SESSION_MAX_HOURS`, `CONSOLE_SESSION_IDLE_MINUTES`). The last
 * activity is an httpOnly cookie signed with `CONSOLE_SESSION_SECRET`; editing it ends the
 * session. Without that secret the idle limit is off and the absolute one still holds. Ending
 * signs out this browser only: the mobile app on the same account is never touched.
 *
 * This is deliberately NOT the authorisation gate. Role is decided by `getConsoleActor()` in
 * the layout and again in each page, close to the data it protects, so a routing change cannot
 * silently unguard a page. Env is read directly rather than through the registry because this
 * runs in a separate runtime with its own module graph.
 */

/** Where a page request with an ended session goes; `/login` reads the flag and says so. */
const SESSION_ENDED_PATH = "/login?session=ended";

/** Pages that work without a session, so an ended one is cleared and they carry on. */
function signedOutPage(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/invite");
}

/**
 * A browser's speculative prefetch is not the person's doing: it is checked but is no
 * activity. The Next router's own prefetches cannot be told apart here (Next strips their
 * headers before the proxy), but they only follow a page load or a hover, which are.
 */
function isPrefetch(request: NextRequest): boolean {
  const headers = request.headers;
  return (
    headers.get("purpose") === "prefetch" ||
    headers.get("sec-purpose")?.includes("prefetch") === true
  );
}

/**
 * A page being opened, which is redirected to `/login`. A server action or a download is not:
 * it carries on signed out, and answers as signed out (its own redirect, or a 401).
 */
function isPageRequest(request: NextRequest): boolean {
  return request.method === "GET" && !request.headers.has("next-action");
}

export default async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Unconfigured deployments still serve. The pages themselves report the
  // missing variable; failing here would turn every route into an opaque 500.
  if (!url || !anonKey) return NextResponse.next({ request });

  const handle = await openSupabaseRequestSession(request, url, anonKey);
  const session = handle.session;
  if (!session) return handle.response();

  const secret = activitySecret(process.env.CONSOLE_SESSION_SECRET);
  const limits = sessionLimitsFrom({
    CONSOLE_SESSION_MAX_HOURS: process.env.CONSOLE_SESSION_MAX_HOURS,
    CONSOLE_SESSION_IDLE_MINUTES: process.env.CONSOLE_SESSION_IDLE_MINUTES,
  });
  const now = Date.now();
  const ended = sessionEnd({
    now,
    signedInAt: session.signedInAt,
    lastActivityAt: secret
      ? await readActivity(secret, session.id, request.cookies.get(ACTIVITY_COOKIE)?.value)
      : null,
    limits,
    idleLimitOn: secret !== null,
  });

  if (ended) {
    await handle.endSession();
    request.cookies.delete(ACTIVITY_COOKIE);
    let response = handle.response();
    if (isPageRequest(request) && !signedOutPage(request.nextUrl.pathname)) {
      const redirect = NextResponse.redirect(new URL(SESSION_ENDED_PATH, request.url));
      // The cleared session cookies go with the redirect.
      for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
      response = redirect;
    }
    response.cookies.delete(ACTIVITY_COOKIE);
    return response;
  }

  const response = handle.response();
  if (secret && !isPrefetch(request)) {
    response.cookies.set(ACTIVITY_COOKIE, await signActivity(secret, session.id, now), {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: Math.ceil(limits.absoluteMs / 1000),
    });
  }
  return response;
}

export const config = {
  /**
   * Everything except Next's own assets and static files. Image requests would
   * otherwise each cost a pointless auth round trip, and so would the map's
   * boundary files (`/geo/`) and MapLibre's worker (`/vendor/`).
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|geo/|vendor/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
