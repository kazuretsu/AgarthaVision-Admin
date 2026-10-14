---
verified: 2026-10-14
commit: 38a1777
---

# Prevalence map

Input: a place (country, region, province or town), a period and a scope → Movement: the
database places each examined smear by its patient's barangay and counts per area → Output: a
shaded map of one level's areas and a table of the same figures, drilling Region → Province →
City/Municipality → its barangays, as a ranked table.

Super admins and org admins (14zcqntjnt3; the barangay breakdown and isolating an area,
14zcqntjnt6). STH surveillance reports prevalence per administrative area, never individual
cases; there are no points to plot, so it is a choropleth, not a heatmap.

## Steps

1. **Where.** `/map` reads `?town=`, `?province=` or `?region=` (`parseMapLocation`,
   `src/domain/prevalence-map.ts:142`), in that order; anything but ten digits shows the
   country. The period (`from`, `to`), a super admin's `org` and an isolated area (`isolate`)
   ride along in every link (`mapHref`, `:165`), so the back button and a shared link both
   work. Opening another level drops `isolate`.
2. **Count.** `areaPrevalence` (`src/adapters/supabase/database.ts:792`) makes one request,
   `console_area_prevalence(level, code, organization, from, to)` (`admin/0014`, the town
   level `admin/0015`). It returns the area, its parents' names for the breadcrumb, its own
   figure, and every area one level down **with its name, including those with no smear**;
   at a town, only the barangays **with** a smear, **by code, with no name** (step 8). An
   unknown region, province or town is P0002, which the page turns into a 404 (it reads
   before rendering anything, so no `loading.tsx`: `../effects/CONTEXT.md`).
3. **Place.** A smear sits where its patient lives: `patients.psgc_barangay_code` →
   `console_psgc_town()` (the first seven digits and `000`, or the City of Manila for any
   `13806…` barangay) → `psgc_town_aliases` for a 2023 code from before the Negros Island
   Region and Sulu renumbering → `psgc_towns` → `psgc_provinces` → `psgc_regions`. A code
   that matches no town is **not placed**: counted on the country view's own line, never
   guessed into an area. Highly urbanised cities sit in the province around them; NCR's towns
   in an NCR province-level area (`1300000000`), as in the app.
4. **Rule.** The dashboard's (`dashboard-figures.md`, `admin/0011`): the session is the smear;
   examined once a live sample exists; positive when a live sample carries a detection other
   than `FALSE_POSITIVE`. Flagged samples count, as on the dashboard. The country's examined
   smears plus those not placed equal the dashboard's examined smears for the same scope and
   period; the database test and the end-to-end run both check it.
5. **Withhold.** `console_area_figure()` is the only place the threshold is written: 0 smears
   is `{0, 0}`; 1 to 4 is `suppressed` with no figures; 5 or more is the counts. It is applied
   to **each area's own count**, at every level, so a province made of small barangays shows
   once it reaches 5, and a small province is withheld whatever its towns hold.
   `barangay_prevalence()`'s rows are never summed: they withhold small barangays, so a sum
   undercounts.
6. **Scope.** As `console_dashboard_figures()`: a super admin all laboratories or one; an org
   admin their own only, whatever `?org` says (another laboratory is 42501); anyone else
   refused.
7. **Paint.** The page maps each area to a band or state (`shadeOf`, `:104`; `bandOf`, `:93`,
   the app's `PositiveRateBin`: 0%, under 10%, 10–20%, 20–40%, 40% or more) and hands them to
   `PrevalenceMap` (`src/components/map/PrevalenceMap.tsx`), which only paints: the rate is
   `positive / examined` of the database's two counts. The table (`AreaTable`) carries the
   same figures in words.
8. **Barangays.** At a town (`?town=`) the map draws the town alone, from its province's
   outline file, shaded by its own figure, which is the one the province's map shows (the
   same query counts both). Below it, its barangays: named by `barangayNamesOf`
   (`src/lib/map/barangay-names.ts:13`) from `src/lib/map/barangays/q2_2026/`, one file per
   code's first five digits, the same 2Q 2026 release as the lookup, then ranked by
   `barangayBreakdown` (`:207`): highest rate first, then more smears, then by name; withheld
   barangays last, with no figure. A code not in the release is listed by its code, never guessed. A line
   counts the town's barangays with no smear in scope (Manila has 897; listing them all would
   bury the ones that matter). A barangay recorded with a 2023 Negros Island Region or Sulu
   code is counted under its current code: the town's current first seven digits and its own
   last three, since PSA kept the lower digits.
