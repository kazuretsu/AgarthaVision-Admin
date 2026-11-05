import type { Detection, Patient, Profile, Sample, Session, SpeciesFinding } from "./entities";
import type { SessionSummary } from "./clinical";

/**
 * The read models the records browser shows: Patient → Session → Sample.
 *
 * Composed by the database adapter from rows, with every figure computed by
 * `clinical.ts`. Deleted duplicate samples never reach these shapes.
 */

/** Who a row names. `null` when the profile could not be read. */
export type PersonRef = Pick<Profile, "id" | "fullName"> | null;

/** One row of the patients list. */
export interface PatientListItem {
  patient: Patient;
  registeredBy: PersonRef;
  sessionCount: number;
  lastSessionAt: string | null;
}

/** One page of the patients list, with how many patients match in all. */
export interface PatientPage {
  items: PatientListItem[];
  /** Every patient matching the query, not just this page's. */
  total: number;
}

/** One session in a patient's history, with what it showed. */
export interface SessionListItem {
  session: Session;
  author: PersonRef;
  summary: SessionSummary;
}

/** A patient and their sessions, newest first. */
export interface PatientRecord {
  patient: Patient;
  registeredBy: PersonRef;
  sessions: SessionListItem[];
}

/** One live field with everything recorded on it. */
export interface SampleDetail {
  sample: Sample;
  detections: Detection[];
  findings: SpeciesFinding[];
  /** Whether the model's output for this frame is stored (`0004`). */
  hasPredictions: boolean;
}

/** A session with its live fields in capture order. */
export interface SessionRecord {
  session: Session;
  patient: Patient;
  author: PersonRef;
  samples: SampleDetail[];
  summary: SessionSummary;
}

/** One field, with where it sits. */
export interface SampleRecordDetail extends SampleDetail {
  session: Session;
  patient: Patient;
  author: PersonRef;
  /** 1-based position among the session's live fields. */
  fieldNumber: number;
  fieldCount: number;
}
