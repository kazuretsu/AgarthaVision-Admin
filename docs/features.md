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
- **Clinical** — the app's counting rule, the live-sample rule, the per-species LPF range,
  descriptor and estimated parasite burden level, and box provenance, with the app's own LPF
  test cases.
- **Patients** — display names (codenames included) and age in the Manila frame.
- **Dashboard** — per-smear counting on the prevalence rule, species mix, weekly trend.
- **Research export** — the version 2 column contract, CSV with formula neutralising, JSON.

### Port interfaces

`src/ports/` holds vendor-free interfaces — `db.ts`, `admin-write.ts`, `storage.ts`,
`auth.ts`, `onboarding.ts`, `mail.ts` — plus their error types. The database port is read-only by construction: it has no insert,
update or delete verb, so no feature can mutate clinical data.

### Provider registry and Supabase adapters

`src/adapters/registry.ts` is the only module that names a concrete backend. `DB_PROVIDER`,
`STORAGE_PROVIDER`, `AUTH_PROVIDER` and `MAIL_PROVIDER` select an implementation; an unrecognised value
throws rather than falling back, so a typo cannot leave a deployment silently reading from
the default. Adapters are imported lazily.

The Supabase adapters implement the database, storage, auth and onboarding ports, and a
Resend adapter the mail port. Database reads and storage signing run through the visitor's
own session so RLS decides visibility. The service-role key is used for two things: making an
invited person's account when they accept, and banning or unbanning a medtech's login.

### Authentication and the admin gate

Supabase Auth behind `AuthPort`. Identity comes from `getUser()`; access comes from
an active `super_admins` grant through `is_admin()` (super admin) or an org-admin
membership (organization admin), read server-side on every request, never from a token
claim or the retired `profiles.role`. A super admin whose grant is revoked, and an
organization admin whose membership or organization is deactivated, are turned away on
their next request. The `(dashboard)` segment layout resolves the actor
once, so every page under it is guarded on creation; narrower pages add
`requirePageAccess()`, and route handlers repeat the check with `requireRouteAccess()`. A
medtech who signs in is signed back out and told to use the mobile app; a medtech with a
live session sees that notice and no data. `src/proxy.ts` refreshes tokens and is
deliberately not the authorisation point.

### Organizations

Super admins create, rename, deactivate and reactivate laboratory organizations at
`/organizations`, and see each one's org admins, medtechs and patient count. Names are
unique ignoring case and spacing. Deactivation asks for confirmation, deletes nothing, and
locks the laboratory's org admins out until reactivated. Every change is written to the
audit log in the same transaction by the database, which checks the caller again. Existing
users and patients start in one "Starting laboratory". Org admins and medtechs get a 404.

### Invitations

Nobody signs up. A super admin invites an organization's admins from its page
(`/organizations/[id]`); an org admin invites their laboratory's medtechs from `/people`.
The inviter enters an email and, optionally, a name; the role and the organization follow
from who is inviting. The invitee gets an email from the console's domain (Resend) with a
link that works for 7 days and opens `/invite/<token>`, where they set their own password.
No password is ever emailed. An org admin then lands in the console; a medtech is told to
sign in to the Android app with the same email and password.

Both pages list the organization's invitations — pending, expired, accepted and revoked —
with re-send (a new link; the old one stops working) and revoke. An email that already has an
account, or already has a live invitation, is refused. Expired, revoked, used and unknown
links each say so. The role and organization come from the stored invitation, never from the
invitee. Each invite, re-send, revoke and acceptance is in the audit trail.

### People

`/people` (the sidebar's **People**; `/medtechs` redirects here) lists everyone in a laboratory —
its organization admins and its medtechs, since both can sign in to the app and do fieldwork —
and the people it has invited: name and email, role, status (active, deactivated, invited,
invite expired), date joined and number of the laboratory's patients each is linked to. The
signed-in person's own row is marked "You". Search by name or email, filter by role (everyone,
organization admins, medtechs), sort by any column and page through 50 at a time, all in the
URL. An org admin sees their own laboratory and invites medtechs from here; a super admin
chooses any laboratory (also linked from its organization page).

**Deactivate** (behind a confirmation) blocks the medtech's sign-in to the app and the console
and deletes nothing; the app signs them out the next time it reaches the server. **Reactivate**
restores it. An org admin cannot deactivate themselves, another org admin, or anyone in another
laboratory. Each change is in the audit trail.

### Patient assignment

A patient's page lists the people assigned to it — the ones who see it in the Android app —
with their role, status and since when. Org admins do fieldwork too: a role is a permission
level, not a job. The laboratory's org admin assigns any of its active members, org admins
(themselves included) or medtechs, removes an assignment (behind a confirmation) and, for the
last active member, hands the patient over to another instead: a patient is never left with
nobody, and an active org admin counts. A person's page (`/people/[id]`, either role) lists
the patients assigned to them. Assigning across laboratories, or a deactivated member of either
role, is refused in the page and in the database. Removing an assignment removes
access only: the patient, every record and who read each smear stay. A super admin sees who is
assigned and nothing more. Each change is in the audit trail, naming the patient by record id.

### Laboratory scoping

A patient belongs to the laboratory of the medtech who registered it, set by a database
trigger as the app syncs it and never changed; a creator with no laboratory leaves it
unassigned, and the trigger can never fail the app's sync. An org admin sees only their
laboratory's patients, sessions, samples, detections, findings and frames — in the
records browser, the dashboard and the export — and gets a 404 for anything else, even by
URL. A super admin sees everything and can narrow the records, dashboard and export to one
organization.

The database also lets an org admin read their laboratory's reports, session and patient
reports alike (`admin/0004`), though no page shows reports yet.

### Audit trail

`/audit` lists every console change and every export, newest first: when, who, the action,
and one line saying what happened. Filter by person, action and date; a super admin also by
organization. An org admin sees only their organization's entries. Entries are written by
the database with the change itself and can never be edited or deleted by anyone.

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
barangay PSGC code, with the query in the URL. The list is read 50 patients at a time
(`?page=`) and says how many match in all ("Showing 51–100 of 1,234 patients"), so every
patient is reachable however many a laboratory holds; search and filters run in the
database over all of them. A new search or page shows a skeleton in place of the list while
the search form stays. A page past the end goes to the last page. A super admin sees patients de-identified: no
name, sex, age or birthdate, no name search, no session label and no medtech's note; a
patient or session is named by the start of its record id (constraint #14). A patient page lists every session with who
read it, the fields examined, a positive/negative result, the per-species LPF range with its
descriptor and estimated burden ("0–4 LPF · Few · Low Burden") and the eggs counted; a
session no one has read yet says "Not read" and shows a dash for its LPF and eggs, never "No
parasites found". A session
page shows the findings table the way the app's Session Detail does, burden level included,
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
cut short, and the page warns before the click. Every download is recorded in the audit trail
first; if it cannot be recorded, no file is served.

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
