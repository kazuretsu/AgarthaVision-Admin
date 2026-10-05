import type { Report } from "@/domain";

/**
 * `public.reports` as PostgREST returns it, after the app's `0015`: a row is a session
 * report or a patient report, never both (`reports_scope_check`).
 *
 * No page reads reports yet. This is the one place a row becomes a `Report`, so the
 * records view and the report verification page start from a mapping that already
 * matches the schema.
 */
export interface ReportRow {
  id: string;
  report_type: string;
  /** `0001`; nullable since `0015`. Set exactly when `report_type = 'session'`. */
  session_id: string | null;
  /** `0015`. Set exactly when `report_type = 'patient'`. */
  patient_id: string | null;
  /** `0015`. The sessions a patient report pooled. */
  session_ids: string[] | null;
  user_id: string;
  generated_at: string;
  total_samples: number;
  total_eggs_confirmed: number;
  positive_species: string[] | null;
  lpf_per_species: Record<string, { min: number; max: number }> | null;
  csv_file_path: string | null;
  pdf_file_path: string | null;
}

export const REPORT_COLUMNS =
  "id, report_type, session_id, patient_id, session_ids, user_id, generated_at, total_samples, total_eggs_confirmed, positive_species, lpf_per_species, csv_file_path, pdf_file_path";

/**
 * The row as a `Report`, or `null` when it is neither scope `0015` allows: an unknown
 * `report_type`, or a type whose id is missing. A caller skips a `null` rather than
 * guessing which report it was.
 */
export function toReport(row: ReportRow): Report | null {
  const base = {
    id: row.id,
    userId: row.user_id,
    generatedAt: row.generated_at,
    totalSamples: row.total_samples,
    totalEggsConfirmed: row.total_eggs_confirmed,
    positiveSpecies: row.positive_species ?? [],
    lpfPerSpecies: row.lpf_per_species ?? {},
    csvFilePath: row.csv_file_path,
    pdfFilePath: row.pdf_file_path,
  };

  if (row.report_type === "session" && row.session_id && !row.patient_id) {
    // `session_ids` is dropped: `reports_scope_check` does not forbid it on a session
    // report, but it means "the sessions a patient report pooled", and the app never sets
    // it on one. A session report's one session is `session_id`.
    return {
      ...base,
      reportType: "session",
      sessionId: row.session_id,
      patientId: null,
      sessionIds: null,
    };
  }
  if (row.report_type === "patient" && row.patient_id && !row.session_id) {
    return {
      ...base,
      reportType: "patient",
      sessionId: null,
      patientId: row.patient_id,
      sessionIds: row.session_ids,
    };
  }
  return null;
}
