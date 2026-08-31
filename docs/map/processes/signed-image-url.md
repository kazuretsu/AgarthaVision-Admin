# Signed image URL

Input: a sample's `storage_path` → Movement: sign server-side → Output: a short-lived URL
the browser can load.

## Steps

1. Build the service-role client (`src/adapters/supabase/client.ts:52`).
2. `createSignedUrl` (`src/adapters/supabase/storage.ts:33`) signs one object key against
   the `samples` bucket with a TTL (default 60s, `SUPABASE_SIGNED_URL_TTL_SECONDS`).
3. Both a returned `error` and a missing `signedUrl` are treated as failure
   (`src/adapters/supabase/storage.ts:45`) — a missing object surfaces as one or the other
   depending on the call, so trusting only one shape would let a null URL through.

## Why this one adapter is privileged

Every other read in this console runs as the signed-in user so RLS decides visibility.
This one cannot. Upstream `0003_storage_rls.sql` scopes SELECT on the `samples` bucket to
`(storage.foldername(name))[1] = auth.uid()` — **the uploader's own folder, with no admin
exception**. The table policies added admins via `public.is_admin()` in `0004`; Storage was
missed. So an admin session can list every sample row and load zero images.

Until that policy lands, signing with the service-role key server-side is the only way this
console can render an image it is entitled to show. Two things keep it narrow: the key is
read only in server modules (`serviceConfig`, `src/adapters/supabase/env.ts`), and the
adapter **authorises nothing itself** — it signs whatever key it is handed, so callers must
pass the admin gate first.

**Status: the fix exists but is not applied.** `0009_storage_admin_read.sql` in the
AgarthaVision repo adds `bucket_id = 'samples' and public.is_admin(auth.uid())` as an
additive SELECT policy. Like every migration in that repo it is applied by hand in the
Supabase SQL Editor; committing it does not run it. Until someone runs it, image loading
depends entirely on the service-role path described here.

## Consumes / produces

Consumes `samples.storage_path` (`docs/map/objects/domain-model.md`). Produces a
time-limited URL. Object keys follow `{user_id}/{sample_id}.jpg`.

## If you change this

**Hits**

- Any surface that renders a sample image.
- `.env.example` and `docs/stack.md` if a variable changes.
- The security posture, if the key ever reaches a client component. It must not.

**Does not hit**

- Row queries. Those go through the session-scoped client and are unaffected.
- The upstream bucket contents. This console never writes to Storage.

## See

`src/adapters/supabase/storage.ts`, `src/adapters/supabase/client.ts`, and upstream
`supabase/migrations/0003_storage_rls.sql`.
