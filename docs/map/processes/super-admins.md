---
verified: 2026-10-28
commit: 2e84353
---

# Super admins (14zcqntjwjg)

Input: a super admin on `/super-admins` → Movement: invite someone by email, they set their own
password from the link, the database adds their grant; or revoke another super admin → Output:
an active `super_admins` row (or a revoked one), and an audit entry under no laboratory.

## Why

A super admin is an active row in the app's `super_admins` table (app `0014`, D22), read by
`is_admin()`, which every policy and the console gate ask (`docs/map/processes/admin-gate.md`).
The first super admins were granted by hand in the Supabase SQL editor. Every later one,
including people outside the founding team such as a maintenance partner, is invited from the
console with stricter rules than a laboratory invitation: super admin creates and deactivates
laboratories and reads every laboratory's records de-identified (D19).

## Steps

1. **The page.** `/super-admins` (`src/app/(dashboard)/super-admins/page.tsx`, sidebar, super
   admins only; anyone else gets a 404, so it has no `loading.tsx`) lists the active super
   admins through `console_list_super_admins()` (`admin/0019`), since `super_admins` itself is
   closed to every client, and the super admin invitations from `super_admin_invitations`
   (RLS: super admins read all, never the token hash).
2. **Invite.** `inviteSuperAdmin` (`src/app/(dashboard)/super-admins/actions.ts`) checks
   `canManageSuperAdmins` (`src/domain/super-admins.ts`), then `console_invite_super_admin`,
   which checks again and refuses an email that already has an account in a laboratory or is
   already a super admin (`account_exists`), or has a live invitation of either kind
   (`invitation_pending`). It shares the laboratory invitation's lock on the address, token
   helpers and one-minute re-send gap (`admin/0005`). The link works for **72 hours**. The email
   (`src/lib/invitation-email.ts`, role `super_admin`, no laboratory) goes out after the row is
   saved; a failed send leaves an invitation to re-send.
3. **Re-send and withdraw.** A new link and 72 hours, the old link dead; or withdraw it (status
   `revoked`, shown as "Withdrawn"). Nothing is deleted.
4. **Accept.** The same page as a laboratory invitation, `/invite/<token>`
   (`docs/map/processes/invitations.md`): the onboarding adapter looks the token up in
   `organization_invitations` first, then `super_admin_invitations`
   (`console_super_admin_invitation_by_token`, open to `anon`). The account is made the same
   way (password rules, human check), then `console_accept_super_admin_invitation`, run as the
   invitee, checks the token, expiry and email, refuses a laboratory member
   (`already_member`), inserts their `super_admins` row with `granted_by` the inviter, fills
   their name and marks the invitation accepted. **No laboratory membership.** They go on to
   the console as a super admin, through the second step as any admin does
   (`docs/map/processes/second-factor.md`).
5. **Revoke.** `RevokeSuperAdminForm` behind a confirmation; `revokeSuperAdmin` checks
   `superAdminRevokeRefusal` first. `console_revoke_super_admin` locks every active grant, then
   checks the caller is **still** an active super admin, that it is not their own grant
   (`self`), that the target holds one, and that more than one is active
   (`last_super_admin`). It sets `revoked_at` and `revoked_by`; the app's trigger allows that
   and nothing else. The revoked person's next request finds no access (`NotAuthorizedError`).
   Then, unless they still belong to an active laboratory, their sign-in is blocked (a ban,
   recorded first as `account.sign_in_blocked`; `admin/0021`, 14zcqntnqpd), so a phone signed in
   to the app on that account is refused at its next refresh. Inviting them again works: the
   block is lifted for the acceptance and stays lifted once it succeeds
   (`docs/map/processes/people-access.md`).

## Guarantees

- **Only a super admin** invites, re-sends, withdraws or revokes: the console checks, and each
  function checks `is_admin(auth.uid())` again (42501 otherwise).
- **There is always one.** Nobody revokes themselves, and the caller must still be active after
  the lock, so two super admins revoking each other at once leave the first one standing.
- **Recorded.** `super_admin.invite`, `.invite_resend`, `.invite_revoke`, `.grant` (by the
  invitee, naming the inviter) and `.revoke`, each with no organization, so only super admins
  read them (`docs/map/processes/audit-trail.md`).
- **Nothing is deleted** (C8): invitations are withdrawn, grants are revoked in place.

## Not covered

- A laboratory invitation does not look for a pending super admin invitation to the same
  address (`admin/0005` is unchanged). If both were sent and both accepted, the person is a
  member and a super admin, and super admin wins (`resolveConsoleAccess`).
- Access to the Supabase project or the repositories, which bypasses all of this, is decided
  outside the console.
- A super admin's own lost authenticator app is reset in the Supabase dashboard
  (`docs/map/processes/second-factor.md`).

## Consumes / produces

Consumes `DatabasePort.listSuperAdmins`, `listSuperAdminInvitations`,
`getSuperAdminInvitation`; `AdminWritePort.inviteSuperAdmin`, `resendSuperAdminInvitation`,
`revokeSuperAdminInvitation`, `revokeSuperAdmin`; `OnboardingPort` (accept);
`MailPort.send`. Produces `super_admins` rows (granted or revoked), `super_admin_invitations`
rows and audit entries.

## If you change this

**Hits**

- `is_admin()` and therefore every policy and the console gate: a grant or revocation changes
  what that person reads on their next request.
- The accept page and onboarding adapter, shared with laboratory invitations.
- `admin/0019`; the app's `super_admins` table and its trigger (`0014`).

**Does not hit**

- `organization_members`: a grant adds no membership.
- Laboratory invitations (`admin/0005`).

## Tests

`supabase/tests/admin_0019_super_admin_invitations.test.sql` (every refusal, the 72 hours,
the audit entries, the last super admin), `src/domain/super-admins.test.ts`,
`src/adapters/supabase/onboarding.test.ts`, `src/lib/invitation-email.test.ts`,
`src/domain/audit.test.ts`, `src/components/shell/nav.test.ts`.

## See

`supabase/migrations/admin/0019_super_admin_invitations.sql`, `src/domain/super-admins.ts`,
`src/app/(dashboard)/super-admins/`, `src/components/super-admins/`.
