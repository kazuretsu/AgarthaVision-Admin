import { describe, expect, it } from "vitest";
import { DetectionVerdict } from "./enums";
import {
  DEFAULT_TRAINING_FILTER,
  TRAINING_SPLITS,
  buildTrainingSet,
  clipToFrame,
  labelFrame,
  splitFor,
  type TrainingBox,
  type TrainingDetectionSource,
  type TrainingFilter,
  type TrainingFrameSource,
} from "./training-data";

// The bucket is the first eight hex digits mod 100.
const KEY_A = "0000000a000000000000000000000000"; // 10: test at 15/15
const KEY_B = "00000013000000000000000000000000"; // 19: val
const KEY_C = "00000050000000000000000000000000"; // 80: train

function detection(
  verdict: DetectionVerdict,
  classLabel: string,
  options: Partial<TrainingDetectionSource> = {},
): TrainingDetectionSource {
  return {
    verdict,
    classLabel,
    expertClass: null,
    linked: true,
    box: [100, 100, 40, 30],
    modelBox: [100, 100, 40, 30],
    ...options,
  };
}

function frame(
  sampleId: string,
  detections: TrainingDetectionSource[],
  options: Partial<TrainingFrameSource> = {},
): TrainingFrameSource {
  return {
    sampleId,
    patientKey: KEY_C,
    organizationId: "org-1",
    labCode: "LAB-AAAAAA",
    modelVersion: "yolo-v1",
    needsReannotation: false,
    isManual: false,
    hasPredictions: true,
    detections,
    ...options,
  };
}

const filter = (overrides: Partial<TrainingFilter> = {}): TrainingFilter => ({
  ...DEFAULT_TRAINING_FILTER,
  ...overrides,
});

