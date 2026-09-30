import type { Detection, Sample, SampleRecord } from "./entities";
import { DetectionVerdict, EggSpecies, ValidationStatus, parseEggSpecies } from "./enums";

/**
 * Eggs Per Gram computation and aggregation.
 *
 * Pure functions only. Nothing here reads a port, an environment variable or a
 * clock; every input arrives as an argument so every branch is testable.
 */

/**
 * Department of Health volumetric multiplier for the Kato-Katz thick smear:
 * one template holds a fixed mass of stool, so egg count times this constant is
 * eggs per gram. Mirrors `EpgCalculator.MULTIPLIER` in the Android client.
 *
 * TODO(Tabada): attach the official DOH bulletin / WHO guideline citation.
 */
export const EPG_MULTIPLIER = 24;

/** Converts a validated egg count to eggs per gram. */
export function epgFromCount(eggCount: number): number {
  return eggCount * EPG_MULTIPLIER;
}

/**
 * A detection counts toward EPG only when a human confirmed it.
 *
 * `FALSE_POSITIVE` is not an egg. `WRONG_CLASS` and `BOX_INCORRECT` are real
 * eggs, but the Android client's session reports count `CONFIRMED` only, and
 * schema parity beats a locally clever rule — the two surfaces must not
 * disagree about the same smear.
 */
export function isCountableDetection(detection: Detection): boolean {
  return detection.verdict === DetectionVerdict.Confirmed;
}

/** Derives a sample's validation state from the columns Phase 1 actually has. */
export function deriveValidationStatus(sample: Sample): ValidationStatus {
  if (sample.verifiedAt === null) return ValidationStatus.Pending;
  if (sample.needsReannotation) return ValidationStatus.Flagged;
  return ValidationStatus.Validated;
}

/**
 * Only validated records reach a report. Pending and flagged records are
 * excluded from every aggregate on the administrative dashboard and from every
 * summary figure in an export. Clinical requirement, not a display preference.
 */
export function isValidatedRecord(record: SampleRecord): boolean {
  return record.validationStatus === ValidationStatus.Validated;
}

/** The species a detection should be reported under: expert correction wins. */
export function effectiveSpecies(detection: Detection): EggSpecies {
  return parseEggSpecies(detection.expertClass ?? detection.classLabel);
}

/** Milliseconds between capture and verification; `null` when unverified. */
export function processingTimeMs(sample: Sample): number | null {
  if (sample.verifiedAt === null) return null;
  const captured = Date.parse(sample.capturedAt);
  const verified = Date.parse(sample.verifiedAt);
  if (Number.isNaN(captured) || Number.isNaN(verified)) return null;
  return verified - captured;
}

/**
 * Composes the derived half of a {@link SampleRecord} from its persisted half.
 * The adapter supplies rows; this function supplies meaning.
 */
export function composeSampleRecord(input: {
  sample: Sample;
  detections: Detection[];
  owner: SampleRecord["owner"];
  sessionLabel: string | null;
}): SampleRecord {
  const { sample, detections, owner, sessionLabel } = input;
  const countable = detections.filter(isCountableDetection);
  const species = new Set<EggSpecies>();
  for (const detection of countable) species.add(effectiveSpecies(detection));

  const meanConfidence =
    detections.length === 0
      ? null
      : detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length;

  return {
    sample,
    detections,
    owner,
    sessionLabel,
    validationStatus: deriveValidationStatus(sample),
    detectedSpecies: [...species],
    meanConfidence,
    aiEggCount: detections.length,
    aiEpg: epgFromCount(detections.length),
    validatedEggCount: countable.length,
    validatedEpg: epgFromCount(countable.length),
    processingTimeMs: processingTimeMs(sample),
  };
}
