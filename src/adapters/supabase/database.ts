import type { SupabaseClient } from "@supabase/supabase-js";
import { isLiveSample, isUuid, parseDetectionVerdict, summariseSession } from "@/domain";
import type {
  Detection,
  Patient,
  PatientDisclosure,
  PatientListItem,
  PatientRecord,
  PersonRef,
  Profile,
  Sample,
  SampleDetail,
  SampleRecordDetail,
  Session,
  SessionRecord,
  SmearRecord,
  SpeciesFinding,
  AuditEntry,
} from "@/domain";
import { sortMembers } from "@/domain";
import type {
  MembershipRole,
  OrganizationDetail,
  OrganizationStatus,
  OrganizationSummary,
  ReadScope,
} from "@/domain";
import {
  DatabaseReadError,
  type AuditQuery,
  type DatabasePort,
  type PatientQuery,
  type SmearQuery,
} from "@/ports/db";
import { createRequestClient } from "./client";
import { readPages } from "./paging";

/**
 * Supabase implementation of {@link DatabasePort}.
 *
 * Reads run through the visitor's own session, so Postgres RLS decides
 * visibility. This adapter never elevates and never adds a `user_id` predicate of
 * its own.
 *
 * Row shapes are snake_case as they come from Postgres and are mapped to the
 * camelCase domain entities here. This file is the only place the two spellings
 * meet. Columns are those of the app's migrations `0001`–`0006` on `development`.
 *
 * Deleted duplicate samples (`deleted_at` set) are fetched with their siblings
 * and dropped by the domain (`isLiveSample`, `summariseSession`), so the rule has
 * one definition rather than a filter here and another there.
 */

interface ProfileRefRow {
  id: string;
  full_name: string | null;
}

interface PatientRow {
  id: string;
  /** Present only when the identity columns were selected. */
  lastname?: string;
  firstname?: string;
  middle_name?: string | null;
  sex?: string;
  birthdate?: string;
  psgc_barangay_code: string;
  created_by: string;
  created_at: string;
  profiles?: ProfileRefRow | null;
}

interface SessionRow {
  id: string;
  user_id: string;
  patient_id: string;
  device_id: string;
  started_at: string;
  label: string | null;
  profiles?: ProfileRefRow | null;
}

interface SampleRow {
  id: string;
  session_id: string;
  user_id: string;
  captured_at: string;
  verified_at: string | null;
  storage_path: string;
  inference_model_version: string | null;
  needs_reannotation: boolean;
  is_manual: boolean;
  user_note: string | null;
  deleted_at: string | null;
  detections?: DetectionRow[] | null;
  sample_species_findings?: FindingRow[] | null;
  predictions?: { id: string }[] | null;
}

interface DetectionRow {
  id: string;
  sample_id: string;
  class_label: string;
  confidence: number;
  bbox_x: number | null;
  bbox_y: number | null;
  bbox_w: number | null;
  bbox_h: number | null;
  verdict: string | null;
  expert_class: string | null;
  prediction_id: string | null;
  stage: string | null;
}

interface FindingRow {
  sample_id: string;
  species: string;
  stage: string | null;
  egg_count: number;
}

interface OrganizationRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  deactivated_at: string | null;
  organization_members?: MemberRow[] | null;
  patient_organizations?: { count: number }[] | null;
}

interface MemberRow {
  user_id: string;
  role: string;
  status: string;
  added_at: string;
  profiles?: { full_name: string | null } | null;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  role: string | null;
  created_at: string;
}

/**
 * Default row cap. Large enough for a real surveillance period, small enough
 * that a mis-typed filter cannot pull the whole table into a server component.
 */
const DEFAULT_LIMIT = 1000;

/** Default cap for the dashboard's one-row-per-session read; callers may pass their own. */
const SMEAR_LIMIT = 5000;

const PATIENT_COLUMNS = "id, psgc_barangay_code, created_by, created_at";
/** Who the patient is. Selected only for an `"identified"` reader. */
const PATIENT_IDENTITY_COLUMNS = "lastname, firstname, middle_name, sex, birthdate";

/**
 * The patient columns a reader may receive. A de-identified reader's request
 * never names the identity columns, so they do not leave the database for them.
 */
function patientColumns(disclosure: PatientDisclosure): string {
  return disclosure === "identified"
    ? `${PATIENT_COLUMNS}, ${PATIENT_IDENTITY_COLUMNS}`
    : PATIENT_COLUMNS;
}
/**
 * The medtech who registered a patient. Named by constraint because `patients`
 * reaches `profiles` two ways — `created_by`, and the `patient_users` join table —
 * and PostgREST refuses an ambiguous embed.
 */
