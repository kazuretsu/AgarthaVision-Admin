---
verified: 2026-10-14
commit: aa17053
---

# Admin gate

Input: an HTTP request → Movement: refresh session, verify identity locally, resolve console
access in one database call → Output: a rendered console page, the "use the mobile app"
notice, the outage page, or a redirect to `/login`.

## Who gets in

| Person             | Source of truth                                           | Console access                                  |
| ------------------ | --------------------------------------------------------- | ----------------------------------------------- |
| Super admin        | An active `super_admins` grant, read through `is_admin()` | Everything, every organization                  |
| Organization admin | An active org-admin membership in an active organization  | Their own organization's pages                  |
| Medtech            | Anyone else                                               | None — told to use the mobile app, sees no data |

The rule is `resolveConsoleAccess` (`src/domain/access.ts:40`). It is plain domain code so
it runs before any read or write, whichever provider sits behind the ports (D7). Being a
super admin wins: a super admin who also holds a membership stays a super admin.

`console_actor()` (`supabase/migrations/admin/0010_console_actor.sql`) returns, about the
caller only, their name, the app's `is_admin()` (app `0014`, D22) — the same function every
database policy calls, so the console and the database never disagree — and their own
membership and organization (`docs/map/objects/organizations.md`). `super_admins` itself is
closed to every client. `profiles.role` is retired and the console never reads it. Only an
active `org_admin` membership in an active organization counts (`orgAdminMembership`,
`src/adapters/supabase/auth.ts:84`), so revoking a grant or deactivating a membership or an
organization locks the person out on their next uncached page.

## Steps

1. **Refresh.** `src/proxy.ts:50` calls `supabase.auth.getClaims()` on every matched
   request. It verifies the access token locally and refreshes it only when it has
   expired, which triggers the refresh-and-set-cookie cycle a Server Component cannot do.
   It sends `Server-Timing: session;dur=…` (`:55`). **This is refresh only — it is not the
   authorisation point.**
2. **Verify identity.** `identity` (`src/adapters/supabase/auth.ts:100`) calls `getClaims()`,
   which checks the JWT's signature and expiry against the project's published signing key
   (ECC P-256, fetched once from `/auth/v1/.well-known/jwks.json` and cached ten minutes per
   server instance): **no auth-server round trip**. A legacy shared-secret project falls back
   to asking the server. Never `getSession()`, which only decodes a cookie the browser can
   set.
3. **Resolve the facts, in one call.** `facts` (`:109`) calls `console_actor()`: name,
   super-admin grant and membership. No row is no access at all. An **error** is not an
   answer: it throws `AuthUnavailableError` (`:117`, below). If the function is not
   installed yet (`PGRST202`/`42883`, `:115`), `factsWithoutActor` (`:141`) runs the three
   reads it replaced (profile name and `is_admin()` in parallel, then the membership), so a
   deployment ahead of its migration keeps working; a failed `is_admin()` or membership
   read throws the same way (`:146`, `:156`), a failed profile read only loses the name.
4. **Resolve access.** `toActor` (`:188`) applies `resolveConsoleAccess`. No access throws
   `NotAuthorizedError`.
5. **Gate the segment.** The `(dashboard)` layout calls `getConsoleActor()`
   (`src/app/(dashboard)/layout.tsx:29`): no session redirects to `/login` (`:31`); no access
   renders `NoConsoleAccess` (`:32`, `:98`) — a message and a sign-out button, no data, no
   navigation. An outage is thrown on, past the layout (see below).
6. **Narrow a page.** A page for fewer than all console users calls `requirePageAccess`
   (`src/lib/console-access.ts:46`), which 404s anyone else (`:57`). It handles the
   layout's two refusals itself (`:53-54`): no session redirects to `/login`, and no
   access is a 404, so a client-side navigation after a revocation never reaches the error
   boundary. The sidebar's `visibleTo` (`src/components/shell/nav.ts`) only hides links;
   this call is the protection.
7. **Repeat it in route handlers.** A handler does not render inside the layout and
   inherits nothing. `requireRouteAccess` (`src/lib/console-access.ts:65`) returns 401, 403
   or 503 as JSON — 503 for a missing environment variable and for an outage (`:91`);
   `export/download` calls it first (`src/app/(dashboard)/export/download/route.ts:36`).

`getConsoleActor` is wrapped in React's `cache()` (`src/lib/console-access.ts:29`), so the
layout and the page share one lookup per request. A warm page therefore makes **one**
database round trip for access (`auth.actor`) before its own reads; the timing log lines
(`src/lib/timing.ts`) show it per request.

## When access cannot be read (14zcqntk6h2)

A failed read is neither a refusal nor a grant. Before this, the gate turned it into "no
access", so a database outage showed every admin the medtech screen ("This console is for
super admins and organization admins") with a 200: an admin would think they had been
revoked, and monitoring saw nothing wrong.

