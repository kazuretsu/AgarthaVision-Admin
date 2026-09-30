import { describe, expect, it } from "vitest";
import {
  aggregateLpfPerSpecies,
  boxProvenance,
  canonicalSpecies,
  formatLpfRange,
  isBinomial,
  lpfDescriptor,
  summariseSession,
} from "./clinical";
import { DetectionVerdict } from "./enums";

let next = 0;
const finding = (sampleId: string, species: string, eggCount: number) => ({
  sampleId,
  species,
  eggCount,
  id: `f${next++}`,
});

// Each case below is one of the app's LpfAggregationTest cases, so the two
// implementations are held to the same examples.
describe("aggregateLpfPerSpecies (parity with LpfAggregationTest)", () => {
  it("pulls the minimum to zero when a species is missing from some fields", () => {
    const result = aggregateLpfPerSpecies(
      [
        finding("s1", "Ascaris lumbricoides", 1),
        finding("s2", "Ascaris lumbricoides", 4),
        finding("s3", "Ascaris lumbricoides", 2),
      ],
      10,
    );
    expect(result["Ascaris lumbricoides"]).toEqual({ min: 0, max: 4, descriptor: "few" });
  });

  it("keeps the real minimum when the species is in every field", () => {
    const result = aggregateLpfPerSpecies(
      [finding("s1", "Hookworm", 3), finding("s2", "Hookworm", 5)],
      2,
    );
    expect(result.Hookworm).toMatchObject({ min: 3, max: 5 });
  });

  it("returns nothing for ten clean fields", () => {
    expect(aggregateLpfPerSpecies([], 10)).toEqual({});
  });

  it("keeps two species in one field as two ranges", () => {
    const result = aggregateLpfPerSpecies(
      [
        finding("s1", "Ascaris lumbricoides", 2),
        finding("s1", "Hookworm", 1),
        finding("s2", "Ascaris lumbricoides", 3),
      ],
      2,
    );
    expect(result["Ascaris lumbricoides"]).toMatchObject({ min: 2, max: 3 });
    expect(result.Hookworm).toMatchObject({ min: 0, max: 1 });
  });

  it("reads the descriptor off one heavy field among nine clean ones", () => {
    const result = aggregateLpfPerSpecies([finding("s10", "Trichuris trichiura", 12)], 10);
    expect(result["Trichuris trichiura"]).toEqual({ min: 0, max: 12, descriptor: "numerous" });
  });

  it("sums several rows for one species in one field", () => {
    const result = aggregateLpfPerSpecies(
      [finding("s1", "Ascaris lumbricoides", 4), finding("s1", "Ascaris lumbricoides", 3)],
      1,
    );
    expect(result["Ascaris lumbricoides"]).toMatchObject({ min: 7, max: 7 });
  });

  it("cannot invent a minimum from a field count smaller than the findings", () => {
    const result = aggregateLpfPerSpecies(
      [finding("s1", "Hookworm", 2), finding("s2", "Hookworm", 6), finding("s3", "Hookworm", 4)],
      1,
    );
    expect(result.Hookworm).toMatchObject({ min: 2, max: 6 });
  });
});

describe("lpfDescriptor (parity with LpfDescriptor.forMax)", () => {
  it("has no descriptor for a species never seen", () => {
    expect(lpfDescriptor(0)).toBeNull();
  });

  it("uses the app's band ceilings", () => {
    expect(lpfDescriptor(1)).toBe("rare");
    expect(lpfDescriptor(2)).toBe("rare");
    expect(lpfDescriptor(3)).toBe("few");
    expect(lpfDescriptor(4)).toBe("few");
    expect(lpfDescriptor(10)).toBe("moderate");
    expect(lpfDescriptor(11)).toBe("numerous");
    expect(lpfDescriptor(12)).toBe("numerous");
  });
});

describe("formatLpfRange", () => {
  it("writes the app's range string", () => {
    expect(formatLpfRange({ min: 0, max: 4 })).toBe("0–4 LPF");
  });
});

describe("canonicalSpecies", () => {
  it("maps the app's aliases onto canonical names", () => {
    expect(canonicalSpecies("ascaris")).toBe("Ascaris lumbricoides");
    expect(canonicalSpecies(" Trichuris ")).toBe("Trichuris trichiura");
    expect(canonicalSpecies("HOOKWORM")).toBe("Hookworm");
  });

  it("keeps an unknown species as written", () => {
    expect(canonicalSpecies("Enterobius vermicularis")).toBe("Enterobius vermicularis");
  });

  it("names a blank label rather than returning an empty string", () => {
    expect(canonicalSpecies("  ")).toBe("Unspecified");
  });
});

