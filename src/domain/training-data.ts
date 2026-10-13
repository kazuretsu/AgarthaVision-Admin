import { boxProvenance, detectionSpecies } from "./clinical";
import { DetectionVerdict } from "./enums";

/**
 * Model training data (14zcqntm62u): which verified frames and boxes become a training
 * snapshot, which split each frame lands in, and what was left out and why.
 *
 * The database selects the candidate frames (`console_training_frames()`, admin/0012): live
 * samples in the period, laboratories and model versions asked for, each with every detection
 * on it. This module applies the label rules to them. Pure functions only.
 *
 * Boxes are centre-x, centre-y, width and height in pixels on the 640×640 frame the app
 * captures, the same space as `detections.bbox_*` and `predictions.bbox_*`.
 *
 * The rules:
 * - A detection the medtech did not reject, with a box, of a selected species, is a label.
 *   Its class is the medtech's correction if any, else the model's, by canonical name. An
 *   untouched model box the medtech confirmed is a label like any other.
 * - A rejected detection (`FALSE_POSITIVE`) is a hard negative at the model's position. It is
 *   no label, so no YOLO line; the manifest lists it.
 * - A frame goes in whole or not at all. A frame where an egg was counted but never boxed, or
 *   where a box falls outside the frame, is left out: kept, that egg would teach the model it
 *   is background. So is a frame with a species the console does not train on, which may be
 *   anything, and a frame the medtech flagged as needing re-annotation, unless asked for.
 * - Asked for (`includeUnboxed`), a frame with eggs counted but never boxed goes in with the
 *   boxes it has, marked incomplete and with the number of unboxed eggs, so whoever trains on
 *   it can leave it out, keep it, or evaluate on it. Off by default.
 * - A frame with no label is a background image, included unless switched off. Boxes of a
 *   species not selected are dropped, and their frame stays: a detector for the selected
 *   species should learn that those eggs are not it.
 */

/** The classes a model is trained on, in their fixed index order. */
export const TRAINING_CLASSES = [
  "Ascaris lumbricoides",
  "Trichuris trichiura",
  "Hookworm",
] as const;
export type TrainingClass = (typeof TRAINING_CLASSES)[number];

export const TRAINING_SPLITS = ["train", "val", "test"] as const;
export type TrainingSplit = (typeof TRAINING_SPLITS)[number];

/** Every frame is 640×640; YOLO values are pixels divided by this. */
export const TRAINING_FRAME_SIZE = 640;

/** The most frames one snapshot holds. Under the zip format's 65,535-entry limit, with room. */
export const TRAINING_SNAPSHOT_LIMIT = 20_000;

/** A box as centre-x, centre-y, width, height, in pixels. */
export type TrainingBox = readonly [x: number, y: number, w: number, h: number];

export interface TrainingDetectionSource {
  verdict: DetectionVerdict;
  /** The model's label, or the medtech's for an egg they added. */
  classLabel: string;
  expertClass: string | null;
  /** The detection rules on a model prediction (`prediction_id` set). */
  linked: boolean;
  box: TrainingBox | null;
  /** The linked prediction's box: where the model put it. */
  modelBox: TrainingBox | null;
}

export interface TrainingFrameSource {
  sampleId: string;
  /** Opaque and stable: groups one patient's frames for the split. Never written out. */
  patientKey: string;
  organizationId: string | null;
  /** The laboratory as the file names it: `LAB-` and six hex digits, or `LAB-NONE`. */
  labCode: string;
  modelVersion: string;
  needsReannotation: boolean;
  isManual: boolean;
  hasPredictions: boolean;
  detections: TrainingDetectionSource[];
}

export interface TrainingFrames {
  frames: TrainingFrameSource[];
  /** Samples in the filter that were deleted as duplicates, never returned. */
  deleted: number;
}

