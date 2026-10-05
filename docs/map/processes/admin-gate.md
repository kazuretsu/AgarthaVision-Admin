---
verified: 2026-10-02
commit: 0e56473
---

# Admin gate

Input: an HTTP request → Movement: refresh session, resolve identity, resolve console access
→ Output: a rendered console page, the "use the mobile app" notice, or a redirect to
`/login`.

## Who gets in

| Person             | Source of truth                                           | Console access                                  |
| ------------------ | --------------------------------------------------------- | ----------------------------------------------- |
| Super admin        | An active `super_admins` grant, read through `is_admin()` | Everything, every organization                  |
| Organization admin | An active org-admin membership in an active organization  | Their own organization's pages                  |
| Medtech            | Anyone else                                               | None — told to use the mobile app, sees no data |

The rule is `resolveConsoleAccess` (`src/domain/access.ts:40`). It is plain domain code so
it runs before any read or write, whichever provider sits behind the ports (D7). Being a
super admin wins: a super admin who also holds a membership stays a super admin.

`isSuperAdmin` (`src/adapters/supabase/auth.ts:63`) calls the app's `is_admin()` (app
`0014`, D22) as the signed-in user: the same function every database policy calls, so the
console and the database never disagree. `super_admins` itself is closed to every client.
`profiles.role` is retired and the console never reads it. A revoked grant turns the super
admin away on their next request.

`findOrgAdminMembership` (`src/adapters/supabase/auth.ts:74`) reads the user's own
`organization_members` row (`docs/map/objects/organizations.md`). Only an active `org_admin`
membership in an active organization counts, so deactivating either locks the org admin
out on their next request.

## Steps

1. **Refresh.** `src/proxy.ts:46` touches `supabase.auth.getUser()` on every matched
   request to trigger the refresh-and-set-cookie cycle. A Server Component cannot write
   cookies. **This is refresh only — it is not the authorisation point.**
2. **Resolve identity.** `getCurrentUser` (`src/adapters/supabase/auth.ts:96`) calls
   `getUser()`, not `getSession()`, which only decodes a cookie the browser can set.
3. **Resolve super admin.** `toAuthenticatedUser` (`:42`) reads the name from `profiles`
   and asks `is_admin()` in parallel (`:63`), never a JWT claim, `user_metadata` or
   `profiles.role`. An error or anything but `true` resolves to not a super admin (`:65`).
4. **Resolve access.** `toActor` (`:88`) looks up the membership (skipped for a super admin)
   and applies `resolveConsoleAccess`. No access throws `NotAuthorizedError`.
5. **Gate the segment.** The `(dashboard)` layout calls `getConsoleActor()`
   (`src/app/(dashboard)/layout.tsx:29`): no session redirects to `/login` (`:31`); no access
   renders `NoConsoleAccess` (`:32`, `:98`) — a message and a sign-out button, no data, no
   navigation.
6. **Narrow a page.** A page for fewer than all console users calls `requirePageAccess`
   (`src/lib/console-access.ts:31`), which 404s anyone else (`:42`). It handles the
   layout's two refusals itself (`:38-39`): no session redirects to `/login`, and no
   access is a 404, so a client-side navigation after a revocation never reaches the error
   boundary. The sidebar's `visibleTo` (`src/components/shell/nav.ts`) only hides links;
   this call is the protection.
7. **Repeat it in route handlers.** A handler does not render inside the layout and
   inherits nothing. `requireRouteAccess` (`src/lib/console-access.ts:50`) returns 401, 403
   or 503 as JSON; `export/download` calls it first
   (`src/app/(dashboard)/export/download/route.ts:35`).

`getConsoleActor` is wrapped in React's `cache()` (`src/lib/console-access.ts:19`), so the
layout and the page share one lookup per request.

## Why the gate is in the layout

Every route under `(dashboard)/` is protected the moment it is created; there is no
per-page opt-in to forget. The layout is `force-dynamic`
(`src/app/(dashboard)/layout.tsx:24`), but a client-side navigation between pages of the
segment does not re-render it — only the page. So every page also calls
`requirePageAccess(ANY_CONSOLE_USER)` (or narrower) before it reads anything; that call,
cached per request, is what makes a revoked admin lose access on their next click rather
than at their next hard load or token expiry. A new page must make the same call.

`requireConsoleActor()` throws rather than returning a reduced view. There is no partial
console, so a caller cannot forget to branch on a role and leak a cross-user query.

## Sign-in

A medtech with correct credentials is signed straight back out
(`src/app/(auth)/login/actions.ts:43-45`) and shown where to go instead. That message
appears only after a correct password, so it tells a stranger nothing; bad credentials and
an unknown email return the **same** generic refusal, so the form does not confirm which
addresses are real accounts.

## Outside the gate

`/login` and `/invite/[token]` (with `/invite/joined`) render outside `(dashboard)/`. The
invitation page is open to anyone holding a link; the token is the permission, and what it
can do is described in `docs/map/processes/invitations.md`.

## Consumes / produces

Consumes `AuthPort` (`docs/map/objects/ports.md`), `profiles`
(`docs/map/objects/domain-model.md`) and the app's `is_admin()`. Produces a `ConsoleActor`, the notice, or a redirect.

## If you change this

**Hits**

- Every page under `(dashboard)/`, and every route handler that calls
  `requireRouteAccess`.
- `src/app/(auth)/login/actions.ts`, which applies the same rule at sign-in.
- `src/components/shell/nav.ts`, whose `visibleTo` must agree with each page's
  `requirePageAccess` call or a link leads to a 404.

**Does not hit**

- Row visibility. RLS decides what a query returns; this gate decides who may ask.
- `src/proxy.ts`, which never reads a role.
- `super_admins` and `is_admin()`, which the app owns. Granting and revoking are a separate
  ticket (14zcqntjwjg).

## See

`src/domain/access.ts`, `src/adapters/supabase/auth.ts`, `src/lib/console-access.ts`,
`src/app/(dashboard)/layout.tsx`, `src/proxy.ts`.
