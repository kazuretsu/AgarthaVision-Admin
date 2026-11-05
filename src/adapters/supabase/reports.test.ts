import { describe, expect, it } from "vitest";
import { REPORT_COLUMNS, type ReportRow, toReport } from "./reports";

const SESSION = "00000000-0000-4000-8000-0000000000a1";
const PATIENT = "00000000-0000-4000-8000-0000000000b1";

function row(overrides: Partial<ReportRow>): ReportRow {
  return {
    id: "00000000-0000-4000-8000-0000000000c1",
    report_type: "session",
    session_id: SESSION,
    patient_id: null,
    session_ids: null,
    user_id: "00000000-0000-4000-8000-0000000000d1",
    generated_at: "2026-10-05T01:00:00Z",
    total_samples: 3,
    total_eggs_confirmed: 4,
    positive_species: ["Ascaris lumbricoides"],
    lpf_per_species: { "Ascaris lumbricoides": { min: 0, max: 4 } },
    csv_file_path: null,
    pdf_file_path: "u/r.pdf",
    ...overrides,
  };
}

describe("toReport — the two scopes of app 0015", () => {
  it("reads a session report as before", () => {
    expect(toReport(row({}))).toMatchObject({
      reportType: "session",
      sessionId: SESSION,
      patientId: null,
      sessionIds: null,
      totalEggsConfirmed: 4,
      lpfPerSpecies: { "Ascaris lumbricoides": { min: 0, max: 4 } },
    });
  });

  it("reads a patient report with the sessions it pooled", () => {
    const report = toReport(
      row({
        report_type: "patient",
        session_id: null,
        patient_id: PATIENT,
        session_ids: [SESSION, "00000000-0000-4000-8000-0000000000a2"],
      }),
    );
    expect(report).toMatchObject({
      reportType: "patient",
      sessionId: null,
      patientId: PATIENT,
      sessionIds: [SESSION, "00000000-0000-4000-8000-0000000000a2"],
    });
  });

  it("skips a report_type it does not know instead of guessing", () => {
    expect(toReport(row({ report_type: "barangay" }))).toBeNull();
  });

  it("skips a row whose ids contradict its type", () => {
    expect(toReport(row({ report_type: "patient", patient_id: null }))).toBeNull();
    expect(
      toReport(row({ report_type: "session", session_id: null, patient_id: PATIENT })),
    ).toBeNull();
  });

  it("selects every column 0015 added", () => {
    for (const column of ["report_type", "session_id", "patient_id", "session_ids"]) {
      expect(REPORT_COLUMNS.split(", ")).toContain(column);
    }
  });
});
