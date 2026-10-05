---
verified: 2026-10-05
commit: c0011a3
---

# LPF session summary

Input: a session's samples, detections and per-field findings → Movement: drop deleted
samples, count eggs, range each species per field → Output: the `SessionSummary` every
records page shows.

## The rules, each ported from the app

| Rule                                                                                                                           | Console                                           | App (`development`)                                                     |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------- |
| An egg is any detection **except** `FALSE_POSITIVE` — `WRONG_CLASS` and `BOX_INCORRECT` count                                  | `isCountedDetection`, `src/domain/clinical.ts:33` | `DetectionDao.getConfirmedEggCountsForSession`; `barangay_prevalence()` |
| A sample with `deleted_at` set appears nowhere and counts toward nothing                                                       | `isLiveSample`, `:38`                             | every sample query filters `deleted_at is null`                         |
| A species counts under the medtech's correction, `expert_class ?? class_label`                                                 | `detectionSpecies`, `:65`                         | `COALESCE(d.expert_class, d.class_label)`                               |
| Per species, **min–max eggs in any single field**; a field without it is 0; several rows in one field are summed; never a mean | `aggregateLpfPerSpecies`, `:114`                  | `LpfAggregation.kt::aggregateLpfPerSpecies`                             |
| Descriptor read off the worst field: ≤2 rare, ≤5 few, ≤10 moderate, else numerous; none when never seen                        | `lpfDescriptor`, `:86`                            | `LpfDescriptor.forMax`                                                  |
| Burden read off the descriptor: rare or few → Low, moderate → Moderate, numerous → High; none when never seen                  | `parasiteBurdenLevel`, `:153`                     | `ParasiteBurdenLevel.forDescriptor`                                     |
| A smear is positive when a live sample carries a counted detection                                                             | `summariseSession`, `:265`                        | `public.barangay_prevalence()`                                          |

`src/domain/clinical.test.ts` repeats every case in the app's `LpfAggregationTest`, so a
change to either side that the other does not make fails a test here.

**Not a WHO tier.** There is no eggs-per-gram for a direct smear and no published intensity
table for it (PB-16). The descriptor describes what the medtech saw and carries no clinical
classification. The burden level (`Low` / `Moderate` / `High Burden`) is the app's estimate
from that descriptor, derived on read and never stored; it is labelled "Burden", never an
infection intensity. No surface in the console shows EPG.

## Steps

1. The adapter reads a session with its samples and their detections, findings and
   prediction ids (`sampleTree`, `src/adapters/supabase/database.ts:233`), or only what a
   summary needs for a patient's session list (`sessionSummaryTree`, `:244`).
2. `summariseSession` (`src/domain/clinical.ts:265`) keeps live samples, counts eggs per
   species, ranges the findings over the live field count, and decides positivity.
3. `speciesRows` (`src/domain/clinical.ts:231`) joins the two halves for display. The LPF
   range is keyed by the finding's **stored** species string, as the app groups it, while egg
   counts are keyed by the canonical name; joining on the raw keys would split
   `ascaris_lumbricoides` and `Ascaris lumbricoides` into two half-empty rows. The join is on
   `canonicalSpecies`, and no range is recomputed: two stored spellings that each carry a
   range keep a row each.
4. Pages render the result: `LpfTable` and `LpfInline` (`src/components/records/LpfTable.tsx`).
   Each species seen reads `Moderate · Moderate Burden`, written by `formatLpfReading`
   (`src/domain/clinical.ts:179`) as the app's Session Detail writes it; a species never seen,
   and a session never read, show neither. `src/components/records/LpfTable.test.ts` renders
   both components and fails if the reading drops off either page.
   Field cards on the session page and the sample page name species canonically too.

## Box provenance

`boxProvenance` (`src/domain/clinical.ts:311`) reads the table in the app's
`0004_predictions.sql`: linked + box → **model** (or **redrawn** when `BOX_INCORRECT`);
linked, no box → **no box**; unlinked + box → **added**. An unlinked row on a frame with no
predictions at all and not a manual capture is **unknown** — a pre-`0004` row whose
provenance could not be recovered — and is never guessed as "added".

Boxes are drawn by `FieldImage` (`src/components/records/FieldImage.tsx`). `0004` says
boxes are centre and size in source pixels, while `0001`'s comment says normalised `0..1`;
the overlay detects which (`:66`) and scales accordingly. Rejected boxes are dashed.

## If you change this

**Hits**

- Every records page, and the parity with the app's Session Detail and PDF report. A rule
  change here without the same change in the app makes the two disagree about one smear.
- The prevalence map, which must use the same positivity rule.

**Does not hit**

- Nothing outside the console. The dashboard and export read these summaries, so they move
  with any change here.

## See

`src/domain/clinical.ts`, `src/domain/clinical.test.ts`, `src/components/records/LpfTable.test.ts`,
`src/adapters/supabase/database.ts`.