export interface TrainingFilter {
  /** Inclusive Manila calendar dates, `YYYY-MM-DD`, bounding the session's start. */
  from?: string;
  to?: string;
  /** Empty means every laboratory. */
  organizationIds: string[];
  /** At least one; in {@link TRAINING_CLASSES} order. */
  classes: TrainingClass[];
  /** Empty means every model version. */
  modelVersions: string[];
  includeHardNegatives: boolean;
  includeReannotation: boolean;
  includeBackground: boolean;
  /** Keep frames with eggs counted but never boxed, marked incomplete. */
  includeUnboxed: boolean;
  /** Whole percentages of patients; the rest is training. */
  valPercent: number;
  testPercent: number;
}

export const DEFAULT_VAL_PERCENT = 15;
export const DEFAULT_TEST_PERCENT = 15;
/** Each held-out split is at most this share of patients. */
export const MAX_HELD_OUT_PERCENT = 40;

export const DEFAULT_TRAINING_FILTER: TrainingFilter = {
  organizationIds: [],
  classes: [...TRAINING_CLASSES],
  modelVersions: [],
  includeHardNegatives: true,
  includeReannotation: false,
  includeBackground: true,
  includeUnboxed: false,
  valPercent: DEFAULT_VAL_PERCENT,
  testPercent: DEFAULT_TEST_PERCENT,
};

/** Where a label's box came from, in the manifest's words. */
export type TrainingBoxOrigin = "kept" | "redrawn" | "added" | "unknown";

export interface TrainingLabel {
  class: TrainingClass;
  x: number;
  y: number;
  w: number;
  h: number;
  verdict: DetectionVerdict;
  /** What the model called it; `null` for an egg the medtech added. */
  modelClass: string | null;
  origin: TrainingBoxOrigin;
}

