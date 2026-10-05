# Changelog

Newest first. One entry per commit that changes behavior or contract.

## [fix] Records list reaches every patient, a page at a time

`/records` read one response of patients, which PostgREST stops at 1000 rows without saying
so: a laboratory past that could not see or search its oldest patients. The list now reads
50 at a time (`?page=`), says how many match in all ("Showing 51–100 of 1,234 patients"),
and pages with shadcn's `pagination` (ported from the registry source, the twelfth
component in `ui/`). Search, barangay and laboratory filters run in the database over every
patient in scope and are kept in the page links; a page past the end goes to the last page.

`DatabasePort.listPatients` takes `offset` and `limit` and returns a `PatientPage`
(`items`, `total`). The adapter reads with `.range()` and an exact count, ordered by
`created_at` then `id` so a patient sits on one page, and caps a page at the server's row
cap. A range past the last row is refused (`PGRST103`) and loses the count, so the adapter
then asks for the count alone with the same filters. A super admin's pages still come from
the de-identified views and ignore a name search. Page arithmetic in `src/lib/pagination.ts`.

## [fix] CLI components take the console's corners and field height

The organization, person and action filters rendered as 32px pills beside 36px fields with
8px corners. `globals.css` fixed `rounded-lg` at 16px, while shadcn components size their
corners from a scale derived from `--radius`. `globals.css` now carries shadcn's scale
(`--radius-sm` … `--radius-4xl`) with `--radius: 8px`, the console's field corner, and
`shadcn.test.ts` fails if the scale stops deriving from it. `native-select` is adapted to the
field height (`h-9`) and background (`bg-surface`), recorded on the components card. The
dashboard legend's swatches (`rounded-sm`) go from near-circles to rounded squares.

## [chore] The console's filters use shadcn's native select

`bunx shadcn@latest add native-select` added `src/components/ui/native-select.tsx`. The audit
trail's person and action filters and the organization filter render `NativeSelect` in place
of a raw `<select>`, keeping their `name` and `defaultValue`, so the GET forms submit the same
query strings. `SELECT_CLASS` is gone. With no raw element left outside `ui/`,
`shadcn.test.ts` drops its known-exceptions list and the test that kept it shrinking. The CLI
imported `cn` from an unrelated npm package; the import points at `@/lib/utils` and the
package was not added.

## [chore] Components come from shadcn, never from scratch

New constraint #15. `components.json` configures the shadcn CLI for Base UI (`base-nova`) and
this repo's paths, so `bunx shadcn@latest add <name>` installs a primitive into
`src/components/ui/`; `shadcn info` reads the config back and recognises all ten existing
components as installed. `src/app/globals.css` maps shadcn's token names (`card`, `muted`,
`accent`, `border`, `input`, `ring`, `destructive`, …) onto the console's palette, so an added
component renders in maroon and stone in both themes. Nothing used those names before;
`muted` was a text grey and now means shadcn's subtle background.

`src/components/ui/shadcn.test.ts` fails on a `ui/` file that is not a shadcn registry item, a
`@base-ui/` import outside `ui/`, a raw `<button>`, `<select>`, `<textarea>`, `<table>` or
visible `<input>` outside `ui/`, a `components.json` that stops pointing at Base UI, and a
`globals.css` that takes the registry's `oklch()` theme. Two raw `<select>`s (audit filters,
organization filter) are listed exceptions until `native-select` is added. New card
`docs/map/objects/ui-components.md`, with the inventory; a routing row, an effects row, a rule
in `AGENTS.example.md`, and constraint #14 now named in the router too.

## [fix] A missing patient, session or field answers HTTP 404