- **Still fail closed.** `AuthUnavailableError` (`src/ports/auth.ts`) carries no actor and no
  access; nothing is rendered from the console, and no session is kept at sign-in.
- **A full page load** fails in the layout, before the shell. `getConsoleActor` gives the
  error an outage digest (`src/lib/unavailable.ts`, `markUnavailable`) and throws it on; the
  boundary above the layout, `src/app/error.tsx`, shows `ConsoleUnavailable`
  (`src/components/shell/ConsoleUnavailable.tsx`): "The console can't reach its data right
  now", a short reference and Try again, which asks the server again. The page answers
  **500**. The ticket asked for 503, but Next.js 16 lets a page set only 404, 401 and 403
  (`notFound()`, `unauthorized()`, `forbidden()`); any other error thrown before the page
  streams is a 500. Either way a probe sees a failure.
- **A click inside the console** fails in the page's own `requirePageAccess`, which throws it
  on; `src/app/(dashboard)/error.tsx` shows the same message inside the shell. A server
  action's own access check throws it on the same way.
- **A route handler** answers 503 as JSON, no detail (`requireRouteAccess`).
- **Sign-in** with the right password signs straight back out and says the console cannot
  reach its data (`src/app/(auth)/login/actions.ts:55`), never the medtech notice.
- **No detail reaches the browser.** In production it gets the digest only; the boundaries
  recognise the outage by its prefix and show the part after it as the reference, which is
  also in the server log with the cause. If a future Next.js stopped keeping an error's own
  digest, the boundaries would fall back to "This page could not be loaded", still a
  failure with no data.
- **Not changed:** identity. A session `getClaims()` cannot verify is still no session, and
  goes to `/login`. With the signing key cached (ten minutes), an auth outage alone does not
  reach the gate.

Tests: `src/adapters/supabase/auth.test.ts` (a failed `console_actor()`, `is_admin()` or
membership read; no row, no grant and no membership still no access),
`src/lib/console-access.test.ts` (503, the digest), `src/lib/unavailable.test.ts`.

## The browser's router cache (14zcqntkd0y)

`next.config.ts:11` keeps a page the person already opened in the tab for 30 seconds
(`staleTimes.dynamic`), so moving back and forth between sidebar pages makes no server
request. The trade-off, chosen deliberately: a page seen in the last 30 seconds re-shows
without a server check, so a revoked admin is refused on their next page **not** in that
cache — at most 30 seconds later. It never fetches anything new for them. Every server action
that changes data calls `revalidatePath`, which empties the cache, so one's own changes show
at once; signing out empties it too (`src/app/(auth)/login/actions.ts:76`), so Back after
sign-out shows nothing of the console.

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
(`src/app/(auth)/login/actions.ts:50-52`) and shown where to go instead. That message
appears only after a correct password, so it tells a stranger nothing; bad credentials and
an unknown email return the **same** generic refusal, so the form does not confirm which
addresses are real accounts.

## Outside the gate

`/login` and `/invite/[token]` (with `/invite/joined`) render outside `(dashboard)/`. The
invitation page is open to anyone holding a link; the token is the permission, and what it
can do is described in `docs/map/processes/invitations.md`.

## Consumes / produces

Consumes `AuthPort` (`docs/map/objects/ports.md`), `console_actor()` (`admin/0010`) — or,
before it is applied, `profiles` (`docs/map/objects/domain-model.md`), the app's `is_admin()`
and `organization_members`. Produces a `ConsoleActor`, the notice, the outage page, or a
redirect.

## If you change this

**Hits**

- Every page under `(dashboard)/`, and every route handler that calls
  `requireRouteAccess`.
- `console_actor()` and `factsWithoutActor` must return the same facts;
  `supabase/tests/admin_0010_console_actor.test.sql`, `src/adapters/supabase/auth.test.ts`.
- `src/app/(auth)/login/actions.ts`, which applies the same rule at sign-in.
- `src/app/error.tsx` and `src/app/(dashboard)/error.tsx`, which must keep telling an outage
  apart by its digest (`src/lib/unavailable.ts`).
- `src/components/shell/nav.ts`, whose `visibleTo` must agree with each page's
  `requirePageAccess` call or a link leads to a 404.

**Does not hit**

- Row visibility. RLS decides what a query returns; this gate decides who may ask.
- `src/proxy.ts`, which never reads a role.
- Caching of data: there is none on the server. Every read runs as the signed-in user, so
  RLS decides; only the browser's 30-second router cache above re-shows a page.
- `super_admins` and `is_admin()`, which the app owns. Granting and revoking are a separate
  ticket (14zcqntjwjg).

## See

`src/domain/access.ts`, `src/adapters/supabase/auth.ts`, `src/lib/console-access.ts`,
`src/lib/unavailable.ts`, `src/app/(dashboard)/layout.tsx`, `src/app/error.tsx`,
`src/proxy.ts`.
