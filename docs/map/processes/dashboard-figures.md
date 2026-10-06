---
verified: 2026-10-06
commit: bcb2774
---

# Dashboard figures

Input: a scope and a period → Movement: the database counts per smear, the console derives
rates and order → Output: the dashboard's cards, weekly trend and species mix, and the export
page's count.

## The unit is the smear

One session is one smear from one patient. A smear is **examined** once at least one live
field was verified (`isExamined`, `src/domain/dashboard.ts:57`), and **positive** when a
live field carries a counted detection (`SessionSummary.isPositive`, from
`lpf-session-summary.md`). That is the rule inside `public.barangay_prevalence()`, so the
dashboard and the prevalence map count the same thing. A session opened but never read
does not dilute the denominator.

## Steps

1. `dashboardTotals` (`src/adapters/supabase/database.ts:747`) makes **one** request,
   `console_dashboard_figures(organization, from, to)`
   (`supabase/migrations/admin/0011_dashboard_totals.sql`), whatever the period holds. The
   function decides the scope itself: a super admin all laboratories or one, an org admin
   their own only (another laboratory is 42501), anyone else refused. It returns counts and
   nothing else — sessions, patients, examined, positive, fields, per-week examined/positive,
   positive smears per species — so there is nothing to de-identify. Period bounds are Manila
   calendar days. Species are named by `console_canonical_species()`, the SQL twin of
   `canonicalSpecies()`; the medtech's `expert_class` wins over the model's `class_label`.
2. `figuresFromTotals` (`src/domain/dashboard.ts:124`) derives the positive rate, each
   species' share of positive smears, and the order (most positive smears first, then name;
   weeks oldest first). A polyparasitic smear counts once for each species it carries; weeks
   are Manila weeks, Monday first (`weekStart`, `:62`).
3. Weeks with nothing examined are **absent, not zero** (`:145`): a gap in surveillance is a
   different claim from a week of negative smears.
4. There is no session cap any more: the old page read at most 5,000 sessions and warned
   that its figures were partial past that.

## The reference

`summariseDashboard` (`:157`) is `figuresFromTotals(totalsOf(records))`: the same derivation
over counts taken from session records (`totalsOf`, `:89`). It is the reference the database
function is held to. `supabase/tests/admin_0011_dashboard_parity.test.ts` builds one fixture
(deleted duplicates, rejected detections, unread sessions, species aliases and corrections,
Manila midnight and Monday boundaries, a patient in no laboratory), reads it back, and
requires the function and `summariseDashboard` to give identical figures for every scope and
period it tries. Change a counting rule in one and that test fails until the other matches.

**Before `admin/0011` is applied**, `dashboardTotals` falls back to `listSmears` and
`totalsOf` (`:766`), capped at the export's 20,000 sessions.

## Agreeing with the map

Do **not** check the dashboard by adding up `barangay_prevalence()` rows. That function
withholds every barangay with fewer than 5 examined smears, so the sum drops them and
undercounts. The map needs its own rollup per level for the same reason. On the local
synthetic data the dashboard shows 19 examined / 14 positive; the barangay rows add up to
6 / 6, with 5 barangays suppressed.

## If you change this

**Hits**

- The dashboard, the export page's count, and their agreement with the prevalence map.
- `console_dashboard_figures()` — a counting rule lives in both it and the domain; the parity
  test keeps them together.
- `src/domain/dashboard.test.ts`, `supabase/tests/admin_0011_dashboard_*`.

**Does not hit**

- The records browser, which shows one session at a time from the same `SessionSummary`.

## See

`src/domain/dashboard.ts`, `supabase/migrations/admin/0011_dashboard_totals.sql`,
`src/components/dashboard/`, `src/app/(dashboard)/dashboard/page.tsx`.
