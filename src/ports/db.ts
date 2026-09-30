import type { PatientDisclosure, PatientListItem, PatientRecord, Profile } from "@/domain";
import type { SampleRecordDetail, SessionRecord, SmearRecord } from "@/domain";
import type { OrganizationDetail, OrganizationSummary } from "@/domain";

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

export interface PatientQuery {
  /**
   * Whether names, sex and birthdates are read at all. Derive it with
   * `patientDisclosureFor`. When `"deidentified"` the adapter never selects those
   * columns and ignores {@link search}, which would otherwise match on a name.
   */
  disclosure: PatientDisclosure;
  /** Matches surname, given name or codename, case-insensitively. */
  search?: string;
  /** Exact 10-digit PSGC barangay code. */
  barangayCode?: string;
  /** Hard cap on rows returned. Adapters must apply a sane default. */
  limit?: number;
}

export interface SmearQuery {
  /** Inclusive Manila calendar dates, `YYYY-MM-DD`, bounding `sessions.started_at`. */
  startedFrom?: string;
  startedTo?: string;
  /** Hard cap on rows returned. Adapters must apply a sane default. */
  limit?: number;
}

export interface DatabasePort {
  /** Patients, most recently registered first. */
  listPatients(query: PatientQuery): Promise<PatientListItem[]>;

  /** One patient with their sessions and what each showed; `null` when absent or hidden. */
  getPatientRecord(patientId: string, disclosure: PatientDisclosure): Promise<PatientRecord | null>;

  /** One session with its live fields; `null` when absent or hidden. */
  getSessionRecord(sessionId: string, disclosure: PatientDisclosure): Promise<SessionRecord | null>;

  /** One live field; `null` when absent, hidden, or deleted as a duplicate. */
  getSampleRecord(
    sampleId: string,
    disclosure: PatientDisclosure,
  ): Promise<SampleRecordDetail | null>;

  /** Every session in the period with its summary, for the dashboard and the export. */
  listSmears(query?: SmearQuery): Promise<SmearRecord[]>;

  /** Organizations the caller may read, by name, with member and patient counts. */
  listOrganizations(): Promise<OrganizationSummary[]>;

  /** One organization with its members; `null` when absent or hidden. */
  getOrganization(organizationId: string): Promise<OrganizationDetail | null>;

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
