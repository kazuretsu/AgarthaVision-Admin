---
verified: 2026-10-01
commit: 58be5a5
---

# Domain model

The entity types this console reads, mirrored from AgarthaVision's Postgres schema, and the
read models the records browser composes from them.

## Why this shape

These types are a **mirror, not a design**. The authority is the app repo's
`supabase/migrations/0001_init.sql` through `0006_drop_species_touched.sql` on
`development` — the consolidated, patient-based schema. The `legacy-dev/` migrations there
describe an older database and are **not** the authority. This console cannot invent a
field that does not exist upstream.

Timestamps are ISO-8601 strings, not `Date`: they cross the server/client boundary and must
serialise without a custom reviver (`src/domain/entities.ts:15`).

## Shape

| Type             | Source of truth                | Notes                                                                                 |
| ---------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| `Profile`        | `0001`                         | `role` CHECK `('medtech','admin')`; `full_name` is never filled by the signup trigger |
| `Patient`        | `0001`, `0002`                 | name, sex, birthdate under `identity`, `null` for a de-identified reader (#14)        |
| `Session`        | `0001`                         | one smear, owned by a patient; `user_id` is the **author**; `label` `null` if de-id'd |
| `Sample`         | `0001`                         | `deleted_at` is the duplicate tombstone — see below                                   |
| `Detection`      | `0001`, `0004`, `0005`, `0006` | `prediction_id` (0004), `stage` (0005); `species_touched` dropped (0006)              |
| `SpeciesFinding` | `0001`, `0005`                 | one species' egg count in one field; drives the LPF range                             |
| `Report`         | `0001`                         | `lpf_per_species` stored as issued; no `epg_per_species`                              |

Read models for the records browser live in `src/domain/records.ts`: `PatientListItem`
(`:15`), `PatientRecord` (`:30`), `SessionRecord` (`:46`), `SampleRecordDetail` (`:55`).
Each carries a `SessionSummary` computed by `docs/map/processes/lpf-session-summary.md`.

Facts that trip people up:

- **Columns that are gone, deliberately:** `samples.gps_*`, `sessions.notes`,
  `sessions.ended_at`, `sessions.psgc_barangay_code`, `reports.epg_per_species`. `0001`
  comments each absence. Selecting one fails the whole query — that is how the console broke.
- **`deleted_at`.** A sample deleted as a duplicate keeps its rows and JPEG (C8) but must
  not appear or count anywhere. The adapter fetches it with its siblings and the domain drops
  it (`isLiveSample`, `src/domain/clinical.ts:37`), so the rule has one definition.
- **Patient visibility resolves through `patient_users`**, not `created_by`, which is
  provenance only.
- **`patients` reaches `profiles` two ways** (`created_by`, and the `patient_users` join),
  so an embed must name the constraint: `profiles!patients_created_by_fkey`
  (`src/adapters/supabase/database.ts:174`).

Enums live in `src/domain/enums.ts`. `DetectionVerdict` is UPPERCASE in Postgres and
lowercase in Room; `parseDetectionVerdict` accepts either. Species are free text and have no
enum; `canonicalSpecies` names them. `validation_records` is a Phase 2 ghost with no
migration behind it.

## Connected to

- Owned by: upstream migrations own every field.
- Consumed by: `src/domain/clinical.ts`, `patients.ts`, `dashboard.ts`, `research-export.ts`.
- Produced by: `src/adapters/supabase/database.ts`, the only place snake_case and camelCase
  meet (`toPatient` at `:252` and its siblings).
- Looks like but is not: Room entities in the Android client, which carry columns Postgres
  does not (`status`, `is_repeat`, `predictions_json`).

## If you change this

**Hits**

- `src/adapters/supabase/database.ts` — the row interfaces, the column lists and the mappers.
- Every domain function typed against these entities.
- `docs/map/processes/lpf-session-summary.md` if a field feeding a session summary changes.

**Does not hit**

- The upstream database. A real schema change is a migration in the app repo first.
- The Android client, which has its own model.

## See

`src/domain/entities.ts`, `src/domain/records.ts`, `src/domain/enums.ts`, and upstream
`supabase/migrations/0001_init.sql` through `0006_drop_species_touched.sql`.
