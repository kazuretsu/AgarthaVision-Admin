---
verified: 2026-09-30
commit: f99fd4c
---

# Audit trail

Input: an administrative write or an export → Movement: the database appends one entry in
the same transaction → Output: `/audit`, filtered by person, action, date and (for a super
admin) organization.

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

| Action                    | Written by                        |
| ------------------------- | --------------------------------- |
| `organization.create`     | `console_create_organization`     |
| `organization.rename`     | `console_rename_organization`     |
| `organization.deactivate` | `console_set_organization_status` |
| `organization.reactivate` | `console_set_organization_status` |
| `organization.backfill`   | `admin/0001`, once                |
| `export.research`         | `console_record_export`           |
| `invitation.create`       | `console_invite`                  |
| `invitation.resend`       | `console_resend_invitation`       |
| `invitation.revoke`       | `console_revoke_invitation`       |
| `invitation.accept`       | `console_accept_invitation`       |
| `member.deactivate`       | `console_set_member_status`       |
| `member.reactivate`       | `console_set_member_status`       |

## Reading

`listAuditEntries` (`src/adapters/supabase/database.ts:672`) reads newest first, scoped like
every other read: an org admin sees their organization's entries (and RLS agrees); a super
admin sees all or one organization. `describeAuditEntry` (`src/domain/audit.ts:43`) turns an
entry into one line; an action this build does not know is shown as recorded, never hidden.
The page caps at 500 entries and says so.

Each entry keeps `actor_label`, the actor's name at the time, so it still reads correctly if
the profile is later removed.

## If you change this

**Hits**

- Every new administrative write: it must call `console_write_audit` in its own function,
  and its action belongs in `AUDIT_ACTIONS` (`src/domain/audit.ts:24`).
- The export route's fail-closed order: record first, then serve.

**Does not hit**

- Clinical data, which the console never writes.

## See

`src/domain/audit.ts`, `src/app/(dashboard)/audit/page.tsx`,
`supabase/migrations/admin/0001_organizations.sql`, `0003_audit_exports.sql`.
