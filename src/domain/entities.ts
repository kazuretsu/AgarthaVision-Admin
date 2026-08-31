import type { DetectionVerdict, EggSpecies, ReportType, ValidationStatus } from "./enums";

/**
 * Entity types mirrored from the AgarthaVision Postgres schema.
 *
 * Field names match the columns as they stand after migration `0008`. The
 * per-field comments record which migration each field came from so a schema
 * change upstream is cheap to trace. Room-only columns are not represented.
 *
 * ISO-8601 timestamp strings, not `Date`: these values cross a server/client
 * boundary and must serialise without a custom reviver.
 */
export type Iso8601 = string;

/** `public.profiles` — one row per authenticated user (`0001_init.sql`). */
export interface Profile {
  /** PK, FK to `auth.users(id)`. */
  id: string;
  /** Nullable display name copied from auth metadata at signup. */
  fullName: string | null;
  /** `not null default 'medtech'`, CHECK in `('medtech','admin')`. */
  role: "medtech" | "admin";
  createdAt: Iso8601;
}

/** `public.sessions` — one capture session, i.e. one fecal smear (`0001`, `0005`). */
export interface Session {
  id: string;
  userId: string;
  /** Client-generated stable device identifier. */
  deviceId: string;
  startedAt: Iso8601;
  endedAt: Iso8601 | null;
  /** Free-form operator notes. */
  notes: string | null;
  /** Human-friendly smear label, added by `0005_session_label.sql`. */
  label: string | null;
}

/** `public.samples` — a verified microscopy frame (`0001`, `0002`, `0006`). */
export interface Sample {
  id: string;
  sessionId: string;
  userId: string;
  /** When the frame was captured on-device. */
  capturedAt: Iso8601;
  /**
   * When the frame reached the cloud as a verified sample. `not null default
   * now()` upstream; typed nullable here so a partial row cannot be mistaken for
   * a validated one.
   */
  verifiedAt: Iso8601 | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsAccuracy: number | null;
  /** Object key in the private `samples` bucket: `{user_id}/{sample_id}.jpg`. */
  storagePath: string;
  /**
   * Inference model version. The column was created as
   * `roboflow_model_version` in `0001` and renamed to
   * `inference_model_version` by `0002_verification_fields.sql`.
   */
  inferenceModelVersion: string | null;
  /** Set when the medtech reported the model missed eggs (`0002`). */
  needsReannotation: boolean;
  /** Capture taken without inference, added by `0006_sample_is_manual.sql`. */
  isManual: boolean;
  userNote: string | null;
}

/** `public.detections` — one detected egg on a sample (`0001`, `0002`, `0007`). */
export interface Detection {
  id: string;
  sampleId: string;
  /** Raw model-predicted label, free text upstream. */
  classLabel: string;
  /** Model confidence, `0..1`, CHECK-constrained upstream. */
  confidence: number;
  /** Normalised box. Nullable since `0007` — manual captures have no box. */
  bboxX: number | null;
  bboxY: number | null;
  bboxW: number | null;
  bboxH: number | null;
  verdict: DetectionVerdict;
  /** Expert's corrected class, set when the verdict is `WRONG_CLASS`. */
  expertClass: string | null;
}

/** `public.reports` — a persisted session report snapshot (`0008_reports.sql`). */
export interface Report {
  id: string;
  sessionId: string;
  userId: string;
  reportType: ReportType;
  generatedAt: Iso8601;
  totalSamples: number;
  totalEggsConfirmed: number;
  positiveSpecies: string[];
  epgPerSpecies: Record<string, number>;
  csvFilePath: string | null;
}

/**
 * A sample joined with its detections and the values this console derives from
 * them. Composed in the domain layer, not a table: nothing here is persisted.
 *
 * `aiEpg` is what the model alone would have reported; `validatedEpg` is what
 * the medical technologist's verdicts leave standing. Reports use the second.
 */
export interface SampleRecord {
  sample: Sample;
  detections: Detection[];
  /** Owning medtech, when the profile row was readable. */
  owner: Pick<Profile, "id" | "fullName"> | null;
  /** Session label, carried for display and filtering. */
  sessionLabel: string | null;
  /** Derived per `ValidationStatus`. */
  validationStatus: ValidationStatus;
  /** Distinct species across all detections, model label or expert correction. */
  detectedSpecies: EggSpecies[];
  /** Mean model confidence across all detections; `null` when there are none. */
  meanConfidence: number | null;
  /** Every detection counted, before human validation. */
  aiEggCount: number;
  /** {@link aiEggCount} times the DOH volumetric multiplier. */
  aiEpg: number;
  /** Only `CONFIRMED` detections. */
  validatedEggCount: number;
  /** {@link validatedEggCount} times the DOH volumetric multiplier. */
  validatedEpg: number;
  /**
   * Capture-to-verification duration in milliseconds; `null` when the sample has
   * no `verifiedAt`. This is the console's "Processing Time".
   */
  processingTimeMs: number | null;
}
