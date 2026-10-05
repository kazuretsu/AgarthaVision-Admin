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
| Org admin   | **medtech**   | their own organization     | `/medtechs`           |

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

`SupabaseOnboardingAdapter.acceptInvitation` (`src/adapters/supabase/onboarding.ts:86`):

1. Re-reads the link; only `pending` goes on. The action has already checked the password
   and the name's length, so nothing it can refuse is left for after the account exists.
2. `auth.admin.createUser` with the **invitation's** email, the chosen password and
   `email_confirm: true` (`:91`) — one of the console's two uses of the service-role key
   (`createServiceClient`, `src/adapters/supabase/client.ts:52`). No `user_metadata` is
   written. If the email already has an account (a retry), that account is used.
3. Signs in as that account (`:105`) and calls `console_accept_invitation` as the invitee
   (`:313`), which checks the token, the expiry, the organization, that the signed-in email
   is the invited one and that they belong to no organization yet; then inserts the
   membership from the invitation row, fills `profiles.full_name`, marks the invitation
   accepted and writes the audit entry. If it refuses, the adapter signs out again.

An org admin lands on `/dashboard`. A medtech is signed out and sent to `/invite/joined`,
which tells them to sign in to the Android app.

## Audit

`invitation.create`, `invitation.resend`, `invitation.revoke` (actor: the inviter) and
`invitation.accept` (actor: the invitee), each filed under the invitation's organization.

## If you change this

**Hits**

- `profiles` rows the app's `handle_new_user()` makes: accepting only sets `full_name`.
- The membership rule (D10, one organization per user): the invitation is refused for a
  member, never moved.
- Deployment settings: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `MAIL_FROM` and
  `CONSOLE_URL` (`.env.example`).
- `supabase/tests/admin_0005_invitations.test.sql`.

**Does not hit**

- Clinical data, and anything the app owns: `admin/0005` adds one table and its functions.

## See

`supabase/migrations/admin/0005_invitations.sql`, `src/domain/invitations.ts`,
`src/ports/onboarding.ts`, `src/ports/mail.ts`, `docs/map/objects/organizations.md`.
