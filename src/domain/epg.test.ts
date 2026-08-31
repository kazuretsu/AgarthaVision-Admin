import { describe, expect, it } from "vitest";
import { DetectionVerdict, EggSpecies, ValidationStatus } from "./enums";
import {
  EPG_MULTIPLIER,
  composeSampleRecord,
  deriveValidationStatus,
  effectiveSpecies,
  epgFromCount,
  epgPerSpecies,
  epgTrend,
  isCountableDetection,
  speciesDistribution,
  summariseDashboard,
  summariseEpg,
} from "./epg";
import { makeDetection, makeRecord, makeSample } from "./test-fixtures";

describe("epgFromCount", () => {
  it("multiplies the confirmed egg count by the DOH volumetric multiplier", () => {
    expect(EPG_MULTIPLIER).toBe(24);
    expect(epgFromCount(3)).toBe(72);
  });

  it("reports zero eggs as zero EPG rather than a floor value", () => {
    expect(epgFromCount(0)).toBe(0);
  });
});

describe("isCountableDetection", () => {
  it("counts only confirmed detections", () => {
    expect(isCountableDetection(makeDetection({ verdict: DetectionVerdict.Confirmed }))).toBe(true);
    expect(isCountableDetection(makeDetection({ verdict: DetectionVerdict.FalsePositive }))).toBe(
      false,
    );
    expect(isCountableDetection(makeDetection({ verdict: DetectionVerdict.WrongClass }))).toBe(
      false,
    );
    expect(isCountableDetection(makeDetection({ verdict: DetectionVerdict.BoxIncorrect }))).toBe(
      false,
    );
  });
});

describe("effectiveSpecies", () => {
  it("prefers the expert correction over the model label", () => {
    const detection = makeDetection({
      classLabel: "ascaris_lumbricoides",
      expertClass: "Trichuris trichiura",
      verdict: DetectionVerdict.WrongClass,
    });
    expect(effectiveSpecies(detection)).toBe(EggSpecies.Trichuris);
  });

  it("falls back to Other for an unrecognised free-text label", () => {
    expect(effectiveSpecies(makeDetection({ classLabel: "Strongyloides" }))).toBe(EggSpecies.Other);
  });
});

describe("deriveValidationStatus", () => {
  it("treats an unverified sample as pending", () => {
    expect(deriveValidationStatus(makeSample({ verifiedAt: null }))).toBe(ValidationStatus.Pending);
  });

  it("treats a reannotation-flagged sample as flagged, not validated", () => {
    expect(deriveValidationStatus(makeSample({ needsReannotation: true }))).toBe(
      ValidationStatus.Flagged,
    );
  });

  it("treats a verified, unflagged sample as validated", () => {
    expect(deriveValidationStatus(makeSample())).toBe(ValidationStatus.Validated);
  });
});

describe("composeSampleRecord", () => {
  it("separates the model's EPG from the human-validated EPG", () => {
    const record = composeSampleRecord({
      sample: makeSample(),
      detections: [
        makeDetection(),
        makeDetection(),
        makeDetection({ verdict: DetectionVerdict.FalsePositive }),
      ],
      owner: null,
      sessionLabel: null,
    });
    expect(record.aiEggCount).toBe(3);
    expect(record.aiEpg).toBe(72);
    expect(record.validatedEggCount).toBe(2);
    expect(record.validatedEpg).toBe(48);
  });

  it("averages model confidence across every detection, rejected ones included", () => {
    const record = composeSampleRecord({
      sample: makeSample(),
      detections: [
        makeDetection({ confidence: 0.8 }),
        makeDetection({ confidence: 0.6, verdict: DetectionVerdict.FalsePositive }),
      ],
      owner: null,
      sessionLabel: null,
    });
    expect(record.meanConfidence).toBeCloseTo(0.7, 10);
  });

  it("leaves confidence null when the sample has no detections at all", () => {
    const record = composeSampleRecord({
      sample: makeSample(),
      detections: [],
      owner: null,
      sessionLabel: null,
    });
    expect(record.meanConfidence).toBeNull();
    expect(record.validatedEpg).toBe(0);
  });

  it("measures processing time from capture to verification", () => {
    const record = makeRecord();
    expect(record.processingTimeMs).toBe(12400);
  });

  it("leaves processing time null when the sample was never verified", () => {
    const record = makeRecord({ verifiedAt: null });
    expect(record.processingTimeMs).toBeNull();
  });
});

