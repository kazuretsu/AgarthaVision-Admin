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

/** Per-species validated EPG across a set of records. */
export function epgPerSpecies(records: SampleRecord[]): Record<EggSpecies, number> {
  const counts: Record<EggSpecies, number> = {
    [EggSpecies.Ascaris]: 0,
    [EggSpecies.Trichuris]: 0,
    [EggSpecies.Hookworm]: 0,
    [EggSpecies.Other]: 0,
  };
  for (const record of records.filter(isValidatedRecord)) {
    for (const detection of record.detections.filter(isCountableDetection)) {
      counts[effectiveSpecies(detection)] += 1;
    }
  }
  return {
    [EggSpecies.Ascaris]: epgFromCount(counts[EggSpecies.Ascaris]),
    [EggSpecies.Trichuris]: epgFromCount(counts[EggSpecies.Trichuris]),
    [EggSpecies.Hookworm]: epgFromCount(counts[EggSpecies.Hookworm]),
    [EggSpecies.Other]: epgFromCount(counts[EggSpecies.Other]),
  };
}

/** Average, highest and lowest validated EPG over the validated records. */
export interface EpgSummary {
  sampleCount: number;
  averageEpg: number;
  highestEpg: number;
  lowestEpg: number;
}

export function summariseEpg(records: SampleRecord[]): EpgSummary {
  const validated = records.filter(isValidatedRecord);
  if (validated.length === 0) {
    return { sampleCount: 0, averageEpg: 0, highestEpg: 0, lowestEpg: 0 };
  }
  const values = validated.map((record) => record.validatedEpg);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    sampleCount: validated.length,
    averageEpg: Math.round(total / validated.length),
    highestEpg: Math.max(...values),
    lowestEpg: Math.min(...values),
  };
}

/** Headline counters for the administrative dashboard's summary cards. */
export interface DashboardSummary {
  totalSamplesProcessed: number;
  pendingValidation: number;
  positiveSamples: number;
  /** Share of validated samples with at least one confirmed egg, `0..1`. */
  positivityRate: number;
}

export function summariseDashboard(records: SampleRecord[]): DashboardSummary {
  const validated = records.filter(isValidatedRecord);
  const positive = validated.filter((record) => record.validatedEggCount > 0);
  return {
    totalSamplesProcessed: records.length,
    pendingValidation: records.filter((record) => !isValidatedRecord(record)).length,
    positiveSamples: positive.length,
    positivityRate: validated.length === 0 ? 0 : positive.length / validated.length,
  };
}

/** One bucket of the EPG trend chart: a calendar day, split by species. */
export interface EpgTrendPoint {
  /** `YYYY-MM-DD`, in UTC. */
  date: string;
  epgBySpecies: Record<EggSpecies, number>;
  totalEpg: number;
}

/**
 * Groups validated records into per-day, per-species EPG buckets, sorted
 * ascending by date. Days with no validated record are absent rather than zero:
 * a gap in surveillance is not the same claim as a day with no eggs.
 */
export function epgTrend(records: SampleRecord[]): EpgTrendPoint[] {
  const byDate = new Map<string, SampleRecord[]>();
  for (const record of records.filter(isValidatedRecord)) {
    const date = record.sample.capturedAt.slice(0, 10);
    const bucket = byDate.get(date);
    if (bucket) bucket.push(record);
    else byDate.set(date, [record]);
  }
  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, bucket]) => {
      const epgBySpecies = epgPerSpecies(bucket);
      const totalEpg = Object.values(epgBySpecies).reduce((sum, value) => sum + value, 0);
      return { date, epgBySpecies, totalEpg };
    });
}

/** Confirmed-egg share per species, for the parasite distribution panel. */
export interface SpeciesDistributionSlice {
  species: EggSpecies;
  eggCount: number;
  /** Share of all confirmed eggs, `0..1`. Zero when nothing was counted. */
  share: number;
}

export function speciesDistribution(records: SampleRecord[]): SpeciesDistributionSlice[] {
  const counts = new Map<EggSpecies, number>();
  for (const record of records.filter(isValidatedRecord)) {
    for (const detection of record.detections.filter(isCountableDetection)) {
      const species = effectiveSpecies(detection);
      counts.set(species, (counts.get(species) ?? 0) + 1);
    }
  }
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  return [...counts.entries()]
    .map(([species, eggCount]) => ({
      species,
      eggCount,
      share: total === 0 ? 0 : eggCount / total,
    }))
    .sort((left, right) => right.eggCount - left.eggCount);
}
