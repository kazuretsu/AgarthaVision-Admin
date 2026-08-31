import { describe, expect, it } from "vitest";
import { DetectionVerdict } from "./enums";
import {
  RESEARCH_MATRIX_COLUMNS,
  buildResearchMatrix,
  escapeCsvField,
  formatConfidence,
  formatProcessingTime,
  toResearchMatrixCsv,
  toResearchMatrixJson,
  toResearchMatrixRow,
} from "./research-matrix";
import { makeDetection, makeRecord } from "./test-fixtures";

describe("RESEARCH_MATRIX_COLUMNS", () => {
  it("matches the column set and order specified by the SRS", () => {
    expect([...RESEARCH_MATRIX_COLUMNS]).toEqual([
      "Sample ID",
      "Detected Species / Class",
      "AI Confidence Score",
      "AI Calculated EPG",
      "Medical Technician Validated EPG",
      "Processing Time",
    ]);
  });
});

describe("formatProcessingTime", () => {
  it("renders sub-minute durations in seconds with one decimal", () => {
    expect(formatProcessingTime(12400)).toBe("12.4s");
  });

  it("renders longer durations as minutes and zero-padded seconds", () => {
    expect(formatProcessingTime(63000)).toBe("1m 03s");
  });

  it("renders an unmeasured duration as empty, never as zero", () => {
    expect(formatProcessingTime(null)).toBe("");
    expect(formatProcessingTime(-1)).toBe("");
  });
});

describe("formatConfidence", () => {
  it("renders three decimals and leaves an absent score empty", () => {
    expect(formatConfidence(0.8125)).toBe("0.813");
    expect(formatConfidence(null)).toBe("");
  });
});

describe("toResearchMatrixRow", () => {
  it("maps one record onto the six columns", () => {
    const record = makeRecord({}, [
      makeDetection({ confidence: 0.9 }),
      makeDetection({ confidence: 0.7, classLabel: "Hookworm" }),
      makeDetection({ confidence: 0.5, verdict: DetectionVerdict.FalsePositive }),
    ]);
    expect(toResearchMatrixRow(record)).toEqual({
      "Sample ID": "11111111-1111-4111-8111-111111111111",
      "Detected Species / Class": "Ascaris lumbricoides; Hookworm",
      "AI Confidence Score": "0.700",
      "AI Calculated EPG": "72",
      "Medical Technician Validated EPG": "48",
      "Processing Time": "12.4s",
    });
  });
});

describe("buildResearchMatrix", () => {
  it("excludes unvalidated records by default", () => {
    const validated = makeRecord({ id: "a" });
    const pending = makeRecord({ id: "b", verifiedAt: null });
    const flagged = makeRecord({ id: "c", needsReannotation: true });
    const rows = buildResearchMatrix([validated, pending, flagged]);
    expect(rows.map((row) => row["Sample ID"])).toEqual(["a"]);
  });

  it("includes unvalidated records only when explicitly asked", () => {
    const validated = makeRecord({ id: "a" });
    const pending = makeRecord({ id: "b", verifiedAt: null });
    const rows = buildResearchMatrix([validated, pending], { includeUnvalidated: true });
    expect(rows).toHaveLength(2);
    expect(rows[1]["Processing Time"]).toBe("");
  });
});

describe("escapeCsvField", () => {
  it("leaves a plain field untouched", () => {
    expect(escapeCsvField("Hookworm")).toBe("Hookworm");
  });

  it("quotes separators, newlines and doubles inner quotes", () => {
    expect(escapeCsvField("Ascaris, Trichuris")).toBe('"Ascaris, Trichuris"');
    expect(escapeCsvField('say "yes"')).toBe('"say ""yes"""');
    expect(escapeCsvField("line\nbreak")).toBe('"line\nbreak"');
  });
});

describe("toResearchMatrixCsv", () => {
  it("writes the exact header row and one CRLF-terminated line per record", () => {
    const csv = toResearchMatrixCsv(buildResearchMatrix([makeRecord({ id: "a" })]));
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "Sample ID,Detected Species / Class,AI Confidence Score,AI Calculated EPG," +
        "Medical Technician Validated EPG,Processing Time",
    );
    expect(lines[1]).toBe("a,Ascaris lumbricoides,0.900,24,24,12.4s");
    expect(lines[2]).toBe("");
  });

  it("emits a header-only file for an empty matrix", () => {
    expect(toResearchMatrixCsv([]).split("\r\n")).toHaveLength(2);
  });
});

describe("toResearchMatrixJson", () => {
  it("serialises the same columns in the same order as the CSV header", () => {
    const json = toResearchMatrixJson(buildResearchMatrix([makeRecord({ id: "a" })]));
    const parsed = JSON.parse(json) as Record<string, string>[];
    expect(Object.keys(parsed[0])).toEqual([...RESEARCH_MATRIX_COLUMNS]);
    expect(parsed[0]["Medical Technician Validated EPG"]).toBe("24");
  });
});
