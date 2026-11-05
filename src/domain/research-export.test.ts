import { describe, expect, it } from "vitest";
import type { SessionSummary } from "./clinical";
import type { SmearRecord } from "./dashboard";
import {
  RESEARCH_EXPORT_COLUMNS,
  buildResearchExport,
  escapeCsvField,
  toResearchExportCsv,
  toResearchExportJson,
  toResearchExportRow,
} from "./research-export";

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return { fieldCount: 10, eggCounts: [], totalEggs: 0, lpf: {}, isPositive: false, ...overrides };
}

function smear(overrides: Partial<SmearRecord> = {}): SmearRecord {
  return {
    sessionId: "session-1",
    patientId: "patient-1",
    startedAt: "2026-09-01T17:30:00Z",
    barangayCode: "0722217001",
    summary: summary(),
    ...overrides,
  };
}

describe("RESEARCH_EXPORT_COLUMNS", () => {
  it("carries no EPG column and no personal detail", () => {
    const joined = RESEARCH_EXPORT_COLUMNS.join("|").toLowerCase();
    expect(joined).not.toContain("epg");
    expect(joined).not.toContain("name");
    expect(joined).not.toContain("birth");
  });
});

describe("toResearchExportRow", () => {
  it("writes each known species' range, descriptor and eggs", () => {
    const row = toResearchExportRow(
      smear({
        summary: summary({
          isPositive: true,
          totalEggs: 7,
          eggCounts: [{ species: "Ascaris lumbricoides", count: 7 }],
          lpf: { "Ascaris lumbricoides": { min: 0, max: 4, descriptor: "few" } },
        }),
      }),
    );
    expect(row["Ascaris lumbricoides LPF min"]).toBe("0");
    expect(row["Ascaris lumbricoides LPF max"]).toBe("4");
    expect(row["Ascaris lumbricoides descriptor"]).toBe("few");
    expect(row["Ascaris lumbricoides eggs counted"]).toBe("7");
    expect(row["Hookworm LPF max"]).toBe("0");
    expect(row["Hookworm descriptor"]).toBe("");
    expect(row.Result).toBe("positive");
  });

  it("dates the session in Manila", () => {
    expect(toResearchExportRow(smear())["Session date"]).toBe("2026-09-02");
  });

  it("lists species outside the three columns in one cell", () => {
    const row = toResearchExportRow(
      smear({
        summary: summary({
          eggCounts: [{ species: "Enterobius vermicularis", count: 2 }],
          lpf: { "Enterobius vermicularis": { min: 0, max: 2, descriptor: "rare" } },
        }),
      }),
    );
    expect(row["Other species"]).toBe("Enterobius vermicularis 0–2 LPF (2 eggs)");
  });
});

describe("buildResearchExport", () => {
  it("leaves out sessions never read and orders oldest first", () => {
    const rows = buildResearchExport([
      smear({ sessionId: "late", startedAt: "2026-09-10T00:00:00Z" }),
      smear({ sessionId: "unread", summary: summary({ fieldCount: 0 }) }),
      smear({ sessionId: "early", startedAt: "2026-09-02T00:00:00Z" }),
    ]);
    expect(rows.map((row) => row["Session ID"])).toEqual(["early", "late"]);
  });
});

describe("escapeCsvField", () => {
  it("quotes only when needed", () => {
    expect(escapeCsvField("plain")).toBe("plain");
    expect(escapeCsvField('a "b", c')).toBe('"a ""b"", c"');
  });

  it("neutralises spreadsheet formulas", () => {
    expect(escapeCsvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(escapeCsvField("-1+2")).toBe("'-1+2");
  });
});

describe("serialisation", () => {
  it("writes the header, CRLF endings and a trailing newline", () => {
    const csv = toResearchExportCsv(buildResearchExport([smear()]));
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(RESEARCH_EXPORT_COLUMNS.join(","));
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe("");
  });

  it("keeps JSON keys in column order", () => {
    const [first] = JSON.parse(toResearchExportJson(buildResearchExport([smear()])));
    expect(Object.keys(first)).toEqual([...RESEARCH_EXPORT_COLUMNS]);
  });
});
