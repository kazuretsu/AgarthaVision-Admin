---
status: stale
---

# EPG aggregation

**Scope now:** the research export only. The records browser and the dashboard do not use
anything here (`lpf-session-summary.md`, `dashboard-figures.md`). The severity bands, the
EPG trend and every dashboard aggregate described below were deleted; EPG is retracted
(PB-16) and leaves the console when the export is rebuilt.

Input: `SampleRecord[]` → Movement: count, multiply, group → Output: the figures on the
administrative dashboard.

## Steps

1. **Compose.** `composeSampleRecord` (`src/domain/epg.ts:71`) joins a sample with its
   detections and derives everything the console shows: validation status, distinct
   species, mean confidence, both egg counts, both EPG figures, processing time.
2. **Decide what counts.** `isCountableDetection` (`src/domain/epg.ts:33`) admits only
   `CONFIRMED`. `FALSE_POSITIVE` is not an egg; `WRONG_CLASS` and `BOX_INCORRECT` are real
   eggs, but the Android client's session reports count `CONFIRMED` only and **schema
   parity beats a locally clever rule** — the two surfaces must not disagree about one smear.
3. **Multiply.** `epgFromCount` (`src/domain/epg.ts:21`) applies `EPG_MULTIPLIER = 24`
   (`src/domain/epg.ts:18`), the Kato-Katz volumetric constant, mirroring
   `EpgCalculator.MULTIPLIER` in the Android client.
4. **Derive status.** `deriveValidationStatus` (`src/domain/epg.ts:38`): no `verified_at`
   → `Pending`; `needs_reannotation` → `Flagged`; otherwise `Validated`.
5. **Filter to validated.** Every aggregate calls `isValidatedRecord`
   (`src/domain/epg.ts:49`) first. This is constraint #6 and it is clinical, not cosmetic.
6. **Aggregate.** `summariseDashboard` (`:156`), `summariseEpg` (`:132`), `epgTrend`
   (`:180`), `speciesDistribution` (`:205`), and `severitySplit`
   (`src/domain/severity.ts:88`).

## Consumes / produces

Consumes `docs/map/objects/domain-model.md`. Produces the dashboard figures
(`src/app/(dashboard)/dashboard/page.tsx`) and the export's EPG columns.

## Two decisions worth knowing

**Severity is species-specific.** 3,000 EPG is a light _Ascaris_ burden and a heavy
_Trichuris_ one, so one threshold set would misreport both (`src/domain/severity.ts:28`).
A species with no published band is `Unclassified`, never folded into `Light`.
`classifyRecord` (`src/domain/severity.ts:55`) takes a sample's **worst** species burden,
because that is the finding that drives treatment.

**A day with no validated sample is absent from the trend, not zero** (`src/domain/epg.ts:180`).
A surveillance gap is a different claim from a day on which no eggs were found.

## If you change this

**Hits**

- The dashboard and the export together — they call the same functions, which is why they
  cannot disagree.
- `src/domain/epg.test.ts` and `severity.test.ts`.
- The Android client's agreement with this console, if you change what counts. That is a
  cross-repo behaviour change, not a local one.

**Does not hit**

- The records browser, which uses `src/domain/clinical.ts` instead.
- Stored data. Nothing here is persisted; every figure is recomputed per request.

## Open

`EPG_MULTIPLIER` and `INTENSITY_BANDS` both carry a `TODO(Tabada)` for their DOH/WHO
citation. The values match standard Kato-Katz practice; the source document is not yet
attached.

## See

`src/domain/epg.ts`, `src/domain/severity.ts`.
