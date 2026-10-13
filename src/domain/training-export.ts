import type { DetectionVerdict } from "./enums";
import {
  TRAINING_BOX_DROP_LABELS,
  TRAINING_FRAME_EXCLUSION_LABELS,
  TRAINING_FRAME_SIZE,
  TRAINING_SPLITS,
  type TrainingClass,
  type TrainingFilter,
  type TrainingHardNegative,
  type TrainingLabel,
  type TrainingSplit,
  type TrainingSummary,
} from "./training-data";

/**
 * The files of a training snapshot's zip, built from its frozen rows (admin/0012). Pure
 * functions: the route handler fetches the images and writes these beside them.
 *
 * Nothing written here names a patient, a medtech or a place. Frames are named by sample id;
 * the laboratory is an opaque code; the patient is a group code that means something only
 * inside this snapshot. The storage path, whose first part is the medtech's user id, is read
 * by the server to fetch the image and never written out.
 */

/** A snapshot as listed: what it is and how big. */
export interface TrainingSnapshotListing {
  id: string;
  name: string;
  createdByLabel: string | null;
  createdAt: string;
  frameCount: number;
  boxCount: number;
  summary: TrainingSummary | null;
}

/** One frozen frame. */
export interface TrainingSnapshotItem {
  sampleId: string;
  split: TrainingSplit;
  /** Server only: the image's object key. Never written into the zip. */
  storagePath: string;
  modelVersion: string;
  labCode: string;
  /** Frames of one patient share it, within this snapshot only. */
  patientGroup: string;
  needsReannotation: boolean;
  labels: TrainingLabel[];
  hardNegatives: TrainingHardNegative[];
}

export interface TrainingSnapshot extends TrainingSnapshotListing {
  filter: TrainingFilter;
  items: TrainingSnapshotItem[];
}

export function trainingImagePath(item: Pick<TrainingSnapshotItem, "split" | "sampleId">): string {
  return `images/${item.split}/${item.sampleId}.jpg`;
}

export function trainingLabelPath(item: Pick<TrainingSnapshotItem, "split" | "sampleId">): string {
  return `labels/${item.split}/${item.sampleId}.txt`;
}

const normalised = (pixels: number) => (pixels / TRAINING_FRAME_SIZE).toFixed(6);

/**
 * The frame's YOLO label file: one `class cx cy w h` line per label, each value between 0
 * and 1. A background frame's file is empty, which YOLO reads as "nothing here".
 */
export function toYoloLabels(
  labels: readonly TrainingLabel[],
  classes: readonly TrainingClass[],
): string {
  return labels
    .filter((label) => classes.includes(label.class))
    .map((label) =>
      [
        classes.indexOf(label.class),
        normalised(label.x),
        normalised(label.y),
        normalised(label.w),
        normalised(label.h),
      ].join(" "),
    )
    .map((line) => `${line}\n`)
    .join("");
}

/** Ultralytics' dataset file: split folders and class names in index order. */
export function toDataYaml(classes: readonly TrainingClass[]): string {
  return [
    "# AgarthaVision training snapshot. Paths are relative to this file.",
    "path: .",
    ...TRAINING_SPLITS.map((split) => `${split}: images/${split}`),
    `nc: ${classes.length}`,
    "names:",
    ...classes.map((name, index) => `  ${index}: ${name}`),
    "",
  ].join("\n");
}

const pixel = (value: number) => Math.round(value * 100) / 100;

/** The same labels in COCO form. Each image also carries its split, which COCO tools ignore. */
export function toCocoJson(
  snapshot: Pick<TrainingSnapshot, "id" | "name" | "createdAt">,
  items: readonly TrainingSnapshotItem[],
  classes: readonly TrainingClass[],
): string {
  let annotationId = 0;
  const images = items.map((item, index) => ({
    id: index + 1,
    file_name: trainingImagePath(item),
    width: TRAINING_FRAME_SIZE,
    height: TRAINING_FRAME_SIZE,
    split: item.split,
  }));
  const annotations = items.flatMap((item, index) =>
    item.labels
      .filter((label) => classes.includes(label.class))
      .map((label) => {
        annotationId += 1;
        const left = pixel(label.x - label.w / 2);
        const top = pixel(label.y - label.h / 2);
        return {
          id: annotationId,
          image_id: index + 1,
          category_id: classes.indexOf(label.class) + 1,
          bbox: [left, top, pixel(label.w), pixel(label.h)],
          area: pixel(label.w * label.h),
          iscrowd: 0,
        };
      }),
  );
  return JSON.stringify(
    {
      info: {
        description: `AgarthaVision training snapshot "${snapshot.name}"`,
        version: snapshot.id,
        date_created: snapshot.createdAt,
      },
      licenses: [],
      categories: classes.map((name, index) => ({ id: index + 1, name, supercategory: "egg" })),
      images,
      annotations,
    },
    null,
    2,
  );
}

