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
push on a full build. `commit-msg` enforces the `[type][ClickUp-ID][Lastname]:` subject
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

### Provider registry and Supabase adapters

`src/adapters/registry.ts` is the only module that names a concrete backend. `DB_PROVIDER`,
`STORAGE_PROVIDER` and `AUTH_PROVIDER` select an implementation; an unrecognised value
throws rather than falling back, so a typo cannot leave a deployment silently reading from
the default. Adapters are imported lazily.

The Supabase adapters implement all three ports. Database reads run through the visitor's
own session so RLS decides visibility. Storage signs short-lived URLs with the service-role
key — necessary because upstream Storage RLS has no admin exception yet.

### Authentication and the admin gate

Supabase Auth behind `AuthPort`. Identity comes from `getUser()`; access comes from
`profiles.role` (super admin) or an org-admin membership (organization admin), read
server-side on every request, never from a token claim. Org-admin memberships arrive with organizations —
until then only super admins get in. The `(dashboard)` segment layout resolves the actor
once, so every page under it is guarded on creation; narrower pages add
`requirePageAccess()`, and route handlers repeat the check with `requireRouteAccess()`. A
medtech who signs in is signed back out and told to use the mobile app; a medtech with a
live session sees that notice and no data. `src/proxy.ts` refreshes tokens and is
deliberately not the authorisation point.

### Console shell

A sidebar with the sections the signed-in person may open, a header naming the scope ("All
organizations", or the org admin's laboratory), and a user menu with the person's name,
role, theme choice (light, dark, system) and sign out. Components are shadcn on Base UI
(D1).

**Desktop only.** Super admins and organization admins work at a computer; medtechs use the
mobile app. The shell holds a 1024px minimum width and a narrower window scrolls sideways.
Pages lay out for a desktop and do not collapse into a phone layout.

### Administrative dashboard

Summary cards, a per-species EPG trend line chart with crosshair, tooltip, legend, direct
labels and a table view, parasite distribution bars, the light/moderate/heavy intensity
split on the reserved status palette, and average/highest/lowest EPG. Every aggregate
counts human-validated records only.

### Detailed records and export

A filterable table of all processed samples showing AI EPG beside technologist-validated
EPG, with filters held in the query string so a view is shareable and the export reuses the
same query. Research-matrix export as CSV or JSON through a guarded route handler,
validated-only by default with a separately labelled link for a working file.

## Not built yet, in this pass

Tracked here so the gap is visible:

- Nothing from this pass's scope remains. Deferred work is listed below.

## Deferred by decision

- **Better Auth + Drizzle.** Wanted, deferred to keep this pass shippable. Adding it means
  a new adapter plus one branch in the registry.
- **S3 storage adapter.** Same shape of change; the storage port is already the seam.
- **Any second database adapter.** The port contract is the specification for one.

## Out of scope, decided

- Mutating any diagnostic record. The console is read-only over clinical data.
- PDF export. CSV and JSON only this pass.
- Geospatial mapping of sample GPS.
- Anything built on `validation_records` — the table is a Phase 2 ghost with no upstream
  migration behind it.