Record pages showed "This page could not be found" for a missing id, or for another
laboratory's record, but with status 200: `records/loading.tsx` began streaming the response
before the page could call `notFound()`. The list page and its loading state move into a
`(list)` route group, so the loading state covers the list only. The session and sample pages
read the record and decide 404 first, then sign their frames inside a Suspense boundary
(`FramesFallback`), so the figures still show at once and the frames follow. A missing
storage configuration now leaves the frames unavailable instead of replacing the page.
`src/app/not-found-status.test.ts` fails if a page that calls `notFound()` is put back under a
loading file. Both loading states use shadcn's `Skeleton` (`src/components/ui/skeleton.tsx`).

Checked against a local build: a malformed id, an unknown patient, session or field, and Lab
B's records opened by Lab A's org admin (with or without `?org=`) all answer 404; existing
records answer 200, with the frames streamed after the figures. `staging` answered 200 to all
of them.

## [refactor] The console recognises super admins from the super_admins table

The gate asks the app's `is_admin()` (app `0014`, D22) instead of reading `profiles.role`,
so the console and every database policy give the same answer. `super_admins` is closed to
clients; the security definer function is the one way to ask. An error from the call is no
grant. `AuthenticatedUser.role` becomes `isSuperAdmin`, `resolveConsoleAccess` takes that
boolean, and `Profile` no longer mirrors the retired `role`. Nothing changes on screen for
anyone whose status didn't change; a revoked super admin is turned away on their next request.

`bun run test:db` now needs an app checkout with `0014`. The helpers make a super admin with a
`super_admins` row and leave `profiles.role` at its default, so a test that still depended on
the column would fail. `app_0014_super_admin_gate.test.sql` covers an active grant with
`role = 'medtech'`, a revoked one with `role = 'admin'`, a revoke taking effect, and the table
staying out of a client's reach. A unit test pins the adapter on `is_admin()`. The profile
delete step in `admin_0001` moves to a user with no grant: a super admin's grant now keeps
their profile, and the test checks that too.

## [security] A super admin's patient reads go through the de-identified views

Every patient, session and sample read a super admin makes now comes from the app's
`patients_deidentified`, `sessions_deidentified` and `samples_deidentified` views (app
`0012`), embedded under the tables' names so pages are unchanged. That covers the records
list, the patient, session and sample pages, and the dashboard's and export's barangay
codes. The request never names a name, sex, birthdate, session label or note. App `0013`
then removes a super admin's access to the tables, and the console works the same before and
after it. Organization admins still read the tables, identified.

Session labels and notes were already dropped for a super admin when a row is mapped
(`toSession`, `toSample`, named by `sessionLabel`); now they are not requested either, so
they never leave the database for one. A unit test pins that no super admin request names an
identity column or a clinical table. `app_0013_deidentified_reads.test.sql` covers a super
admin, an organization admin, a medtech, a colleague and an anonymous caller against the
narrowed policy. Constraint #14 now names the database as the second line.

## [fix] Audit trail: ignore a malformed person or action filter

`?actor=` was checked against a loose pattern, so a 36-character string of hex digits and
dashes in the wrong layout reached Postgres and the page was a 500. It is now checked with
`isUuid`, as every record id is. `?action=` was checked with `in`, which also accepts
inherited names such as `constructor`; it now has to be a listed action.

## [fix] Organizations: 404 a malformed id, and test against the app's current schema

`/organizations/abc` was a 500, because the id went straight to Postgres. It is now a 404,
like the record pages, and the rename and status actions answer "no longer exists" for one.

`bun run test:db` failed on the app's `development` branch, which is now at `0011`: `0007`
calls `storage.filename()`, which the stubs lacked. The stub is added. Since `0011`, a
profile outlives its login, so deleting a login no longer clears `admin_audit_log.actor_id`.
The test now checks both paths: the login goes and, where `0011` is applied, the entries
keep their actor; the profile goes and they keep their label. The organizations card's
offboarding rule says the same. No migration changes; `admin/0001`–`0003` apply on the
app's `0001`–`0006` and on `0001`–`0011`, and the tests pass on both.

## [fix] Records: a super admin sees no session label either

