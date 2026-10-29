import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { logTiming } from "@/lib/timing";
import type { RequestSession, RequestSessionPort } from "@/ports/request-session";

/**
 * Supabase implementation of {@link RequestSessionPort}, for the proxy.
 *
 * Supabase access tokens are short-lived. A Server Component cannot write cookies, so without
 * this the refreshed token would be dropped and an admin signed out mid-session. The proxy is
 * the one place in the request that can both read the old cookies and set the new ones.
 *
 * `getClaims()` verifies the access token locally against the project's published key and,
 * only when it has expired, refreshes it, which triggers the cookie cycle below. A valid token
 * costs no auth round trip (14zcqntkd0y).
 */

interface AmrEntry {
  method?: unknown;
  timestamp?: unknown;
}

/**
 * When the session signed in: the earliest timestamp in the token's `amr` claim, which Supabase
 * stamps per sign-in method (the password, then any authenticator code) and keeps across
 * refreshes. Null when there is none.
 */
export function signedInAtFromClaims(claims: { amr?: unknown }): number | null {
  if (!Array.isArray(claims.amr)) return null;
  const times = (claims.amr as AmrEntry[])
    .map((entry) => entry?.timestamp)
    .filter((time): time is number => typeof time === "number" && Number.isFinite(time));
  return times.length > 0 ? Math.min(...times) * 1000 : null;
}

export async function openSupabaseRequestSession(
  request: NextRequest,
  url: string,
  anonKey: string,
): Promise<RequestSessionPort> {
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

  const start = performance.now();
  const { data } = await supabase.auth.getClaims();
  const milliseconds = performance.now() - start;
  logTiming("proxy.session", milliseconds);

  const claims = data?.claims;
  const session: RequestSession | null =
    claims && typeof claims.sub === "string" && typeof claims.session_id === "string"
      ? { id: claims.session_id, signedInAt: signedInAtFromClaims(claims) }
      : null;

  return {
    session,
    async endSession() {
      // This browser's session only: `global`, supabase-js's default, would end the mobile
      // app's session on the same account too.
      await supabase.auth.signOut({ scope: "local" });
    },
    response() {
      // The browser's Network tab shows this under Timing; the page's own reads are in the logs.
      response.headers.set(
        "Server-Timing",
        `session;desc="Session check";dur=${milliseconds.toFixed(1)}`,
      );
      return response;
    },
  };
}
