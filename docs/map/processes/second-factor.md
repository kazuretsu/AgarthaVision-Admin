---
verified: 2026-10-18
commit: 8d5e003
---

# Second factor (14zcqntjnt0)

Input: a console user's session after their password → Movement: set up an authenticator app
the first time, enter its six-digit code every time → Output: a session the console admits,
or `/verify` until then.

## Why

The signed privacy position (`docs/patient-pii-position.md` §3) makes multi-factor
authentication mandatory for administrative accounts: super admins and org admins can read
patients' personal data, including minors'. A password alone no longer opens the console.

Supabase Auth's TOTP (authenticator app) MFA is free on every plan and on by default. SMS codes
cost money and are out of scope; so is MFA for medtechs, who never use the console.

## Steps

1. **Sign-in.** A correct password redirects to `/verify`
   (`src/app/(auth)/login/actions.ts:76`), never straight to the console. So does accepting an
   org admin invitation (`src/app/(auth)/invite/[token]/actions.ts`).
2. **The gate.** `requireConsoleActor` (`src/adapters/supabase/auth.ts:223`) resolves access,
   then requires `aal2` on the verified token (`:229`), Supabase's mark that the session passed
   a code. Short of it, `SecondFactorRequiredError`: the layout and `requirePageAccess` redirect
   to `/verify`, route handlers answer 401, and server actions refuse as signed out
   (`docs/map/processes/admin-gate.md`). No page, data or write before the code.
3. **Where they stand.** `/verify` (`src/app/(auth)/verify/page.tsx`) asks
   `secondFactorStatus` (`auth.ts:233`), which resolves access the same way, then asks the auth
   server for the account's confirmed apps (`mfa.listFactors`, which calls `getUser`, `:249`).
   The rule is `secondFactorStep` (`src/domain/second-factor.ts`): passed → the dashboard; an
   app → "Enter your code"; none → "Set up two-step sign-in". A medtech is sent to the
   dashboard, where the gate tells them to use the app; they are never offered one.
4. **Set up (first time).** "Set up authenticator app" calls `beginSecondFactorSetUp`
   (`:255`). It clears any unconfirmed set-up left by an abandoned page, then enrols a TOTP
   factor with issuer `AgarthaVision Admin` and shows its QR code (an SVG data URL) and the key
   in fours. The first code confirms it (`confirmSecondFactorSetUp`): Supabase marks the
   factor verified and upgrades the session to `aal2`, and the request client writes the new
   session cookies. A mistyped code keeps the QR code; a set-up the provider no longer has
   says "This set-up expired. Start again."
5. **Code (every later sign-in).** `verifySecondFactor` (`:282`) challenges the confirmed app
   and checks the code. Codes are six digits; spaces are dropped (`readSecondFactorCode`).
6. **Refusals.** `SecondFactorError` carries `rejected` (wrong or expired code: "That code
   didn't match…"), `rate_limited` (429: "Too many attempts…") or `failed`
   (`secondFactorFailure`, `src/adapters/supabase/errors.ts`). An outage reading the factors is
   `AuthUnavailableError`, never "no app".

## Guarantees the provider adds

- **No second app on a password alone.** Supabase refuses to enrol a factor for a session
  below `aal2` once a verified one exists (`insufficient_aal`), even when called straight at
  `/auth/v1/factors`. A stolen password cannot replace the app.
- **Removing a confirmed app needs `aal2`** too; the console never does it for oneself.

## The phone (org admins)

Org admins do fieldwork in the Android app with the same account (14zcqntkd0w), and the app
signs in with a password only. **Every** successful code — at set-up and at each later sign-in —
makes Supabase delete the account's sessions below `aal2`
(`verifyTOTPFactor` → `InvalidateSessionsWithAALLessThan`, supabase/auth `internal/api/mfa.go`).
The phone's next renewal is refused, and the app treats that as "access refused" (SE2
14zcqntjph8): it signs out and clears its synced copy; unsynced work stays. Signing in again on
the phone works. `/verify` says so: "If you also use the AgarthaVision mobile app with this
account, it will ask you to sign in again afterwards."

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

The org admin sets up a new app at their next sign-in. An `aal2` access token already issued
keeps working until it expires (an hour by default); the next renewal carries `aal1` and the
gate sends them to `/verify`. Nothing else changes: password, membership, patients, records.

A super admin's own lost phone, or another super admin's, is reset in the Supabase dashboard
(Authentication → Users → the user → remove the MFA factor): super admins are in no
laboratory, so they have no People page.

## Consumes / produces

Consumes `AuthPort.secondFactorStatus`, `beginSecondFactorSetUp`, `confirmSecondFactorSetUp`,
`verifySecondFactor`; `AccountAccessPort.hasAuthenticator`, `resetAuthenticator`;
`AdminWritePort.recordAuthenticatorReset` (`docs/map/objects/ports.md`). Produces an `aal2`
session, or an audit entry and a reset.

## If you change this

**Hits**

- Every page, route handler and server action through `requireConsoleActor`
  (`docs/map/processes/admin-gate.md`).
- The Android app's sessions for org admins (above), until it asks for the code itself.
- `admin/0018` and `src/domain/audit.ts` (`member.authenticator_reset`).
- A provider swap: the rule (`secondFactorStep`, `canResetSecondFactor`) and the `/verify`
  page stay; the adapter must report "this session passed a second factor" and "this account
  has an app", and must refuse a second app to a session that has not passed.

**Does not hit**

- Medtechs: never asked, never offered an app.
- Supabase settings: TOTP is on by default and free. Nothing to switch on.
- Database policies: unchanged (see "The phone").

## Tests

`src/domain/second-factor.test.ts`, `src/adapters/supabase/auth.test.ts` (the gate, status,
set-up, codes, refusals), `src/adapters/supabase/account-access.test.ts`,
`src/adapters/supabase/admin-write.test.ts`, `src/lib/console-access.test.ts`,
`supabase/tests/admin_0018_authenticator_reset.test.sql`.

## See

`src/domain/second-factor.ts`, `src/app/(auth)/verify/`, `src/components/auth/SecondFactor.tsx`,
`src/components/people/AuthenticatorResetForm.tsx`, `supabase/migrations/admin/0018_authenticator_reset.sql`.
