# Change impact

If you touch X, open these cards. This index is a catalog, not a waterfall: it names where
to look, and the card carries the reasoning. **If this table and a card disagree, the card
is right and this table is stale.**

| If you touch                                                                       | Open                                                                                                |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/ports/*`                                                                      | `../objects/ports.md` · `../../constraints.md` (#1, #4)                                             |
| `src/adapters/registry.ts`                                                         | `../objects/provider-registry.md`                                                                   |
| `src/adapters/supabase/database.ts`                                                | `../objects/domain-model.md` · `../objects/ports.md`                                                |
| `src/adapters/supabase/paging.ts`, any `.limit()`                                  | `../processes/dashboard-figures.md` — one response stops at the server's row cap                    |
| `src/adapters/supabase/storage.ts`                                                 | `../processes/signed-image-url.md`                                                                  |
| `src/adapters/supabase/auth.ts`                                                    | `../processes/admin-gate.md` · `../../constraints.md` (#3)                                          |
| `src/domain/entities.ts`, `enums.ts`                                               | `../objects/domain-model.md` · `../../constraints.md` (#5, #7)                                      |
| `src/domain/clinical.ts`, `patients.ts`                                            | `../processes/lpf-session-summary.md` · `../../constraints.md` (#6)                                 |
| `src/domain/dashboard.ts`, `src/components/dashboard/`                             | `../processes/dashboard-figures.md`                                                                 |
| `src/domain/research-export.ts`                                                    | `../processes/research-export.md` — the column set is a contract (v2)                               |
| `src/lib/period.ts`                                                                | `../processes/dashboard-figures.md` · `../processes/research-export.md` — shared period             |
| `src/app/(dashboard)/layout.tsx`                                                   | `../processes/admin-gate.md`                                                                        |
| `src/domain/access.ts`, `src/lib/console-access.ts`                                | `../processes/admin-gate.md` · `../../constraints.md` (#3)                                          |
| `src/components/shell/nav.ts`                                                      | `../processes/admin-gate.md` — `visibleTo` must match each page's `requirePageAccess`               |
| Any new route handler                                                              | `../processes/admin-gate.md` — handlers do **not** inherit the layout's gate                        |
| `src/proxy.ts`                                                                     | `../processes/admin-gate.md` — refresh only, never the authorisation point                          |
| `src/lib/palette.ts`, anything charting                                            | `../../constraints.md` (#11) — re-run the palette validator                                         |
| `supabase/migrations/admin/*`                                                      | `../objects/organizations.md` · `../../constraints.md` (#7) — additive only; run `bun run test:db`  |
| `src/domain/scope.ts`, `src/lib/read-scope.ts`, `supabase/migrations/admin/0002_*` | `../processes/lab-scoping.md` — the console filter and the policies must agree                      |
| `src/domain/audit.ts`, any new admin write                                         | `../processes/audit-trail.md` — a write must audit itself; add its action                           |
| `src/ports/admin-write.ts`, `src/adapters/supabase/admin-write.ts`                 | `../objects/organizations.md` — every write audits itself                                           |
| `src/domain/invitations.ts`, `src/adapters/supabase/onboarding.ts`, `invite/`      | `../processes/invitations.md` — role and organization come from the stored invitation only          |
| `createServiceClient`, `SUPABASE_SERVICE_ROLE_KEY`                                 | `../processes/invitations.md` · `../../constraints.md` (#2) — one caller, after the link is checked |
| `src/adapters/resend/*`, `src/lib/invitation-email.ts`                             | `../processes/invitations.md` — the email carries the link, never a password                        |
| `SESSION_INIT.md`                                                                  | `../../constraints.md` (#13)                                                                        |
| `src/components/ui/*`, `components.json`, tokens in `globals.css`                  | `../objects/ui-components.md` · `../../constraints.md` (#15) — add primitives with the shadcn CLI   |
| `.husky/*`, `package.json` scripts                                                 | `../../commands.md` · `../../constraints.md` (#9)                                                   |
| `.env.example`                                                                     | `../objects/provider-registry.md` · `../../stack.md` · `../../constraints.md` (#2, #12)             |

## The non-obvious breaks

**A route handler is not behind the gate.** The `(dashboard)` layout guards pages that
render inside it. A route handler under the same folder does not render inside it and
inherits nothing. `records/export` calls `requireRouteAccess()` for exactly this reason; a new
handler that forgets to is an open dataset.

**A route-level `loading.tsx` turns every 404 under it into a 200.** It starts streaming the
response before the page runs, so `notFound()` can only swap the content, not the status.
Record pages therefore have none: the list's lives in `records/(list)/`, and the detail pages
read first and suspend only their frames. Put a new loading state inside the page, below its
not-found check. `src/app/not-found-status.test.ts` fails if any page that calls `notFound()`
sits under a loading file, or suspends before its not-found check. The same holds for
`redirect()`: under the records list's loading state it arrives in the browser (the router,
or a meta refresh) rather than as a 307, which is fine for the list's page-past-the-end
redirect but not for anything a non-browser client must follow.

**A `loading.tsx` does not show when only the query string changes.** A new search or page
on the same route keeps the previous page on screen until the next one is ready. The records
list wraps its table in a Suspense boundary keyed by its query (`PatientList`), so the
skeleton shows there; do the same for any list that pages or filters through the URL.

**`.limit()` above 1000 does nothing.** PostgREST cuts every response at `db-max-rows`
(1000 on Supabase by default) and does not say so. A read that can exceed it goes through
`readPages` (`src/adapters/supabase/paging.ts`); a "more than N" check on a single
response's length can never fire. A list a person pages through instead reads one page with
`.range()` and `count: "exact"` (`listPatients`); a range past the last row is refused
(`PGRST103`) and loses the count, so the adapter asks for the count alone.

**One dropped column fails the whole query.** The consolidated schema removed
`samples.gps_*`, `sessions.notes`, `sessions.ended_at` and `reports.epg_per_species`.
PostgREST rejects a select naming any of them, so every page on that query errors — this is
how the console broke. Read `0001_init.sql` before adding a column to a select.

**A report may have no session.** Since app `0015` a patient report carries `patient_id` and
no `session_id`. Anything that finds a report through its session — a policy, a join, an
embed — silently misses every patient report. `admin/0004` adds the patient path for org
admins; a reports page or the verification page needs both paths too.

**An ambiguous embed fails the whole query.** `patients` reaches `profiles` through
`created_by` and through `patient_users`, so `profiles(...)` from `patients` must name
`patients_created_by_fkey`. See `../objects/domain-model.md`.

**The patient trigger runs inside the app's sync.** `console_assign_patient_organization`
fires on every patient the app inserts. If it ever raised, patient sync would stop for every
medtech. Its exception handler is load-bearing; `admin_0002` tests it. See
`../processes/lab-scoping.md`.

**What counts is cross-repo.** Every non-rejected detection on a live sample counts
(`src/domain/clinical.ts:33`), matching the app's Session Detail and its PDF report, and
the tests carry the app's own cases. Changing the rule here alone makes the console and the
report a patient was handed disagree about the same smear.

## What points into this tree from outside

Nothing in this repo references these, so nothing here would break loudly if they changed:

- **The AgarthaVision Android client and its Supabase project.** The real schema authority.
  A migration there is a change here.
- **ClickUp.** Task IDs appear in every commit subject; no code reads them.
- **Downstream consumers of the research export.** The column labels are a contract
  with analysts this repo cannot see.