describe("isBinomial", () => {
  it("italicises binomials but not Hookworm", () => {
    expect(isBinomial("Ascaris lumbricoides")).toBe(true);
    expect(isBinomial("Hookworm")).toBe(false);
  });
});

const detection = (
  sampleId: string,
  verdict: DetectionVerdict,
  classLabel = "Ascaris lumbricoides",
  expertClass: string | null = null,
) => ({ sampleId, verdict, classLabel, expertClass });

describe("summariseSession", () => {
  it("counts every verdict except FALSE_POSITIVE", () => {
    const summary = summariseSession({
      samples: [{ id: "s1", deletedAt: null }],
      detections: [
        detection("s1", DetectionVerdict.Confirmed),
        detection("s1", DetectionVerdict.WrongClass, "Ascaris lumbricoides", "Hookworm"),
        detection("s1", DetectionVerdict.BoxIncorrect),
        detection("s1", DetectionVerdict.FalsePositive),
      ],
      findings: [],
    });
    expect(summary.totalEggs).toBe(3);
    expect(summary.eggCounts).toEqual([
      { species: "Ascaris lumbricoides", count: 2 },
      { species: "Hookworm", count: 1 },
    ]);
    expect(summary.isPositive).toBe(true);
  });

  it("drops everything on a deleted duplicate sample", () => {
    const summary = summariseSession({
      samples: [
        { id: "live", deletedAt: null },
        { id: "dup", deletedAt: "2026-09-01T00:00:00Z" },
      ],
      detections: [detection("dup", DetectionVerdict.Confirmed)],
      findings: [finding("dup", "Ascaris lumbricoides", 9)],
    });
    expect(summary).toEqual({
      fieldCount: 1,
      eggCounts: [],
      totalEggs: 0,
      lpf: {},
      isPositive: false,
    });
  });

  it("uses the live field count as the LPF denominator", () => {
    const summary = summariseSession({
      samples: [
        { id: "a", deletedAt: null },
        { id: "b", deletedAt: null },
        { id: "dup", deletedAt: "2026-09-01T00:00:00Z" },
      ],
      detections: [],
      findings: [finding("a", "Hookworm", 2), finding("dup", "Hookworm", 2)],
    });
    expect(summary.lpf.Hookworm).toMatchObject({ min: 0, max: 2 });
  });

  it("calls a session with only rejected detections negative", () => {
    const summary = summariseSession({
      samples: [{ id: "s1", deletedAt: null }],
      detections: [detection("s1", DetectionVerdict.FalsePositive)],
      findings: [],
    });
    expect(summary.isPositive).toBe(false);
  });
});

describe("boxProvenance (the table in 0004_predictions.sql)", () => {
  const box = { bboxX: 10, bboxY: 10, bboxW: 5, bboxH: 5 };
  const noBox = { bboxX: null, bboxY: null, bboxW: null, bboxH: null };
  const linkedFrame = { hasPredictions: true, isManual: false };

  it("reads a linked row with its box as the model's", () => {
    expect(
      boxProvenance(
        { predictionId: "p", verdict: DetectionVerdict.Confirmed, ...box },
        linkedFrame,
      ),
    ).toBe("model");
  });

  it("reads a linked BOX_INCORRECT row with a box as redrawn", () => {
    expect(
      boxProvenance(
        { predictionId: "p", verdict: DetectionVerdict.BoxIncorrect, ...box },
        linkedFrame,
      ),
    ).toBe("redrawn");
  });

  it("reads a linked row with no box as unlocated", () => {
    expect(
      boxProvenance(
        { predictionId: "p", verdict: DetectionVerdict.BoxIncorrect, ...noBox },
        linkedFrame,
      ),
    ).toBe("unlocated");
  });

  it("reads an unlinked row with a box on a linked frame as added", () => {
    expect(
      boxProvenance(
        { predictionId: null, verdict: DetectionVerdict.Confirmed, ...box },
        linkedFrame,
      ),
    ).toBe("added");
  });

  it("reads an unlinked row on a manual capture as added", () => {
    expect(
      boxProvenance(
        { predictionId: null, verdict: DetectionVerdict.Confirmed, ...box },
        { hasPredictions: false, isManual: true },
      ),
    ).toBe("added");
  });

  it("does not guess on a frame with no predictions at all", () => {
    expect(
      boxProvenance(
        { predictionId: null, verdict: DetectionVerdict.Confirmed, ...box },
        { hasPredictions: false, isManual: false },
      ),
    ).toBe("unknown");
  });
});
