---
verified: 2026-11-06
commit: ef77214
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
   (`src/domain/profile.ts:17-26`), checks the caller is a console user, then calls
   `AdminWritePort.setOwnName` → `console_set_own_name` (`admin/0020`). The name is trimmed,
   spaces are collapsed, and the result must contain at least one character. The form,
   validation and write-refusal message all use `PROFILE_NAME_MAX` for the 120-character
   upper limit (`src/components/settings/ProfileForms.tsx:37-43`,
   `src/app/(dashboard)/settings/actions.ts:154`).
   The function writes the **caller's own row only** (it takes no person), refuses anyone but a
   super admin or an active org admin (42501), and records `profile.rename` with the old and new
   name. The same name again writes nothing. The layout is revalidated so the sidebar shows it.
3. **Password.** Current password, then the new one twice, each with an eye button
   (`src/components/auth/PasswordInput.tsx`) and the rules checklist
   (`src/components/auth/NewPasswordFields.tsx`, shared with the invitation and reset-password
   forms). `checkPasswordChange` (`src/domain/profile.ts:65-77`, built on `checkPasswordReset`,
   `:44-57`) checks the fields, the rules in full and that the new one differs. **Before
   sending, a dialog warns** that every other session, the mobile app's included, will be
   signed out. `AuthPort.changePassword` sends one `updateUser` with `password` and
   `current_password`: Supabase Auth checks the current password and the rules, sets the new
   one and ends the account's other sessions in one transaction, keeping this one. After it
   accepts, `console_record_own_password_change` records `profile.password_change` with no
   details.
4. **Forgot password (14zcqntjnt9).** `/login` links to `/forgot-password`, which checks the
   email shape with `normaliseResetEmail` (`src/domain/profile.ts:32-38`) and calls
   `AuthPort.requestPasswordReset` (`src/adapters/supabase/auth.ts:419-435`) with the Turnstile
   token and `/reset-password` as `redirectTo`. It always shows the same confirmation whether or
   not an active account exists. `/reset-password` validates the new password with
   `checkPasswordReset` before consuming the single-use `code` or `token_hash` in
   `AuthPort.resetPassword` (`:437-480`), verifies through `console_actor()` that the user is an
   active super admin or an active member (`org_admin` or `medtech`) in an active organization,
   sets the password (using the service client when an MFA-enabled admin's `aal1` recovery
   session receives `insufficient_aal`), and signs out the recovery session so admins still pass
   `/verify` on sign-in and medtechs sign in to the mobile app.

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
- If recording fails after Supabase accepted the change, the password is changed without its
  entry; the page says so.
- The console's attempt limits (`docs/map/processes/admin-gate.md`): a wrong current password
  here is not counted. Only Supabase Auth's own rate limit applies, shown as "Too many
  attempts. Wait a few minutes, then try again." (`src/app/(dashboard)/settings/actions.ts:167`).

## Consumes / produces

Consumes `AuthPort.changePassword`, `AuthPort.requestPasswordReset`, `AuthPort.resetPassword`,
`AdminWritePort.setOwnName`, `AdminWritePort.recordOwnPasswordChange`. Produces
`profiles.full_name`, `profile.rename` and `profile.password_change` audit entries.

## If you change this

**Hits**

- `src/domain/password-policy.ts` and Supabase's password rules (change both together).
- The invitation and `/reset-password` forms, which share `NewPasswordFields` and
  `PasswordInput`; `/login`, which uses `PasswordInput`.
- `admin/0020`.

**Does not hit**

- Anyone else's account, membership or grant.

## Tests

`supabase/tests/admin_0020_own_profile.test.sql`, `src/domain/profile.test.ts`,
`src/adapters/supabase/errors.test.ts`, `src/domain/audit.test.ts`.

## See

`supabase/migrations/admin/0020_own_profile.sql`, `src/domain/profile.ts`,
`src/app/(dashboard)/settings/`, `src/components/settings/`, `src/components/auth/`.
