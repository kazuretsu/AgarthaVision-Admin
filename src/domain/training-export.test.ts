import { describe, expect, it } from "vitest";
import { DetectionVerdict } from "./enums";
import { DEFAULT_TRAINING_FILTER, type TrainingSummary } from "./training-data";
import {
  toCocoJson,
  toDataCard,
  toDataYaml,
  toManifestLine,
  toYoloLabels,
  trainingImagePath,
  trainingLabelPath,
  type TrainingSnapshot,
  type TrainingSnapshotItem,
} from "./training-export";

const CLASSES = DEFAULT_TRAINING_FILTER.classes;
const USER_ID = "7d3f0c1e-1111-4222-8333-944455556666";

const item: TrainingSnapshotItem = {
  sampleId: "5a1e0000-0000-4000-8000-000000000001",
  split: "val",
  storagePath: `${USER_ID}/5a1e0000-0000-4000-8000-000000000001.jpg`,
  modelVersion: "yolo-v1",
  labCode: "LAB-3F9A2C",
  patientGroup: "a1b2c3d4e5f6",
  needsReannotation: false,
  labels: [
    {
      class: "Hookworm",
      x: 320,
      y: 160,
      w: 64,
      h: 32,
      verdict: DetectionVerdict.Confirmed,
      modelClass: "Hookworm",
      origin: "kept",
    },
    {
      class: "Ascaris lumbricoides",
      x: 20,
      y: 620,
      w: 40,
      h: 40,
      verdict: DetectionVerdict.WrongClass,
      modelClass: "Trichuris",
      origin: "kept",
    },
  ],
  hardNegatives: [{ modelClass: "Ascaris", x: 100, y: 100, w: 10, h: 10 }],
};

const summary: TrainingSummary = {
  frames: 1,
  boxes: 2,
  background: 0,
  hardNegatives: 1,
  patients: 1,
  splits: {
    train: { frames: 0, background: 0, boxes: 0, patients: 0 },
    val: { frames: 1, background: 0, boxes: 2, patients: 1 },
    test: { frames: 0, background: 0, boxes: 0, patients: 0 },
  },
  classes: [],
  modelVersions: [{ modelVersion: "yolo-v1", frames: 1, boxes: 2 }],
  labs: [{ labCode: "LAB-3F9A2C", organizationId: "org-secret-id", frames: 1, boxes: 2 }],
  excludedFrames: [{ reason: "counted_without_box", frames: 3 }],
  droppedBoxes: [],
  unrecognisedClasses: ["draft"],
};

const snapshot: TrainingSnapshot = {
  id: "c0ffee00-0000-4000-8000-000000000000",
  name: "Baseline October",
  createdByLabel: "Super Admin",
  createdAt: "2026-10-13T08:00:00.000Z",
  frameCount: 1,
  boxCount: 2,
  filter: { ...DEFAULT_TRAINING_FILTER, organizationIds: ["org-secret-id"] },
  summary,
  items: [item],
};

describe("training export files", () => {
  it("names files by split and sample id only", () => {
    expect(trainingImagePath(item)).toBe(`images/val/${item.sampleId}.jpg`);
    expect(trainingLabelPath(item)).toBe(`labels/val/${item.sampleId}.txt`);
  });

  it("writes YOLO lines with the class index and values between 0 and 1", () => {
    const text = toYoloLabels(item.labels, CLASSES);
    expect(text).toBe(
      "2 0.500000 0.250000 0.100000 0.050000\n0 0.031250 0.968750 0.062500 0.062500\n",
    );
    for (const line of text.trim().split("\n")) {
      const [, ...values] = line.split(" ").map(Number);
      for (const value of values) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("writes an empty label file for a background frame", () => {
    expect(toYoloLabels([], CLASSES)).toBe("");
  });

  it("indexes classes by the snapshot's own list", () => {
    expect(toYoloLabels(item.labels, ["Hookworm"])).toBe("0 0.500000 0.250000 0.100000 0.050000\n");
  });

  it("lists the classes in index order in data.yaml", () => {
    expect(toDataYaml(CLASSES)).toContain(
      "train: images/train\nval: images/val\ntest: images/test\nnc: 3\nnames:\n  0: Ascaris lumbricoides\n  1: Trichuris trichiura\n  2: Hookworm\n",
    );
  });

  it("writes COCO boxes as top-left corner and size, categories from 1", () => {
    const coco = JSON.parse(toCocoJson(snapshot, [item], CLASSES)) as {
      images: { id: number; file_name: string; width: number }[];
      annotations: { image_id: number; category_id: number; bbox: number[]; area: number }[];
      categories: { id: number; name: string }[];
    };
    expect(coco.images).toEqual([
      {
        id: 1,
        file_name: `images/val/${item.sampleId}.jpg`,
        width: 640,
        height: 640,
        split: "val",
      },
    ]);
    expect(coco.annotations[0]).toMatchObject({
      image_id: 1,
      category_id: 3,
      bbox: [288, 144, 64, 32],
      area: 2048,
    });
    expect(coco.categories.map((category) => category.id)).toEqual([1, 2, 3]);
  });

  it("writes one manifest line with labels, origins and hard negatives", () => {
    const line = toManifestLine(item, CLASSES);
    expect(line.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      sample_id: item.sampleId,
      split: "val",
      lab: "LAB-3F9A2C",
      patient_group: "a1b2c3d4e5f6",
      hard_negatives: [{ model_class: "Ascaris", bbox: [100, 100, 10, 10] }],
    });
    expect((parsed.labels as unknown[])[1]).toEqual({
      class: "Ascaris lumbricoides",
      class_index: 0,
      bbox: [20, 620, 40, 40],
      origin: "kept",
      verdict: "WRONG_CLASS",
      model_class: "Trichuris",
    });
  });

  it("never writes the storage path, the medtech's user id or a laboratory id", () => {
    const files = [
      toManifestLine(item, CLASSES),
      toCocoJson(snapshot, [item], CLASSES),
      toDataCard(snapshot, [item], []),
    ].join("\n");
    expect(files).not.toContain(USER_ID);
    expect(files).not.toContain("org-secret-id");
    expect(files).not.toContain("storage");
  });

  it("states the counts, the split rule, what was left out and what is missing", () => {
    const card = toDataCard(snapshot, [item], ["5a1e0000-0000-4000-8000-00000000dead"]);
    expect(card).toContain("# Baseline October");
    expect(card).toContain("| val | 1 | 0 | 2 | 1 |");
    expect(card).toContain("Validation 15%, test 15%");
    expect(card).toContain("| Frame: An egg was counted but never boxed | 3 |");
    expect(card).toContain("not trained on: draft.");
    expect(card).toContain("- Laboratories: 1 selected.");
    expect(card).toContain("`5a1e0000-0000-4000-8000-00000000dead`");
  });
});
