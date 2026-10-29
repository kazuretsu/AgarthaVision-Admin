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
- **Prevalence map** — where the map is (country, region, province), shading bands, and what
  an area may show: a figure, too few to report, or no data.
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
invited person's account when they accept, and banning or unbanning a member's login, a
medtech's or an org admin's.

### Authentication and the admin gate

Supabase Auth behind `AuthPort`. Identity comes from `getClaims()`, which verifies the
session's JWT locally against the project's published signing key; access comes from an
active `super_admins` grant through `is_admin()` (super admin) or an org-admin membership
(organization admin), read server-side on every request in **one** database call
(`console_actor()`, `admin/0010`), never from a token claim or the retired `profiles.role`.
A super admin whose grant is revoked, and an organization admin whose membership or
organization is deactivated, are turned away on their next page that is not in the
browser's 30-second router cache. The `(dashboard)` segment layout resolves the actor
once, so every page under it is guarded on creation; narrower pages add
`requirePageAccess()`, and route handlers repeat the check with `requireRouteAccess()`. A
medtech who signs in is signed back out and told to use the mobile app; a medtech with a
live session sees that notice and no data. When access cannot be read at all (the database
is down or unreachable), nobody gets in and nobody is told they lack access: pages say the
console can't reach its data, with a retry, and fail with a 500; downloads answer 503.
`src/proxy.ts` refreshes tokens and is deliberately not the authorisation point.

### Session limits, and sign-in that follows access (14zcqntnqpd)

A console session ends 12 hours after sign-in, or after an hour with no request, and the person
is sent to `/login` with "Your session ended. Sign in again." Both limits are set with
environment variables; the idle one needs `CONSOLE_SESSION_SECRET`. Signing out of the
console, or a limit ending it, no longer signs the same account out of the mobile app.
Deactivating a laboratory, or revoking a super admin, blocks the sign-in of everyone left with
no access anywhere, so the app on their phone stops too; reactivating the laboratory restores
it. Each block and restore is in the audit trail (`admin/0021`,
`docs/map/processes/admin-gate.md`, `docs/map/processes/people-access.md`).

### Two-step sign-in (14zcqntjnt0, 14zcqntr31c)

Each super admin and org admin chooses whether to use an authenticator app. On `/settings` (in
the sidebar) they set one up (QR code or typed key, confirmed with its first code) or turn it
off with a current code. An admin with an app enters its six-digit code after their password,
and until they have, no page, data, download or write is reached: pages go to `/verify`,
downloads answer 401. An admin without one goes straight in on their password. Medtechs are
never asked. A super admin resets an org
admin's app from their People page (lost phone), recorded in the audit trail before it happens
(`admin/0018`). Supabase's authenticator-app MFA, free on every plan. An org admin who also uses
the Android app and has an app set up is signed out of it each time they enter a code, until the
app asks for the code too (`docs/map/processes/second-factor.md`).

### Notices (14zcqntr35f)

A strip above every console page shows short notices for the signed-in admin, each closable.
The first reminds an admin without an authenticator app to turn on two-step sign-in, with "Set
up now" to `/settings` (not shown there). Closing it hides it for 7 days on that browser; it is
gone for good once an app is set up (`docs/map/processes/notices.md`).

### Own name and password (14zcqntr35e)

On `/settings` each super admin and org admin changes the name the console shows for them, and
their password after entering the current one. Every password field (`/settings`, `/login`, the
invitation form) has an eye button to show what was typed. A new password shows the rules as
they are met. Before a password change, a dialog warns that it signs out every other session,
including the mobile app; this one stays signed in. Both are recorded in the audit trail, never
the password (`admin/0020`, `docs/map/processes/own-profile.md`).

### Organizations

Super admins create, rename, deactivate and reactivate laboratory organizations at
`/organizations`, and see each one's org admins, medtechs and patient count. Names are
unique ignoring case and spacing, and are cleaned before they are checked and stored
(`admin/0016`): invisible characters are removed and look-alike letters and spaces made
plain, so "Cebu Lab" with a zero-width space is "Cebu Lab", and refused if that exists. Deactivation asks for confirmation, deletes nothing, and
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

### Super admins (14zcqntjwjg)

