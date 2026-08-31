import type { SampleRecord } from "./entities";
import type { EggSpecies, ValidationStatus } from "./enums";

/**
 * Advanced filters for the detailed records dashboard.
 *
 * Every field is optional and every range is inclusive on both ends. An absent
 * field means "do not constrain", never "zero" — the difference matters when a
 * range bound arrives empty from a form.
 */
export interface NumericRange {
  min?: number;
  max?: number;
}

export interface RecordFilter {
  /** Inclusive capture-date range, `YYYY-MM-DD`. */
  capturedFrom?: string;
  capturedTo?: string;
  /** Case-insensitive substring match on the sample UUID. */
  sampleId?: string;
  /** Empty or absent means every status. */
  validationStatuses?: ValidationStatus[];
  /** Empty or absent means every species. */
  species?: EggSpecies[];
  /** Mean model confidence, `0..1`. */
  confidence?: NumericRange;
  /** Human-validated EPG. */
  epg?: NumericRange;
  /** Capture-to-verification duration, in seconds. */
  processingTimeSeconds?: NumericRange;
  /** Restrict to one medtech's samples. */
  ownerId?: string;
}

function withinRange(value: number | null, range: NumericRange | undefined): boolean {
  if (!range) return true;
  if (value === null) return range.min === undefined && range.max === undefined;
  if (range.min !== undefined && value < range.min) return false;
  if (range.max !== undefined && value > range.max) return false;
  return true;
}

/** True when the record satisfies every constraint the filter actually sets. */
export function matchesFilter(record: SampleRecord, filter: RecordFilter): boolean {
  const capturedDate = record.sample.capturedAt.slice(0, 10);
  if (filter.capturedFrom && capturedDate < filter.capturedFrom) return false;
  if (filter.capturedTo && capturedDate > filter.capturedTo) return false;

  if (filter.sampleId) {
    const needle = filter.sampleId.trim().toLowerCase();
    if (needle.length > 0 && !record.sample.id.toLowerCase().includes(needle)) return false;
  }

  if (filter.ownerId && record.sample.userId !== filter.ownerId) return false;

  if (filter.validationStatuses?.length) {
    if (!filter.validationStatuses.includes(record.validationStatus)) return false;
  }

  if (filter.species?.length) {
    const hit = record.detectedSpecies.some((species) => filter.species?.includes(species));
    if (!hit) return false;
  }

  if (!withinRange(record.meanConfidence, filter.confidence)) return false;
  if (!withinRange(record.validatedEpg, filter.epg)) return false;

  const seconds = record.processingTimeMs === null ? null : record.processingTimeMs / 1000;
  if (!withinRange(seconds, filter.processingTimeSeconds)) return false;

  return true;
}

/** Applies a filter to a record set, preserving input order. */
export function applyFilter(records: SampleRecord[], filter: RecordFilter): SampleRecord[] {
  return records.filter((record) => matchesFilter(record, filter));
}