A session label is pre-filled on the phone from the patient's initials and barangay, and a
medtech may type anything over it, so it named patients to super admins on the patient,
session and field pages. For a de-identified reader the adapter now drops the label, and
the medtech's note with it, when it maps the row (`toSession`, `toSample`). Before, the note
reached the server and was only hidden at render. `sessionLabel` names their session
"Session" plus the first eight characters of its id.

## [fix] A page turns a signed-out or revoked visitor away itself

A client-side navigation re-renders the page but not the `(dashboard)` layout, so the
page's `requirePageAccess()` is the only check that runs. It let the layout's two refusals
escape as errors, and a session that ended or an access revoked since the last click
landed on the "could not be loaded" boundary. It now redirects a signed-out visitor to
`/login` and gives a revoked one a 404, as a full load would.

## [fix] Audit trail lays out for a desktop

The audit page drops its phone padding breakpoint like every other console page. Entries
name organizations, people who acted and export periods, never a patient, so the trail
needs no de-identification of its own. The map cards' line references point at the
current code again.

## [fix] Audit trail page repeats the access check

`/audit` now calls `requirePageAccess()` like every other console page, so a revoked admin
loses it on their next client-side navigation. Route line references in the export, audit,
scoping and gate cards are brought up to date with the audited download route.

## [feat] Audit trail: see who did what in the console, and every export

`/audit` lists every administrative change and every export, newest first, with who, when,
the action and one line describing it; filters for person, action, date and — for super
admins — organization. Org admins read only their organization's entries, in the console's
own query and in RLS. An action the build does not recognise is shown as recorded.

`admin/0003_audit_exports.sql` adds `console_record_export`, which files an org admin's
export under their own organization whatever is passed. The export route now records each
download before serving it and refuses to serve the file if the entry cannot be written.
SQL tests cover the misfiling attempt, a medtech's refusal, and that org admins can neither
edit, delete nor read another laboratory's entries.

## [fix] Lab scoping keeps patients de-identified for a super admin who narrows

Every patient read now takes both the read scope and the patient disclosure. Narrowing to
one laboratory with `?org=` changes which rows a super admin reads, never which columns: an
organization admin sees their own laboratory's patients identified, and a super admin sees
any laboratory's de-identified. The lab-scoping card says so.

## [fix] Lab scoping: a malformed `?org=` is ignored

`readScopeFor` uses the strict `isUuid` check, so a super admin's `?org=` of 36 dashes is
treated as no filter rather than sent to Postgres, which rejected it with a 500.

## [feat] A laboratory's patients and records stay inside that laboratory

`admin/0002_patient_scoping.sql`, additive only. A trigger on the app's `patients` insert
files each new patient under its creator's organization, permanently; it catches every
error, so a creator with no organization leaves the patient unassigned and nothing can
ever fail the app's sync (R4). Permissive SELECT policies let an org admin read their
organization's patients, links, sessions, samples, detections, predictions, findings,
reports, members' profiles and sample frames — and nothing else. The frame policy reads the
sample id from the `{user_id}/{sample_id}.jpg` key and requires the stored path to match.

The console enforces the same boundary itself (D7): every clinical read now requires a
`ReadScope`, derived by `readScopeFor` from who is asking, and the adapter inner-joins the
owning organization. An org admin is held to their own laboratory whatever the URL says and
gets a 404 on anything outside it. Super admins can narrow the records, dashboard and export
to one organization. SQL tests cover ownership at creation, the no-organization case, the
trigger surviving a forced failure, and cross-organization refusal on every table.

## [fix] Organizations: tier names, desktop layout, and leaving keeps the author

Organization pages say Organization admin where they said Org admin, and lay out for a
desktop. The organizations card now states the offboarding rule: a member who leaves is
deactivated, never deleted, so their profile and their authorship of every record stay.

## [feat] Laboratory organizations, managed by super admins, with an append-only audit log

