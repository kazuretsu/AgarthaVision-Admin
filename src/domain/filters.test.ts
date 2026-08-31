import { describe, expect, it } from "vitest";
import { EggSpecies, ValidationStatus } from "./enums";
import { applyFilter, matchesFilter } from "./filters";
import { makeDetection, makeRecord } from "./test-fixtures";

const record = makeRecord(
  {
    id: "aaaa-1111",
    capturedAt: "2026-03-05T08:00:00.000Z",
    verifiedAt: "2026-03-05T08:00:12.400Z",
  },
  [makeDetection({ confidence: 0.8 })],
);

describe("matchesFilter", () => {
  it("matches everything when the filter is empty", () => {
    expect(matchesFilter(record, {})).toBe(true);
  });

  it("bounds the capture date inclusively at both ends", () => {
    expect(matchesFilter(record, { capturedFrom: "2026-03-05", capturedTo: "2026-03-05" })).toBe(
      true,
    );
    expect(matchesFilter(record, { capturedFrom: "2026-03-06" })).toBe(false);
    expect(matchesFilter(record, { capturedTo: "2026-03-04" })).toBe(false);
  });

  it("matches a sample id by case-insensitive substring", () => {
    expect(matchesFilter(record, { sampleId: "AAAA" })).toBe(true);
    expect(matchesFilter(record, { sampleId: "bbbb" })).toBe(false);
  });

  it("treats an empty status or species list as no constraint", () => {
    expect(matchesFilter(record, { validationStatuses: [], species: [] })).toBe(true);
  });

  it("filters on validation status", () => {
    expect(matchesFilter(record, { validationStatuses: [ValidationStatus.Validated] })).toBe(true);
    expect(matchesFilter(record, { validationStatuses: [ValidationStatus.Pending] })).toBe(false);
  });

  it("filters on any detected species, not all of them", () => {
    expect(matchesFilter(record, { species: [EggSpecies.Ascaris, EggSpecies.Hookworm] })).toBe(
      true,
    );
    expect(matchesFilter(record, { species: [EggSpecies.Hookworm] })).toBe(false);
  });

  it("bounds confidence, EPG and processing time inclusively", () => {
    expect(matchesFilter(record, { confidence: { min: 0.8, max: 0.8 } })).toBe(true);
    expect(matchesFilter(record, { confidence: { min: 0.81 } })).toBe(false);
    expect(matchesFilter(record, { epg: { min: 24, max: 24 } })).toBe(true);
    expect(matchesFilter(record, { epg: { max: 23 } })).toBe(false);
    expect(matchesFilter(record, { processingTimeSeconds: { min: 12, max: 13 } })).toBe(true);
    expect(matchesFilter(record, { processingTimeSeconds: { max: 12 } })).toBe(false);
  });

  it("excludes a record whose measurement is missing when a range is set", () => {
    const unverified = makeRecord({ id: "b", verifiedAt: null });
    expect(matchesFilter(unverified, { processingTimeSeconds: { max: 100 } })).toBe(false);
    expect(matchesFilter(unverified, {})).toBe(true);
  });

  it("filters on the owning medtech", () => {
    expect(matchesFilter(record, { ownerId: record.sample.userId })).toBe(true);
    expect(matchesFilter(record, { ownerId: "someone-else" })).toBe(false);
  });
});

describe("applyFilter", () => {
  it("preserves input order and drops non-matching records", () => {
    const other = makeRecord({ id: "bbbb-2222" });
    expect(applyFilter([record, other], { sampleId: "bbbb" })).toEqual([other]);
  });
});
