---
verified: 2026-10-01
commit: 219d9cc
---

# Organizations

Laboratories, who belongs to them, which patients they own, and the audit log of every
console write. Schema: `supabase/migrations/admin/0001_organizations.sql`.

## Why this shape

A laboratory owns its patient records; the medtech is the author, not the owner (D11). So
ownership hangs off the organization, and access follows membership — never a profile
flag a user could keep after leaving. The shapes mirror Better Auth's organization plugin
(`organization`, `member`) so a later provider move maps cleanly (D7).

**Leaving keeps the author.** A medtech or organization admin who leaves is deactivated —
their membership's `status` — never deleted. Their `profiles` row stays, and every patient,
session and sample they recorded still points at it (`created_by`, `user_id`), so the
record keeps naming its author after they are gone. Deleting their login is safe as well,
once the app's `0011_profile_outlives_login.sql` is applied: `profiles.id` no longer
cascades from `auth.users`, the login's `profiles.account_id` is cleared instead, and the
profile, its membership and its audit entries keep naming them. Before `0011`, deleting a
login took the profile with it, or failed outright while records referenced it. Deleting
the `profiles` row itself is never offboarding.

This is the first schema this repo owns (D4). It follows the migration convention: its own
sequence under `supabase/migrations/admin/`, **additive only**, nothing the app owns is
altered or dropped. `bun run test:db` proves the app still registers patients afterwards.

## Shape

| Object                                                                  | Line                   | What it holds                                                                                |
| ----------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| `organizations`                                                         | `:36`                  | name (unique ignoring case and spacing), `active` / `deactivated`                            |
| `organization_members`                                                  | `:52`                  | keyed by `user_id` — **one organization per user** (D10); `role` is `org_admin` or `medtech` |
| `patient_organizations`                                                 | `:67`                  | keyed by `patient_id` — the owning laboratory; filled for new patients by `admin/0002`       |
| `admin_audit_log`                                                       | `:79`                  | actor, action, target, organization, details; **append-only**                                |
| `console_org_admin_org(uid)`                                            | `:137`                 | the organization a user administers, or null; null if either side is deactivated             |
| `console_member_org(uid)`                                               | `:154`                 | the organization a user belongs to, in any role                                              |
| `console_write_audit(…)`                                                | `:176`                 | internal; no client may call it                                                              |
| `console_create_organization` / `_rename_` / `_set_organization_status` | `:262`, `:286`, `:319` | super-admin writes, each auditing itself                                                     |

Line numbers are in `supabase/migrations/admin/0001_organizations.sql`.

**Reads** are RLS policies (`:209` on): a super admin reads everything; an org admin reads
their own organization, its members, its patient links and its audit entries; every user
reads their own membership and their own organization's name.

**Writes** have no table policy at all. Every write is a security-definer function that
checks the caller, changes the row and appends the audit entry in one transaction — so a
write without its audit entry cannot happen, and no client can forge one. The console
checks the same rule first in `canManageOrganizations` (`src/domain/organizations.ts:46`);
the function is the second line, never the only one.

**The audit log is append-only for everyone.** No role has an UPDATE or DELETE policy, and
a trigger (`:103`) refuses both — and TRUNCATE — even for the table owner. The single
exception is the foreign key's own `on delete set null` when an actor's profile is removed,
because refusing it would stop user deletion working, which an additive migration must not
change. `actor_label` keeps who it was. Since the app's `0011`, deleting a login leaves the
profile, so the entries keep their `actor_id`.

**Members join by invitation** (`admin/0005`, `docs/map/processes/invitations.md`): a super
admin invites an organization's admins, an org admin its medtechs, and accepting inserts the
membership the invitation names. `organization_invitations` is read like the members: a super
admin all, an org admin their organization's; its token hash by nobody.

**Deactivating a medtech** (`admin/0006`, `docs/map/processes/medtech-access.md`) sets
their membership's status and bans their login; nothing is deleted.

**Assigning patients** (`admin/0007`, `docs/map/processes/patient-assignment.md`): an org
admin links their laboratory's patients to its active medtechs through audited functions;
`patient_users` itself still has no write policy.

**Backfill** (`:363`): one "Starting laboratory" receives every existing non-admin user as a
medtech and every existing patient, so nothing is orphaned when scoping arrives. Super
admins are members of nothing; they see everything.

## In the console

- Org-admin detection: `findOrgAdminMembership` (`src/adapters/supabase/auth.ts:74`) reads
  the user's own membership; only an active `org_admin` in an active organization counts.
- Writes go through `AdminWritePort` (`src/ports/admin-write.ts`), implemented by one RPC
  call per method (`src/adapters/supabase/admin-write.ts:35`), with SQLSTATEs mapped to
  reasons a page can explain (`:16`).
- Pages: `/organizations` and `/organizations/[id]`, super admins only
  (`requirePageAccess(["super_admin"])`). Server actions re-check the rule before writing
  (`src/app/(dashboard)/organizations/actions.ts:27`). A malformed organization id is a 404
  on the page and "no longer exists" from an action, never a database error.

## If you change this

**Hits**

- Everything that scopes by organization: the gate, `admin/0002` scoping, the audit page.
- The app, if a change ever touches an app-owned object — which must instead go to the app
  repo as its own migration.
- `supabase/tests/admin_0001_organizations.test.sql`.

**Does not hit**

- Clinical data. No function here writes a patient, session, sample or detection.

## Reading the log

`/audit` and `admin/0003` (exports) are described in `docs/map/processes/audit-trail.md`.

## See

`supabase/migrations/admin/0001_organizations.sql`, `src/domain/organizations.ts`,
`src/ports/admin-write.ts`, `supabase/tests/`.