interface ManifestLabel {
  class: TrainingClass;
  class_index: number;
  bbox: [number, number, number, number];
  origin: TrainingLabel["origin"];
  verdict: DetectionVerdict;
  model_class: string | null;
}

/** One JSON line per frame: its files, labels with where each box came from, hard negatives. */
export function toManifestLine(
  item: TrainingSnapshotItem,
  classes: readonly TrainingClass[],
): string {
  const labels: ManifestLabel[] = item.labels
    .filter((label) => classes.includes(label.class))
    .map((label) => ({
      class: label.class,
      class_index: classes.indexOf(label.class),
      bbox: [label.x, label.y, label.w, label.h],
      origin: label.origin,
      verdict: label.verdict,
      model_class: label.modelClass,
    }));
  return `${JSON.stringify({
    sample_id: item.sampleId,
    split: item.split,
    image: trainingImagePath(item),
    labels_file: trainingLabelPath(item),
    model_version: item.modelVersion,
    lab: item.labCode,
    patient_group: item.patientGroup,
    needs_reannotation: item.needsReannotation,
    labels,
    hard_negatives: item.hardNegatives.map((negative) => ({
      model_class: negative.modelClass,
      bbox: [negative.x, negative.y, negative.w, negative.h],
    })),
  })}\n`;
}

function table(header: string[], rows: (string | number)[][]): string[] {
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ];
}

/**
 * The data card: what the snapshot is, how it was chosen, what it holds and what it left out.
 * `written` are the frames whose image made it into the zip; `missing` are sample ids whose
 * image could not be read when it was downloaded.
 */
