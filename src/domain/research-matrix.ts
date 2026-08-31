import type { SampleRecord } from "./entities";
import { isValidatedRecord } from "./epg";

/**
 * The research-matrix export.
 *
 * The column set is fixed by the project's SRS and is not a UI preference: a
 * downstream analyst joins these files across deployments, so the labels, their
 * order and their spelling are a contract. Changing one is a schema change.
 */
export const RESEARCH_MATRIX_COLUMNS = [
  "Sample ID",
  "Detected Species / Class",
  "AI Confidence Score",
  "AI Calculated EPG",
  "Medical Technician Validated EPG",
  "Processing Time",
] as const;

export type ResearchMatrixColumn = (typeof RESEARCH_MATRIX_COLUMNS)[number];

/** One export row, keyed by the exact column labels so CSV and JSON cannot drift. */
export type ResearchMatrixRow = Record<ResearchMatrixColumn, string>;

export interface ResearchMatrixOptions {
  /**
   * Include records that are not human-validated. Off by default: pending and
   * flagged records are excluded from official aggregation, and an export is an
   * aggregation. Callers that flip this are producing a working file, not a
   * report, and must say so in the UI.
   */
  includeUnvalidated?: boolean;
}

/**
 * Formats a capture-to-verification duration. Seconds below a minute, `m s`
 * above it, and an empty cell rather than a zero when the sample is unverified —
 * a missing measurement must not read as a fast one.
 */
export function formatProcessingTime(milliseconds: number | null): string {
  if (milliseconds === null || milliseconds < 0) return "";
  const totalSeconds = milliseconds / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds - minutes * 60);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/** Mean model confidence to three decimals; empty when the sample had no detections. */
export function formatConfidence(meanConfidence: number | null): string {
  return meanConfidence === null ? "" : meanConfidence.toFixed(3);
}

/** Maps one record onto the six research-matrix columns. */
export function toResearchMatrixRow(record: SampleRecord): ResearchMatrixRow {
  return {
    "Sample ID": record.sample.id,
    "Detected Species / Class": record.detectedSpecies.join("; "),
    "AI Confidence Score": formatConfidence(record.meanConfidence),
    "AI Calculated EPG": String(record.aiEpg),
    "Medical Technician Validated EPG": String(record.validatedEpg),
    "Processing Time": formatProcessingTime(record.processingTimeMs),
  };
}

/** Builds the full matrix, validated-only unless explicitly told otherwise. */
export function buildResearchMatrix(
  records: SampleRecord[],
  options: ResearchMatrixOptions = {},
): ResearchMatrixRow[] {
  const source = options.includeUnvalidated ? records : records.filter(isValidatedRecord);
  return source.map(toResearchMatrixRow);
}

/** RFC 4180 escaping: quote a field only when it needs it, and double inner quotes. */
export function escapeCsvField(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

/** Serialises the matrix to CSV with the exact header row, CRLF line endings. */
export function toResearchMatrixCsv(rows: ResearchMatrixRow[]): string {
  const header = RESEARCH_MATRIX_COLUMNS.map(escapeCsvField).join(",");
  const body = rows.map((row) =>
    RESEARCH_MATRIX_COLUMNS.map((column) => escapeCsvField(row[column])).join(","),
  );
  return [header, ...body].join("\r\n") + "\r\n";
}

/** Serialises the matrix to JSON, same keys and same order as the CSV header. */
export function toResearchMatrixJson(rows: ResearchMatrixRow[]): string {
  return JSON.stringify(rows, RESEARCH_MATRIX_COLUMNS as unknown as string[], 2);
}
