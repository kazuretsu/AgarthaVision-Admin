---
verified: 2026-10-05
commit: d6f03d2
---

# Signed image URL

Input: a sample's `storage_path` → Movement: sign as the signed-in user → Output: a
short-lived URL the browser can load, or "Image unavailable".

## Steps

1. `signFrames` (`src/lib/signed-urls.ts:9`) asks the storage port for each key on a page.
2. `createSignedUrl` (`src/adapters/supabase/storage.ts:36`) signs against the `samples`
   bucket with the **request-scoped client** — the visitor's own session — and a TTL
   (default 60s, `SUPABASE_SIGNED_URL_TTL_SECONDS`).
3. A returned `error` or a missing `signedUrl` is a failure (`:40`). `signFrames` turns that
   one frame into `null` (`src/lib/signed-urls.ts:16`), which renders as "Image unavailable"
   rather than failing the page.
4. The session and sample pages call it inside a Suspense boundary (`SessionFields`,
   `SignedFieldImage`), after they have read the record and called `notFound()` for a missing
   one. The figures render at once, the frames follow, and a missing record still answers a
   real 404 (`FramesFallback` shows meanwhile).

## Why no elevated key

The app's `0001_init.sql` grants every admin read on the whole bucket (`"samples: admin read
all"`, `bucket_id = 'samples' and public.is_admin(auth.uid())`). So a super admin's own
session can sign any frame, and the Storage policy — not this console — decides what a user
may see. Signing never uses the service-role key; the old path that signed with it (needed only
while the legacy database lacked that policy) is gone. The key's uses now are making an
invited person's account and banning a deactivated medtech's login
(`docs/map/processes/invitations.md`, `docs/map/processes/medtech-access.md`).

## Consumes / produces

Consumes `samples.storage_path` (`docs/map/objects/domain-model.md`). Produces a
time-limited URL. Object keys follow `{user_id}/{sample_id}.jpg`.

## If you change this

**Hits**

- Every records page that shows a frame.
- The Storage policies upstream: a user without a read policy on an object gets "Image
  unavailable", by design.

**Does not hit**

- Row queries, which use the same session-scoped client.
- The bucket contents. This console never writes to Storage.

## See

`src/adapters/supabase/storage.ts`, `src/lib/signed-urls.ts`, and upstream
`supabase/migrations/0001_init.sql` (the Storage section).