The first schema this repo owns (D4): `supabase/migrations/admin/0001_organizations.sql`,
additive only. Organizations; memberships keyed by user, so a user belongs to one laboratory
and "org admin" is a role on the membership; `patient_organizations`, the owning laboratory
of each patient; and `admin_audit_log`. Reads are RLS policies scoped to the super admin or
the reader's own organization. Writes have no table policy: each is a security-definer
function that checks the caller and appends the audit row in the same transaction. The
audit log refuses UPDATE, DELETE and TRUNCATE for every role, allowing only the foreign
key's own set-null when an actor's profile is deleted, so user deletion still works. A
backfill puts every existing medtech and patient in one "Starting laboratory".

The console gains `AdminWritePort` (D2), checks `canManageOrganizations` before every write,
and gives super admins `/organizations` to create, rename, deactivate (with confirmation)
and reactivate. The gate now recognises org admins from their own membership, and a
deactivated membership or organization locks them out on their next request.

`bun run test:db` applies the app's migrations and ours to a throwaway local Postgres and
runs `supabase/tests/`: the backfill, super-admin-only writes, scoped reads, the audit log's
immutability, and that a medtech still registers a patient afterwards.

## [fix] Export page lays out for a desktop

The export page drops its phone padding breakpoint, as every other console page did. The
file itself is unchanged: it carries no names, sex or birthdates, so it is already the
de-identified view a super admin may take.

## [fix] Research export: the 20,000 refusal works, and the count matches the file

The refusal could never fire: one PostgREST response stops at 1000 rows, so a busy period
downloaded the newest 1000 sessions as if they were all. `listSmears` now pages (see the
dashboard fix), the download asks for `RESEARCH_EXPORT_LIMIT + 1`, and the export page reads
with the same limit, so its "N smears examined" matches the file and a period the download
would refuse is flagged first. A failed read is a 502 or 503 with no database detail instead
of a bare 500. CSVs carry a UTF-8 byte-order mark so Excel keeps the en dash in `0–2 LPF`,
and an open-ended file is named for today in Manila rather than in UTC.

## [feat] Research export in LPF, one row per smear, with no names or birthdates

The SRS research matrix exported AI and validated EPG per sample; EPG was retracted with
it. `/export` now shows how many smears a period holds and downloads one row per examined
smear, as CSV or JSON: session and patient record IDs, Manila date, barangay PSGC code,
fields examined, result, eggs counted, and for each of the three species its LPF min, max,
descriptor and eggs, plus other species in one cell. The rows come from the same
`SessionSummary` the records browser shows. The column set is version 2 and the version is
in the file name. CSV cells that would run as a spreadsheet formula are neutralised. A
period over 20,000 sessions is refused rather than silently cut short.

This removes the last of EPG: `epg.ts`, the record filters, the sample-level
`SampleRecord`, `listSampleRecords` and the old `/records/export` route are deleted with
their tests, and so are the EPG and research-matrix cards. Exports are not yet written to
the audit trail, which does not exist yet.

## [fix] Dashboard lays out for a desktop

The summary cards sit in one row of five and the trend shares its row with the species mix
at every width, instead of stacking below 1024px. The console is desktop only.

## [fix] Dashboard: read every session in the period, not the newest 1000

`.limit(5000)` could not raise PostgREST's response cap (`db-max-rows`, 1000 by default on
Supabase), so "All time" and any busy period quietly counted only the newest 1000 sessions,
and the "figures are partial" notice could never appear. `listSmears` now reads in pages
(`readPages`, `src/adapters/supabase/paging.ts`) with `id` as a tie-break so pages cannot
overlap, and the page asks for 5,001 so a period over 5,000 is detected.

## [feat] Dashboard counted per smear in LPF terms, matching the app and the map