const PATIENT_REGISTRAR = "profiles!patients_created_by_fkey ( id, full_name )";
const SESSION_COLUMNS = "id, user_id, patient_id, device_id, started_at, label";
const SAMPLE_COLUMNS =
  "id, session_id, user_id, captured_at, verified_at, storage_path, inference_model_version, needs_reannotation, is_manual, user_note, deleted_at";
const DETECTION_COLUMNS =
  "id, sample_id, class_label, confidence, bbox_x, bbox_y, bbox_w, bbox_h, verdict, expert_class, prediction_id, stage";
const FINDING_COLUMNS = "sample_id, species, stage, egg_count";

/**
 * A sample with everything recorded on it. Each child table holds exactly one
 * foreign key to `samples`, so the embeds need no disambiguating hint.
 */
const SAMPLE_TREE = `${SAMPLE_COLUMNS},
  detections ( ${DETECTION_COLUMNS} ),
  sample_species_findings ( ${FINDING_COLUMNS} ),
  predictions ( id )`;

/**
 * Only what a session summary needs. `sessions` → `profiles` is the author;
 * `sessions` holds one FK to each of `profiles` and `patients`.
 */
const SESSION_SUMMARY_TREE = `${SESSION_COLUMNS},
  profiles ( id, full_name ),
  samples ( id, deleted_at,
    detections ( sample_id, verdict, class_label, expert_class ),
    sample_species_findings ( sample_id, species, egg_count ) )`;

const ORGANIZATION_COLUMNS = "id, name, status, created_at, deactivated_at";

/**
 * The owning laboratory, as an inner join: embedded with `!inner` and filtered, a
 * patient outside the scope drops out of the result entirely rather than coming
 * back with an empty embed. This is the console's own scoping (D7); RLS applies
 * the same boundary underneath.
 */
const OWNER = "patient_organizations!inner ( organization_id )";

function scopedOrganization(scope: ReadScope): string | null {
  return scope.kind === "organization" ? scope.organizationId : null;
}

/**
 * A member's own profile. `organization_members` reaches `profiles` twice
 * (`user_id` and `added_by`), so the embed names its constraint.
 */
const MEMBER_TREE =
  "organization_members ( user_id, role, status, added_at, profiles!organization_members_user_id_fkey ( full_name ) )";

function toStatus(value: string): OrganizationStatus {
  return value === "deactivated" ? "deactivated" : "active";
}

function toOrganizationSummary(row: OrganizationRow): OrganizationSummary {
  const active = (row.organization_members ?? []).filter((member) => member.status === "active");
  return {
    id: row.id,
    name: row.name,
    status: toStatus(row.status),
    createdAt: row.created_at,
    deactivatedAt: row.deactivated_at,
    orgAdminCount: active.filter((member) => member.role === "org_admin").length,
    medtechCount: active.filter((member) => member.role === "medtech").length,
    patientCount: row.patient_organizations?.[0]?.count ?? 0,
  };
}

/**
 * Characters that carry meaning inside a PostgREST `or=(…)` filter or an ILIKE
 * pattern. Search text is data, so they are dropped rather than escaped.
 */
