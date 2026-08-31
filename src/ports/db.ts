import type { Profile, SampleRecord } from "@/domain/entities";
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
 */

export interface RecordQuery {
  /** Filters the caller wants applied. The adapter pushes down what it can. */
  filter?: RecordFilter;
  /** Hard cap on rows returned. Adapters must apply a sane default. */
  limit?: number;
}

export interface DatabasePort {
  /**
   * Every processed sample the caller is allowed to see, joined with its
   * detections and composed into {@link SampleRecord}. Cross-user visibility is
   * granted by the upstream RLS admin policy; this port does not widen it.
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
