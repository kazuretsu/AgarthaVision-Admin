---
verified: 2026-10-06
commit: 8121cf4
---

# Patient assignment

Input: an org admin on a patient's page → Movement: an audited database function adds or
removes a `patient_users` link → Output: the person sees (or stops seeing) the patient in the
app after their next sync. Nothing else changes: the patient, every record and its author stay.

Anyone active in the patient's laboratory can be assigned, **org admins included**
(`admin/0008`, 14zcqntkd0w). A role is a permission level, not a job: an org admin can do
everything a medtech can — the app never checked membership, so org admins already signed in,
registered patients and were linked to them — plus administration.

## Why it matters

A person sees a patient only through a `patient_users` link (D12, app `0001`), and since app
`0007` that link also shows them the patient's whole history, colleagues' smears included.
The app's `on_patient_created` trigger links the creator; until `admin/0007` nothing else could
change links, because `patient_users` has no write policy for anyone. It still has none: every
change is a security-definer function.

## Who does what

| Who                         | Patient page                       | Person page (`/people/[id]`)             |
| --------------------------- | ---------------------------------- | ---------------------------------------- |
| Org admin of the laboratory | sees, assigns, removes, hands over | sees the person's patients, named        |
| Super admin                 | sees who is assigned (read only)   | sees them de-identified (`?org=` needed) |

The person page opens for a member of either role. Only a laboratory's own org admin assigns
(`canAssignPatients`, `src/domain/assignments.ts:37`): who works on a clinic's patient is the
clinic's decision. An org admin may assign themselves.

## The rules

- **Same laboratory, active members only.** `console_assign_patient`
  (`supabase/migrations/admin/0008_member_fieldwork.sql:28`, replacing `admin/0007`'s) refuses
  a patient of another laboratory, and anyone who is not an active member — org admin or
  medtech — of the patient's laboratory. The page offers only those, each with their role
  (`assignableMembers`, `src/domain/assignments.ts:58`); the action checks again before the call.
- **Never nobody.** `console_unassign_patient` (`0008:62`) refuses to remove a link when no
  other **active** member of the laboratory, in either role, would remain (`23514`, hint
  `last_assignment`) — a deactivated member's link does not count, nor does a link from outside
  the laboratory (`isCovering`, `:45`). So a patient linked to an active org admin and a medtech
  can lose the medtech. It locks the patient's links first, so two removals cannot each leave
  the other's last. The page shows **Hand over** instead of Remove for that row
  (`canRemoveAssignment`, `:50`); `console_replace_assignment`
  (`admin/0007_patient_assignments.sql:215`, unchanged) assigns the new person and removes the
  old one in one transaction, so it follows both rules above.
- **Removing is access only.** It deletes the one link row. The patient, sessions, samples,
  reports and their `user_id` authors are untouched (C8); the session table still says who
  read each smear.
- **Audited, without the patient's name.** `assignment.add` and `assignment.remove` name the
  patient by record id and the person by name: super admins read the audit trail
  (constraint #14). Since `admin/0008` the details are `member_id`, `member` and `role`;
  `admin/0007`'s entries say `medtech_id` and `medtech`, and `describeAuditEntry` reads both.

## Feedback

A successful assign, remove or hand-over usually unmounts the form that made it (the row goes,
or the Assign card gives way to "Everyone active … is already assigned"). So success is
announced once for the section, in a status line under its heading (`AssignmentFeedback`,
`src/components/assignments/AssignmentForms.tsx`); an error stays beside its form, which a failed
change leaves in place.

## Reads

`console_patient_assignments` (`:35`) returns who is linked to one patient with their
membership in its laboratory (a link from outside the laboratory shows "Not in this
laboratory"). `console_member_patients` (`:67`) returns one member's patients in their
laboratory and withholds names from a super admin. Both refuse anyone else.

## If you change this

**Hits**

- What the app shows each person, from their next sync.
- `isCovering` / `canRemoveAssignment` and the function's "last active member" rule must agree,
  as must `assignableMembers` and `console_assign_patient`.
- `supabase/tests/admin_0007_patient_assignments.test.sql`,
  `supabase/tests/admin_0008_member_fieldwork.test.sql`.

**Does not hit**

- Clinical records and their authors; the patient's laboratory (`patient_organizations`).

## See

`src/domain/assignments.ts`, `src/app/(dashboard)/assignments/actions.ts`,
`src/components/assignments/`, `src/app/(dashboard)/people/[userId]/page.tsx`.