The dashboard showed an EPG trend and a WHO light/moderate/heavy split — both retracted for
direct smear. It now counts smears: one session is one smear, examined once a live field
was verified, positive when a live field carries a counted detection. That is the rule in
`barangay_prevalence()`, so the dashboard and the map count the same thing. Cards: patients
with a smear read, smears examined, positive smears and rate, fields verified. A weekly bar
chart (inline SVG, with a table view) and species bars showing the share of positive smears
carrying each species. A from/to period in Manila dates lives in the URL; a period over
5,000 sessions says its figures are partial.

The severity bands, the EPG trend, the distribution-by-egg and the EPG summary are deleted,
with their tests. `epg.ts` keeps only what the export still needs.

## [fix] Records: super admins see patients de-identified

A patient's name, sex and birthdate now reach only an organization admin of the patient's
own laboratory. Each clinic controls its patients' data under RA 10173 and AgarthaVision
processes it for them; a super admin runs the platform and needs no patient's identity.
`patientDisclosureFor` decides it, every patient read in `DatabasePort` takes the result,
and the Supabase adapter leaves the identity columns out of a de-identified request, so
they never leave the database for a super admin. A name search is ignored for them, the
medtech's free-text note is withheld, and a patient is named by the start of their record
id. `Patient` carries the identity fields under `identity`, `null` when withheld.

Record pages also drop their phone breakpoints, as the shell did.

## [fix] Records: one row per species, and a bad id is a 404

The LPF table joined ranges and egg counts on their raw keys. Ranges are keyed by the stored
finding species (as the app groups them) and counts by the canonical name, so a finding
stored as `ascaris_lumbricoides` split one species into a range-only row and a count-only
row. `speciesRows` now joins on `canonicalSpecies` without recomputing any range, and the
session page's field cards name species the way the sample page does.

A patient, session or sample id that is not a well-formed uuid now 404s before any read;
Postgres used to reject it and the page failed with a 500. Each detail page repeats the
access check, and `records/loading.tsx` shows that a click registered while a session's
frames are read and signed.

## [feat] Browse records as patient → session → sample, in LPF as the app reports them

The console was broken: every sample query still selected `samples.gps_*`, which the
consolidated schema dropped, so the dashboard and records pages failed outright. The
domain now mirrors the app's `0001`–`0006` on `development` — patients, sessions owned by
patients, `deleted_at` on samples, `prediction_id` and `stage` on detections, per-field
species findings — and the records page became a browser: patients, a patient's sessions,
a session's findings and fields, and one field's frame and detections.

Figures follow the app, not a local rule: every detection except `FALSE_POSITIVE` counts; a
sample deleted as a duplicate appears nowhere and counts toward nothing; each species gets a
min–max eggs-per-field range with a rare/few/moderate/numerous descriptor, never a mean,
never EPG. `src/domain/clinical.test.ts` carries every case from the app's
`LpfAggregationTest`. Each detection says whether its box is the model's, redrawn or added,
and a frame with no stored predictions says "unknown" rather than guessing.

Frames are signed with the visitor's own session: `0001` already grants admins read on the
whole bucket, so the service-role path is gone and nothing reads that key. The dashboard
works again but still shows EPG, and the EPG export route remains without a link; both move
to LPF in their own changes.

## [fix] Desktop-only console, and the three tiers named as the product names them

Super admins and organization admins use the console at a computer; medtechs use the mobile
app. The shell no longer folds its sidebar into a row under the header below 768px: the
sidebar and the organization name are always shown, the shell holds a 1024px minimum width
and a narrower window scrolls sideways. Grids keep their desktop columns.

The tiers are named Super admin, Organization admin and Medtech wherever a person reads
them. The refusal shown after a correct password no longer assumes the person is a medtech:
a deactivated organization admin sees it too, so it says who the console is for and who
to ask.

## [feat] Console shell with role-aware navigation, shadcn on Base UI and dark mode