export function toDataCard(
  snapshot: Pick<TrainingSnapshot, "id" | "name" | "createdAt" | "filter" | "summary">,
  written: readonly TrainingSnapshotItem[],
  missing: readonly string[],
): string {
  const { filter } = snapshot;
  const summary = snapshot.summary;
  const counts = (split: TrainingSplit) => written.filter((item) => item.split === split);
  const lines: string[] = [
    `# ${snapshot.name}`,
    "",
    "An AgarthaVision training snapshot: microscopy frames of direct fecal smears, each",
    "640×640 pixels, with the soil-transmitted helminth eggs a medical technologist verified",
    "on it, frozen when the snapshot was made.",
    "",
    `- Snapshot: \`${snapshot.id}\``,
    `- Created: ${snapshot.createdAt}`,
    `- Frames in this file: ${written.length}`,
    `- Boxes in this file: ${written.reduce((total, item) => total + item.labels.length, 0)}`,
    "",
    "## Files",
    "",
    "- `images/{train,val,test}/<sample_id>.jpg`: the frames.",
    "- `labels/{train,val,test}/<sample_id>.txt`: YOLO labels, `class cx cy w h`, each value",
    "  divided by 640. An empty file is a background frame: no egg on it.",
    "- `data.yaml`: the class list in index order and the split folders.",
    "- `annotations.coco.json`: the same labels in COCO form, boxes in pixels.",
    "- `manifest.jsonl`: one line per frame with its split, model version, laboratory code,",
    "  patient group, labels in pixels with where each box came from (`kept`: the model's box",
    "  the medtech confirmed or reclassified; `redrawn`; `added` by the medtech; `unknown`: from",
    "  before the app recorded it), and hard negatives: boxes the model drew and the medtech",
    "  rejected, at the model's position. Hard negatives are not in the YOLO or COCO files.",
    "",
    "## Classes",
    "",
    ...table(
      ["Index", "Class", "Train", "Val", "Test"],
      filter.classes.map((name, index) => [
        index,
        name,
        ...TRAINING_SPLITS.map((split) =>
          counts(split).reduce(
            (total, item) => total + item.labels.filter((label) => label.class === name).length,
            0,
          ),
        ),
      ]),
    ),
    "",
    "## Splits",
    "",
    "By patient: every frame of one patient is in one split, so near-identical frames of the same",
    `smear never sit on both sides. Validation ${filter.valPercent}%, test ${filter.testPercent}%`,
    "of patients, the rest training. A patient's split comes from a fixed hash of their record,",
    "so they stay in the same split in every snapshot made with the same percentages.",
    "",
    ...table(
      ["Split", "Frames", "Background frames", "Boxes", "Patient groups"],
      TRAINING_SPLITS.map((split) => {
        const items = counts(split);
        return [
          split,
          items.length,
          items.filter((item) => item.labels.length === 0).length,
          items.reduce((total, item) => total + item.labels.length, 0),
          new Set(items.map((item) => item.patientGroup)).size,
        ];
      }),
    ),
    "",
    "## How the frames were chosen",
    "",
    `- Sessions started: ${filter.from ?? "any date"} to ${filter.to ?? "any date"} (Philippine time).`,
    `- Laboratories: ${filter.organizationIds.length === 0 ? "all" : `${filter.organizationIds.length} selected`}.`,
    `- Model versions: ${filter.modelVersions.length === 0 ? "all" : filter.modelVersions.join(", ")}.`,
    `- Frames flagged for re-annotation: ${filter.includeReannotation ? "included" : "left out"}.`,
    `- Background frames (no egg): ${filter.includeBackground ? "included" : "left out"}.`,
    `- Hard negatives in the manifest: ${filter.includeHardNegatives ? "included" : "left out"}.`,
    "",
    "Only verified frames exist on the server; a frame the medtech deleted as a duplicate is never",
    "used. An egg is labelled with the medtech's species where they corrected the model, and the",
    "model's otherwise. A frame goes in whole or not at all: one where an egg was counted but",
    "never boxed, a box falls outside the frame, or a species the model is not trained on",
    "appears, is left out, so no egg is ever taught as background.",
    "",
  ];

  if (summary) {
    lines.push(
      "## Model versions",
      "",
      ...table(
        ["Model version", "Frames", "Boxes"],
        summary.modelVersions.map((row) => [row.modelVersion, row.frames, row.boxes]),
      ),
      "",
      "## Laboratories",
      "",
      "Opaque codes. The same laboratory has the same code in every snapshot.",
      "",
      ...table(
        ["Laboratory", "Frames", "Boxes"],
        summary.labs.map((row) => [row.labCode, row.frames, row.boxes]),
      ),
      "",
      "## Left out",
      "",
    );
    if (summary.excludedFrames.length === 0 && summary.droppedBoxes.length === 0) {
      lines.push("Nothing.", "");
    } else {
      lines.push(
        ...table(
          ["Reason", "Count"],
          [
            ...summary.excludedFrames.map((row) => [
              `Frame: ${TRAINING_FRAME_EXCLUSION_LABELS[row.reason]}`,
              row.frames,
            ]),
            ...summary.droppedBoxes.map((row) => [
              `Box: ${TRAINING_BOX_DROP_LABELS[row.reason]}`,
              row.boxes,
            ]),
          ],
        ),
        "",
      );
    }
    if (summary.unrecognisedClasses.length > 0) {
      lines.push(
        `Species on left-out frames that the model is not trained on: ${summary.unrecognisedClasses.join(", ")}.`,
        "",
      );
    }
  }

  if (missing.length > 0) {
    lines.push(
      "## Missing images",
      "",
      `${missing.length} frame${missing.length === 1 ? "" : "s"} of the snapshot could not be read`,
      "from storage when this file was made, and are not in it, nor in any label file or the",
      "manifest:",
      "",
      ...missing.map((sampleId) => `- \`${sampleId}\``),
      "",
    );
  }

  lines.push(
    "## Privacy",
    "",
    "No patient name, birthdate, sex, barangay, session label, note or medtech identity is in",
    "this file. Frames are named by sample id. A patient group code links frames of one patient",
    "within this snapshot only. Use it for AgarthaVision model development; do not try to",
    "re-identify anyone.",
    "",
  );
  return lines.join("\n");
}
