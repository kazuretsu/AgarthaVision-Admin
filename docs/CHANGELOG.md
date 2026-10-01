# Changelog

Newest first. One entry per commit that changes behavior or contract.

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