The console now knows three people instead of one. A super admin (`profiles.role =
'admin'`) sees everything; an org admin will see their own laboratory once memberships
exist; a medtech is refused. The rule is `resolveConsoleAccess` in `src/domain/access.ts`,
plain TypeScript so it holds under any provider (D7). `AuthPort.requireAdmin()` became
`requireConsoleActor()`, which returns the user with their access. Every page calls
`requirePageAccess()`, which 404s anyone it does not admit — a hidden sidebar link is never
the protection, and a client-side navigation does not re-render the layout, so the page's
call is what re-reads access. Route handlers use `requireRouteAccess()`. An `error.tsx`
under `(dashboard)/` replaces the bare framework error page with a retry.

A medtech who signs in with the right password is signed back out and told to use the
Android app. That message only appears after a correct password, so it confirms nothing to
a stranger; wrong passwords and unknown emails still share one reply.

The frame is a sidebar, a header naming the scope, and a user menu with theme and sign out.
Components are shadcn-style files under `src/components/ui/` written on Base UI (D1); no
Radix package is installed, and the shadcn registry is not used. Colours became two layers:
the raw `--av-*` palette, and semantic tokens that a `dark` class swaps, so existing
components are correct in both themes without `dark:` classes. `/` now redirects to the
dashboard.

## [docs] Add a keep-the-docs-aligned rule to AGENTS.example.md