describe("labelFrame — the label rules", () => {
  it("keeps a confirmed model box as a label, untouched or not", () => {
    const outcome = labelFrame(
      frame("s", [detection(DetectionVerdict.Confirmed, "Ascaris")]),
      filter(),
    );
    expect(outcome.excluded).toBeNull();
    expect(outcome.labels).toEqual([
      {
        class: "Ascaris lumbricoides",
        x: 100,
        y: 100,
        w: 40,
        h: 30,
        verdict: DetectionVerdict.Confirmed,
        modelClass: "Ascaris",
        origin: "kept",
      },
    ]);
  });

  it("labels a wrong class with the medtech's species, keeping what the model said", () => {
    const outcome = labelFrame(
      frame("s", [
        detection(DetectionVerdict.WrongClass, "Hookworm", { expertClass: "trichuris" }),
      ]),
      filter(),
    );
    expect(outcome.labels[0]).toMatchObject({
      class: "Trichuris trichiura",
      modelClass: "Hookworm",
      origin: "kept",
    });
  });

  it("labels a redrawn box where the medtech drew it", () => {
    const outcome = labelFrame(
      frame("s", [
        detection(DetectionVerdict.BoxIncorrect, "Hookworm", {
          box: [300, 310, 50, 50],
          modelBox: [200, 200, 20, 20],
        }),
      ]),
      filter(),
    );
    expect(outcome.labels[0]).toMatchObject({ x: 300, y: 310, w: 50, h: 50, origin: "redrawn" });
  });

  it("labels an egg the medtech added", () => {
    const outcome = labelFrame(
      frame("s", [
        detection(DetectionVerdict.Confirmed, "Hookworm", { linked: false, modelBox: null }),
      ]),
      filter(),
    );
    expect(outcome.labels[0]).toMatchObject({ origin: "added", modelClass: null });
  });

  it("calls a box unknown when the frame predates predictions", () => {
    const outcome = labelFrame(
      frame("s", [detection(DetectionVerdict.Confirmed, "Hookworm", { linked: false })], {
        hasPredictions: false,
      }),
      filter(),
    );
    expect(outcome.labels[0]?.origin).toBe("unknown");
  });

  it("makes a rejected box a hard negative at the model's position, not a label", () => {
    const outcome = labelFrame(
      frame("s", [
        detection(DetectionVerdict.FalsePositive, "Ascaris", {
          box: [1, 1, 1, 1],
          modelBox: [50, 60, 20, 20],
        }),
      ]),
      filter(),
    );
    expect(outcome.labels).toEqual([]);
    expect(outcome.hardNegatives).toEqual([{ modelClass: "Ascaris", x: 50, y: 60, w: 20, h: 20 }]);
    expect(outcome.excluded).toBeNull();
  });

  it("omits hard negatives when they are switched off", () => {
    const outcome = labelFrame(
      frame("s", [detection(DetectionVerdict.FalsePositive, "Ascaris")]),
      filter({ includeHardNegatives: false }),
    );
    expect(outcome.hardNegatives).toEqual([]);
  });

  it("counts a rejection with no box anywhere as dropped", () => {
    const outcome = labelFrame(
      frame("s", [
        detection(DetectionVerdict.FalsePositive, "Ascaris", { box: null, modelBox: null }),
      ]),
      filter(),
    );
    expect(outcome.dropped.rejection_without_box).toBe(1);
    expect(outcome.hardNegatives).toEqual([]);
  });

  it("leaves out a frame where an egg was counted but never boxed", () => {
    const outcome = labelFrame(
      frame("s", [
        detection(DetectionVerdict.Confirmed, "Ascaris"),
        detection(DetectionVerdict.BoxIncorrect, "Ascaris", { box: null }),
      ]),
      filter(),
    );
    expect(outcome.excluded).toBe("counted_without_box");
  });

  it("keeps a frame with an unboxed egg when asked, with its boxes and the count it lacks", () => {
    const outcome = labelFrame(
      frame("s", [
        detection(DetectionVerdict.Confirmed, "Ascaris"),
        detection(DetectionVerdict.Confirmed, "Ascaris", { box: null, linked: false }),
        detection(DetectionVerdict.BoxIncorrect, "Hookworm", { box: null }),
      ]),
      filter({ includeUnboxed: true }),
    );
    expect(outcome.excluded).toBeNull();
    expect(outcome.labels).toHaveLength(1);
    expect(outcome.unboxed).toBe(2);
  });

  it("does not call a frame whose only eggs are unboxed background", () => {
    const onlyUnboxed = frame("s", [
      detection(DetectionVerdict.Confirmed, "Ascaris", { box: null }),
    ]);
    const kept = labelFrame(
      onlyUnboxed,
      filter({ includeUnboxed: true, includeBackground: false }),
    );
    expect(kept.excluded).toBeNull();
    expect(kept.unboxed).toBe(1);
  });

  it("still leaves out a frame with an unboxed egg and another reason", () => {
    const outcome = labelFrame(
      frame("s", [
        detection(DetectionVerdict.Confirmed, "Ascaris", { box: null }),
        detection(DetectionVerdict.Confirmed, "mystery"),
      ]),
      filter({ includeUnboxed: true }),
    );
    expect(outcome.excluded).toBe("unrecognised_class");
  });

  it("leaves out a frame with a species the model is not trained on, and names it", () => {
    const outcome = labelFrame(
      frame("s", [
        detection(DetectionVerdict.Confirmed, "Ascaris"),
        detection(DetectionVerdict.Confirmed, "test egg"),
      ]),
      filter(),
    );
    expect(outcome.excluded).toBe("unrecognised_class");
    expect(outcome.unrecognised).toEqual(["test egg"]);
  });

  it("does not let a rejected odd label exclude the frame", () => {
    const outcome = labelFrame(
      frame("s", [detection(DetectionVerdict.FalsePositive, "test egg")]),
      filter(),
    );
    expect(outcome.excluded).toBeNull();
  });

  it("leaves out frames flagged for re-annotation unless asked for", () => {
    const flagged = frame("s", [detection(DetectionVerdict.Confirmed, "Ascaris")], {
      needsReannotation: true,
    });
    expect(labelFrame(flagged, filter()).excluded).toBe("needs_reannotation");
    expect(labelFrame(flagged, filter({ includeReannotation: true })).excluded).toBeNull();
  });

  it("keeps a frame with no egg as background unless switched off", () => {
    const empty = frame("s", []);
    expect(labelFrame(empty, filter()).excluded).toBeNull();
    expect(labelFrame(empty, filter({ includeBackground: false })).excluded).toBe(
      "background_not_included",
    );
  });

  it("drops the boxes of a species not selected and keeps the frame", () => {
    const outcome = labelFrame(
      frame("s", [
        detection(DetectionVerdict.Confirmed, "Ascaris"),
        detection(DetectionVerdict.Confirmed, "Hookworm", { box: null }),
        detection(DetectionVerdict.Confirmed, "Hookworm"),
      ]),
      filter({ classes: ["Ascaris lumbricoides"] }),
    );
    expect(outcome.excluded).toBeNull();
    expect(outcome.labels.map((label) => label.class)).toEqual(["Ascaris lumbricoides"]);
    expect(outcome.dropped.species_not_selected).toBe(2);
  });

  it("clips a box that pokes past an edge and leaves out one wholly outside", () => {
    const edge = labelFrame(
      frame("s", [detection(DetectionVerdict.Confirmed, "Ascaris", { box: [630, 10, 40, 40] })]),
      filter(),
    );
    expect(edge.labels[0]).toMatchObject({ x: 625, y: 15, w: 30, h: 30 });

    const outside = labelFrame(
      frame("s", [detection(DetectionVerdict.Confirmed, "Ascaris", { box: [700, 700, 10, 10] })]),
      filter(),
    );
    expect(outside.excluded).toBe("box_outside_frame");
  });

  it("names a frame's first reason in a fixed order", () => {
    const outcome = labelFrame(
      frame(
        "s",
        [
          detection(DetectionVerdict.Confirmed, "Ascaris", { box: null }),
          detection(DetectionVerdict.Confirmed, "mystery"),
        ],
        { needsReannotation: true },
      ),
      filter(),
    );
    expect(outcome.excluded).toBe("needs_reannotation");
  });
});

