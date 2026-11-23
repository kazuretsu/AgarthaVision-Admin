import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportCheckLink, ReportCheckOutcome } from "@/domain/report-check";
import { ReportCheckError, type ReportCheckPort } from "@/ports/report-check";
import { createRequestClient } from "./client";

/** A row of admin/0025's `console_check_report`. */
interface CheckRow {
  outcome: string;
  report_type: string | null;
  generated_at: string | null;
  laboratory_name: string | null;
  total_samples: number | null;
  total_eggs_confirmed: number | null;
  positive_species: string[] | null;
  lpf_per_species: Record<string, { min: number; max: number }> | null;
}

/**
 * The report check over the request's own client: signed out, that is the anon key, which
 * may call only `console_check_report` (admin/0025) and can read no `reports` row itself.
 */
export class SupabaseReportCheckAdapter implements ReportCheckPort {
  constructor(private readonly client: SupabaseClient) {}

  async checkReport(link: ReportCheckLink): Promise<ReportCheckOutcome> {
    const { data, error } = await this.client.rpc("console_check_report", {
      p_report_id: link.reportId,
      p_session_id: link.sessionId,
      p_patient_id: link.patientId,
      p_generated_at: link.generatedAtEpochSeconds,
    });
    if (error) throw new ReportCheckError(error);

    const row = ((data as CheckRow[] | null) ?? [])[0];
    if (!row) return { kind: "not_found" };
    if (row.outcome !== "confirmed") return { kind: "mismatch" };
    if (
      (row.report_type !== "session" && row.report_type !== "patient") ||
      row.generated_at === null
    ) {
      throw new ReportCheckError(new Error(`Unexpected check row: ${row.report_type}`));
    }
    return {
      kind: "confirmed",
      report: {
        reportType: row.report_type,
        generatedAt: row.generated_at,
        laboratoryName: row.laboratory_name,
        totalSamples: Number(row.total_samples ?? 0),
        totalEggsConfirmed: Number(row.total_eggs_confirmed ?? 0),
        positiveSpecies: row.positive_species ?? [],
        lpfPerSpecies: row.lpf_per_species ?? {},
      },
    };
  }
}

export async function createSupabaseReportCheck(): Promise<ReportCheckPort> {
  return new SupabaseReportCheckAdapter(await createRequestClient());
}