9. **Isolate.** At the country, a region or a province, each table row can draw its area
   alone (`?isolate=`, `parseIsolate`, `:156`); the outline filter keeps that one feature
   (`boundariesFor`, `:247`) and the map fits whatever it draws. "Showing only …" above the
   map, and the row's "Show all", clear it. A code the view does not list is ignored, so a
   stale link shows every area. Clicking an area still opens it; isolating is the table's.

## The map

- **Layout**: the map and its table side by side from 1400px wide; below that, the table under
  the map, since the table's columns would squeeze the map to a sliver.
- **MapLibre GL JS on a plain background**: no basemap, no tiles, no key, nothing fetched
  from anyone but this site. Pan and zoom, no rotation. Pointing at an area names it and its
  figure below the map; a click opens the level below (a town opens nothing).
- **Boundaries** are static files in `public/geo/q2_2026/`: `regions.json` at the country
  view, `provinces.json` filtered to the region, `towns/<province>.json` for one province,
  and the same file filtered to one town at a town. There are no barangay outlines. Built by `scripts/geo/build-map-data.ts` from the app repo's committed 2Q 2026
  build (`tools/geo/`, `tools/psgc/`), which also writes the lookup rows into `admin/0014`, so
  outlines and lookup share every code. The script stops if the barangay → town rule, the
  aliases, or a code shared by both stop holding.
- **Barangay names** are built by `scripts/geo/build-barangay-names.ts` from the app's
  `tools/psgc/psgc-barangays-q2_2026.csvgz`: one file per province segment, read on the
  server for the one town shown, never sent whole. No network. It stops unless every
  barangay follows the town rule and the towns match `admin/0014`'s exactly. There is no
  barangay table in the database, by design.
- **Colours** (`src/lib/map/palette.ts`): one maroon hue, light to dark for a higher rate (dark
  to light on the dark theme), validated as ordinal ramps against each surface. No data is
  neutral grey; too few to report is hatched, so neither reads as a rate.
- **Worker**: MapLibre 6 starts a worker from a URL. It is served from
  `public/vendor/maplibre-gl/<version>/`, copied from the installed package by
  `scripts/vendor-maplibre.ts`; `src/lib/map/vendor.test.ts` fails if the copy and the
  package differ.
- **Attribution** is shown under every map: "Administrative boundaries: OCHA Philippines
  COD-AB, CC BY-IGO 3.0." (`BOUNDARY_ATTRIBUTION`, `:193`). The licence requires it wherever
  the boundaries are shown.

## Accepted

A withheld area's count can sometimes be had by subtracting its shown siblings from its
parent. Accepted for this map, whose readers are the console's admins (14zcqntjnt3).

## Before admin/0014, and before 0015

`console_area_prevalence` missing → `MigrationNotAppliedError`; the page says which file to
apply. Nothing else on the console depends on it. With 0014 but not 0015, the function refuses
the town level as a bad argument (22023); the adapter turns that, at a town only, into the
same message naming `admin/0015_barangay_breakdown.sql`. The rest of the map is unaffected.

## If you change this

**Hits**

- `supabase/tests/admin_0014_prevalence_map.test.ts`: the lookup's counts, the rule, the
  aliases, every level, withholding, period, scope, errors and privileges, and agreement with
  `console_dashboard_figures()`.
- `supabase/tests/admin_0015_barangay_breakdown.test.ts`: a town's barangays, their sum with
  the province's figure, withholding, the 2023 and Manila codes, period, scope, refusals, and
  agreement with the app's `barangay_prevalence()`.
- `src/domain/prevalence-map.test.ts`, `src/adapters/supabase/prevalence-rows.test.ts`,
  `src/adapters/supabase/database.test.ts` (the town level, and before 0015),
  `src/lib/map/barangay-names.test.ts`.
- `console_area_prevalence()` is replaced by 0015: a change to it is a new migration that
  replaces 0015's version, never an edit to 0014's.
- The counting rule: change it in `admin/0011` and here together, or the map and the dashboard
  disagree.
- A new PSGC release: rebuild the app's `tools/geo`, then rerun `build-map-data.ts` and
  `build-barangay-names.ts`, then a new admin migration for the lookup; the outlines, the
  lookup and the barangay names must change together.

**Does not hit**

- The dashboard, records, export and training data.

## See

`supabase/migrations/admin/0014_prevalence_map.sql`, `admin/0015_barangay_breakdown.sql`,
`src/domain/prevalence-map.ts`, `src/app/(dashboard)/map/page.tsx`, `src/components/map/`,
`src/lib/map/barangay-names.ts`, `scripts/geo/build-map-data.ts`,
`scripts/geo/build-barangay-names.ts`.
