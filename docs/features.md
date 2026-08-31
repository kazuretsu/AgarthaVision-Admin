# Features

What exists today. Anything not listed here is not built.

## Built

### Project scaffold

Next.js App Router app with TypeScript in `strict` mode, Tailwind v4, ESLint, Prettier and
Vitest. Design tokens in `src/app/globals.css` mirror the Android client's Clinical
Microscopy palette — CIT-U maroon `#8C1823` with gold `#FFB81C`, the warm stone neutral
ramp, tabular numerals on data fields and italic binomial species names.

### Commit and build discipline

Husky hooks gate every commit on typecheck, tests, production build and lint, and every
push on a full build. `commit-msg` enforces the `[type][ClickUp-ID][Lastname]` subject
format. `lint-staged.config.js` and `commitlint.config.js` mirror the sibling repo, with a
`scope-enum` adapted to this repo's areas.

### Documentation shelf

`SESSION_INIT.md` routes; `docs/` holds the shelf; `docs/map/` holds the object, process
and effect cards.

### Domain model

`src/domain/` mirrors the AgarthaVision Postgres schema after migration `0008`, with
per-field provenance comments naming the migration each column came from. Enums cover
detection verdicts (canonical UPPERCASE, lenient parsing of the Android client's lowercase
form), egg species (lenient, because `class_label` is free text upstream), report type,
a console-derived validation status, and the EPG severity bands.

Pure logic, all of it unit-tested and none of it touching I/O:

- **EPG** — the DOH volumetric multiplier, the confirmed-only counting rule, per-species
  EPG, the daily trend, the parasite distribution, the average / highest / lowest summary,
  and the dashboard's headline counters.
- **Severity** — species-specific light / moderate / heavy intensity bands, a per-sample
  classification that takes the worst species burden on the frame, and the split.
- **Research matrix** — the six SRS-fixed export columns, their formatting, and RFC 4180
  CSV plus key-ordered JSON serialisation.
- **Filters** — date range, sample ID substring, validation status, species, and the
  confidence / EPG / processing-time ranges.

### Port interfaces

`src/ports/` holds three vendor-free interfaces — `db.ts`, `storage.ts`, `auth.ts` — plus
their error types. The database port is read-only by construction: it has no insert,
update or delete verb, so no feature can mutate clinical data.

## Not built yet, in this pass

Tracked here so the gap is visible:

- Supabase database and storage adapters, and the provider registry
- Supabase Auth behind the auth port, with the `profiles.role` admin gate
- Administrative dashboard: summary cards, EPG trend by species, parasite distribution,
  EPG summary, severity split
- Detailed records table with date-range and advanced filters, and the research-matrix
  export in CSV and JSON

## Out of scope, decided

- Mutating any diagnostic record. The console is read-only over clinical data.
- PDF export. CSV and JSON only this pass.
- Geospatial mapping of sample GPS.
- Anything built on `validation_records` — the table is a Phase 2 ghost with no upstream
  migration behind it.
