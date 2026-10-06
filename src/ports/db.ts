import type { PatientDisclosure, PatientPage, PatientRecord, Profile } from "@/domain";
import type { SampleRecordDetail, SessionRecord, SmearRecord } from "@/domain";
import type {
  AuditEntry,
  Invitation,
  MemberPatient,
  OrganizationDetail,
  PatientAssignment,
  Person,
  OrganizationSummary,
  ReadScope,
} from "@/domain";

/**
 * The database port.
 *
 * Every read of clinical data takes a {@link ReadScope}. An implementation must
 * return nothing outside it, on its own, whatever the backing store's policies
 * would allow — the policies are the second line (D7).
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
  /** Whose patients. Required: derive it with `readScopeFor`, never from the URL alone. */
  scope: ReadScope;
  /**
   * Whether names, sex and birthdates are read at all. Derive it with
   * `patientDisclosureFor`. When `"deidentified"` the adapter reads the
   * de-identified views instead of the tables, never names those columns, and
   * ignores {@link search}, which would otherwise match on a name.
   */
  disclosure: PatientDisclosure;
  /** Matches surname, given name or codename, case-insensitively. */
  search?: string;
  /** Exact 10-digit PSGC barangay code. */
  barangayCode?: string;
  /** Rows to skip, for a later page. Defaults to 0. */
  offset?: number;
  /** Rows on the page. Adapters must apply a sane default and a ceiling. */
  limit?: number;
}

export interface SmearQuery {
  /** Whose smears. Required: derive it with `readScopeFor`. */
  scope: ReadScope;
  /**
   * Which source the smears are read from. Derive it with `patientDisclosureFor`:
   * a super admin's smears come from the de-identified views, which still carry
   * the barangay code a smear is counted under.
   */
  disclosure: PatientDisclosure;
  /** Inclusive Manila calendar dates, `YYYY-MM-DD`, bounding `sessions.started_at`. */
  startedFrom?: string;
  startedTo?: string;
  /** Hard cap on rows returned. Adapters must apply a sane default. */
  limit?: number;
}

export interface AuditQuery {
  /** Whose entries: an organization's, or all of them for a super admin. */
  scope: ReadScope;
  actorId?: string;
  action?: string;
  /** Inclusive Manila calendar dates, `YYYY-MM-DD`. */
  from?: string;
  to?: string;
  /** Hard cap on rows returned. Adapters must apply a sane default. */
  limit?: number;
}

export interface DatabasePort {
  /**
   * One page of patients, most recently registered first, with the number that
   * match in all. Search and filters apply to every patient, not just this page.
   */
  listPatients(query: PatientQuery): Promise<PatientPage>;

  /** One patient with their sessions and what each showed; `null` when absent or hidden. */
  getPatientRecord(
    patientId: string,
    scope: ReadScope,
    disclosure: PatientDisclosure,
  ): Promise<PatientRecord | null>;

  /** One session with its live fields; `null` when absent or hidden. */
  getSessionRecord(
    sessionId: string,
    scope: ReadScope,
    disclosure: PatientDisclosure,
  ): Promise<SessionRecord | null>;

  /** One live field; `null` when absent, hidden, or deleted as a duplicate. */
  getSampleRecord(
    sampleId: string,
    scope: ReadScope,
    disclosure: PatientDisclosure,
  ): Promise<SampleRecordDetail | null>;

  /** Every session in the period with its summary, for the dashboard and the export. */
  listSmears(query: SmearQuery): Promise<SmearRecord[]>;

  /** Organizations the caller may read, by name, with member and patient counts. */
  listOrganizations(): Promise<OrganizationSummary[]>;

  /** One organization with its members; `null` when absent or hidden. */
  getOrganization(organizationId: string): Promise<OrganizationDetail | null>;

  /** An organization's invitations, newest first, at most {@link INVITATION_LIST_LIMIT}. */
  listInvitations(organizationId: string): Promise<Invitation[]>;

  /**
   * One laboratory's members with their sign-in email and linked-patient count.
   * Throws {@link DatabaseReadError} for a laboratory the caller may not read.
   */
  listPeople(organizationId: string): Promise<Person[]>;

  /**
   * Who is assigned to one patient. Throws {@link DatabaseReadError} for a patient
   * the caller may not read.
   */
  listPatientAssignments(patientId: string): Promise<PatientAssignment[]>;

  /** The laboratory's patients one member is assigned to, newest link first. */
  listMemberPatients(userId: string): Promise<MemberPatient[]>;

  /**
   * The ids of the laboratory's patients this member is the only active member on:
   * what must be handed over before they can be deactivated. Throws
   * {@link DatabaseReadError} for a member the caller may not read.
   */
  listSoleCoverPatients(userId: string): Promise<string[]>;

  /** One invitation by id; `null` when absent or hidden. */
  getInvitation(invitationId: string): Promise<Invitation | null>;

  /** Audit entries, newest first. */
  listAuditEntries(query: AuditQuery): Promise<AuditEntry[]>;

  /** One profile by id, or `null` when it is absent or unreadable. */
  getProfile(userId: string): Promise<Profile | null>;

  /** Profiles the caller may read, for owner labels and the owner filter. */
  listProfiles(): Promise<Profile[]>;
}

/** The most invitations one organization's list shows; the page says when it stops there. */
export const INVITATION_LIST_LIMIT = 500;

/** Thrown when the backing store rejects or fails a read. */
export class DatabaseReadError extends Error {
  constructor(operation: string, cause?: unknown) {
    super(`Database read failed during ${operation}.`);
    this.name = "DatabaseReadError";
    this.cause = cause;
  }
}
