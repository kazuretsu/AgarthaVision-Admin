import { describe, expect, it } from "vitest";
import {
  aggregateLpfPerSpecies,
  boxProvenance,
  canonicalSpecies,
  formatLpfRange,
  formatLpfReading,
  isBinomial,
  lpfDescriptor,
  parasiteBurdenLevel,
  speciesRows,
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

describe("parasiteBurdenLevel (parity with ParasiteBurdenLevel.forDescriptor)", () => {
  it("maps every descriptor band", () => {
    expect(parasiteBurdenLevel("rare")).toBe("low");
    expect(parasiteBurdenLevel("few")).toBe("low");
    expect(parasiteBurdenLevel("moderate")).toBe("moderate");
    expect(parasiteBurdenLevel("numerous")).toBe("high");
  });

  it("has no burden for a species never seen", () => {
    expect(parasiteBurdenLevel(null)).toBeNull();
  });

  // The app's "ParasiteBurdenLevel maps correctly from LpfDensity" case: the
  // worst field decides, through the descriptor.
  it("reads the worst field, as LpfDensity.burdenLevel does", () => {
    const burden = (max: number) => parasiteBurdenLevel(lpfDescriptor(max));
    expect(burden(0)).toBeNull();
    expect(burden(2)).toBe("low");
    expect(burden(5)).toBe("low");
    expect(burden(10)).toBe("moderate");
    expect(burden(12)).toBe("high");
  });
});

describe("formatLpfReading", () => {
  it("writes the app's Session Detail line", () => {
    expect(formatLpfReading("rare")).toBe("Rare · Low Burden");
    expect(formatLpfReading("few")).toBe("Few · Low Burden");
    expect(formatLpfReading("moderate")).toBe("Moderate · Moderate Burden");
    expect(formatLpfReading("numerous")).toBe("Numerous · High Burden");
  });

  it("writes nothing for a species never seen", () => {
    expect(formatLpfReading(null)).toBeNull();
  });

  it("never names a WHO tier or an infection intensity", () => {
    for (const descriptor of ["rare", "few", "moderate", "numerous"] as const) {
      expect(formatLpfReading(descriptor)).not.toMatch(/WHO|DOH|intensity|light|heavy/i);
    }
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

  it("gives a session never read no species, so no descriptor and no burden", () => {
    const summary = summariseSession({ samples: [], detections: [], findings: [] });
    expect(summary.fieldCount).toBe(0);
    expect(summary.lpf).toEqual({});
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

describe("speciesRows", () => {
  const range = (min: number, max: number) => ({ min, max, descriptor: lpfDescriptor(max) });

  it("joins a range stored under an alias to the eggs counted under the canonical name", () => {
    const rows = speciesRows({
      lpf: { ascaris_lumbricoides: range(0, 4) },
      eggCounts: [{ species: "Ascaris lumbricoides", count: 4 }],
    });
    expect(rows).toEqual([{ species: "Ascaris lumbricoides", lpf: range(0, 4), eggs: 4 }]);
  });

  it("keeps a range with no counted eggs, and eggs with no range", () => {
    const rows = speciesRows({
      lpf: { Hookworm: range(0, 1) },
      eggCounts: [{ species: "Trichuris trichiura", count: 2 }],
    });
    expect(rows).toEqual([
      { species: "Hookworm", lpf: range(0, 1), eggs: 0 },
      { species: "Trichuris trichiura", lpf: null, eggs: 2 },
    ]);
  });

  it("never merges two stored spellings that each carry a range", () => {
    const rows = speciesRows({
      lpf: { Ascaris: range(0, 2), "Ascaris lumbricoides": range(1, 3) },
      eggCounts: [{ species: "Ascaris lumbricoides", count: 5 }],
    });
    expect(rows).toEqual([
      { species: "Ascaris", lpf: range(0, 2), eggs: 0 },
      { species: "Ascaris lumbricoides", lpf: range(1, 3), eggs: 5 },
    ]);
  });

  it("gives the eggs a row of their own when no stored spelling is canonical", () => {
    const rows = speciesRows({
      lpf: { Ascaris: range(0, 2), ascaris_lumbricoides: range(1, 3) },
      eggCounts: [{ species: "Ascaris lumbricoides", count: 5 }],
    });
    expect(rows.map((row) => row.species)).toEqual([
      "Ascaris",
      "Ascaris lumbricoides",
      "ascaris_lumbricoides",
    ]);
    expect(new Set(rows.map((row) => row.species)).size).toBe(rows.length);
  });

  it("is empty for a wholly negative session", () => {
    expect(speciesRows({ lpf: {}, eggCounts: [] })).toEqual([]);
  });
});
