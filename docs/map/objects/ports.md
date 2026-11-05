---
verified: 2026-11-05
commit: 7e94643
---

# Ports

The interfaces every feature depends on: `DatabasePort`, `AdminWritePort`, `StoragePort`,
`AuthPort`, and, for invitations and medtech access, `OnboardingPort`, `MailPort` and
`AccountAccessPort`; for the sign-in attempt limits, `AttemptLimitPort`.

## Why this shape

The console must be able to change database and file-storage provider without touching UI
or feature code (constraint #1). That only holds if **no vendor type appears in a port
signature** — otherwise swapping a provider is a refactor of everything that imports it,
not an addition. Grep `src/ports/` for `supabase` and you should find nothing.

Every clinical read on `DatabasePort` takes a required `ReadScope` (`src/domain/scope.ts`)
and must return nothing outside it on its own — see `docs/map/processes/lab-scoping.md`.
`DatabasePort` is **read-only by construction** (`src/ports/db.ts:110`). There is no
`insert`, `update` or `delete` verb on it. That is how constraint #4 is enforced rather
than merely stated: the console cannot mutate clinical data because it has no way to
express the intent.

## Shape

| Port                 | Members                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | File                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `DatabasePort`       | the clinical reads (`listPatients`, `getPatientRecord`, `getSessionRecord`, `getSampleRecord`, `listSmears`, `dashboardTotals`, `areaPrevalence`); the administrative reads (`listOrganizations`, `getOrganization`, `listInvitations`, `getInvitation`, `listPeople`, `listPatientAssignments`, `listMemberPatients`, `listSoleCoverPatients`, `listSuperAdmins`, `listSuperAdminInvitations`, `getSuperAdminInvitation`, `listAuditEntries`, `getProfile`, `listAuditActors`); and the training reads (`trainingFrames`, `trainingSupportsUnboxed`, `trainingModelVersions`, `listTrainingSnapshots`, `getTrainingSnapshot`), super admins only | `src/ports/db.ts:110`          |
| `AdminWritePort`     | `createOrganization`, `renameOrganization`, `setOrganizationStatus`, `recordExport`, `invite`, `resendInvitation`, `revokeInvitation`, `inviteSuperAdmin`, `resendSuperAdminInvitation`, `revokeSuperAdminInvitation`, `revokeSuperAdmin`, `setMemberStatus`, `recordAuthenticatorReset`, `assignPatient`, `unassignPatient`, `replaceAssignment`, `offboardMember`, `createTrainingSnapshot`, `recordTrainingDownload` — each audited, `recordSignInChange`, `setOwnName`, `recordOwnPasswordChange`                                                                                                                                             | `src/ports/admin-write.ts:40`  |
| `StoragePort`        | `createSignedUrl`, `download` (a training zip's images, as the signed-in user)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `src/ports/storage.ts:22`      |
| `AuthPort`           | `getCurrentUser`, `requireConsoleActor`, `secondFactorStatus`, `beginSecondFactorSetUp`, `confirmSecondFactorSetUp`, `verifySecondFactor`, `turnOffSecondFactor`, `changePassword`, `signInWithPassword`, `signOut`                                                                                                                                                                                                                                                                                                                                                                                                                               | `src/ports/auth.ts`            |
| `OnboardingPort`     | `findInvitation`, `acceptInvitation` — for a visitor with no account yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `src/ports/onboarding.ts`      |
| `MailPort`           | `send`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `src/ports/mail.ts`            |
| `RequestSessionPort` | `session` (id, sign-in time), `endSession` (this browser only), `response` — for the proxy, which opens it from the Supabase adapter directly, not through the registry                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `src/ports/request-session.ts` |
| `AccountAccessPort`  | `setSignInAllowed` — block or allow a login, deleting nothing; `hasAuthenticator`, `resetAuthenticator` — a login's authenticator app                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `src/ports/account-access.ts`  |
| `AttemptLimitPort`   | `countFailures` (since the window's start), `recordFailure` — failed sign-in and invitation attempts, server only; callers go through `withAttemptLimit`, which fails open                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `src/ports/attempt-limit.ts`   |

Each port ships its own error types, so a caller handles a failure without knowing which
provider raised it: `DatabaseReadError` (`src/ports/db.ts:243`), `MigrationNotAppliedError`
(`src/ports/db.ts:252`, naming the admin migration to apply), `StorageAccessError`
(`src/ports/storage.ts:38`), and `NotAuthenticatedError` / `NotAuthorizedError` /
`AuthenticationFailedError` / `HumanCheckFailedError` / `SecondFactorRequiredError` (a kind of
`NotAuthenticatedError`) / `SecondFactorError` / `PasswordChangeError` / `AuthUnavailableError`
(`src/ports/auth.ts`), `AdminWriteError` (`src/ports/admin-write.ts:160`: a `reason` —
`forbidden`, `conflict`, `not_found`, `invalid` or `failed` — and a `hint` naming which case
it was), `AccountAccessError` (`src/ports/account-access.ts:23`), `AcceptInvitationError` and
`MailSendError`.

`requireConsoleActor` admits a session with an authenticator app only once it has passed the
code, and one without an app on its password; the second-step members serve `/verify` and
`/settings` (`docs/map/processes/second-factor.md`).

`AuthPort.signOut` ends this browser's session only; the account's other sessions, the mobile
app's included, carry on (14zcqntnqpd, `docs/map/processes/admin-gate.md`).

`changePassword` checks the current password and ends every other session of the account,
keeping this one; `setOwnName` and `recordOwnPasswordChange` act on the caller only
(`docs/map/processes/own-profile.md`).

`Credentials` and `AcceptInvitationRequest` carry an optional `humanCheckToken`: the form's
single-use Turnstile token, which the provider verifies (`docs/map/processes/human-check.md`).

`ConsoleActor.secondFactorOn` says whether the account has an authenticator app, as the gate
already learned it, at no extra call (`docs/map/processes/notices.md`).

`requireConsoleActor()` returns the user together with their `ConsoleAccess`
(`src/domain/access.ts:22`) — super admin, or org admin with their organization — and
throws rather than returning a reduced view for anyone else. There is no partial console,
so a caller cannot forget to branch on a role and leak a cross-user query. `AuthPort`
imports two domain types, `ConsoleAccess` and `SecondFactorStep`; it still names no vendor.

## Connected to

- Implemented by:
  `src/adapters/supabase/{database,admin-write,storage,auth,onboarding,account-access,attempt-limit,request-session}.ts`
  and `src/adapters/resend/mail.ts`.
- Selected by: `docs/map/objects/provider-registry.md`.
- Imported by: pages, layouts and route handlers — the types via `@/ports`, the ports
  themselves from the getters in `src/adapters/registry.ts`, never from an adapter. The one
  exception is `src/proxy.ts:2`, which opens a `RequestSessionPort` from
  `src/adapters/supabase/request-session.ts` directly.

## If you change this

**Hits**

- Every adapter, which must still satisfy the interface — a new method is a new method on
  each of them.
- `src/adapters/registry.ts`, whose return types are these ports (all but
  `RequestSessionPort`).
- `src/proxy.ts`, for `RequestSessionPort`.
- Every caller, if a signature changes.

**Does not hit**

- The domain layer. `src/domain/` is pure and imports no port; it takes rows as arguments.
  That is why the domain tests need no network and no mock.
- The upstream schema.

## Surfaces

The only interface between feature code and any backend.

## See

`src/ports/db.ts`, `src/ports/admin-write.ts`, `src/ports/storage.ts`, `src/ports/auth.ts`,
`src/ports/onboarding.ts`, `src/ports/mail.ts`, `src/ports/request-session.ts`,
`src/ports/account-access.ts`, `src/ports/attempt-limit.ts`, `src/ports/index.ts`.
