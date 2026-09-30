---
verified: 2026-09-30
commit: e1e39b1
---

# Dashboard figures

Input: every session started in a period → Movement: summarise each smear, count per smear
→ Output: the dashboard's cards, weekly trend and species mix.

## The unit is the smear

One session is one smear from one patient. A smear is **examined** once at least one live
field was verified (`isExamined`, `src/domain/dashboard.ts:55`), and **positive** when a
live field carries a counted detection (`SessionSummary.isPositive`, from
`lpf-session-summary.md`). That is the rule inside `public.barangay_prevalence()`, so the
dashboard and the prevalence map count the same thing. A session opened but never read
does not dilute the denominator.

## Steps

1. `listSmears` (`src/adapters/supabase/database.ts:412`) reads each session in the period
   with only what a summary needs. Period bounds are Manila calendar days (`:422`).
2. `summariseDashboard` (`src/domain/dashboard.ts:69`) counts distinct patients, examined
   and positive smears, the positive rate, and verified fields; the species mix counts each
   species once per positive smear, so a polyparasitic smear counts for each species it
   carries; the trend buckets examined smears by Manila week, Monday first
   (`weekStart`, `:60`).
3. Weeks with nothing examined are **absent, not zero** (`:104`): a gap in surveillance is a
   different claim from a week of negative smears.
4. The page (`src/app/(dashboard)/dashboard/page.tsx`) caps the read at 5,000 sessions
   (`:25`) and says so when the cap is reached (`:51`), because a figure from a truncated
   set is silently wrong.

## Agreeing with the map

Do **not** check the dashboard by adding up `barangay_prevalence()` rows. That function
withholds every barangay with fewer than 5 examined smears, so the sum drops them and
undercounts. The map needs its own rollup per level for the same reason. On the local
synthetic data the dashboard shows 19 examined / 14 positive; the barangay rows add up to
6 / 6, with 5 barangays suppressed.

## If you change this

**Hits**

- The dashboard, and its agreement with the prevalence map.
- `src/domain/dashboard.test.ts`.

**Does not hit**

- The records browser, which shows one session at a time from the same `SessionSummary`.

## See

`src/domain/dashboard.ts`, `src/components/dashboard/`, `src/app/(dashboard)/dashboard/page.tsx`.
