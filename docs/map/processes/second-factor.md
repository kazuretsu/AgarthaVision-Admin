---
verified: 2026-10-28
commit: 2e84353
---

# Second factor (14zcqntjnt0, 14zcqntr31c)

Input: a console user's session after their password → Movement: an admin with an
authenticator app enters its six-digit code; one without goes straight in, and sets an app up
on `/settings` when they choose → Output: a session the console admits, or `/verify` until the
code is entered.

## Why

Super admins and org admins can read patients' personal data, including minors'. The app
repo's signed privacy position (`docs/patient-pii-position.md`, Position 6, safeguard 2) makes
multi-factor authentication mandatory for administrative accounts. The console built it as
mandatory (14zcqntjnt0), and it got in the way of user validation testing: a test admin could
see nothing until they had installed an app. So during validation and demo it is **each
admin's choice** (14zcqntr31c): the console offers it on `/settings` and holds an admin who
turned it on to it. That is a deviation from Position 6 that rests on Position 3 (validation
uses synthetic patients only), and it must be mandatory again before any real patient's record
is entered; the position document needs amending to say so.

Supabase Auth's TOTP (authenticator app) MFA is free on every plan and on by default. SMS codes
cost money and are out of scope; so is MFA for medtechs, who never use the console.

## Steps

1. **Sign-in.** A correct password redirects to `/dashboard`
   (`src/app/(auth)/login/actions.ts`), and so does accepting an org admin invitation
   (`src/app/(auth)/invite/[token]/actions.ts`). The gate decides from there.
