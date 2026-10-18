---
verified: 2026-09-30
commit: f99fd4c
---

# Audit trail

Input: an administrative write or an export → Movement: the database appends one entry in
the same transaction → Output: `/audit`, filtered by person, action, date and (for a super
admin) organization.

## The person filter

The filter lists only the people who appear in the entries the reader can read, under the
label their latest entry carries: `listAuditActors` → `console_audit_actors(organization)`
(`admin/0011`), a security-invoker function, so `admin_audit_log`'s own policies decide which
entries count. It used to list every profile the reader could see.

## Writing

Nothing in the console inserts into `admin_audit_log`. Each write is a security-definer
function (`docs/map/objects/organizations.md`) that performs the change and calls the
internal `console_write_audit` before it returns, so a change without its entry cannot
commit. The table has no client write policy, and a trigger refuses UPDATE, DELETE and
TRUNCATE for every role, the owner included.

**Exports are audited before the file leaves.** The download route calls
`recordExport` (`src/app/(dashboard)/export/download/route.ts:86`) with the row count,
format, period and column version. If that fails, the route answers 403 or 503 and serves
nothing: an unrecorded download of patient data must not happen. The function
(`supabase/migrations/admin/0003_audit_exports.sql:13`) files an org admin's export under
their own organization whatever the console passes (`:30`), so an entry cannot be misfiled.
A training snapshot's download is recorded the same way, before the zip starts
(`training-data.md`). Training entries are filed under no organization, so only super admins
read them, and an org admin's action filter does not offer them (`auditActionsFor`). An
authenticator reset (14zcqntjnt0) follows the same order: recorded, then reset at the auth
provider (`docs/map/processes/second-factor.md`).

| Action                       | Written by                                                            |
| ---------------------------- | --------------------------------------------------------------------- |
| `organization.create`        | `console_create_organization`                                         |
| `organization.rename`        | `console_rename_organization`                                         |
| `organization.deactivate`    | `console_set_organization_status`                                     |
| `organization.reactivate`    | `console_set_organization_status`                                     |
| `organization.backfill`      | `admin/0001`, once                                                    |
| `export.research`            | `console_record_export`                                               |
| `invitation.create`          | `console_invite`                                                      |
| `invitation.resend`          | `console_resend_invitation`                                           |
| `invitation.revoke`          | `console_revoke_invitation`                                           |
| `invitation.accept`          | `console_accept_invitation`                                           |
| `member.deactivate`          | `console_set_member_status`                                           |
| `member.reactivate`          | `console_set_member_status`                                           |
| `member.authenticator_reset` | `console_record_authenticator_reset` (`admin/0017`), before the reset |
| `assignment.add`             | `console_assign_patient`                                              |
| `assignment.remove`          | `console_unassign_patient`                                            |
| `training.snapshot.create`   | `console_create_training_snapshot`                                    |
| `training.snapshot.download` | `console_record_training_download`                                    |

## Reading

`listAuditEntries` (`src/adapters/supabase/database.ts:672`) reads newest first, scoped like
every other read: an org admin sees their organization's entries (and RLS agrees); a super
admin sees all or one organization. `describeAuditEntry` (`src/domain/audit.ts:76`) turns an
entry into one line; an action this build does not know is shown as recorded, never hidden.
The page caps at 500 entries and says so.

Each entry keeps `actor_label`, the actor's name at the time, so it still reads correctly if
the profile is later removed.

## If you change this

**Hits**

- Every new administrative write: it must call `console_write_audit` in its own function,
  and its action belongs in `AUDIT_ACTIONS` (`src/domain/audit.ts:30`).
- The export route's fail-closed order: record first, then serve.

**Does not hit**

- Clinical data, which the console never writes.

## See

`src/domain/audit.ts`, `src/app/(dashboard)/audit/page.tsx`,
`supabase/migrations/admin/0001_organizations.sql`, `0003_audit_exports.sql`.