describe("epgPerSpecies", () => {
  it("attributes confirmed eggs to the expert-corrected species", () => {
    const record = makeRecord({}, [
      makeDetection(),
      makeDetection({ classLabel: "Hookworm" }),
      makeDetection({ classLabel: "Hookworm", verdict: DetectionVerdict.FalsePositive }),
    ]);
    const result = epgPerSpecies([record]);
    expect(result[EggSpecies.Ascaris]).toBe(24);
    expect(result[EggSpecies.Hookworm]).toBe(24);
    expect(result[EggSpecies.Trichuris]).toBe(0);
  });

  it("excludes pending and flagged records from aggregation", () => {
    const pending = makeRecord({ verifiedAt: null });
    const flagged = makeRecord({ needsReannotation: true });
    const result = epgPerSpecies([pending, flagged]);
    expect(result[EggSpecies.Ascaris]).toBe(0);
  });
});

describe("summariseEpg", () => {
  it("reports average, highest and lowest over validated records only", () => {
    const light = makeRecord({ id: "a" }, [makeDetection()]);
    const heavy = makeRecord({ id: "b" }, [makeDetection(), makeDetection(), makeDetection()]);
    const pending = makeRecord({ id: "c", verifiedAt: null }, [
      makeDetection(),
      makeDetection(),
      makeDetection(),
      makeDetection(),
      makeDetection(),
    ]);
    const summary = summariseEpg([light, heavy, pending]);
    expect(summary.sampleCount).toBe(2);
    expect(summary.highestEpg).toBe(72);
    expect(summary.lowestEpg).toBe(24);
    expect(summary.averageEpg).toBe(48);
  });

  it("returns zeroes rather than NaN when nothing is validated", () => {
    expect(summariseEpg([])).toEqual({
      sampleCount: 0,
      averageEpg: 0,
      highestEpg: 0,
      lowestEpg: 0,
    });
  });
});

describe("summariseDashboard", () => {
  it("counts pending validation separately and rates positivity over validated only", () => {
    const positive = makeRecord({ id: "a" });
    const negative = makeRecord({ id: "b" }, [
      makeDetection({ verdict: DetectionVerdict.FalsePositive }),
    ]);
    const pending = makeRecord({ id: "c", verifiedAt: null });
    const summary = summariseDashboard([positive, negative, pending]);
    expect(summary.totalSamplesProcessed).toBe(3);
    expect(summary.pendingValidation).toBe(1);
    expect(summary.positiveSamples).toBe(1);
    expect(summary.positivityRate).toBeCloseTo(0.5, 10);
  });
});

describe("epgTrend", () => {
  it("buckets by capture day, sorts ascending, and omits days with no data", () => {
    const day1 = makeRecord({ id: "a", capturedAt: "2026-03-02T09:00:00.000Z" });
    const day2 = makeRecord({ id: "b", capturedAt: "2026-03-01T09:00:00.000Z" }, [
      makeDetection({ classLabel: "Trichuris trichiura" }),
    ]);
    const trend = epgTrend([day1, day2]);
    expect(trend.map((point) => point.date)).toEqual(["2026-03-01", "2026-03-02"]);
    expect(trend[0].epgBySpecies[EggSpecies.Trichuris]).toBe(24);
    expect(trend[1].totalEpg).toBe(24);
  });
});

describe("speciesDistribution", () => {
  it("ranks species by confirmed egg count and shares sum to one", () => {
    const record = makeRecord({}, [
      makeDetection(),
      makeDetection(),
      makeDetection({ classLabel: "Hookworm" }),
    ]);
    const distribution = speciesDistribution([record]);
    expect(distribution[0].species).toBe(EggSpecies.Ascaris);
    expect(distribution[0].eggCount).toBe(2);
    const total = distribution.reduce((sum, slice) => sum + slice.share, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("returns an empty distribution rather than dividing by zero", () => {
    expect(speciesDistribution([])).toEqual([]);
  });
});
