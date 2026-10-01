import type { SupabaseClient } from "@supabase/supabase-js";
import {
  composeSampleRecord,
  isLiveSample,
  matchesFilter,
  parseDetectionVerdict,
  summariseSession,
} from "@/domain";
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
  SampleRecord,
  SampleRecordDetail,
  Session,
  SessionRecord,
  SpeciesFinding,
} from "@/domain";
import {
  DatabaseReadError,
  type DatabasePort,
  type PatientQuery,
  type RecordQuery,
} from "@/ports/db";
import { createRequestClient } from "./client";

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
    const { disclosure, search, barangayCode, limit = DEFAULT_LIMIT } = query;

    let request = this.client
      .from("patients")
      .select(`${patientColumns(disclosure)}, ${PATIENT_REGISTRAR}, sessions ( started_at )`)
      .order("created_at", { ascending: false })
      .limit(limit);

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
    disclosure: PatientDisclosure,
  ): Promise<PatientRecord | null> {
    const { data, error } = await this.client
      .from("patients")
      .select(
        `${patientColumns(disclosure)}, ${PATIENT_REGISTRAR}, sessions ( ${SESSION_SUMMARY_TREE} )`,
      )
      .eq("id", patientId)
      .maybeSingle();

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
    disclosure: PatientDisclosure,
  ): Promise<SessionRecord | null> {
    const { data, error } = await this.client
      .from("sessions")
      .select(
        `${SESSION_COLUMNS}, profiles ( id, full_name ), patients ( ${patientColumns(disclosure)} ), samples ( ${SAMPLE_TREE} )`,
      )
      .eq("id", sessionId)
      .maybeSingle();

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
    disclosure: PatientDisclosure,
  ): Promise<SampleRecordDetail | null> {
    const { data: owner, error: ownerError } = await this.client
      .from("samples")
      .select("session_id, deleted_at")
      .eq("id", sampleId)
      .maybeSingle();

    if (ownerError) throw new DatabaseReadError("getSampleRecord", ownerError);
    if (!owner || (owner as { deleted_at: string | null }).deleted_at !== null) return null;

    const record = await this.getSessionRecord(
      (owner as { session_id: string }).session_id,
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

  async listSampleRecords(query: RecordQuery = {}): Promise<SampleRecord[]> {
    const { filter, limit = DEFAULT_LIMIT } = query;

    // Only the date bounds are pushed down. Every other predicate is derived
    // (mean confidence, validated EPG, processing time are computed, not stored)
    // so it cannot be expressed in SQL without duplicating the domain rules in a
    // second language. Filtering those in `matchesFilter` keeps one definition.
    let request = this.client
      .from("samples")
      .select(
        `${SAMPLE_COLUMNS}, detections ( ${DETECTION_COLUMNS} ), sessions ( label ), profiles ( id, full_name )`,
      )
      .is("deleted_at", null)
      .order("captured_at", { ascending: false })
      .limit(limit);

    if (filter?.capturedFrom) {
      request = request.gte("captured_at", `${filter.capturedFrom}T00:00:00Z`);
    }
    if (filter?.capturedTo) {
      request = request.lte("captured_at", `${filter.capturedTo}T23:59:59.999Z`);
    }
    if (filter?.ownerId) {
      request = request.eq("user_id", filter.ownerId);
    }

    const { data, error } = await request;
    if (error) throw new DatabaseReadError("listSampleRecords", error);

    type Row = SampleRow & {
      sessions: { label: string | null } | null;
      profiles: ProfileRefRow | null;
    };
    const records = ((data as unknown as Row[] | null) ?? []).map((row) =>
      composeSampleRecord({
        // Legacy EPG export path, removed with EPG by the research export.
        sample: toSample(row, "identified"),
        detections: (row.detections ?? []).map(toDetection),
        owner: toPersonRef(row.profiles),
        sessionLabel: row.sessions?.label ?? null,
      }),
    );

    return filter ? records.filter((record) => matchesFilter(record, filter)) : records;
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