describe("clipToFrame", () => {
  it("keeps a box inside the frame as it is", () => {
    expect(clipToFrame([320, 320, 64, 32])).toEqual([320, 320, 64, 32]);
  });

  it("refuses a box with no size or a non-number", () => {
    const bad: TrainingBox[] = [
      [10, 10, 0, 5],
      [10, 10, -4, 5],
      [Number.NaN, 10, 5, 5],
    ];
    for (const box of bad) expect(clipToFrame(box)).toBeNull();
  });

  it("clips the full frame to itself", () => {
    expect(clipToFrame([320, 320, 800, 800])).toEqual([320, 320, 640, 640]);
  });
});

describe("splitFor — by patient, deterministic", () => {
  it("puts the lowest buckets in test, then validation, then training", () => {
    expect(splitFor(KEY_A)).toBe("test");
    expect(splitFor(KEY_B)).toBe("val");
    expect(splitFor(KEY_C)).toBe("train");
  });

  it("gives the same answer every time", () => {
    expect(splitFor(KEY_B, 15, 15)).toBe(splitFor(KEY_B, 15, 15));
  });

  it("never moves a test patient when the validation share changes", () => {
    for (let bucket = 0; bucket < 100; bucket += 1) {
      const key = bucket.toString(16).padStart(8, "0") + "0".repeat(24);
      if (splitFor(key, 15, 15) === "test") expect(splitFor(key, 30, 15)).toBe("test");
    }
  });

  it("splits a hundred evenly spread patients 70/15/15", () => {
    const tally = { train: 0, val: 0, test: 0 };
    for (let bucket = 0; bucket < 100; bucket += 1) {
      tally[splitFor(bucket.toString(16).padStart(8, "0") + "0".repeat(24))] += 1;
    }
    expect(tally).toEqual({ train: 70, val: 15, test: 15 });
  });

  it("refuses a key that is not hex", () => {
    expect(() => splitFor("patient-1")).toThrow();
  });
});

