---
verified: 2026-10-01
commit: 704ff09
---

# Admin gate

Input: an HTTP request → Movement: refresh session, resolve identity, resolve console access
→ Output: a rendered console page, the "use the mobile app" notice, or a redirect to
`/login`.

## Who gets in

| Person             | Source of truth                                | Console access                                  |
| ------------------ | ---------------------------------------------- | ----------------------------------------------- |
| Super admin        | `profiles.role = 'admin'`                      | Everything, every organization                  |
| Organization admin | An active org-admin membership (organizations) | Their own organization's pages                  |
| Medtech            | Anyone else                                    | None — told to use the mobile app, sees no data |

The rule is `resolveConsoleAccess` (`src/domain/access.ts:41`). It is plain domain code so
it runs before any read or write, whichever provider sits behind the ports (D7). The profile
role wins: a super admin who also holds a membership stays a super admin.

Organizations are not built yet, so `findOrgAdminMembership`
(`src/adapters/supabase/auth.ts:70`) returns `null` and nobody is an org admin today. That
method is the one seam the organizations work fills; nothing else in the gate changes.

## Steps

1. **Refresh.** `src/proxy.ts:46` touches `supabase.auth.getUser()` on every matched
   request to trigger the refresh-and-set-cookie cycle. A Server Component cannot write
   cookies. **This is refresh only — it is not the authorisation point.**
2. **Resolve identity.** `getCurrentUser` (`src/adapters/supabase/auth.ts:82`) calls
   `getUser()`, not `getSession()`, which only decodes a cookie the browser can set.
3. **Resolve role.** From `profiles.role`, read server-side (`:45`), never from a JWT claim
   or `user_metadata`. A missing or unreadable profile resolves to `medtech` (`:38`, `:61`).
4. **Resolve access.** `toActor` (`:74`) looks up the membership (skipped for a super admin)
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
   or 503 as JSON; `records/export` calls it first
   (`src/app/(dashboard)/records/export/route.ts:22`).

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

## Consumes / produces

Consumes `AuthPort` (`docs/map/objects/ports.md`) and `profiles`
(`docs/map/objects/domain-model.md`). Produces a `ConsoleActor`, the notice, or a redirect.

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

## See

`src/domain/access.ts`, `src/adapters/supabase/auth.ts`, `src/lib/console-access.ts`,
`src/app/(dashboard)/layout.tsx`, `src/proxy.ts`.
