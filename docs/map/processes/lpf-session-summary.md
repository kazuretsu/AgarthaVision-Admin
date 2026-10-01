---
verified: 2026-09-30
commit: c5c0fbe
---

# LPF session summary

Input: a session's samples, detections and per-field findings → Movement: drop deleted
samples, count eggs, range each species per field → Output: the `SessionSummary` every
records page shows.

## The rules, each ported from the app

| Rule                                                                                                                           | Console                                           | App (`development`)                                                     |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------- |
| An egg is any detection **except** `FALSE_POSITIVE` — `WRONG_CLASS` and `BOX_INCORRECT` count                                  | `isCountedDetection`, `src/domain/clinical.ts:32` | `DetectionDao.getConfirmedEggCountsForSession`; `barangay_prevalence()` |
| A sample with `deleted_at` set appears nowhere and counts toward nothing                                                       | `isLiveSample`, `:37`                             | every sample query filters `deleted_at is null`                         |
| A species counts under the medtech's correction, `expert_class ?? class_label`                                                 | `detectionSpecies`, `:64`                         | `COALESCE(d.expert_class, d.class_label)`                               |
| Per species, **min–max eggs in any single field**; a field without it is 0; several rows in one field are summed; never a mean | `aggregateLpfPerSpecies`, `:113`                  | `LpfAggregation.kt::aggregateLpfPerSpecies`                             |
| Descriptor read off the worst field: ≤2 rare, ≤5 few, ≤10 moderate, else numerous; none when never seen                        | `lpfDescriptor`, `:85`                            | `LpfDescriptor.forMax`                                                  |
| A smear is positive when a live sample carries a counted detection                                                             | `summariseSession`, `:219`                        | `public.barangay_prevalence()`                                          |

`src/domain/clinical.test.ts` repeats every case in the app's `LpfAggregationTest`, so a
change to either side that the other does not make fails a test here.

**Not a WHO tier.** There is no eggs-per-gram for a direct smear and no published intensity
table for it (PB-16). The descriptor describes what the medtech saw and carries no clinical
classification. No surface in the console shows EPG.

## Steps

1. The adapter reads a session with its samples and their detections, findings and
   prediction ids (`SAMPLE_TREE`, `src/adapters/supabase/database.ts:186`), or only what a
   summary needs for a patient's session list (`SESSION_SUMMARY_TREE`, `:156`).
2. `summariseSession` (`src/domain/clinical.ts:219`) keeps live samples, counts eggs per
   species, ranges the findings over the live field count, and decides positivity.
3. `speciesRows` (`src/domain/clinical.ts:185`) joins the two halves for display. The LPF
   range is keyed by the finding's **stored** species string, as the app groups it, while egg
   counts are keyed by the canonical name; joining on the raw keys would split
   `ascaris_lumbricoides` and `Ascaris lumbricoides` into two half-empty rows. The join is on
   `canonicalSpecies`, and no range is recomputed: two stored spellings that each carry a
   range keep a row each.
4. Pages render the result: `LpfTable` and `LpfInline` (`src/components/records/LpfTable.tsx`).
   Field cards on the session page and the sample page name species canonically too.

## Box provenance

`boxProvenance` (`src/domain/clinical.ts:265`) reads the table in the app's
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

`src/domain/clinical.ts`, `src/domain/clinical.test.ts`, `src/adapters/supabase/database.ts`.