export interface TrainingHardNegative {
  modelClass: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TrainingItem {
  sampleId: string;
  split: TrainingSplit;
  patientKey: string;
  organizationId: string | null;
  labCode: string;
  modelVersion: string;
  needsReannotation: boolean;
  labels: TrainingLabel[];
  hardNegatives: TrainingHardNegative[];
  /**
   * Eggs of a selected species counted on this frame but never boxed. Above zero only when
   * `includeUnboxed` kept the frame: its labels are then incomplete.
   */
  unboxedEggs: number;
}

/** Why a whole frame was left out, in the order a frame's first reason is chosen. */
export const TRAINING_FRAME_EXCLUSIONS = [
  "deleted_duplicate",
  "needs_reannotation",
  "unrecognised_class",
  "counted_without_box",
  "box_outside_frame",
  "background_not_included",
] as const;
export type TrainingFrameExclusion = (typeof TRAINING_FRAME_EXCLUSIONS)[number];

export const TRAINING_FRAME_EXCLUSION_LABELS: Record<TrainingFrameExclusion, string> = {
  deleted_duplicate: "Deleted by the medtech as a duplicate",
  needs_reannotation: "Flagged as needing re-annotation",
  unrecognised_class: "Holds an egg of a species the model is not trained on",
  counted_without_box: "An egg was counted but never boxed",
  box_outside_frame: "A box lies outside the frame",
  background_not_included: "No egg to label, and background frames are off",
};

/** Boxes dropped from frames that stay in. */
export const TRAINING_BOX_DROPS = ["species_not_selected", "rejection_without_box"] as const;
export type TrainingBoxDrop = (typeof TRAINING_BOX_DROPS)[number];

export const TRAINING_BOX_DROP_LABELS: Record<TrainingBoxDrop, string> = {
  species_not_selected: "Eggs of a species not selected (the frame stays)",
  rejection_without_box: "Rejected boxes with no position to keep as a hard negative",
};

export interface TrainingSplitCounts {
  frames: number;
  background: number;
  /** Frames kept with eggs never boxed (`includeUnboxed`). Absent on snapshots before it. */
  incomplete?: number;
  boxes: number;
  patients: number;
}

export interface TrainingSummary {
  frames: number;
  boxes: number;
  background: number;
  /** Frames kept with eggs never boxed, and those eggs. Absent on snapshots before them. */
  incomplete?: number;
  unboxedEggs?: number;
  hardNegatives: number;
  patients: number;
  splits: Record<TrainingSplit, TrainingSplitCounts>;
  classes: { class: TrainingClass; boxes: Record<TrainingSplit, number> }[];
  modelVersions: { modelVersion: string; frames: number; boxes: number }[];
  labs: { labCode: string; organizationId: string | null; frames: number; boxes: number }[];
  excludedFrames: { reason: TrainingFrameExclusion; frames: number }[];
  droppedBoxes: { reason: TrainingBoxDrop; boxes: number }[];
  /** Species named on excluded frames that are not training classes, as written. */
  unrecognisedClasses: string[];
}

export function isTrainingClass(value: string): value is TrainingClass {
  return (TRAINING_CLASSES as readonly string[]).includes(value);
}

/**
 * The split a patient's frames land in, from the first eight hex digits of their key: a
 * bucket from 0 to 99. Test takes the lowest buckets and validation the next, so the same
 * patient stays in the same split in every snapshot with the same percentages, and raising
 * the validation share never moves a test patient.
 */
export function splitFor(
  patientKey: string,
  valPercent: number = DEFAULT_VAL_PERCENT,
  testPercent: number = DEFAULT_TEST_PERCENT,
): TrainingSplit {
  const head = patientKey.slice(0, 8);
  if (!/^[0-9a-f]{8}$/i.test(head)) throw new Error("A patient key starts with eight hex digits.");
  const bucket = Number.parseInt(head, 16) % 100;
  if (bucket < testPercent) return "test";
  if (bucket < testPercent + valPercent) return "val";
  return "train";
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The box clipped to the frame, or `null` when less than a pixel of it lies inside. A box
 * that pokes past an edge keeps the part on the frame, which is what a training run reads.
 */
export function clipToFrame(box: TrainingBox): TrainingBox | null {
  const [x, y, w, h] = box;
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  const left = Math.max(0, x - w / 2);
  const top = Math.max(0, y - h / 2);
  const right = Math.min(TRAINING_FRAME_SIZE, x + w / 2);
  const bottom = Math.min(TRAINING_FRAME_SIZE, y + h / 2);
  if (right - left < 1 || bottom - top < 1) return null;
  return [
    round((left + right) / 2),
    round((top + bottom) / 2),
    round(right - left),
    round(bottom - top),
  ];
}

function originOf(
  detection: TrainingDetectionSource,
  frame: Pick<TrainingFrameSource, "hasPredictions" | "isManual">,
): TrainingBoxOrigin {
  const [bboxX, bboxY, bboxW, bboxH] = detection.box ?? [null, null, null, null];
  const provenance = boxProvenance(
    {
      predictionId: detection.linked ? "linked" : null,
      verdict: detection.verdict,
      bboxX,
      bboxY,
      bboxW,
      bboxH,
    },
    frame,
  );
  switch (provenance) {
    case "model":
      return "kept";
    case "redrawn":
      return "redrawn";
    case "added":
      return "added";
    default:
      return "unknown";
  }
}

export interface FrameOutcome {
  labels: TrainingLabel[];
  hardNegatives: TrainingHardNegative[];
  /** Set when the whole frame is left out. */
  excluded: TrainingFrameExclusion | null;
  /** Eggs of a selected species counted but never boxed. */
  unboxed: number;
  dropped: Record<TrainingBoxDrop, number>;
  unrecognised: string[];
}

/** The label rules for one frame. */
export function labelFrame(
  frame: TrainingFrameSource,
  filter: Pick<
    TrainingFilter,
    | "classes"
    | "includeHardNegatives"
    | "includeReannotation"
    | "includeBackground"
    | "includeUnboxed"
  >,
): FrameOutcome {
  const labels: TrainingLabel[] = [];
  const hardNegatives: TrainingHardNegative[] = [];
  const reasons = new Set<TrainingFrameExclusion>();
  const dropped: Record<TrainingBoxDrop, number> = {
    species_not_selected: 0,
    rejection_without_box: 0,
  };
  const unrecognised: string[] = [];
  let unboxed = 0;

  if (frame.needsReannotation && !filter.includeReannotation) reasons.add("needs_reannotation");

  for (const detection of frame.detections) {
    if (detection.verdict === DetectionVerdict.FalsePositive) {
      const box = clipToFrame(detection.modelBox ?? detection.box ?? [0, 0, 0, 0]);
      if (!box) {
        dropped.rejection_without_box += 1;
      } else if (filter.includeHardNegatives) {
        const [x, y, w, h] = box;
        hardNegatives.push({ modelClass: detection.classLabel.trim(), x, y, w, h });
      }
      continue;
    }

    const species = detectionSpecies(detection);
    if (!isTrainingClass(species)) {
      reasons.add("unrecognised_class");
      if (!unrecognised.includes(species)) unrecognised.push(species);
      continue;
    }
    if (!filter.classes.includes(species)) {
      dropped.species_not_selected += 1;
      continue;
    }
    if (!detection.box) {
      unboxed += 1;
      if (!filter.includeUnboxed) reasons.add("counted_without_box");
      continue;
    }
    const box = clipToFrame(detection.box);
    if (!box) {
      reasons.add("box_outside_frame");
      continue;
    }
    const [x, y, w, h] = box;
    labels.push({
      class: species,
      x,
      y,
      w,
      h,
      verdict: detection.verdict,
      modelClass: detection.linked ? detection.classLabel.trim() : null,
      origin: originOf(detection, frame),
    });
  }

  // A frame with an unboxed egg is not background: there is an egg on it.
  if (reasons.size === 0 && labels.length === 0 && unboxed === 0 && !filter.includeBackground) {
    reasons.add("background_not_included");
  }
  const excluded = TRAINING_FRAME_EXCLUSIONS.find((reason) => reasons.has(reason)) ?? null;
  return { labels, hardNegatives, excluded, unboxed, dropped, unrecognised };
}

function emptySplits(): Record<TrainingSplit, TrainingSplitCounts> {
  return {
    train: { frames: 0, background: 0, incomplete: 0, boxes: 0, patients: 0 },
    val: { frames: 0, background: 0, incomplete: 0, boxes: 0, patients: 0 },
    test: { frames: 0, background: 0, incomplete: 0, boxes: 0, patients: 0 },
  };
}

/** Adds one to a keyed tally and returns it. */
function bump<K>(map: Map<K, { frames: number; boxes: number }>, key: K, boxes: number) {
  const entry = map.get(key) ?? { frames: 0, boxes: 0 };
  entry.frames += 1;
  entry.boxes += boxes;
  map.set(key, entry);
}

/** The frames a filter keeps, each in its split, and the counts the preview shows. */
export function buildTrainingSet(
  source: TrainingFrames,
  filter: TrainingFilter,
): { items: TrainingItem[]; summary: TrainingSummary } {
  const items: TrainingItem[] = [];
  const excluded = new Map<TrainingFrameExclusion, number>();
  if (source.deleted > 0) excluded.set("deleted_duplicate", source.deleted);
  const dropped: Record<TrainingBoxDrop, number> = {
    species_not_selected: 0,
    rejection_without_box: 0,
  };
  const unrecognised = new Set<string>();

  for (const frame of source.frames) {
    const outcome = labelFrame(frame, filter);
    for (const reason of TRAINING_BOX_DROPS) dropped[reason] += outcome.dropped[reason];
    outcome.unrecognised.forEach((species) => unrecognised.add(species));
    if (outcome.excluded) {
      excluded.set(outcome.excluded, (excluded.get(outcome.excluded) ?? 0) + 1);
      continue;
    }
    items.push({
      sampleId: frame.sampleId,
      split: splitFor(frame.patientKey, filter.valPercent, filter.testPercent),
      patientKey: frame.patientKey,
      organizationId: frame.organizationId,
      labCode: frame.labCode,
      modelVersion: frame.modelVersion,
      needsReannotation: frame.needsReannotation,
      labels: outcome.labels,
      hardNegatives: outcome.hardNegatives,
      unboxedEggs: outcome.unboxed,
    });
  }

  return {
    items,
    summary: summariseTrainingSet(items, filter.classes, excluded, dropped, unrecognised),
  };
}

function summariseTrainingSet(
  items: readonly TrainingItem[],
  classes: readonly TrainingClass[],
  excluded: Map<TrainingFrameExclusion, number>,
  dropped: Record<TrainingBoxDrop, number>,
  unrecognised: Set<string>,
): TrainingSummary {
  const splits = emptySplits();
  const patients: Record<TrainingSplit, Set<string>> = {
    train: new Set(),
    val: new Set(),
    test: new Set(),
  };
  const classBoxes = new Map<TrainingClass, Record<TrainingSplit, number>>(
    classes.map((name) => [name, { train: 0, val: 0, test: 0 }]),
  );
  const models = new Map<string, { frames: number; boxes: number }>();
  const labs = new Map<string, { frames: number; boxes: number }>();
  const labOrganization = new Map<string, string | null>();
  let boxes = 0;
  let background = 0;
  let incomplete = 0;
  let unboxedEggs = 0;
  let hardNegatives = 0;

  for (const item of items) {
    const split = splits[item.split];
    split.frames += 1;
    split.boxes += item.labels.length;
    if (item.unboxedEggs > 0) {
      split.incomplete = (split.incomplete ?? 0) + 1;
      incomplete += 1;
      unboxedEggs += item.unboxedEggs;
    } else if (item.labels.length === 0) {
      split.background += 1;
      background += 1;
    }
    patients[item.split].add(item.patientKey);
    boxes += item.labels.length;
    hardNegatives += item.hardNegatives.length;
    for (const label of item.labels) {
      const tally = classBoxes.get(label.class);
      if (tally) tally[item.split] += 1;
    }
    bump(models, item.modelVersion, item.labels.length);
    bump(labs, item.labCode, item.labels.length);
    labOrganization.set(item.labCode, item.organizationId);
  }
  for (const name of TRAINING_SPLITS) splits[name].patients = patients[name].size;

  const byFramesThenName = <T extends { frames: number }>(key: (row: T) => string) => {
    return (left: T, right: T) => right.frames - left.frames || key(left).localeCompare(key(right));
  };

  return {
    frames: items.length,
    boxes,
    background,
    incomplete,
    unboxedEggs,
    hardNegatives,
    patients: TRAINING_SPLITS.reduce((total, name) => total + splits[name].patients, 0),
    splits,
    classes: [...classBoxes].map(([name, tally]) => ({ class: name, boxes: tally })),
    modelVersions: [...models]
      .map(([modelVersion, tally]) => ({ modelVersion, ...tally }))
      .sort(byFramesThenName((row) => row.modelVersion)),
    labs: [...labs]
      .map(([labCode, tally]) => ({
        labCode,
        organizationId: labOrganization.get(labCode) ?? null,
        ...tally,
      }))
      .sort(byFramesThenName((row) => row.labCode)),
    excludedFrames: TRAINING_FRAME_EXCLUSIONS.filter((reason) => excluded.has(reason)).map(
      (reason) => ({ reason, frames: excluded.get(reason) ?? 0 }),
    ),
    droppedBoxes: TRAINING_BOX_DROPS.filter((reason) => dropped[reason] > 0).map((reason) => ({
      reason,
      boxes: dropped[reason],
    })),
    unrecognisedClasses: [...unrecognised].sort((left, right) => left.localeCompare(right)),
  };
}
