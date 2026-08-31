# Admin gate

Input: an HTTP request → Movement: refresh session, resolve identity, check role → Output:
a rendered admin page, or a redirect to `/login`.

## Steps

1. **Refresh.** `src/proxy.ts:18` runs on every matched request and touches
   `supabase.auth.getUser()` (`src/proxy.ts:46`) to trigger the refresh-and-set-cookie
   cycle. A Server Component cannot write cookies, so without this an admin would be
   signed out mid-session whenever their short-lived token expired.
   **This is refresh only — it is not the authorisation point.**
2. **Resolve identity.** `getCurrentUser` (`src/adapters/supabase/auth.ts:63`) calls
   `getUser()`, not `getSession()`. `getSession()` only decodes a cookie the browser can
   set; it is never the authority for a privilege decision.
3. **Resolve role.** The role comes from `profiles.role`, read server-side, never from a
   JWT claim or user metadata — both are shaped by data a user influences at signup. A
   missing or unreadable profile resolves to `medtech`
   (`src/adapters/supabase/auth.ts:36`, `:53`): `handle_new_user()` in `0001_init.sql`
   creates the row, so absence means something is wrong upstream, and the safe reading of
   wrong is less privilege.
4. **Gate.** `requireAdmin` (`src/adapters/supabase/auth.ts:72`) throws
   `NotAuthenticatedError` or `NotAuthorizedError`. The `(dashboard)` segment layout calls
   it once (`src/app/(dashboard)/layout.tsx:24`) and redirects to `/login`
   (`:27`) on either.
5. **Repeat it in route handlers.** A route handler does not render inside the layout, so
   it does not inherit the check — `src/app/(dashboard)/records/export/route.ts:24` runs
   its own.

## Why the gate is in the layout

Every route under `(dashboard)/` is protected the moment it is created; there is no
per-page opt-in to forget. And because the check re-reads `profiles.role` on each request
(`force-dynamic`, `src/app/(dashboard)/layout.tsx:19`), a revoked admin loses access on
their next navigation rather than whenever their token happens to expire.

`requireAdmin()` throws rather than returning a reduced view. There is no partial console,
so a caller cannot forget to branch on a role and leak a cross-user query.

## A medtech is signed out, not downgraded

A medtech with correct credentials is signed straight back out
(`src/app/(auth)/login/actions.ts:31-32`). Leaving the session in place would mean a valid
cookie for a console they may not use. Bad credentials and a non-admin role return the
**same** message, so the form does not confirm which addresses are real accounts.

## Consumes / produces

Consumes `docs/map/objects/ports.md` (`AuthPort`) and `profiles` from
`docs/map/objects/domain-model.md`. Produces an `AuthenticatedUser` or a redirect.

## If you change this

**Hits**

- Every page under `(dashboard)/`, and every route handler that repeats the check.
- `src/app/(auth)/login/actions.ts`, which performs the same role test at sign-in.

**Does not hit**

- Row visibility. RLS decides what a query returns; this gate decides who may ask. An
  admin whose Storage policy is missing still sees rows and no images — see
  `signed-image-url.md`.
- `src/proxy.ts`, which never reads a role.

## See

`src/adapters/supabase/auth.ts`, `src/app/(dashboard)/layout.tsx`, `src/proxy.ts`.
