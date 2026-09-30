import type { DetectionVerdict } from "./enums";

/**
 * Entity types mirrored from the AgarthaVision Postgres schema.
 *
 * Field names match the columns after the app's `supabase/migrations/0001_init.sql`
 * through `0006_drop_species_touched.sql` on `development` — the consolidated,
 * patient-based schema. The `legacy-dev/` migrations describe an older database
 * and are not the authority here. Per-field comments name the migration each
 * field came from. Room-only columns are not represented.
 *
 * ISO-8601 timestamp strings, not `Date`: these values cross a server/client
 * boundary and must serialise without a custom reviver.
 */
export type Iso8601 = string;

/** `public.profiles` — one row per authenticated user (`0001`). */
export interface Profile {
  /** PK, FK to `auth.users(id)`. */
  id: string;
  /** Nullable. `handle_new_user()` never fills it. */
  fullName: string | null;
  /** `not null default 'medtech'`, CHECK in `('medtech','admin')`. */
  role: "medtech" | "admin";
  createdAt: Iso8601;
}

/**
 * The columns of `public.patients` that identify a person (`0001`, `0002`). Read only
 * for a reader whose disclosure is `"identified"` (`patientDisclosureFor`).
 */
export interface PatientIdentity {
  lastname: string;
  /** `''` for a codenamed patient (`0002` relaxed the non-blank CHECK). Never SQL null. */
  firstname: string;
  middleName: string | null;
  /** `'M' | 'F'`, CHECK-constrained. */
  sex: "M" | "F";
  /** A date, not an age. Age is computed per encounter. */
  birthdate: string;
}

/** `public.patients` — the unit a medtech works from (`0001`, `0002`). */
export interface Patient {
  id: string;
  /**
   * Name, sex and birthdate, or `null` when they were not read because this reader
   * may not see them. `null` never means the patient has none.
   */
  identity: PatientIdentity | null;
  /** Canonical zero-padded 10-digit PSGC barangay code. */
  psgcBarangayCode: string;
  /** Provenance only; visibility resolves through `patient_users`. */
  createdBy: string;
  createdAt: Iso8601;
}

/** `public.sessions` — one fecal smear, owned by a patient (`0001`). */
export interface Session {
  id: string;
  /** The author: the medtech who read the smear. Never rewritten. */
  userId: string;
  patientId: string;
  /** Client-generated stable device identifier. */
  deviceId: string;
  startedAt: Iso8601;
  label: string | null;
}

/** `public.samples` — one verified field of a smear (`0001`). */
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
  /** Object key in the private `samples` bucket: `{user_id}/{sample_id}.jpg`. */
  storagePath: string;
  inferenceModelVersion: string | null;
  /** The medtech reported the model missed eggs on this frame. */
  needsReannotation: boolean;
  /** A capture taken without inference. Its detections carry null boxes. */
  isManual: boolean;
  userNote: string | null;
  /**
   * The C8 tombstone. A medtech deleted this frame as a duplicate: it is hidden
   * everywhere and counts toward nothing, while its rows and JPEG stay.
   */
  deletedAt: Iso8601 | null;
}

/** `public.detections` — one egg on a sample (`0001`, `0004`, `0005`, `0006`). */
export interface Detection {
  id: string;
  sampleId: string;
  /** The model's label, free text upstream. */
  classLabel: string;
  /** Model confidence, `0..1`, CHECK-constrained upstream. */
  confidence: number;
  /** Box centre and size. Nullable: a manual egg or an unredrawn rejection has none. */
  bboxX: number | null;
  bboxY: number | null;
  bboxW: number | null;
  bboxH: number | null;
  verdict: DetectionVerdict;
  /** The corrected species, set for `WRONG_CLASS` and `BOX_INCORRECT`. */
  expertClass: string | null;
  /**
   * The model prediction this row rules on (`0004`). Null when the medtech added
   * the egg, or on a row whose provenance predates `0004`.
   */
  predictionId: string | null;
  /** Developmental stage, nullable free text (`0005`). */
  stage: string | null;
}

/** `public.sample_species_findings` — one species' egg count in one field (`0001`, `0005`). */
export interface SpeciesFinding {
  sampleId: string;
  /** Canonical species name, or free text for a species the dropdown lacks. */
  species: string;
  stage: string | null;
  /** Always positive; a zero is the absence of a row. */
  eggCount: number;
}

/** `public.reports` — a report generated on the phone (`0001`). */
export interface Report {
  id: string;
  sessionId: string;
  userId: string;
  reportType: "session";
  generatedAt: Iso8601;
  totalSamples: number;
  totalEggsConfirmed: number;
  positiveSpecies: string[];
  /** `{ "<species>": { "min": 0, "max": 4 } }`, stored as issued. */
  lpfPerSpecies: Record<string, { min: number; max: number }>;
  pdfFilePath: string | null;
}
