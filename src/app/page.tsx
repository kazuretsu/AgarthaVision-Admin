import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The console has no public landing page. The dashboard's gate sends a
 * signed-out visitor to sign in, so every entry goes through one check.
 *
 * When Supabase Auth's default mailer falls back to `SITE_URL` (`/`) before
 * `/reset-password` is added to Additional Redirect URLs, forward the recovery
 * query parameters on to `/reset-password` (14zcqntjnt9).
 */
export default async function Home({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const resolved = searchParams ? await searchParams : undefined;
  if (
    resolved &&
    (resolved.code !== undefined ||
      resolved.token_hash !== undefined ||
      resolved.error_code !== undefined ||
      resolved.type === "recovery")
  ) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(resolved)) {
      if (typeof value === "string") query.set(key, value);
    }
    redirect(`/reset-password?${query.toString()}`);
  }
  redirect("/dashboard");
}
