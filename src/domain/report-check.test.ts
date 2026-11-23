import { describe, expect, it } from "vitest";
import {
  checkedSpeciesRows,
  parseReportCheckLink,
  reportCheckAttemptKeys,
  reportTypeLabel,
  type CheckedReport,
} from "./report-check";

const REPORT = "3f2b8c1e-6a4d-4e2f-9b7a-1c2d3e4f5a6b";
const SESSION = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

describe("parseReportCheckLink (14zcqnty9bj)", () => {
  it("reads a session report link as the app builds it", () => {
    expect(parseReportCheckLink({ id: REPORT, session: SESSION, ts: "1795356305" })).toEqual({
      reportId: REPORT,
      sessionId: SESSION,
      patientId: null,
      generatedAtEpochSeconds: 1795356305,
    });
  });

  it("reads a patient report link, lower-casing the ids", () => {
    expect(
      parseReportCheckLink({ id: REPORT.toUpperCase(), patient: SESSION, ts: "1" }),
    ).toMatchObject({ reportId: REPORT, sessionId: null, patientId: SESSION });
  });

  it("AC5 treats a malformed link as no link", () => {
    const malformed = [
      {},
      { id: "not-a-uuid", session: SESSION, ts: "1" },
      { id: REPORT, ts: "1" },
      { id: REPORT, session: SESSION, patient: SESSION, ts: "1" },
      { id: REPORT, session: "x", ts: "1" },
      { id: REPORT, session: SESSION },
      { id: REPORT, session: SESSION, ts: "12.5" },
      { id: REPORT, session: SESSION, ts: "-1" },
      { id: REPORT, session: SESSION, ts: "1234567890123" },
      { id: [REPORT, REPORT], session: SESSION, ts: "1" },
    ];
    for (const params of malformed) expect(parseReportCheckLink(params)).toBeNull();
  });
});

function report(overrides: Partial<CheckedReport> = {}): CheckedReport {
  return {
    reportType: "session",
    generatedAt: "2026-11-22T14:05:05Z",
    laboratoryName: "Report Check Lab",
    totalSamples: 10,
    totalEggsConfirmed: 7,
    positiveSpecies: [],
    lpfPerSpecies: {},
    ...overrides,
  };
}

describe("checkedSpeciesRows", () => {
  it("AC2 lists each positive species with its stored range, alphabetically", () => {
    expect(
      checkedSpeciesRows(
        report({
          positiveSpecies: ["Trichuris trichiura", "Ascaris lumbricoides"],
          lpfPerSpecies: {
            "Ascaris lumbricoides": { min: 0, max: 4 },
            "Trichuris trichiura": { min: 1, max: 2 },
            Hookworm: { min: 0, max: 0 },
          },
        }),
      ),
    ).toEqual([
      { species: "Ascaris lumbricoides", range: "0–4 LPF" },
      { species: "Trichuris trichiura", range: "1–2 LPF" },
    ]);
  });

  it("is empty for a report with no parasites", () => {
    expect(checkedSpeciesRows(report({ lpfPerSpecies: { Hookworm: { min: 0, max: 0 } } }))).toEqual(
      [],
    );
  });

  it("says when a positive species has no stored range", () => {
    expect(checkedSpeciesRows(report({ positiveSpecies: ["Hookworm"] }))).toEqual([
      { species: "Hookworm", range: "Range not recorded" },
    ]);
  });
});

describe("report check labels and limits", () => {
  it("names both report types", () => {
    expect(reportTypeLabel("session")).toMatch(/Session report/);
    expect(reportTypeLabel("patient")).toMatch(/Patient report/);
  });

  it("AC6 counts failed checks per IP, apart from the sign-in forms' per-IP allowance", () => {
    expect(reportCheckAttemptKeys("203.0.113.9")).toEqual({
      kind: "report_check",
      email: "report-check:203.0.113.9",
      ip: null,
      invitationToken: null,
    });
    expect(reportCheckAttemptKeys(null).email).toBe("report-check:unknown");
  });
});