function sanitiseSearch(text: string): string {
  return text.replace(/[,()*%\\:."]/g, " ").trim();
}

function toPersonRef(row: ProfileRefRow | null | undefined): PersonRef {
  return row ? { id: row.id, fullName: row.full_name } : null;
}

function toPatient(row: PatientRow, disclosure: PatientDisclosure): Patient {
  return {
    id: row.id,
    identity:
      disclosure === "identified"
        ? {
            lastname: row.lastname ?? "",
            firstname: row.firstname ?? "",
            middleName: row.middle_name ?? null,
            sex: row.sex === "M" ? "M" : "F",
            birthdate: row.birthdate ?? "",
          }
        : null,
    psgcBarangayCode: row.psgc_barangay_code,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/**
 * A session label is pre-filled from the patient's initials and barangay and a
 * medtech's note is free text; either can name the patient. A de-identified
 * reader gets neither, so they never reach a page that could render them.
 */
function toSession(row: SessionRow, disclosure: PatientDisclosure): Session {
  return {
    id: row.id,
    userId: row.user_id,
    patientId: row.patient_id,
    deviceId: row.device_id,
    startedAt: row.started_at,
    label: disclosure === "identified" ? row.label : null,
  };
}

function toSample(row: SampleRow, disclosure: PatientDisclosure): Sample {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    capturedAt: row.captured_at,
    verifiedAt: row.verified_at,
    storagePath: row.storage_path,
    inferenceModelVersion: row.inference_model_version,
    needsReannotation: row.needs_reannotation,
    isManual: row.is_manual,
    userNote: disclosure === "identified" ? row.user_note : null,
    deletedAt: row.deleted_at,
  };
}

function toDetection(row: DetectionRow): Detection {
  return {
    id: row.id,
    sampleId: row.sample_id,
    classLabel: row.class_label,
    confidence: row.confidence,
    bboxX: row.bbox_x,
    bboxY: row.bbox_y,
    bboxW: row.bbox_w,
    bboxH: row.bbox_h,
    verdict: parseDetectionVerdict(row.verdict),
    expertClass: row.expert_class,
    predictionId: row.prediction_id,
    stage: row.stage,
  };
}

function toFinding(row: FindingRow): SpeciesFinding {
  return {
    sampleId: row.sample_id,
    species: row.species,
    stage: row.stage,
    eggCount: row.egg_count,
  };
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    fullName: row.full_name,
    // The CHECK constraint allows only these two, but the column is plain text.
    // Anything else is treated as the lesser privilege rather than trusted.
    role: row.role === "admin" ? "admin" : "medtech",
    createdAt: row.created_at,
  };
}

function toSampleDetail(row: SampleRow, disclosure: PatientDisclosure): SampleDetail {
  return {
    sample: toSample(row, disclosure),
    detections: (row.detections ?? []).map(toDetection),
    findings: (row.sample_species_findings ?? []).map(toFinding),
    hasPredictions: (row.predictions ?? []).length > 0,
  };
}

/** Summarises a session row fetched with {@link SESSION_SUMMARY_TREE}. */
function summariseSessionRow(row: SessionRow & { samples?: SampleRow[] | null }) {
  const samples = row.samples ?? [];
  return summariseSession({
    samples: samples.map((sample) => ({ id: sample.id, deletedAt: sample.deleted_at })),
    detections: samples.flatMap((sample) =>
      (sample.detections ?? []).map((detection) => ({
        sampleId: sample.id,
        verdict: parseDetectionVerdict(detection.verdict),
        classLabel: detection.class_label,
        expertClass: detection.expert_class,
      })),
    ),
    findings: samples.flatMap((sample) =>
      (sample.sample_species_findings ?? []).map((finding) => ({
        sampleId: sample.id,
        species: finding.species,
        eggCount: finding.egg_count,
      })),
    ),
  });
}

/** Live samples in capture order; a deleted duplicate is never shown. */
function liveSampleDetails(
  rows: SampleRow[] | null | undefined,
  disclosure: PatientDisclosure,
): SampleDetail[] {
  return (rows ?? [])
    .map((row) => toSampleDetail(row, disclosure))
    .filter((detail) => isLiveSample(detail.sample))
    .sort((left, right) => left.sample.capturedAt.localeCompare(right.sample.capturedAt));
}

export class SupabaseDatabaseAdapter implements DatabasePort {
  constructor(private readonly client: SupabaseClient) {}

  async listPatients(query: PatientQuery): Promise<PatientListItem[]> {
    const { scope, disclosure, search, barangayCode, limit = DEFAULT_LIMIT } = query;
    const organizationId = scopedOrganization(scope);

    let request = this.client
      .from("patients")
      .select(
        `${patientColumns(disclosure)}, ${PATIENT_REGISTRAR}, sessions ( started_at )${organizationId ? `, ${OWNER}` : ""}`,
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (organizationId)
      request = request.eq("patient_organizations.organization_id", organizationId);

    // A name search is a question about a name: a de-identified reader may not ask it.
    const needle = search && disclosure === "identified" ? sanitiseSearch(search) : "";
    if (needle.length > 0) {
      request = request.or(`lastname.ilike.*${needle}*,firstname.ilike.*${needle}*`);
    }
    if (barangayCode && /^[0-9]{10}$/.test(barangayCode)) {
      request = request.eq("psgc_barangay_code", barangayCode);
    }

    const { data, error } = await request;
    if (error) throw new DatabaseReadError("listPatients", error);

    type Row = PatientRow & { sessions?: { started_at: string }[] | null };
    return ((data as unknown as Row[] | null) ?? []).map((row) => {
      const starts = (row.sessions ?? []).map((session) => session.started_at).sort();
      return {
        patient: toPatient(row, disclosure),
        registeredBy: toPersonRef(row.profiles),
        sessionCount: starts.length,
        lastSessionAt: starts.at(-1) ?? null,
      };
    });
  }

  async getPatientRecord(
    patientId: string,
    scope: ReadScope,
    disclosure: PatientDisclosure,
  ): Promise<PatientRecord | null> {
    const organizationId = scopedOrganization(scope);
    let request = this.client
      .from("patients")
      .select(
        `${patientColumns(disclosure)}, ${PATIENT_REGISTRAR}, sessions ( ${SESSION_SUMMARY_TREE} )${organizationId ? `, ${OWNER}` : ""}`,
      )
      .eq("id", patientId);
    if (organizationId)
      request = request.eq("patient_organizations.organization_id", organizationId);

    const { data, error } = await request.maybeSingle();

    if (error) throw new DatabaseReadError("getPatientRecord", error);
    if (!data) return null;

    type Row = PatientRow & { sessions?: (SessionRow & { samples?: SampleRow[] })[] | null };
    const row = data as unknown as Row;
    const sessions = (row.sessions ?? [])
      .map((session) => ({
        session: toSession(session, disclosure),
        author: toPersonRef(session.profiles),
        summary: summariseSessionRow(session),
      }))
      .sort((left, right) => right.session.startedAt.localeCompare(left.session.startedAt));

    return {
      patient: toPatient(row, disclosure),
      registeredBy: toPersonRef(row.profiles),
      sessions,
    };
  }

  async getSessionRecord(
    sessionId: string,
    scope: ReadScope,
    disclosure: PatientDisclosure,
  ): Promise<SessionRecord | null> {
    const organizationId = scopedOrganization(scope);
    const patient = organizationId
      ? `patients!inner ( ${patientColumns(disclosure)}, ${OWNER} )`
      : `patients ( ${patientColumns(disclosure)} )`;
    let request = this.client
      .from("sessions")
      .select(
        `${SESSION_COLUMNS}, profiles ( id, full_name ), ${patient}, samples ( ${SAMPLE_TREE} )`,
      )
      .eq("id", sessionId);
    if (organizationId) {
      request = request.eq("patients.patient_organizations.organization_id", organizationId);
    }

    const { data, error } = await request.maybeSingle();

    if (error) throw new DatabaseReadError("getSessionRecord", error);
    if (!data) return null;

    type Row = SessionRow & { patients: PatientRow | null; samples?: SampleRow[] | null };
    const row = data as unknown as Row;
    // A session whose patient the caller cannot read is not a session they may open.
    if (!row.patients) return null;

    const samples = liveSampleDetails(row.samples, disclosure);
    return {
      session: toSession(row, disclosure),
      patient: toPatient(row.patients, disclosure),
      author: toPersonRef(row.profiles),
      samples,
      summary: summariseSession({
        samples: samples.map((detail) => detail.sample),
        detections: samples.flatMap((detail) => detail.detections),
        findings: samples.flatMap((detail) => detail.findings),
      }),
    };
  }

  async getSampleRecord(
    sampleId: string,
    scope: ReadScope,
    disclosure: PatientDisclosure,
  ): Promise<SampleRecordDetail | null> {
    const { data: owner, error: ownerError } = await this.client
      .from("samples")
      .select("session_id, deleted_at")
      .eq("id", sampleId)
      .maybeSingle();

    if (ownerError) throw new DatabaseReadError("getSampleRecord", ownerError);
    if (!owner || (owner as { deleted_at: string | null }).deleted_at !== null) return null;

    // Scoped through its session: a field is in scope exactly when its smear is.
    const record = await this.getSessionRecord(
      (owner as { session_id: string }).session_id,
      scope,
      disclosure,
    );
    if (!record) return null;

    const index = record.samples.findIndex((detail) => detail.sample.id === sampleId);
    if (index < 0) return null;

    return {
      ...record.samples[index],
      session: record.session,
      patient: record.patient,
      author: record.author,
      fieldNumber: index + 1,
      fieldCount: record.samples.length,
    };
  }

  async listSmears(query: SmearQuery): Promise<SmearRecord[]> {
    const { scope, startedFrom, startedTo, limit = SMEAR_LIMIT } = query;
    const organizationId = scopedOrganization(scope);

    type Row = SessionRow & {
      samples?: SampleRow[] | null;
      patients: { psgc_barangay_code: string } | null;
    };

    // Paged: one response stops at the server's row cap, not at `limit`. `id`
    // breaks ties in `started_at`, so the order is total and pages do not overlap.
    const rows = await readPages<Row>(
      "listSmears",
      limit,
      (from, to) => {
        let request = this.client
          .from("sessions")
          .select(
            organizationId
              ? `${SESSION_SUMMARY_TREE}, patients!inner ( psgc_barangay_code, ${OWNER} )`
              : `${SESSION_SUMMARY_TREE}, patients ( psgc_barangay_code )`,
          )
          .order("started_at", { ascending: false })
          .order("id", { ascending: false });

        if (organizationId) {
          request = request.eq("patients.patient_organizations.organization_id", organizationId);
        }

        // Dates are Manila calendar days, the frame the app records in.
        if (startedFrom) request = request.gte("started_at", `${startedFrom}T00:00:00+08:00`);
        if (startedTo) request = request.lte("started_at", `${startedTo}T23:59:59.999+08:00`);

        return request.range(from, to);
      },
      (row) => row.id,
    );

    return rows.map((row) => ({
      sessionId: row.id,
      patientId: row.patient_id,
      startedAt: row.started_at,
      barangayCode: row.patients?.psgc_barangay_code ?? "",
      summary: summariseSessionRow(row),
    }));
  }

  async listOrganizations(): Promise<OrganizationSummary[]> {
    const { data, error } = await this.client
      .from("organizations")
      .select(
        `${ORGANIZATION_COLUMNS}, organization_members ( role, status ), patient_organizations ( count )`,
      )
      .order("name", { ascending: true });

    if (error) throw new DatabaseReadError("listOrganizations", error);
    return ((data as unknown as OrganizationRow[] | null) ?? []).map(toOrganizationSummary);
  }

  async getOrganization(organizationId: string): Promise<OrganizationDetail | null> {
    const { data, error } = await this.client
      .from("organizations")
      .select(`${ORGANIZATION_COLUMNS}, ${MEMBER_TREE}, patient_organizations ( count )`)
      .eq("id", organizationId)
      .maybeSingle();

    if (error) throw new DatabaseReadError("getOrganization", error);
    if (!data) return null;

    const row = data as unknown as OrganizationRow;
    return {
      ...toOrganizationSummary(row),
      members: sortMembers(
        (row.organization_members ?? []).map((member) => ({
          userId: member.user_id,
          fullName: member.profiles?.full_name ?? null,
          role: (member.role === "org_admin" ? "org_admin" : "medtech") as MembershipRole,
          status: toStatus(member.status),
          addedAt: member.added_at,
        })),
      ),
    };
  }

  async listAuditEntries(query: AuditQuery): Promise<AuditEntry[]> {
    const { scope, actorId, action, from, to, limit = DEFAULT_LIMIT } = query;
    const organizationId = scopedOrganization(scope);

    let request = this.client
      .from("admin_audit_log")
      .select(
        "id, at, actor_id, actor_label, action, target_type, target_id, organization_id, details, organizations ( name )",
      )
      .order("at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    if (organizationId) request = request.eq("organization_id", organizationId);
    if (isUuid(actorId)) request = request.eq("actor_id", actorId);
    if (action) request = request.eq("action", action);
    if (from) request = request.gte("at", `${from}T00:00:00+08:00`);
    if (to) request = request.lte("at", `${to}T23:59:59.999+08:00`);

    const { data, error } = await request;
    if (error) throw new DatabaseReadError("listAuditEntries", error);

    type Row = {
      id: number;
      at: string;
      actor_id: string | null;
      actor_label: string | null;
      action: string;
      target_type: string;
      target_id: string | null;
      organization_id: string | null;
      details: Record<string, unknown> | null;
      organizations: { name: string } | null;
    };
    return ((data as unknown as Row[] | null) ?? []).map((row) => ({
      id: row.id,
      at: row.at,
      actorId: row.actor_id,
      actorLabel: row.actor_label,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      organizationId: row.organization_id,
      organizationName: row.organizations?.name ?? null,
      details: row.details ?? {},
    }));
  }

  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.client
      .from("profiles")
      .select("id, full_name, role, created_at")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw new DatabaseReadError("getProfile", error);
    return data ? toProfile(data as ProfileRow) : null;
  }

  async listProfiles(): Promise<Profile[]> {
    const { data, error } = await this.client
      .from("profiles")
      .select("id, full_name, role, created_at")
      .order("full_name", { ascending: true, nullsFirst: false });

    if (error) throw new DatabaseReadError("listProfiles", error);
    return ((data ?? []) as ProfileRow[]).map(toProfile);
  }
}

/** Builds the adapter against a request-scoped, session-carrying client. */
export async function createSupabaseDatabase(): Promise<DatabasePort> {
  return new SupabaseDatabaseAdapter(await createRequestClient());
}
