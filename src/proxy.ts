import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { logTiming } from "@/lib/timing";

/**
 * Session refresh.
 *
 * Supabase access tokens are short-lived. A Server Component cannot write
 * cookies, so without this the refreshed token would be dropped and an admin
 * would be signed out mid-session. The proxy is the one place in the request
 * that can both read the old cookies and set the new ones.
 *
 * This is refresh only — it is deliberately NOT the authorisation gate. Role is
 * decided by `getConsoleActor()` against `is_admin()` in the layout that renders
 * the guarded routes, and again in each page, close to the data it protects, so a routing change cannot
 * silently unguard a page. Env is read directly rather than through the registry
 * because this runs in a separate runtime with its own module graph.
 */
export default async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Unconfigured deployments still serve. The pages themselves report the
  // missing variable; failing here would turn every route into an opaque 500.
  if (!url || !anonKey) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getClaims() verifies the access token locally against the project's published key
  // and, only when it has expired, refreshes it — which is what triggers the
  // refresh-and-set cycle above. A valid token costs no auth round trip (14zcqntkd0y).
  const start = performance.now();
  await supabase.auth.getClaims();
  const milliseconds = performance.now() - start;
  logTiming("proxy.session", milliseconds);
  // The browser's Network tab shows this under Timing; the page's own reads are in the logs.
  response.headers.set(
    "Server-Timing",
    `session;desc="Session check";dur=${milliseconds.toFixed(1)}`,
  );

  return response;
}

export const config = {
  /**
   * Everything except Next's own assets and static files. Image requests would
   * otherwise each cost a pointless auth round trip.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
