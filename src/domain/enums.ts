/**
 * Enums mirrored from the AgarthaVision data model.
 *
 * Provenance for every value in this file is the app repo's
 * `supabase/migrations/*.sql` on `development`. Species are deliberately not an
 * enum: the columns are free text upstream, and `canonicalSpecies` in
 * `clinical.ts` names them the way the app's `EggSpecies.fromClassLabel` does.
 *
 * Room-only concepts from the Android client — `SampleStatus`, `is_repeat`,
 * `predictions_json`, `ReportSyncStatus` — are deliberately absent: they have no
 * Postgres column, so this console cannot observe them.
 */

/**
 * Human-in-the-loop verdict attached to one detection.
 *
 * Postgres: `detections.verdict text not null default 'CONFIRMED'` with a CHECK
 * on the four UPPERCASE values (`0001_init.sql`). The Android client stores
 * lowercase locally and maps on sync; the canonical form in this console is the
 * Postgres form, and the adapter is the only place a lowercase value may be read.
 */
export enum DetectionVerdict {
  /** The box is a real egg of the predicted class. */
  Confirmed = "CONFIRMED",
  /** Not an egg. Kept as labelled negative training data, never deleted, never counted. */
  FalsePositive = "FALSE_POSITIVE",
  /** A real egg of a different species; `expert_class` holds the correction. Counts. */
  WrongClass = "WRONG_CLASS",
  /** A real egg with a wrong box; the box may have been redrawn. Counts. */
  BoxIncorrect = "BOX_INCORRECT",
}

/**
 * Reads a verdict in either the Postgres UPPERCASE form or the Android client's
 * lowercase form. Unknown text falls back to `CONFIRMED`, matching the column
 * default and the Android client's `DetectionVerdict.fromValue`.
 */
export function parseDetectionVerdict(value: string | null | undefined): DetectionVerdict {
  const needle = (value ?? "").trim().toUpperCase();
  const match = Object.values(DetectionVerdict).find((verdict) => verdict === needle);
  return match ?? DetectionVerdict.Confirmed;
}
