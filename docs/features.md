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

`src/domain/` mirrors the app's consolidated schema (`0001`–`0006` on `development`), with
per-field provenance comments. The one enum is the detection verdict (canonical UPPERCASE,
lenient parsing of the app's lowercase form); species are free text upstream and are named
by `canonicalSpecies`, as the app names them.

Pure logic, all of it unit-tested and none of it touching I/O:

- **Access** — who is a super admin, an org admin, or neither.
- **Clinical** — the app's counting rule, the live-sample rule, the per-species LPF range
  and descriptor, and box provenance, with the app's own LPF test cases.
- **Patients** — display names (codenames included) and age in the Manila frame.
- **Dashboard** — per-smear counting on the prevalence rule, species mix, weekly trend.
- **Research export** — the version 2 column contract, CSV with formula neutralising, JSON.

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

### Dashboard

Counted per smear on the app's rule, for a chosen period (Manila calendar days, held in the
URL): patients with a smear read, smears examined, positive smears, positive rate, and
fields verified. A weekly bar chart shows smears examined with the positive share filled in
and the rate above each bar, with a table view. Species bars show the share of positive
smears carrying each species. No EPG and no WHO intensity tier. If a period holds more than
5,000 sessions the page says the figures are partial.

### Records browser

Records follow the app's clinical hierarchy: **Patient → Session (one smear) → Sample (one
field) → Detections**. `/records` lists patients, searchable by name or codename and by
barangay PSGC code, with the query in the URL. A super admin sees patients de-identified: no
name, sex, age or birthdate, no name search, no session label and no medtech's note; a
patient or session is named by the start of its record id (constraint #14). A patient page lists every session with who
read it, the fields examined, a positive/negative result, the per-species LPF range and the
eggs counted. A session page shows the findings table the way the app's Session Detail does
and every live field as a frame with its boxes drawn over it. A sample page shows one field:
the frame, the eggs recorded per species, and each detection with its verdict, whether its
box is the model's, redrawn or added by the medtech, and its stage.

Figures follow the app exactly: every detection except a rejected one counts; a sample
deleted as a duplicate never appears or counts; LPF is a min–max range per field, never a
mean; no EPG and no WHO tier. Codenamed patients show as their codename. Frames are signed
as the signed-in user, not with the service-role key. Everything is read-only.

### Research export

`/export` shows how many smears a period holds and downloads them as CSV or JSON, one row
per examined smear: session and patient record IDs, Manila date, barangay PSGC code, fields
examined, result, eggs, and for each of the three species its LPF min, max, descriptor and
eggs, plus other species in one cell. No names and no birthdates. The column set is version
2 and the version is in the file name. A period over 20,000 sessions is refused rather than
cut short. Exports are not yet written to the audit trail.

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
- Geospatial mapping of sample GPS. The columns no longer exist upstream; the map will key
  on the patient's barangay.
- Anything built on `validation_records` — the table is a Phase 2 ghost with no upstream
  migration behind it.