2. **The gate.** `requireConsoleActor` (`src/adapters/supabase/auth.ts`) resolves access. A
   token that says `aal2` (Supabase's mark that the session passed a code) is admitted with no
   further call. Short of it, the adapter asks the auth server whether the account has a
   confirmed app (`confirmedAuthenticator`: `mfa.listFactors`, which calls `getUser`, never the
   cookie, which the browser could edit). The rule is `secondFactorStep` and
   `secondFactorAdmits` (`src/domain/second-factor.ts`): an app and no code yet is
   `SecondFactorRequiredError`, and the layout and `requirePageAccess` redirect to `/verify`,
   route handlers answer 401, server actions refuse as signed out
   (`docs/map/processes/admin-gate.md`). No app is admitted on the password. A failed lookup is
   `AuthUnavailableError`, never "no app".
3. **The code.** `/verify` (`src/app/(auth)/verify/page.tsx`) asks `secondFactorStatus`, which
   resolves access the same way and always reads the app from the auth server. Only
   `enter_code` stays; anyone else goes to the dashboard. A medtech is sent there too, where
   the gate tells them to use the app. `verifySecondFactor` challenges the confirmed app and
   checks the code. Codes are six digits; spaces are dropped (`readSecondFactorCode`).
4. **Setting it up (`/settings`).** The Settings page (`src/app/(dashboard)/settings/`, every
   admin, in the sidebar) shows "Two-step sign-in" on or off, read from the auth server, so an
   app reset since this session passed its code shows as off. "Set up authenticator app" calls
   `beginSecondFactorSetUp`. It clears any unconfirmed set-up left by an abandoned page, then
   enrols a TOTP factor with issuer `AgarthaVision Admin` and shows its QR code (an SVG data
   URL) and the key in fours. The first code confirms it (`confirmSecondFactorSetUp`): Supabase
   marks the factor verified and upgrades the session to `aal2`. A mistyped code keeps the QR
   code; a set-up the provider no longer has says "This set-up expired. Start again." From
   then on every sign-in asks for the code.
5. **Turning it off.** "Turn off" asks for a current code (`turnOffSecondFactor`): it checks
   the code against the app, then removes the app (`mfa.unenroll`), which the provider allows
   only to an `aal2` session and follows by lowering the account's sessions to `aal1`. A code is
   asked even though the session already passed one, so a session left open on a shared
   computer cannot turn it off. The next sign-in needs only the password. Changing phones is
   turn off, then set up again.
6. **Refusals.** `SecondFactorError` carries `rejected` (wrong or expired code: "That code
   didn't match…"), `rate_limited` (429: "Too many attempts…") or `failed`
   (`secondFactorFailure`, `src/adapters/supabase/errors.ts`). The words are shared by both
   pages (`src/lib/second-factor-messages.ts`).

## What it costs

A session that passed its code costs nothing more than before. A session without one (every
admin with no app) costs one call to the auth server per request, to make sure the account
still has no app; it is `cache()`d for the request (`getConsoleActor`).

## Guarantees the provider adds

- **No second app on a password alone.** Supabase refuses to enrol a factor for a session
  below `aal2` once a verified one exists (`insufficient_aal`), even when called straight at
  `/auth/v1/factors`. A stolen password cannot replace the app.
- **Removing a confirmed app needs `aal2`** too, and the console asks for a fresh code first.

## The phone (org admins)

Org admins do fieldwork in the Android app with the same account (14zcqntkd0w), and the app
signs in with a password only. **Every** successful code — at set-up and at each later sign-in —
makes Supabase delete the account's sessions below `aal2`
(`verifyTOTPFactor` → `InvalidateSessionsWithAALLessThan`, supabase/auth `internal/api/mfa.go`).
The phone's next renewal is refused, and the app treats that as "access refused" (SE2
14zcqntjph8): it signs out and clears its synced copy; unsynced work stays. Signing in again on
the phone works. `/verify` says so ("If you also use the AgarthaVision mobile app with this
account, it will ask you to sign in again afterwards."), and so does `/settings` before an app
is set up. An org admin with no app is never signed out of the phone.

This lasts until the app asks for the same code on accounts that have an app (a separate SE2
ticket). Until then, the database cannot require `aal2` either: the same account reads the
same rows from the phone with a password alone. **The console enforces the code; a password
still opens what the app can reach.**

## Reset (lost phone)

A super admin opens an org admin's page (`/people/[userId]?org=…`). The "Two-step sign-in"
card reads whether an app is set up (`hasAuthenticator`, service role,
`src/adapters/supabase/account-access.ts`) and offers "Reset authenticator app" behind a
confirmation. `resetAuthenticator` (`src/app/(dashboard)/people/actions.ts:371`):

1. checks `canResetSecondFactor` (`src/domain/second-factor.ts`): super admins only, for an
   org admin with a login, never themselves;
2. **records first**: `console_record_authenticator_reset` (`admin/0018`) writes
   `member.authenticator_reset` under the member's laboratory, and refuses anyone else the
   same way. If it fails, nothing is reset;
3. then deletes every factor the login has (`auth.admin.mfa.deleteFactor`). Supabase drops
   that login's sessions to `aal1` in the same step. If it fails, the page says so; the entry
   stands for the attempt.

The org admin then signs in with their password alone, and can set up a new app on
`/settings`. An `aal2` access token already issued keeps working until it expires (an hour by
default). Nothing else changes: password, membership, patients, records.

A super admin's own lost phone, or another super admin's, is reset in the Supabase dashboard
(Authentication → Users → the user → remove the MFA factor): super admins are in no
laboratory, so they have no People page.

## Consumes / produces

Consumes `AuthPort.secondFactorStatus`, `beginSecondFactorSetUp`, `confirmSecondFactorSetUp`,
`verifySecondFactor`, `turnOffSecondFactor`; `AccountAccessPort.hasAuthenticator`, `resetAuthenticator`;
`AdminWritePort.recordAuthenticatorReset` (`docs/map/objects/ports.md`). Produces an `aal2`
session, or an audit entry and a reset.

## If you change this

**Hits**

- Every page, route handler and server action through `requireConsoleActor`
  (`docs/map/processes/admin-gate.md`).
- The Android app's sessions for org admins (above), until it asks for the code itself.
- `admin/0018` and `src/domain/audit.ts` (`member.authenticator_reset`).
- Every admin without an app: one auth-server call per request (above).
- A provider swap: the rule (`secondFactorStep`, `secondFactorAdmits`, `canResetSecondFactor`)
  and the `/verify` and `/settings` pages stay; the adapter must report "this session passed a second factor" and "this account
  has an app", and must refuse a second app to a session that has not passed.

**Does not hit**

- Medtechs: never asked, never offered an app.
- Supabase settings: TOTP is on by default and free. Nothing to switch on.
- Database policies: unchanged (see "The phone").

## Tests

`src/domain/second-factor.test.ts`, `src/adapters/supabase/auth.test.ts` (the gate with and
without an app, status, set-up, codes, turning off, refusals), `src/components/shell/nav.test.ts`, `src/adapters/supabase/account-access.test.ts`,
`src/adapters/supabase/admin-write.test.ts`, `src/lib/console-access.test.ts`,
`supabase/tests/admin_0018_authenticator_reset.test.sql`.

## See

`src/domain/second-factor.ts`, `src/app/(auth)/verify/`, `src/app/(dashboard)/settings/`,
`src/components/auth/SecondFactor.tsx`,
`src/components/people/AuthenticatorResetForm.tsx`, `supabase/migrations/admin/0018_authenticator_reset.sql`.
