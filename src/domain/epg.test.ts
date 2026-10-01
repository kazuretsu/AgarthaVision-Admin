import { describe, expect, it } from "vitest";
import { DetectionVerdict, EggSpecies, ValidationStatus } from "./enums";
import {
  EPG_MULTIPLIER,
  composeSampleRecord,
  deriveValidationStatus,
  effectiveSpecies,
  epgFromCount,
  isCountableDetection,
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
