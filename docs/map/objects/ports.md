---
verified: 2026-09-30
commit: c5c0fbe
---

# Ports

The interfaces every feature depends on: `DatabasePort`, `AdminWritePort`, `StoragePort`,
`AuthPort`, and, for invitations and medtech access, `OnboardingPort`, `MailPort` and
`AccountAccessPort`.

## Why this shape

The console must be able to change database and file-storage provider without touching UI
or feature code (constraint #1). That only holds if **no vendor type appears in a port
signature** — otherwise swapping a provider is a refactor of everything that imports it,
not an addition. Grep the three files for `supabase` and you should find it only in prose.

Every clinical read on `DatabasePort` takes a required `ReadScope` (`src/domain/scope.ts`)
and must return nothing outside it on its own — see `docs/map/processes/lab-scoping.md`.
`DatabasePort` is **read-only by construction** (`src/ports/db.ts:72`). There is no
`insert`, `update` or `delete` verb on it. That is how constraint #4 is enforced rather
than merely stated: the console cannot mutate clinical data because it has no way to
express the intent.

## Shape

| Port                | Members                                                                                                                                                                 | File                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `DatabasePort`      | `listPatients`, `getPatientRecord`, `getSessionRecord`, `getSampleRecord`, `listSmears`, `getProfile`, `listProfiles`                                                   | `src/ports/db.ts:72`          |
| `AdminWritePort`    | `createOrganization`, `renameOrganization`, `setOrganizationStatus`, `recordExport`, `invite`, `resendInvitation`, `revokeInvitation`, `setMemberStatus` — each audited | `src/ports/admin-write.ts`    |
| `StoragePort`       | `createSignedUrl`                                                                                                                                                       | `src/ports/storage.ts:21`     |
| `AuthPort`          | `getCurrentUser`, `requireConsoleActor`, `signInWithPassword`, `signOut`                                                                                                | `src/ports/auth.ts:33`        |
| `OnboardingPort`    | `findInvitation`, `acceptInvitation` — for a visitor with no account yet                                                                                                | `src/ports/onboarding.ts`     |
| `MailPort`          | `send`                                                                                                                                                                  | `src/ports/mail.ts`           |
| `AccountAccessPort` | `setSignInAllowed` — block or allow a login, deleting nothing                                                                                                           | `src/ports/account-access.ts` |

Each port ships its own error types, so a caller handles a failure without knowing which
provider raised it: `DatabaseReadError` (`src/ports/db.ts:115`), `StorageAccessError`
(`src/ports/storage.ts:30`), and `NotAuthenticatedError` / `NotAuthorizedError` /
`AuthenticationFailedError` (`src/ports/auth.ts:55-77`), `AdminWriteError` (with a `hint`
naming which conflict it was), `AcceptInvitationError` and `MailSendError`.

`requireConsoleActor()` returns the user together with their `ConsoleAccess`
(`src/domain/access.ts:22`) — super admin, or org admin with their organization — and
throws rather than returning a reduced view for anyone else. There is no partial console,
so a caller cannot forget to branch on a role and leak a cross-user query. The port
imports that one domain type; it still names no vendor.

## Connected to

- Implemented by: `src/adapters/supabase/{database,admin-write,storage,auth,onboarding}.ts`
  and `src/adapters/resend/mail.ts`.
- Selected by: `docs/map/objects/provider-registry.md`.
- Imported by: pages, layouts and route handlers — always via `@/ports`, never from
  `src/adapters/`.

## If you change this

**Hits**

- Every adapter, which must still satisfy the interface — a new method is a new method on
  each of them.
- `src/adapters/registry.ts`, whose return types are these ports.
- Every caller, if a signature changes.

**Does not hit**

- The domain layer. `src/domain/` is pure and imports no port; it takes rows as arguments.
  That is why the domain tests need no network and no mock.
- The upstream schema.

## Surfaces

The only interface between feature code and any backend.

## See

`src/ports/db.ts`, `src/ports/admin-write.ts`, `src/ports/storage.ts`, `src/ports/auth.ts`,
`src/ports/onboarding.ts`, `src/ports/mail.ts`, `src/ports/index.ts`.
