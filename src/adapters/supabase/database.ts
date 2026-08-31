import type { SupabaseClient } from "@supabase/supabase-js";
import { composeSampleRecord, matchesFilter } from "@/domain";
import type { Detection, Profile, Sample, SampleRecord } from "@/domain";
import { parseDetectionVerdict } from "@/domain";
import { DatabaseReadError, type DatabasePort, type RecordQuery } from "@/ports/db";
import { createRequestClient } from "./client";

/**
 * Supabase implementation of {@link DatabasePort}.
 *
 * Reads run through the visitor's own session, so Postgres RLS decides
 * visibility. The admin policies in `0001`/`0004`/`0008` are what widen a row
 * set beyond the signed-in user; this adapter never elevates and never adds a
 * `user_id` predicate of its own. That means a medtech who somehow reached the
 * console sees only their own rows rather than an empty page — the role gate,
 * not this file, is what turns them away.
 *
 * Row shapes are snake_case as they come from Postgres and are mapped to the
 * camelCase domain entities here. This file is the only place the two spellings
 * meet.
 */

/** Rows returned when a sample is selected with its children embedded. */
interface SampleRow {
  id: string;
  session_id: string;
  user_id: string;
  captured_at: string;
  verified_at: string | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  gps_accuracy: number | null;
  storage_path: string;
  inference_model_version: string | null;
  needs_reannotation: boolean;
  is_manual: boolean;
  user_note: string | null;
  detections: DetectionRow[] | null;
  sessions: { label: string | null } | null;
  profiles: { id: string; full_name: string | null } | null;
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

/**
 * Embedded select. `detections` is a to-many child; `sessions` and `profiles`
 * are to-one parents. `samples` holds exactly one foreign key to each
 * (`session_id`, `user_id` — `0001_init.sql:45-46`), so the relationship is
 * unambiguous and needs no disambiguating hint. Should `samples` ever gain a
 * second reference to either table, this select must name the constraint.
 */
const SAMPLE_SELECT = `
  id, session_id, user_id, captured_at, verified_at,
  gps_latitude, gps_longitude, gps_accuracy,
  storage_path, inference_model_version, needs_reannotation, is_manual, user_note,
  detections ( id, sample_id, class_label, confidence, bbox_x, bbox_y, bbox_w, bbox_h, verdict, expert_class ),
  sessions ( label ),
  profiles ( id, full_name )
`;

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
  };
}

function toSample(row: SampleRow): Sample {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    capturedAt: row.captured_at,
    verifiedAt: row.verified_at,
    gpsLatitude: row.gps_latitude,
    gpsLongitude: row.gps_longitude,
    gpsAccuracy: row.gps_accuracy,
    storagePath: row.storage_path,
    inferenceModelVersion: row.inference_model_version,
    needsReannotation: row.needs_reannotation,
    isManual: row.is_manual,
    userNote: row.user_note,
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

export class SupabaseDatabaseAdapter implements DatabasePort {
  constructor(private readonly client: SupabaseClient) {}

  async listSampleRecords(query: RecordQuery = {}): Promise<SampleRecord[]> {
    const { filter, limit = DEFAULT_LIMIT } = query;

    // Only the date bounds are pushed down. Every other predicate is derived
    // (mean confidence, validated EPG, processing time are computed, not stored)
    // so it cannot be expressed in SQL without duplicating the domain rules in a
    // second language. Filtering those in `matchesFilter` keeps one definition.
    let request = this.client
      .from("samples")
      .select(SAMPLE_SELECT)
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

    const records = ((data as unknown as SampleRow[] | null) ?? []).map((row) =>
      composeSampleRecord({
        sample: toSample(row),
        detections: (row.detections ?? []).map(toDetection),
        owner: row.profiles ? { id: row.profiles.id, fullName: row.profiles.full_name } : null,
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