`/super-admins` (super admins only) lists the active super admins, with when and by whom each
was granted, and their invitations. A super admin invites another by email: the link works for
72 hours, can be re-sent or withdrawn, and opens the same `/invite/<token>` page, where the
invitee sets their own password and becomes a super admin, with no laboratory membership. A
super admin revokes another behind a confirmation; nobody revokes themselves, so one always
remains. An email already in a laboratory, already a super admin, or with a live invitation
is refused. Every step is in the audit trail under no laboratory (`admin/0019`,
`docs/map/processes/super-admins.md`).

### People

`/people` (the sidebar's **People**; `/medtechs` redirects here) lists everyone in a laboratory —
its organization admins and its medtechs, since both can sign in to the app and do fieldwork —
and the people it has invited: name and email, role, status (active, deactivated, invited,
invite expired), date joined and number of the laboratory's patients each is linked to. The
signed-in person's own row is marked "You". Search by name or email, filter by role (everyone,
organization admins, medtechs), sort by any column and page through 50 at a time, all in the
URL. An org admin sees their own laboratory and invites medtechs from here; a super admin
chooses any laboratory (also linked from its organization page).

**Deactivate** (behind a confirmation) blocks the person's sign-in to the app and the console
and deletes nothing; the app signs them out the next time it reaches the server. **Reactivate**
restores it. An org admin deactivates their own laboratory's medtechs; a super admin deactivates
anyone, org admins included (here, on a person's page, or in the organization's Members table).
Nobody deactivates themselves. Two deactivations are refused, in the page and in the database:
the laboratory's last active organization admin (their row says "Only organization admin"), and
anyone who is a patient's only active member — their page marks those patients, to hand over
first. Each change is in the audit trail.

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
and one line saying what happened. Filter by person (only people who appear in the trail),
action and date; a super admin also by organization. An org admin sees only their organization's entries. Entries are written by
the database with the change itself and can never be edited or deleted by anyone.

### Console shell

A sidebar with the sections the signed-in person may open, a header naming the scope ("All
organizations", or the org admin's laboratory), and a user menu with the person's name,
role, theme choice (light, dark, system) and sign out. Components are shadcn on Base UI
(D1).

**Desktop only.** Super admins and organization admins work at a computer; medtechs use the
mobile app. The shell holds a 1024px minimum width and a narrower window scrolls sideways.
Pages lay out for a desktop and do not collapse into a phone layout.

### Fast navigation

A sidebar click costs one database round trip for access before the page's own reads: the
session is verified locally, and name, grant and membership come back in one call
(14zcqntkd0y). A page already opened in the tab within 30 seconds re-shows without a server
request; saving a change or signing out empties that cache. Each request logs how long the
access check and each read or write took (`[timing] db.listPeople 84ms`, Vercel → Logs; set
`CONSOLE_TIMING=off` to silence), and the proxy sends a `Server-Timing` header. On a local
stack with 300 ms per call, `/people` went from 1.6 s to 0.66 s.

### Loading states

Every console page shows that a click registered, in the shape of what is coming
(14zcqntk6h5):

- **Dashboard, records list, people, export, audit trail** show a skeleton of their own layout at
  once: header, filters, stat cards, charts or table rows. Their figures or tables read inside
  the page, so a client-side change of sort or page swaps only the table for its skeleton.
- **Organizations** (super admins only) shows its header and form, then the table's skeleton.
- **A patient, session, field, organization or person page** decides "not found" first, so it
  keeps a real 404. Until then the clicked link — in the sidebar, a list or a table — shows a
  spinner. A person's page then shows its header at once and the patients table's skeleton.
- Skeletons are marked busy for screen readers, with what is loading, and follow the theme.

### Not found

A page that answers 404 shows the console's own page inside the shell: "This page isn't
available", one line saying it may not exist or may belong to another laboratory, and a
button back to the section the visitor was in (Records for a record, Organizations for an
organization, the Prevalence map for an unknown area), or the dashboard when that section is
not theirs, as for an org admin opening `/organizations` (14zcqntk6h4). A malformed ID, an
unknown ID and another laboratory's record show the same page, word for word, so it says
nothing about which records exist. The status stays 404. A URL no route matches, such as
`/recordsx` or `/records/nothing/here`, gets the same page inside the shell; signed out, it
goes to sign in like any console page.

### Dashboard

Counted per smear on the app's rule, for a chosen period (Manila calendar days, held in the
URL): patients with a smear read, smears examined, positive smears, positive rate, and
fields verified. A weekly bar chart shows smears examined with the positive share filled in
and the rate above each bar, with a table view. Species bars show the share of positive
smears carrying each species. No EPG and no WHO intensity tier. The figures are counted in the
database in one request, whatever the period holds, so there is no session cap; the console's
own counting is kept as the reference and a test requires the two to agree.

