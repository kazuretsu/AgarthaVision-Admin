---
verified: 2026-10-28
commit: efed466
---

# Own profile: name and password (14zcqntr35e)

Input: a super admin or org admin on `/settings` → Movement: change the name the console shows
for them, or change their password after their current one → Output: `profiles.full_name`, a
new password at the auth provider with every other session of the account ended, and an audit
entry for each.

## Why

An admin could not fix their own name or change a password they suspect is known, short of a
super admin or a password reset by email. Both are their own account, so both live on Settings,
beside two-step sign-in (`docs/map/processes/second-factor.md`).

## Steps

1. **The page.** `/settings` (`src/app/(dashboard)/settings/page.tsx`) shows a Profile card
   (email, read-only; name) and a Password card above the two-step card, from
   `src/components/settings/ProfileForms.tsx`.
2. **Name.** `renameSelf` (`settings/actions.ts`) tidies it with `normaliseOwnName`
   (`src/domain/profile.ts`: trimmed, spaces collapsed, 1–120 characters), checks the caller is
   a console user, then `AdminWritePort.setOwnName` → `console_set_own_name` (`admin/0020`).
   The function writes the **caller's own row only** (it takes no person), refuses anyone but a
   super admin or an active org admin (42501), and records `profile.rename` with the old and new
   name. The same name again writes nothing. The layout is revalidated so the sidebar shows it.
3. **Password.** Current password, then the new one twice, each with an eye button
   (`src/components/auth/PasswordInput.tsx`) and the rules checklist
   (`src/components/auth/NewPasswordFields.tsx`, shared with the invitation form).
   `checkPasswordChange` (`src/domain/profile.ts`) checks the fields, the rules in full and that
   the new one differs. **Before sending, a dialog warns** that every other session, the mobile
   app's included, will be signed out. `AuthPort.changePassword` sends one `updateUser` with
   `password` and `current_password`: Supabase Auth checks the current password and the rules,
   sets the new one and ends the account's other sessions in one transaction, keeping this
   one. After it accepts, `console_record_own_password_change` records `profile.password_change`
   with no details.

## Guarantees

- **Only themselves.** Neither function names a person; both act on `auth.uid()`.
- **Nothing about the password is stored by the console**, in the audit log or anywhere else.
  The eye button shows only what was typed into that field; no password is ever sent to the
  browser.
- **Signed out everywhere else** on a password change, by Supabase Auth (`LogoutAllExceptMe`),
  in the same transaction as the change. The phone is refused at its next token refresh, within
  the access token's lifetime (about an hour).
- **Filed where its readers are.** An org admin's entries under their laboratory, a super
  admin's under none (`docs/map/processes/audit-trail.md`).

## Requires

- **Supabase setting: "Require current password when changing password" ON** (Supabase's
  "Password security" guide; `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD`). Free.
  Without it Supabase ignores `current_password` and anyone with an open session could change
  the password without knowing it.
- **`admin/0020` applied by hand.** Until then saving a name fails, and a password change
  succeeds but says it could not be written to the audit trail.
- An account with an authenticator app needs an `aal2` session to change its password; the
  console gate already ensures one.

## Not covered

- The email address: changing it means confirming the new address; not offered.
- A forgotten password: no reset-by-email flow in the console yet.
- If recording fails after Supabase accepted the change, the password is changed without its
  entry; the page says so.

## Consumes / produces

Consumes `AuthPort.changePassword`, `AdminWritePort.setOwnName`,
`AdminWritePort.recordOwnPasswordChange`. Produces `profiles.full_name`, `profile.rename` and
`profile.password_change` audit entries.

## If you change this

**Hits**

- `src/domain/password-policy.ts` and Supabase's password rules (change both together).
- The invitation form, which shares `NewPasswordFields` and `PasswordInput`; `/login`, which
  uses `PasswordInput`.
- `admin/0020`.

**Does not hit**

- Anyone else's account, membership or grant.

## Tests

`supabase/tests/admin_0020_own_profile.test.sql`, `src/domain/profile.test.ts`,
`src/adapters/supabase/errors.test.ts`, `src/domain/audit.test.ts`.

## See

`supabase/migrations/admin/0020_own_profile.sql`, `src/domain/profile.ts`,
`src/app/(dashboard)/settings/`, `src/components/settings/`, `src/components/auth/`.
