---
verified: 2026-10-28
commit: 2e84353
---

# Admin gate

Input: an HTTP request → Movement: refresh session, verify identity locally, resolve console
access in one database call, check the session passed the authenticator code → Output: a
rendered console page, the "use the mobile app" notice, the outage page, or a redirect to
`/login` or `/verify`.

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
`src/adapters/supabase/auth.ts:108`), so revoking a grant or deactivating a membership or an
organization locks the person out on their next uncached page.

## Steps

1. **Refresh, and the session limits.** `src/proxy.ts` opens the request's session through
   `RequestSessionPort` (`src/adapters/supabase/request-session.ts`), whose `getClaims()`
   verifies the access token locally and refreshes it only when it has expired, which triggers
   the refresh-and-set-cookie cycle a Server Component cannot do. It sends
   `Server-Timing: session;dur=…`. It then applies the console's session limits (below).
   **It never reads a role — it is not the authorisation point.**
2. **Verify identity.** `identity` (`src/adapters/supabase/auth.ts:124`) calls `getClaims()`,
   which checks the JWT's signature and expiry against the project's published signing key
   (ECC P-256, fetched once from `/auth/v1/.well-known/jwks.json` and cached ten minutes per
   server instance): **no auth-server round trip**. A legacy shared-secret project falls back
   to asking the server. Never `getSession()`, which only decodes a cookie the browser can
   set.
3. **Resolve the facts, in one call.** `facts` (`:137`) calls `console_actor()`: name,
   super-admin grant and membership. No row is no access at all. An **error** is not an
   answer: it throws `AuthUnavailableError` (`:145`, below). If the function is not
   installed yet (`PGRST202`/`42883`, `:143`), `factsWithoutActor` (`:169`) runs the three
   reads it replaced (profile name and `is_admin()` in parallel, then the membership), so a
   deployment ahead of its migration keeps working; a failed `is_admin()` or membership
   read throws the same way (`:174`, `:184`), a failed profile read only loses the name.
4. **Resolve access.** `toActor` (`:216`) applies `resolveConsoleAccess`. No access throws
   `NotAuthorizedError`.
5. **Check the second step (14zcqntjnt0, 14zcqntr31c).** `requireConsoleActor` (`:227`) then
   admits a verified token that says `aal2` (the session passed an authenticator code) at no
   further cost. Short of it, it asks the auth server whether the account has an app: with one,
   `SecondFactorRequiredError`; without, the session is admitted on its password, since
   setting an app up is each admin's choice. Access comes first, so a medtech is told where to
   go and never asked for a code.
   `SecondFactorRequiredError` is a kind of `NotAuthenticatedError`: any caller that does not
   handle it treats the session as signed out and shows and writes nothing.
   `docs/map/processes/second-factor.md` has the rest.
6. **Gate the segment.** The `(dashboard)` layout calls `getConsoleActor()`
   (`src/app/(dashboard)/layout.tsx:29`): no code yet redirects to `/verify` (`:32`); no
   session to `/login` (`:33`); no access renders `NoConsoleAccess` (`:34`, `:94`) — a message
   and a sign-out button, no data, no navigation. An outage is thrown on, past the layout (see
   below).
7. **Narrow a page.** A page for fewer than all console users calls `requirePageAccess`
   (`src/lib/console-access.ts:48`), which 404s anyone else (`:60`). It handles the
   layout's refusals itself (`:55-57`): no code yet redirects to `/verify`, no session to
   `/login`, and no access is a 404, so a client-side navigation after a revocation never
   reaches the error boundary. The sidebar's `visibleTo` (`src/components/shell/nav.ts`) only
   hides links; this call is the protection.
8. **Repeat it in route handlers.** A handler does not render inside the layout and
   inherits nothing. `requireRouteAccess` (`src/lib/console-access.ts:68`) returns 401 (no
   session, or no code yet, `:78`), 403 or 503 as JSON — 503 for a missing environment
   variable and for an outage (`:99`); `export/download` calls it first
   (`src/app/(dashboard)/export/download/route.ts:36`).
9. **Server actions** call `getConsoleActor()` themselves and refuse as signed out.

`getConsoleActor` is wrapped in React's `cache()` (`src/lib/console-access.ts:30`), so the
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
  reach its data (`src/app/(auth)/login/actions.ts:63`), never the medtech notice.
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

## Session limits (14zcqntnqpd)

Supabase's own session time-box and inactivity timeout are paid, so the console keeps its own,
in `src/proxy.ts`, for every request that carries a session:

- **12 hours from sign-in** (`CONSOLE_SESSION_MAX_HOURS`), however active. The sign-in time is
  the earliest timestamp in the token's `amr` claim (`signedInAtFromClaims`), which Supabase
  keeps across refreshes. A token without one is ended: its age cannot be checked.
- **1 hour without a request** (`CONSOLE_SESSION_IDLE_MINUTES`). The last activity is the
  httpOnly, SameSite=Lax cookie `av_console_activity` (`src/lib/session-activity.ts`):
  `<session id>.<time>.<HMAC-SHA256>`, signed with `CONSOLE_SESSION_SECRET` (32+ characters,
  server-only). An edited cookie ends the session. A missing one, or one from an earlier
  session, counts as idle since sign-in, so deleting it never buys time. Without the secret the
  idle limit is off and the 12 hours still hold. A browser's speculative prefetch is no
  activity; the Next router's own prefetches cannot be told apart here (Next strips their
  headers before the proxy) but only follow a page load or a hover.
