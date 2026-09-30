import type { PatientListItem, PatientRecord, Profile, SampleRecord } from "@/domain";
import type { SampleRecordDetail, SessionRecord } from "@/domain";
import type { RecordFilter } from "@/domain/filters";

/**
 * The database port.
 *
 * A pure interface: no vendor type appears in any signature, so a second
 * implementation is an addition rather than a refactor. Feature code depends on
 * this file; only `src/adapters/registry.ts` ever names a concrete provider.
 *
 * Read-only by construction. There is no `insert`, `update` or `delete` here,
 * which is how the read-mostly rule is enforced rather than merely stated: the
 * console cannot mutate clinical data because it has no verb for it.
 *
 * Every method returns only what the caller may see. The adapter reads as the
 * signed-in user, so row-level security decides visibility; it never widens it.
 */

export interface RecordQuery {
  /** Filters the caller wants applied. The adapter pushes down what it can. */
  filter?: RecordFilter;
  /** Hard cap on rows returned. Adapters must apply a sane default. */
  limit?: number;
}

export interface PatientQuery {
  /** Matches surname, given name or codename, case-insensitively. */
  search?: string;
  /** Exact 10-digit PSGC barangay code. */
  barangayCode?: string;
  /** Hard cap on rows returned. Adapters must apply a sane default. */
  limit?: number;
}

export interface DatabasePort {
  /** Patients, most recently registered first. */
  listPatients(query?: PatientQuery): Promise<PatientListItem[]>;

  /** One patient with their sessions and what each showed; `null` when absent or hidden. */
  getPatientRecord(patientId: string): Promise<PatientRecord | null>;

  /** One session with its live fields; `null` when absent or hidden. */
  getSessionRecord(sessionId: string): Promise<SessionRecord | null>;

  /** One live field; `null` when absent, hidden, or deleted as a duplicate. */
  getSampleRecord(sampleId: string): Promise<SampleRecordDetail | null>;

  /**
   * Every processed sample, composed into {@link SampleRecord}. Serves the
   * dashboard and export until they move to the session model.
   */
  listSampleRecords(query?: RecordQuery): Promise<SampleRecord[]>;

  /** One profile by id, or `null` when it is absent or unreadable. */
  getProfile(userId: string): Promise<Profile | null>;

  /** Profiles the caller may read, for owner labels and the owner filter. */
  listProfiles(): Promise<Profile[]>;
}

/** Thrown when the backing store rejects or fails a read. */
export class DatabaseReadError extends Error {
  constructor(operation: string, cause?: unknown) {
    super(`Database read failed during ${operation}.`);
    this.name = "DatabaseReadError";
    this.cause = cause;
  }
}