### Prevalence map

`/map` (super admins and org admins) shades the Philippines by the share of examined smears
positive for STH, by where the patient lives, and drills Region → Province → City/Municipality
with a breadcrumb back up (14zcqntjnt3, `admin/0014`). Each area shows examined smears,
positive smears and the rate, on the map when pointed at and in a table beside it. Every
figure is counted in the database on the dashboard's rule; an area with fewer than 5 smears
shows "too few to report", hatched, at every level, never a number, and looks different from
an area with none. An org admin sees their own laboratory; a super admin all or one. A period
filter, and the boundary attribution under the map. Areas affected by the Negros Island Region
and Sulu reorganisations appear under their 2Q 2026 region, including patients recorded with
a 2023 code. Smears whose barangay matches no city or municipality are counted on their own
line. MapLibre on a plain background: no basemap, nothing fetched from another site.

A city or municipality opens to its barangays (14zcqntjnt6, `admin/0015`): the town drawn
alone with its figure, and a table of its barangays with a smear examined, highest prevalence
first, named from the same 2Q 2026 PSGC release, with the same figures, period and laboratory
scoping as the map. A barangay under 5 smears shows "too few to report" and sorts last; a lone
withheld barangay takes the smallest shown one with it, so neither can be worked out from the
town's total. A line counts the barangays with none. At the country, a region or a province, any area in the table
can be isolated: drawn alone, the map fitted to it, until "Show all".

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
2 and the version is in the file name. The page's count comes from the database in one
request. A period over 20,000 sessions is refused rather than cut short, and the page warns
before the click. Every download is recorded in the audit trail
first; if it cannot be recorded, no file is served.

### Training data

`/training-data` (super admins only; org admins get a 404) gathers model training data
(14zcqntm62u, `admin/0012`). Filter by session dates, laboratories, species, model versions,
and whether to include hard negatives, background frames, frames flagged for re-annotation
and frames with unboxed eggs, with the validation and test shares of patients. The preview counts, before
anything is written, the frames, boxes, background frames, hard negatives and patients, by
split, class, model version and laboratory, and what was left out and why.

A labelled box is every detection the medtech did not reject, under the medtech's species
where they corrected it; an untouched model box they confirmed counts. A rejected box is a
hard negative at the model's position. A frame goes in whole or not at all: one with an egg
counted but never boxed, a box outside the frame or a species the model is not trained on is
left out, so no egg is taught as background. **Frames with unboxed eggs** (off by default,
`admin/0013`) keeps those frames anyway, with the boxes they have, marked incomplete with the
number of eggs they lack in the manifest, the COCO images and the data card, for whoever trains
to leave out or use where a missing box does no harm. Frames split by patient,
deterministically, default 70/15/15.

**Create snapshot** freezes the frames and their label values with a name: a medtech changing
a ruling later changes nothing in it. Each snapshot downloads as a zip: images and YOLO label
files per split, `data.yaml`, COCO annotations, a manifest saying where each box came from,
and a data card. Frames are named by sample ID; no patient, medtech, barangay or laboratory
name or id is in the file, laboratories are opaque codes, and patients are a group code that
means nothing outside the snapshot. Images are read as the signed-in super admin. Creating and
downloading are each recorded in the audit trail, the download before anything is served. At
most 20,000 frames a snapshot.

## Not built yet

This file lists what is built, not what is planned. The console is not finished: open work
(forgot password,
sharing a patient, the report verification page, among others) is tracked in the sprint
lists in ClickUp, which is where plans live (`SESSION_INIT.md`). Work decided against is
listed below.

## Deferred by decision

- **Better Auth + Drizzle.** Wanted, deferred to keep this pass shippable. Adding it means
  a new adapter plus one branch in the registry.
- **S3 storage adapter.** Same shape of change; the storage port is already the seam.
- **Any second database adapter.** The port contract is the specification for one.

## Out of scope, decided

- Mutating any diagnostic record. The console is read-only over clinical data.
- PDF export. CSV and JSON only this pass.
- Geospatial mapping of sample GPS. The columns no longer exist upstream; the prevalence map
  keys on the patient's barangay.
- Anything built on `validation_records` — the table is a Phase 2 ghost with no upstream
  migration behind it.
