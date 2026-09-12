# Changelog

Newest first. One entry per commit that changes behavior or contract.

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
