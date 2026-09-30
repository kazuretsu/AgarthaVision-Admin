# Change impact

If you touch X, open these cards. This index is a catalog, not a waterfall: it names where
to look, and the card carries the reasoning. **If this table and a card disagree, the card
is right and this table is stale.**

| If you touch                                           | Open                                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `src/ports/*`                                          | `../objects/ports.md` · `../../constraints.md` (#1, #4)                                 |
| `src/adapters/registry.ts`                             | `../objects/provider-registry.md`                                                       |
| `src/adapters/supabase/database.ts`                    | `../objects/domain-model.md` · `../objects/ports.md`                                    |
| `src/adapters/supabase/storage.ts`                     | `../processes/signed-image-url.md`                                                      |
| `src/adapters/supabase/auth.ts`                        | `../processes/admin-gate.md` · `../../constraints.md` (#3)                              |
| `src/domain/entities.ts`, `enums.ts`                   | `../objects/domain-model.md` · `../../constraints.md` (#5, #7)                          |
| `src/domain/clinical.ts`, `patients.ts`                | `../processes/lpf-session-summary.md` · `../../constraints.md` (#6)                     |
| `src/domain/dashboard.ts`, `src/components/dashboard/` | `../processes/dashboard-figures.md`                                                     |
| `src/domain/epg.ts`                                    | `../processes/epg-aggregation.md` — export only                                         |
| `src/domain/research-matrix.ts`                        | `../processes/research-matrix-export.md` — the column set is a contract                 |
| `src/domain/filters.ts`, `src/lib/search-params.ts`    | `../processes/research-matrix-export.md` — the export reuses the page's filter          |
| `src/app/(dashboard)/layout.tsx`                       | `../processes/admin-gate.md`                                                            |
| `src/domain/access.ts`, `src/lib/console-access.ts`    | `../processes/admin-gate.md` · `../../constraints.md` (#3)                              |
| `src/components/shell/nav.ts`                          | `../processes/admin-gate.md` — `visibleTo` must match each page's `requirePageAccess`   |
| Any new route handler                                  | `../processes/admin-gate.md` — handlers do **not** inherit the layout's gate            |
| `src/proxy.ts`                                         | `../processes/admin-gate.md` — refresh only, never the authorisation point              |
| `src/lib/palette.ts`, anything charting                | `../../constraints.md` (#11) — re-run the palette validator                             |
| `SESSION_INIT.md`                                      | `../../constraints.md` (#13)                                                            |
| `.husky/*`, `package.json` scripts                     | `../../commands.md` · `../../constraints.md` (#9)                                       |
| `.env.example`                                         | `../objects/provider-registry.md` · `../../stack.md` · `../../constraints.md` (#2, #12) |

## The non-obvious breaks

**A route handler is not behind the gate.** The `(dashboard)` layout guards pages that
render inside it. A route handler under the same folder does not render inside it and
inherits nothing. `records/export` calls `requireRouteAccess()` for exactly this reason; a new
handler that forgets to is an open dataset.

**One dropped column fails the whole query.** The consolidated schema removed
`samples.gps_*`, `sessions.notes`, `sessions.ended_at` and `reports.epg_per_species`.
PostgREST rejects a select naming any of them, so every page on that query errors — this is
how the console broke. Read `0001_init.sql` before adding a column to a select.

**An ambiguous embed fails the whole query.** `patients` reaches `profiles` through
`created_by` and through `patient_users`, so `profiles(...)` from `patients` must name
`patients_created_by_fkey`. See `../objects/domain-model.md`.

**What counts is cross-repo.** Every non-rejected detection on a live sample counts
(`src/domain/clinical.ts:32`), matching the app's Session Detail and its PDF report, and
the tests carry the app's own cases. Changing the rule here alone makes the console and the
report a patient was handed disagree about the same smear.

## What points into this tree from outside

Nothing in this repo references these, so nothing here would break loudly if they changed:

- **The AgarthaVision Android client and its Supabase project.** The real schema authority.
  A migration there is a change here.
- **ClickUp.** Task IDs appear in every commit subject; no code reads them.
- **Downstream consumers of the research-matrix export.** The column labels are a contract
  with analysts this repo cannot see.