describe("buildTrainingSet", () => {
  const frames: TrainingFrameSource[] = [
    frame("a1", [detection(DetectionVerdict.Confirmed, "Ascaris")], { patientKey: KEY_A }),
    frame(
      "a2",
      [
        detection(DetectionVerdict.WrongClass, "Ascaris", { expertClass: "Hookworm" }),
        detection(DetectionVerdict.FalsePositive, "Trichuris"),
      ],
      { patientKey: KEY_A, modelVersion: "yolo-v2" },
    ),
    frame("b1", [], { patientKey: KEY_B, organizationId: "org-2", labCode: "LAB-BBBBBB" }),
    frame("c1", [detection(DetectionVerdict.Confirmed, "Ascaris", { box: null })]),
    frame("c2", [detection(DetectionVerdict.Confirmed, "draft")]),
    frame("c3", [detection(DetectionVerdict.Confirmed, "Trichuris")], { needsReannotation: true }),
    frame("c4", [
      detection(DetectionVerdict.Confirmed, "Trichuris"),
      detection(DetectionVerdict.Confirmed, "Trichuris"),
    ]),
  ];

  it("keeps a patient's frames in one split and counts what the rules say", () => {
    const { items, summary } = buildTrainingSet({ frames, deleted: 2 }, filter());

    expect(items.map((item) => [item.sampleId, item.split])).toEqual([
      ["a1", "test"],
      ["a2", "test"],
      ["b1", "val"],
      ["c4", "train"],
    ]);
    expect(summary).toMatchObject({
      frames: 4,
      boxes: 4,
      background: 1,
      hardNegatives: 1,
      patients: 3,
      splits: {
        train: { frames: 1, background: 0, boxes: 2, patients: 1 },
        val: { frames: 1, background: 1, boxes: 0, patients: 1 },
        test: { frames: 2, background: 0, boxes: 2, patients: 1 },
      },
      excludedFrames: [
        { reason: "deleted_duplicate", frames: 2 },
        { reason: "needs_reannotation", frames: 1 },
        { reason: "unrecognised_class", frames: 1 },
        { reason: "counted_without_box", frames: 1 },
      ],
      unrecognisedClasses: ["draft"],
    });
    expect(summary.classes).toEqual([
      { class: "Ascaris lumbricoides", boxes: { train: 0, val: 0, test: 1 } },
      { class: "Trichuris trichiura", boxes: { train: 2, val: 0, test: 0 } },
      { class: "Hookworm", boxes: { train: 0, val: 0, test: 1 } },
    ]);
    expect(summary.modelVersions).toEqual([
      { modelVersion: "yolo-v1", frames: 3, boxes: 3 },
      { modelVersion: "yolo-v2", frames: 1, boxes: 1 },
    ]);
    expect(summary.labs).toEqual([
      { labCode: "LAB-AAAAAA", organizationId: "org-1", frames: 3, boxes: 4 },
      { labCode: "LAB-BBBBBB", organizationId: "org-2", frames: 1, boxes: 0 },
    ]);
  });

  it("counts frames kept with unboxed eggs as incomplete, not background", () => {
    const { items, summary } = buildTrainingSet(
      { frames, deleted: 0 },
      filter({ includeUnboxed: true }),
    );
    const c1 = items.find((item) => item.sampleId === "c1");
    expect(c1).toMatchObject({ split: "train", unboxedEggs: 1, labels: [] });
    expect(summary).toMatchObject({ frames: 5, background: 1, incomplete: 1, unboxedEggs: 1 });
    expect(summary.splits.train).toMatchObject({ frames: 2, background: 0, incomplete: 1 });
    expect(summary.excludedFrames.map((row) => row.reason)).not.toContain("counted_without_box");
  });

  it("no patient key lands in two splits", () => {
    const { items } = buildTrainingSet({ frames, deleted: 0 }, filter());
    for (const split of TRAINING_SPLITS) {
      const here = new Set(items.filter((item) => item.split === split).map((i) => i.patientKey));
      for (const other of TRAINING_SPLITS.filter((name) => name !== split)) {
        for (const item of items.filter((candidate) => candidate.split === other)) {
          expect(here.has(item.patientKey)).toBe(false);
        }
      }
    }
  });

  it("reports nothing left out when nothing is", () => {
    const { summary } = buildTrainingSet({ frames: [frames[0]!], deleted: 0 }, filter());
    expect(summary.excludedFrames).toEqual([]);
    expect(summary.droppedBoxes).toEqual([]);
  });
});
