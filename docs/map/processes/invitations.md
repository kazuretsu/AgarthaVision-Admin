---
verified: 2026-10-05
commit: 3357cf4
---

# Invitations

Input: an inviter's email and name → Movement: the database stores the invitation and mints
a one-time link, the console emails it, the invitee sets a password on `/invite/<token>` →
Output: an account and a membership whose role and organization come from the stored
invitation. This is the only way anyone gets an account: there is no sign-up.

## Who invites whom

| Inviter     | Invites       | Into                       | Where in the console  |
| ----------- | ------------- | -------------------------- | --------------------- |
| Super admin | **org admin** | the organization they pick | `/organizations/[id]` |
| Org admin   | **medtech**   | their own organization     | `/people`             |

The role is never chosen: `invitableRole` (`src/domain/invitations.ts:49`) derives it from
the inviter, and `console_invite` (`supabase/migrations/admin/0005_invitations.sql:121`)
derives it again. An org admin's form cannot aim elsewhere: the action ignores the submitted
organization (`targetOrganization`, `src/app/(dashboard)/invitations/actions.ts`) and the
function refuses one that is not theirs. A super admin, an org admin's org-admin invitation
included, re-sends and revokes anything; an org admin only medtech invitations into their
own organization (`canManageInvitation`, `:62`; `console_can_manage_invitation`, `:78`).

## The link

`console_invite` returns a 64-hex token **once**; the table keeps only its SHA-256
(`token_hash`, which no client is granted, `:103`). The link is
`<CONSOLE_URL or the request's origin>/invite/<token>` (`src/lib/site-url.ts`) and works for
7 days. **Re-send** mints a new token and expiry, so older emails stop working; it also
renews an expired invitation. **Revoke** marks it revoked; nothing is deleted. "Expired" is
not stored: it is a pending invitation past `expires_at` (`invitationState`, `:40`).

Refused at invite and at re-send (`23505`, with a `HINT`): an email whose account is already
in an organization or is a super admin (`account_exists`, `console_email_taken`), and an email
with a live invitation (`invitation_pending`). An account in **no** organization — a login
whose acceptance failed half way — can be invited: accepting signs in to it with its own
password, so no second account is ever made. An advisory lock on the email keeps two inviters
from both succeeding. Re-send is refused within a minute of the last email (`too_soon`), so
repeated clicks cannot flood an inbox.

The email (`src/lib/invitation-email.ts`) carries the link and nothing secret. It is sent
through `MailPort` (Resend, `src/adapters/resend/mail.ts`) **after** the invitation is saved:
if sending fails, the page says so and the invitation can be re-sent.

## Accepting

`/invite/[token]` sits outside the console gate; holding the token is the permission. The
page reads the link with `console_invitation_by_token` (`:282`, open to `anon`) and shows
the organization, the role and the email, which cannot be edited. Expired, revoked, used and
unknown links each say so; a deactivated organization reads `unavailable`. The page sends no
referrer.

`SupabaseOnboardingAdapter.acceptInvitation` (`src/adapters/supabase/onboarding.ts:91`):

1. Re-reads the link; only `pending` goes on. The action has already checked the password
   (both fields match, at most 72 bytes) and the name's length, so nothing it can refuse is
   left for after the account exists.
2. `auth.admin.createUser` with the **invitation's** email, the chosen password and
   `email_confirm: true` (`:96`) — one of the console's uses of the service-role key
   (`createServiceClient`, `src/adapters/supabase/client.ts:52`). No `user_metadata` is
   written. If the email already has an account (a retry), that account is used.
   Supabase applies the password rules only to a new account: at least 12 characters with a
   lowercase letter, an uppercase letter, a number and a symbol. A miss is `weak_password`,
   and the action names the rule from `passwordGaps` (`src/domain/password-policy.ts`), which
   mirrors Supabase's setting and must change with it. The form lists the same rules under the
   password field and ticks them off as the person types; they do not disable the button,
   because an existing account signs in here with the password it already has.
   An existing account whose sign-in was blocked when it lost access (a revoked super admin,
   14zcqntnqpd) has the block lifted for this attempt (`console_blocked_account_for_email`,
   `admin/0021`, service role only), and put back if the password is wrong or the acceptance
   fails. A valid invitation means the account has no access now, so the brief lift opens
   nothing.
3. Signs in as that account, passing the form's human-check token
   (`docs/map/processes/human-check.md`; a refused one is `human_check_failed`), and calls `console_accept_invitation` as the invitee
   (`:313`), which checks the token, the expiry, the organization, that the signed-in email
   is the invited one and that they belong to no organization yet; then inserts the
   membership from the invitation row, fills `profiles.full_name`, marks the invitation
   accepted and writes the audit entry. If it refuses, the adapter signs out again.

**Attempt limits (14zcqntnqp6).** For an email that already has an account, step 3 asks for
that account's password, so the page is a second place to guess one. The action
(`src/app/(auth)/invite/[token]/actions.ts`) reads the link first and, for a pending one, runs
the acceptance under `withAttemptLimit` (`docs/map/processes/admin-gate.md`): a wrong password
(`wrong_password`) is counted under the invitation's email, the client IP and the link. After
5 on one link, 5 for the email (sign-in failures included) or 20 from the IP within 15
minutes, the next attempt is refused before the account is touched or the provider called:
"Too many attempts. Try again in 15 minutes." A link that is not pending is answered as before,
with no password tried.

An org admin goes on to `/verify` to set up their authenticator app before seeing anything
(`docs/map/processes/second-factor.md`). A medtech is signed out and sent to `/invite/joined`,
which tells them to sign in to the Android app.

## Audit

`invitation.create`, `invitation.resend`, `invitation.revoke` (actor: the inviter) and
`invitation.accept` (actor: the invitee), each filed under the invitation's organization.

## If you change this

**Hits**

- `profiles` rows the app's `handle_new_user()` makes: accepting only sets `full_name`.
- The membership rule (D10, one organization per user): the invitation is refused for a
  member, never moved.
- Deployment settings: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `MAIL_FROM`,
  `CONSOLE_URL` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (`.env.example`).
- `supabase/tests/admin_0005_invitations.test.sql`.
- The attempt limits: a new failure reason that is a wrong password must be counted in the
  action (`isFailure`), or guessing there goes unlimited.

**Does not hit**

- Clinical data, and anything the app owns: `admin/0005` adds one table and its functions.

## See

`supabase/migrations/admin/0005_invitations.sql`, `src/domain/invitations.ts`,
`src/ports/onboarding.ts`, `src/ports/mail.ts`, `docs/map/objects/organizations.md`.

## Super admin invitations

A super admin invitation (`admin/0019`) uses the same link page, form and account step: the
adapter looks the token up in `organization_invitations` first and `super_admin_invitations`
second, and accepts it with `console_accept_super_admin_invitation`, which adds a
`super_admins` grant instead of a membership. Its link works for 72 hours.
`docs/map/processes/super-admins.md` has the rest.
