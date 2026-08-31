import { describe, expect, it } from "vitest";
import { EggSpecies, ValidationStatus } from "@/domain";
import { FILTER_KEYS, isEmptyFilter, parseRecordFilter, toSearchParams } from "./search-params";

describe("parseRecordFilter", () => {
  it("returns an all-undefined filter for an empty query", () => {
    const filter = parseRecordFilter(new URLSearchParams());
    expect(isEmptyFilter(filter)).toBe(true);
  });

  it("treats a blank value as absent, not as a filter for empty text", () => {
    // A submitted form sends every field, including the ones left untouched.
    const filter = parseRecordFilter(new URLSearchParams(`${FILTER_KEYS.sampleId}=%20%20`));
    expect(filter.sampleId).toBeUndefined();
    expect(isEmptyFilter(filter)).toBe(true);
  });

  it("keeps a one-sided range", () => {
    const filter = parseRecordFilter(new URLSearchParams(`${FILTER_KEYS.epgMin}=48`));
    expect(filter.epg).toEqual({ min: 48, max: undefined });
  });

  it("drops a non-numeric bound instead of coercing it to NaN", () => {
    // NaN would compare false against everything and silently empty the table.
    const filter = parseRecordFilter(new URLSearchParams(`${FILTER_KEYS.epgMin}=abc`));
    expect(filter.epg).toBeUndefined();
  });

  it("accepts zero as a real bound", () => {
    const filter = parseRecordFilter(new URLSearchParams(`${FILTER_KEYS.epgMin}=0`));
    expect(filter.epg).toEqual({ min: 0, max: undefined });
  });

  it("collects repeated enum values", () => {
    const params = new URLSearchParams();
    params.append(FILTER_KEYS.status, ValidationStatus.Validated);
    params.append(FILTER_KEYS.status, ValidationStatus.Pending);
    expect(parseRecordFilter(params).validationStatuses).toEqual([
      ValidationStatus.Validated,
      ValidationStatus.Pending,
    ]);
  });

  it("discards enum values the domain does not declare", () => {
    const params = new URLSearchParams();
    params.append(FILTER_KEYS.species, EggSpecies.Ascaris);
    params.append(FILTER_KEYS.species, "Loa loa");
    expect(parseRecordFilter(params).species).toEqual([EggSpecies.Ascaris]);
  });

  it("drops an enum list that is entirely unknown rather than matching nothing", () => {
    const params = new URLSearchParams();
    params.append(FILTER_KEYS.status, "deleted");
    expect(parseRecordFilter(params).validationStatuses).toBeUndefined();
  });
});

describe("toSearchParams", () => {
  it("expands array values into repeated keys", () => {
    const params = toSearchParams({ status: ["validated", "pending"], from: "2026-03-01" });
    expect(params.getAll("status")).toEqual(["validated", "pending"]);
    expect(params.get("from")).toBe("2026-03-01");
  });

  it("skips undefined entries", () => {
    expect([...toSearchParams({ from: undefined }).keys()]).toEqual([]);
  });
});
