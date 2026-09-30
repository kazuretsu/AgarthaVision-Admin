import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicConfig } from "./env";

/**
 * Supabase client construction. The only file in the repo that builds one.
 *
 * `next/headers` is imported dynamically inside the function rather than at
 * module scope: the module must stay importable outside a request, so the
 * registry can be unit-tested and the production build can trace imports without
 * a request context.
 */

/**
 * A request-scoped client carrying the visitor's session cookies. Reads run as
 * the signed-in user, so RLS — including the upstream admin read policies on
 * tables and on the `samples` bucket — is what decides visibility. This client
 * can never see more than its user may, and it is the only client the console
 * builds.
 */
export async function createRequestClient(): Promise<SupabaseClient> {
  const { url, anonKey } = publicConfig();
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components may not set cookies. The session is refreshed in
          // proxy.ts instead, so swallowing here is correct rather than lossy.
        }
      },
    },
  });
}