- **Ending** signs out **this browser only** (`scope: "local"`) and clears the cookies. A page
  request goes to `/login?session=ended` ("Your session ended. Sign in again."); a server
  action or download carries on signed out and answers as such; `/login` and `/invite/…` just
  carry on. The rule is `sessionEnd` (`src/domain/session-limits.ts`).

**Console and mobile app are separate sessions.** Signing out of the console, or a limit ending
it, never touches the app's session on the same account (`AuthPort.signOut` is local scope; it
was global, Supabase's default, and signed the phone out too). The app's session ends only
when the account loses access (a ban, `docs/map/processes/people-access.md`) or its password
changes.

## The browser's router cache (14zcqntkd0y)

`next.config.ts:11` keeps a page the person already opened in the tab for 30 seconds
(`staleTimes.dynamic`), so moving back and forth between sidebar pages makes no server
request. The trade-off, chosen deliberately: a page seen in the last 30 seconds re-shows
without a server check, so a revoked admin is refused on their next page **not** in that
cache — at most 30 seconds later. It never fetches anything new for them. Every server action
that changes data calls `revalidatePath`, which empties the cache, so one's own changes show
at once; signing out empties it too (`src/app/(auth)/login/actions.ts:85`), so Back after
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
(`src/app/(auth)/login/actions.ts:57-59`) and shown where to go instead. That message
appears only after a correct password, so it tells a stranger nothing; bad credentials and
an unknown email return the **same** generic refusal, so the form does not confirm which
addresses are real accounts.

A correct password sends the admin to `/dashboard` (`src/app/(auth)/login/actions.ts`). If
they have set up an authenticator app, the gate sends them on to `/verify` for its code
(`docs/map/processes/second-factor.md`).

The form carries a Cloudflare Turnstile token (`docs/map/processes/human-check.md`). A refused
check gets its own message, "The security check expired or did not pass", never the
credentials refusal: the provider checks the token before the password.

A refused attempt leaves the email and password as typed, so a typo can be fixed in place
(14zcqntr8m4). The form submits from `onSubmit` (`src/app/(auth)/login/page.tsx`) because React
resets a form once its `action` finishes; the browser keeps the fields, and the password is
never sent back to refill them. `action` stays for the server-rendered form, which then posts
to the server action, so no credentials reach a URL.

## Attempt limits (14zcqntnqp6)

The sign-in form is a server action, so Supabase's own per-IP limit sees the host's servers,
never the person guessing. The console counts failed attempts itself
(`src/lib/attempt-limit.ts`, `withAttemptLimit`) and refuses a new one **before the auth
provider is called** once, within the last 15 minutes, there are:

- 5 wrong passwords for one email, on the sign-in form and the invitation page together;
- 20 from one client IP, for any emails;
- 5 on one invitation link (`docs/map/processes/invitations.md`).

The refusal is "Too many attempts. Try again in 15 minutes.", the same whether or not the
email has an account. Only a wrong password counts (`AuthenticationFailedError`): a refused
human check, a medtech's correct password or an outage do not. A success erases nothing; the
window just moves past old failures, so nothing is ever deleted.

- **Where:** `console_sign_in_attempts` (`admin/0022`), one row per failure with SHA-256 hashes
  of the lower-cased email, the IP and, on the invitation page, the link token. Row level
  security with no policies; only the server's service role reads, writes or counts
  (`console_failed_attempts`), through `AttemptLimitPort` (`getAttemptLimit()`,
  `src/adapters/supabase/attempt-limit.ts`). The limits are in `src/domain/attempt-limits.ts`.
- **The client IP:** the first entry of the header `TRUSTED_IP_HEADER` names, by default
  `x-forwarded-for`, which Vercel sets itself. On another host, set it to that host's header.
  Without the header, attempts are limited by email (and link) only.
- **Fails open:** if the counter cannot be read or written, the attempt goes ahead and the
  problem is logged. Sign-in never depends on a counter.
- **Not covered:** calling Supabase's `/auth/v1/token` directly with the public key skips the
  console; the human check (`docs/map/processes/human-check.md`) covers that path.

## Outside the gate

`/login`, `/verify` and `/invite/[token]` (with `/invite/joined`) render outside
`(dashboard)/`. `/verify` reads the second step through the auth port itself and renders
nothing of the console. The
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
- `src/app/(auth)/login/actions.ts`, which applies the same rule at sign-in, under the attempt
  limits (`src/lib/attempt-limit.ts`, `admin/0022`,
  `supabase/tests/admin_0022_attempt_limits.test.sql`).
- `src/app/(auth)/verify/`, the one place a session short of the second step is answered
  rather than refused (`docs/map/processes/second-factor.md`).
- `src/app/error.tsx` and `src/app/(dashboard)/error.tsx`, which must keep telling an outage
  apart by its digest (`src/lib/unavailable.ts`).
- `src/components/shell/nav.ts`, whose `visibleTo` must agree with each page's
  `requirePageAccess` call or a link leads to a 404.

**Does not hit**

- Row visibility. RLS decides what a query returns; this gate decides who may ask.
- `src/proxy.ts`, which never reads a role: it only refreshes and enforces the session limits.
- Caching of data: there is none on the server. Every read runs as the signed-in user, so
  RLS decides; only the browser's 30-second router cache above re-shows a page.
- `super_admins` and `is_admin()`, which the app owns. Granting and revoking are a separate
  ticket (14zcqntjwjg).

## See

`src/domain/access.ts`, `src/adapters/supabase/auth.ts`, `src/lib/console-access.ts`,
`src/lib/unavailable.ts`, `src/app/(dashboard)/layout.tsx`, `src/app/error.tsx`,
`src/proxy.ts`, `src/domain/second-factor.ts`.
