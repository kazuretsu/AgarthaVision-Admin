# Domain model

The entity and enum types this console reads, mirrored from AgarthaVision's Postgres
schema. Product language and column names differ in places; both are stated here once.

## Why this shape

These types are a **mirror, not a design**. The authority is the sibling repo's
`supabase/migrations/*.sql`; `schema.ts` there is a readable summary of the same thing.
Where the two disagree, the migration wins. This console cannot migrate anything
(constraint #7), so a field that does not exist upstream cannot be invented here.

Timestamps are ISO-8601 strings, not `Date`: they cross the server/client boundary and
must serialise without a custom reviver (`src/domain/entities.ts:13`).

## Shape

| Type           | Source of truth                  | Notes                                                                 |
| -------------- | -------------------------------- | --------------------------------------------------------------------- |
| `Profile`      | `0001_init.sql`                  | `role text` CHECK `('medtech','admin')` — the only authority on admin |
| `Session`      | `0001`, `0005_session_label.sql` | `label` is nullable, added later                                      |
| `Sample`       | `0001`, `0002`, `0006`           | see the renames below                                                 |
| `Detection`    | `0001`, `0002`, `0007`           | bbox nullable since `0007` — manual captures have no box              |
| `Report`       | `0008_reports.sql`               | `report_type` CHECK allows only `'session'`                           |
| `SampleRecord` | `src/domain/entities.ts:110`     | **composed, not persisted** — no table behind it                      |

Three upstream facts that trip people up, all from `0002_verification_fields.sql`:

- `samples.roboflow_model_version` was **renamed** to `inference_model_version`. Code
  written against the old name compiles and returns `undefined`.
- `samples.needs_reannotation` was added. It is what `ValidationStatus.Flagged` reads.
- `detections.verified_by_user` was **dropped**. It is gone, not deprecated; `verdict`
  replaced it.

Enums live in `src/domain/enums.ts`. `DetectionVerdict` is UPPERCASE in Postgres and
lowercase in the Android client's Room database; `parseDetectionVerdict`
(`src/domain/enums.ts:121`) accepts either and is the only place a lowercase value may be
read. `EggSpecies` is free text upstream with no Postgres enum, so `parseEggSpecies`
(`src/domain/enums.ts:104`) is lenient and never throws — unrecognised text becomes `Other`.

`ValidationStatus` (`src/domain/enums.ts:74`) is **derived by this console**, not a column.
Phase 1 has no per-sample validation-state column and `validation_records` is a Phase 2
**ghost** with no migration behind it. Do not implement against `validation_records`.

## Connected to

- Owned by: nothing here — upstream migrations own every field.
- Consumed by: `src/domain/epg.ts`, `src/domain/severity.ts`, `src/domain/research-matrix.ts`.
- Produced by: `src/adapters/supabase/database.ts:85-127`, the only place snake_case and
  camelCase meet.
- Looks like but is not: Room entities in the Android client. Room has columns Postgres
  does not (`is_repeat`, `predictions_json`, `ReportSyncStatus`); they are deliberately
  absent here because this console cannot observe them.

## If you change this

**Hits**

- `src/adapters/supabase/database.ts` — the row interfaces and the three `to*` mappers.
- Every domain function, which is typed against these entities.
- `docs/map/processes/epg-aggregation.md` and `research-matrix-export.md` if a field
  feeding EPG or an export column changes.

**Does not hit**

- The upstream database. Editing a type here changes nothing in Postgres; a real schema
  change is a migration in the AgarthaVision repo first (constraint #7).
- The Android client. It has its own model and does not read these files.

## Surfaces

Read by every page and every domain function. Written by no one — this console is
read-only over clinical data (constraint #4).

## See

`src/domain/entities.ts`, `src/domain/enums.ts`, and upstream
`supabase/migrations/0001_init.sql` through `0008_reports.sql`.
