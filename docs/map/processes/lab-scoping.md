---
verified: 2026-10-05
commit: cd4e670
---

# Lab scoping

Input: who is asking, and (for a super admin) which organization they chose → Movement:
derive a scope, filter every read by the owning laboratory, let RLS apply the same boundary
underneath → Output: only that laboratory's patients and everything under them.

## Ownership is set once, at creation

`console_assign_patient_organization` (`supabase/migrations/admin/0002_patient_scoping.sql:27`)
runs `after insert` on the app's `patients` (`:53`) and files the patient under its
creator's organization, whatever that membership's status — a patient registered by a
medtech of a deactivated laboratory still belongs to it. It never changes afterwards (D11).

**It must never raise (R4).** It runs inside the app's patient sync; an error there would
stop sync for every medtech. Everything is caught (`:42`): a creator with no organization
leaves the patient unassigned, and a failed insert raises only a warning. The test forces
the insert to fail and checks the patient is still saved.

## Two layers, the same boundary (D7)

1. **The console.** Every clinical read on `DatabasePort` takes a `ReadScope`, and the type
   makes it required. `readScopeFor` (`src/domain/scope.ts:18`) holds an org admin to their
   own organization whatever the URL says, and lets a super admin see everything or narrow
   to one organization (`?org=`). The adapter joins `patient_organizations!inner` and
   filters on it (`src/adapters/supabase/database.ts:260`), so an out-of-scope patient,
   session or sample is simply not found — a 404 on its page.
2. **The database.** Additive SELECT policies (`0002`, from `:131`) let an org admin read
   their organization's patients, patient links, sessions, samples, detections,
   predictions, findings and reports, their members' profiles (`:164`), and their sample
   frames in Storage (`:171`). Permissive policies are ORed, so these only add rows; the
   app's own policies are untouched and a medtech sees exactly what they saw before.
   Reports reach the org admin two ways: a session report through its session (`0002`,
   `:159`), and a patient report, which has no session (app `0015`), through its patient
   (`admin/0004_patient_reports.sql:36`).

Pages call `scopeForRequest` (`src/lib/read-scope.ts:10`); the export route derives its
scope from the actor it already checked (`src/app/(dashboard)/export/download/route.ts:35`).

**Scope is which laboratory; disclosure is whether you see who the patient is.** They are
separate inputs to every patient read. An org admin reads their own laboratory identified.
A super admin who narrows to one laboratory with `?org=` still reads it de-identified: the
filter changes which rows come back, never which columns (constraint #14,
`patientDisclosureFor`). Their reads come from the app's de-identified views, which carry the
same foreign keys as the tables, so the `patient_organizations!inner` filter narrows them
exactly as it narrows an org admin's.

## The frame policy reads the key

Sample keys are `{user_id}/{sample_id}.jpg` (the app's `SampleRemoteDataSource`). The
Storage policy reads the sample id out of the key, finds that sample by primary key, and
also requires its `storage_path` to equal the key — a key that only looks like a sample id
grants nothing. A frame stored under any other key is unreadable to an org admin, by design.

## If you change this

**Hits**

- Every records page, the dashboard and the export, for org admins.
- The app's patient sync, if the trigger ever raises. Keep the handler.
- `supabase/tests/admin_0002_patient_scoping.test.sql`,
  `supabase/tests/admin_0004_patient_reports.test.sql` and
  `supabase/tests/app_0013_deidentified_reads.test.sql`.

**Does not hit**

- Super admins, who read every laboratory through the app's de-identified views, never
  the tables, and receive patients de-identified whatever organization they narrow to.
- Medtechs.

## See

`supabase/migrations/admin/0002_patient_scoping.sql`, `admin/0004_patient_reports.sql`,
`src/domain/scope.ts`,
`src/lib/read-scope.ts`, `src/adapters/supabase/database.ts`.
