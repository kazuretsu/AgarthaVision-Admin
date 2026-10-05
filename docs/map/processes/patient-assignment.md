---
verified: 2026-10-05
commit: d7ba5d4
---

# Patient assignment

Input: an org admin on a patient's page → Movement: an audited database function adds or
removes a `patient_users` link → Output: the medtech sees (or stops seeing) the patient in the
app after their next sync. Nothing else changes: the patient, every record and its author stay.

## Why it matters

A medtech sees a patient only through a `patient_users` link (D12, app `0001`), and since app
`0007` that link also shows them the patient's whole history, colleagues' smears included.
The app's `on_patient_created` trigger links the creator; until `admin/0007` nothing else could
change links, because `patient_users` has no write policy for anyone. It still has none: every
change is a security-definer function.

## Who does what

| Who                         | Patient page                       | Medtech page (`/medtechs/[id]`)          |
| --------------------------- | ---------------------------------- | ---------------------------------------- |
| Org admin of the laboratory | sees, assigns, removes, hands over | sees the medtech's patients, named       |
| Super admin                 | sees who is assigned (read only)   | sees them de-identified (`?org=` needed) |

Only a laboratory's own org admin assigns (`canAssignPatients`,
`src/domain/assignments.ts:35`): who works on a clinic's patient is the clinic's decision.

## The rules

- **Same laboratory, active medtechs only.** `console_assign_patient`
  (`supabase/migrations/admin/0007_patient_assignments.sql:151`) refuses a patient of another
  laboratory, and anyone who is not an active medtech of the patient's laboratory. The page
  offers only those (`assignableMedtechs`, `:53`); the action checks again before the call.
- **Never nobody.** `console_unassign_patient` (`:181`) refuses to remove a link when no other
  **active** medtech of the laboratory would remain (`23514`, hint `last_assignment`) — a
  deactivated medtech's link does not count. It locks the patient's links first, so two
  removals cannot each leave the other's last. The page shows **Hand over** instead of Remove
  for that row (`canRemoveAssignment`, `:45`); `console_replace_assignment` (`:215`) assigns the
  new medtech and removes the old one in one transaction.
- **Removing is access only.** It deletes the one link row. The patient, sessions, samples,
  reports and their `user_id` authors are untouched (C8); the session table still says who
  read each smear.
- **Audited, without the patient's name.** `assignment.add` and `assignment.remove` name the
  patient by record id and the medtech by name: super admins read the audit trail
  (constraint #14).

## Reads

`console_patient_assignments` (`:35`) returns who is linked to one patient with their
membership in its laboratory (a link from outside the laboratory shows "Not in this
laboratory"). `console_member_patients` (`:67`) returns one member's patients in their
laboratory and withholds names from a super admin. Both refuse anyone else.

## If you change this

**Hits**

- What the app shows each medtech, from their next sync.
- `canRemoveAssignment` and the function's "last active medtech" rule must agree.
- `supabase/tests/admin_0007_patient_assignments.test.sql`.

**Does not hit**

- Clinical records and their authors; the patient's laboratory (`patient_organizations`).

## See

`src/domain/assignments.ts`, `src/app/(dashboard)/assignments/actions.ts`,
`src/components/assignments/`, `src/app/(dashboard)/medtechs/[userId]/page.tsx`.
