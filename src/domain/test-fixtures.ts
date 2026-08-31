import type { Detection, Sample, SampleRecord } from "./entities";
import { DetectionVerdict, EggSpecies } from "./enums";
import { composeSampleRecord } from "./epg";

/**
 * Fixture builders for domain tests. Every field has a deterministic default so
 * a test states only the thing it is actually about.
 */

export function makeSample(overrides: Partial<Sample> = {}): Sample {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    sessionId: "22222222-2222-4222-8222-222222222222",
    userId: "33333333-3333-4333-8333-333333333333",
    capturedAt: "2026-03-01T08:00:00.000Z",
    verifiedAt: "2026-03-01T08:00:12.400Z",
    gpsLatitude: null,
    gpsLongitude: null,
    gpsAccuracy: null,
    storagePath: "33333333-3333-4333-8333-333333333333/11111111-1111-4111-8111-111111111111.jpg",
    inferenceModelVersion: "sth-yolo-1.4.0",
    needsReannotation: false,
    isManual: false,
    userNote: null,
    ...overrides,
  };
}

let detectionSeq = 0;

export function makeDetection(overrides: Partial<Detection> = {}): Detection {
  detectionSeq += 1;
  return {
    id: `detection-${detectionSeq}`,
    sampleId: "11111111-1111-4111-8111-111111111111",
    classLabel: EggSpecies.Ascaris,
    confidence: 0.9,
    bboxX: 0.1,
    bboxY: 0.1,
    bboxW: 0.2,
    bboxH: 0.2,
    verdict: DetectionVerdict.Confirmed,
    expertClass: null,
    ...overrides,
  };
}

export function makeRecord(
  sample: Partial<Sample> = {},
  detections: Detection[] = [makeDetection()],
): SampleRecord {
  return composeSampleRecord({
    sample: makeSample(sample),
    detections,
    owner: { id: "33333333-3333-4333-8333-333333333333", fullName: "M. Santos" },
    sessionLabel: "Smear 01",
  });
}
