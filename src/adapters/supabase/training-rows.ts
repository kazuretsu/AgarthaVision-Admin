import {
  parseDetectionVerdict,
  type TrainingBox,
  type TrainingFilter,
  type TrainingFrames,
  type TrainingItem,
  type TrainingSnapshot,
  type TrainingSnapshotItem,
  type TrainingSnapshotListing,
  type TrainingSplit,
  type TrainingSummary,
} from "@/domain";

/**
 * Row shapes of the training functions (admin/0012), and their mapping to the domain.
 * No client here, so the database test maps the same rows the console does.
 */

export interface TrainingDetectionRow {
  verdict: string;
  class_label: string | null;
  expert_class: string | null;
  linked: boolean;
  box: number[] | null;
  model_box: number[] | null;
}

export interface TrainingFrameRow {
  sample_id: string;
  patient_key: string;
  organization_id: string | null;
  lab_code: string;
  model_version: string;
  needs_reannotation: boolean;
  is_manual: boolean;
  has_predictions: boolean;
  detections: TrainingDetectionRow[] | null;
}

export interface TrainingFramesRow {
  deleted: number;
  frames: TrainingFrameRow[] | null;
}

export interface TrainingSnapshotListingRow {
  id: string;
  name: string;
  created_by_label: string | null;
  created_at: string;
  frame_count: number;
  box_count: number;
  summary: TrainingSummary | null;
}

export interface TrainingSnapshotItemRow {
  sample_id: string;
  split: string;
  storage_path: string;
  model_version: string;
  lab_code: string;
  patient_group: string;
  needs_reannotation: boolean;
  labels: TrainingSnapshotItem["labels"] | null;
  hard_negatives: TrainingSnapshotItem["hardNegatives"] | null;
}

export interface TrainingSnapshotRow extends TrainingSnapshotListingRow {
  filter: TrainingFilter;
  items: TrainingSnapshotItemRow[] | null;
}

/** jsonb may arrive parsed or, through some drivers, as text. */
export function parsed<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function toBox(value: number[] | null): TrainingBox | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const numbers = value.map(Number);
  return numbers.every(Number.isFinite)
    ? [numbers[0]!, numbers[1]!, numbers[2]!, numbers[3]!]
    : null;
}

export function toTrainingFrames(row: TrainingFramesRow): TrainingFrames {
  return {
    deleted: Number(row.deleted ?? 0),
    frames: (row.frames ?? []).map((frame) => ({
      sampleId: frame.sample_id,
      patientKey: frame.patient_key,
      organizationId: frame.organization_id,
      labCode: frame.lab_code,
      modelVersion: frame.model_version,
      needsReannotation: frame.needs_reannotation,
      isManual: frame.is_manual,
      hasPredictions: frame.has_predictions,
      detections: (frame.detections ?? []).map((detection) => ({
        verdict: parseDetectionVerdict(detection.verdict),
        classLabel: detection.class_label ?? "",
        expertClass: detection.expert_class,
        linked: Boolean(detection.linked),
        box: toBox(detection.box),
        modelBox: toBox(detection.model_box),
      })),
    })),
  };
}

/** What `console_create_training_snapshot()` takes per frame. The patient key goes in and is hashed there. */
export function toSnapshotItemsPayload(items: readonly TrainingItem[]) {
  return items.map((item) => ({
    sample_id: item.sampleId,
    split: item.split,
    lab_code: item.labCode,
    patient_key: item.patientKey,
    labels: item.labels,
    hard_negatives: item.hardNegatives,
  }));
}

export function toTrainingSnapshotListing(
  row: TrainingSnapshotListingRow,
): TrainingSnapshotListing {
  return {
    id: row.id,
    name: row.name,
    createdByLabel: row.created_by_label,
    createdAt: row.created_at,
    frameCount: Number(row.frame_count),
    boxCount: Number(row.box_count),
    summary: row.summary ? parsed<TrainingSummary>(row.summary) : null,
  };
}

const SPLITS: readonly string[] = ["train", "val", "test"];

export function toTrainingSnapshot(row: TrainingSnapshotRow): TrainingSnapshot {
  return {
    ...toTrainingSnapshotListing(row),
    filter: parsed<TrainingFilter>(row.filter),
    items: (row.items ?? []).map((item) => ({
      sampleId: item.sample_id,
      split: (SPLITS.includes(item.split) ? item.split : "train") as TrainingSplit,
      storagePath: item.storage_path,
      modelVersion: item.model_version,
      labCode: item.lab_code,
      patientGroup: item.patient_group,
      needsReannotation: item.needs_reannotation,
      labels: item.labels ?? [],
      hardNegatives: item.hard_negatives ?? [],
    })),
  };
}
