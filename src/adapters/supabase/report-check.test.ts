import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { ReportCheckError } from "@/ports/report-check";
import { SupabaseReportCheckAdapter } from "./report-check";

const LINK = {
  reportId: "3f2b8c1e-6a4d-4e2f-9b7a-1c2d3e4f5a6b",
  sessionId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
  patientId: null,
  generatedAtEpochSeconds: 1795356305,
};

/** A visitor's client whose only call is the one RPC, answering as scripted. */
function client(rows: unknown[] | null, error: unknown = null) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const fake = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({ data: rows, error });
    },
    from() {
      throw new Error("the report check must not read a table directly");
    },
  };
  return { calls, adapter: new SupabaseReportCheckAdapter(fake as unknown as SupabaseClient) };
}

const CONFIRMED = {
  outcome: "confirmed",
  report_type: "session",
  generated_at: "2026-11-22T14:05:05.678+00:00",
  laboratory_name: "Report Check Lab",
  total_samples: 10,
  total_eggs_confirmed: 7,
  positive_species: ["Ascaris lumbricoides"],
  lpf_per_species: { "Ascaris lumbricoides": { min: 0, max: 4 } },
};

describe("SupabaseReportCheckAdapter (14zcqnty9bj)", () => {
  it("AC7 asks console_check_report with exactly the link's parts", async () => {
    const { calls, adapter } = client([CONFIRMED]);
    await adapter.checkReport(LINK);
    expect(calls).toEqual([
      {
        name: "console_check_report",
        args: {
          p_report_id: LINK.reportId,
          p_session_id: LINK.sessionId,
          p_patient_id: null,
          p_generated_at: 1795356305,
        },
      },
    ]);
  });

  it("AC2 maps a confirmed row to the report's stored findings", async () => {
    const { adapter } = client([CONFIRMED]);
    await expect(adapter.checkReport(LINK)).resolves.toEqual({
      kind: "confirmed",
      report: {
        reportType: "session",
        generatedAt: CONFIRMED.generated_at,
        laboratoryName: "Report Check Lab",
        totalSamples: 10,
        totalEggsConfirmed: 7,
        positiveSpecies: ["Ascaris lumbricoides"],
        lpfPerSpecies: { "Ascaris lumbricoides": { min: 0, max: 4 } },
      },
    });
  });

  it("AC4 maps a mismatch row to a mismatch, whatever else it carries", async () => {
    const { adapter } = client([{ ...CONFIRMED, outcome: "mismatch" }]);
    await expect(adapter.checkReport(LINK)).resolves.toEqual({ kind: "mismatch" });
  });

  it("AC5 maps no row to an unknown report", async () => {
    await expect(client([]).adapter.checkReport(LINK)).resolves.toEqual({ kind: "not_found" });
    await expect(client(null).adapter.checkReport(LINK)).resolves.toEqual({ kind: "not_found" });
  });

  it("turns a database error into a check that could not be made", async () => {
    const { adapter } = client(null, { code: "PGRST202", message: "function not found" });
    await expect(adapter.checkReport(LINK)).rejects.toBeInstanceOf(ReportCheckError);
  });
});
