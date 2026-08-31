import { describe, expect, it } from "vitest";
import { EggSpecies, EpgSeverity } from "./enums";
import { classifyEpg, classifyRecord, severitySplit } from "./severity";
import { makeDetection, makeRecord } from "./test-fixtures";

describe("classifyEpg", () => {
  it("classifies zero as none, not light", () => {
    expect(classifyEpg(EggSpecies.Ascaris, 0)).toBe(EpgSeverity.None);
  });

  it("uses species-specific bands rather than one shared scale", () => {
    // 3,000 EPG is light for Ascaris and heavy for Trichuris.
    expect(classifyEpg(EggSpecies.Ascaris, 3000)).toBe(EpgSeverity.Light);
    expect(classifyEpg(EggSpecies.Trichuris, 3000)).toBe(EpgSeverity.Moderate);
    expect(classifyEpg(EggSpecies.Hookworm, 3000)).toBe(EpgSeverity.Moderate);
  });

  it("treats each band boundary as inclusive at its lower edge", () => {
    expect(classifyEpg(EggSpecies.Ascaris, 4999)).toBe(EpgSeverity.Light);
    expect(classifyEpg(EggSpecies.Ascaris, 5000)).toBe(EpgSeverity.Moderate);
    expect(classifyEpg(EggSpecies.Ascaris, 49999)).toBe(EpgSeverity.Moderate);
    expect(classifyEpg(EggSpecies.Ascaris, 50000)).toBe(EpgSeverity.Heavy);
    expect(classifyEpg(EggSpecies.Hookworm, 1999)).toBe(EpgSeverity.Light);
    expect(classifyEpg(EggSpecies.Hookworm, 4000)).toBe(EpgSeverity.Heavy);
    expect(classifyEpg(EggSpecies.Trichuris, 999)).toBe(EpgSeverity.Light);
    expect(classifyEpg(EggSpecies.Trichuris, 10000)).toBe(EpgSeverity.Heavy);
  });

  it("refuses to assert a band for a species that has none published", () => {
    expect(classifyEpg(EggSpecies.Other, 100000)).toBe(EpgSeverity.Unclassified);
    expect(classifyEpg(EggSpecies.Other, 0)).toBe(EpgSeverity.None);
  });
});

describe("classifyRecord", () => {
  it("takes the worst species-specific burden on the frame", () => {
    // 42 Trichuris eggs = 1,008 EPG (moderate); 42 Ascaris eggs = 1,008 EPG (light).
    const detections = [
      ...Array.from({ length: 42 }, () => makeDetection({ classLabel: "Trichuris trichiura" })),
      ...Array.from({ length: 42 }, () => makeDetection()),
    ];
    expect(classifyRecord(makeRecord({}, detections))).toBe(EpgSeverity.Moderate);
  });

  it("classifies a sample with no confirmed eggs as none", () => {
    expect(classifyRecord(makeRecord({}, []))).toBe(EpgSeverity.None);
  });
});

describe("severitySplit", () => {
  it("splits validated records and leaves unvalidated ones out of the total", () => {
    const negative = makeRecord({ id: "a" }, []);
    const lightAscaris = makeRecord({ id: "b" }, [makeDetection()]);
    const heavyTrichuris = makeRecord(
      { id: "c" },
      Array.from({ length: 500 }, () => makeDetection({ classLabel: "Trichuris trichiura" })),
    );
    const pending = makeRecord({ id: "d", verifiedAt: null }, [makeDetection()]);
    const unclassified = makeRecord({ id: "e" }, [makeDetection({ classLabel: "Strongyloides" })]);

    const split = severitySplit([negative, lightAscaris, heavyTrichuris, pending, unclassified]);
    expect(split).toEqual({
      none: 1,
      light: 1,
      moderate: 0,
      heavy: 1,
      unclassified: 1,
      total: 4,
    });
  });
});