A "Project shelf — keep it current" section, ported from the app repo's `AGENTS.example.md`
and adjusted to this repo: cards cite `path:line` rather than symbols, the router's "Where to
go" table stands in for the app repo's object and process indexes, and the changelog and
`docs/features.md` are part of the same change (#10). It is plain instructions for any agent or
member, so keeping the shelf current no longer depends on a skill only some of the team has.

It introduces `verified:` / `commit:` / `status: stale` frontmatter. No card here has
frontmatter yet; each gains it the first time someone touches it, rather than in a sweep that
would stamp cards as verified without re-checking them.

## [ci] Align the commit-msg hook with the app repo and add agent config templates

The subject format gains a colon — `[type][ClickUp-ID][Lastname]: Task title` — and the
type list widens from eight to twelve (`enhancements security ui ux uiux` added, the never-used
`style` dropped). Merge, revert, fixup and squash subjects are now skipped, because git writes
those itself and the old regex rejected them. This is the AgarthaVision app repo's C9 hook
verbatim, so one subject line works in both repos.

Every type in this repo's history (`feat docs ci chore`) survives the change; only the colon
is newly required, so existing commits stay valid history while new ones take the new shape.

Also adds the `.mcp.json` / `AGENTS.md` local-config pattern: the real files are gitignored and
the tracked `.mcp.example.json` and `AGENTS.example.md` are the templates to copy from.

## [docs] Complete ICM system map with object, process, and effect cards

Three object cards (domain model, ports, provider registry) and four process cards (EPG
aggregation, research-matrix export, admin gate, signed image URL), each citing
`path:line` into `src/`. The change-impact index names four non-obvious breaks: a route
handler does not inherit the layout's gate; an admin can read every row and no image until
the upstream Storage policy is applied; three `0002` renames bite silently; and what
counts toward EPG is a cross-repo agreement with the Android client.

Every citation in the cards was resolved against the file it names before this commit.

## [feat] Add detailed records table with filters and research matrix export

Filters live in the query string, so a view is shareable and the export reuses the page's
exact query. Parsing is defensive: a blank field is absent rather than a filter for empty
text, a non-numeric bound is dropped instead of becoming NaN, zero is a real bound, and
undeclared enum values are discarded.

The table shows AI EPG beside validated EPG — the gap between them is what this console
exists to expose. Export runs in a route handler and repeats `requireAdmin()`, because a
handler does not render inside the `(dashboard)` layout and inherits no gate. Exports are
validated-only unless explicitly asked otherwise, and that link is labelled a working
file rather than a report.

## [feat] Build admin dashboard with summary cards and EPG trend chart

Summary cards, per-species EPG trend, parasite distribution, intensity split and EPG
statistics — all counting validated records only, via the domain functions, so the
dashboard and an export cannot disagree about a period.

The chart palette was validated rather than chosen by eye: it passes the lightness band,
chroma floor, CVD separation and normal-vision floor, and warns that two slots fall under
3:1 contrast. That warning is answered with a legend, direct labels and a table view, so
identity never rests on color alone. Days with no validated sample are omitted from the
trend rather than plotted as zero.

## [feat] Add Supabase Auth behind auth port with admin role gate

Identity from Supabase Auth, role from `profiles.role` read server-side on every request.
`getUser()` over `getSession()`, because the latter only decodes a browser-settable
cookie. A missing profile resolves to `medtech`, not admin. The gate sits in the
`(dashboard)` layout so new pages are protected on creation. A medtech who signs in
successfully is signed straight back out rather than left holding a usable cookie, and
both failure modes return one message so the form cannot confirm real accounts.

`src/proxy.ts` refreshes tokens using Next 16's proxy convention. Login state moved to its
own module: a `"use server"` file may export only async functions.

## [feat] Implement Supabase database and storage adapters

Database reads run as the visitor, so RLS decides visibility; the adapter never elevates
and adds no `user_id` predicate of its own. Only date and owner bounds are pushed to SQL —
confidence, EPG and processing time are derived, so filtering them in the domain keeps one
definition rather than restating the rules in a second language.

Storage signs URLs with the service-role key. That is forced, not convenient: upstream
`0003_storage_rls.sql` scopes bucket reads to the uploader's own folder with no admin
exception, so an admin session cannot read another medtech's frames. The adapter
authorises nothing itself and callers must pass the admin gate first.

`registry.ts` is the only module naming a provider. Unknown values throw rather than
falling back.

## [feat] Define domain model and provider port interfaces

`src/domain/` now mirrors the upstream Postgres schema after migration `0008`, with
per-field provenance comments. Added the pure logic the console reports on: EPG at the DOH
multiplier of 24 counting `CONFIRMED` detections only, species-specific severity bands, the
six fixed research-matrix columns with CSV and JSON serialisation, and the record filters.
51 unit tests cover it; none needs a live Supabase.

`src/ports/` defines `DatabasePort`, `StoragePort` and `AuthPort` with no vendor type in
any signature. The database port exposes reads only — the read-mostly constraint is
enforced by the absence of a mutation verb, not by a comment.

Two judgement calls worth recording. First, `WRONG_CLASS` and `BOX_INCORRECT` detections
are real eggs but do not count toward EPG, because the Android client's session reports
count `CONFIRMED` only and the two surfaces must not disagree about the same smear.
Second, Phase 1 has no per-sample validation-state column and `validation_records` is a
Phase 2 ghost, so validation status is derived from `verified_at` and `needs_reannotation`;
that derivation is documented on the enum.

## [ci] Configure Husky git hooks for typecheck, test, and build verification

Ported the Android repo's hook discipline to the Next.js toolchain. `pre-commit` gates on
four numbered steps — typecheck, unit tests, production build, eslint plus prettier — each
with its own failure message and non-zero exit. `pre-push` repeats the full build.
`commit-msg` enforces `[type][ClickUp-ID][Lastname] Task title` and prints the expected
format on rejection. `run_bun()` mirrors the sibling's `run_gradle()`. Added
`lint-staged.config.js` and `commitlint.config.js` with a `scope-enum` for this repo's
areas.

## [chore] Scaffold Next.js admin console with TypeScript and Tailwind

Next.js 16 App Router, React 19, TypeScript `strict`, Tailwind v4, ESLint, Prettier,
Vitest. Design tokens mirror the Android client's palette. `.env.example` carries variable
names with empty values; `.env.local` is gitignored.
