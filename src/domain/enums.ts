/**
 * Enums mirrored from the AgarthaVision data model.
 *
 * Provenance for every value in this file is the sibling repo's
 * `supabase/migrations/*.sql` (authority) cross-read against `schema.ts`
 * (readable summary). Where the two disagree, the migration wins.
 *
 * Room-only concepts from the Android client — `SampleStatus`, `is_repeat`,
 * `predictions_json`, `ReportSyncStatus` — are deliberately absent: they have no
 * Postgres column, so this console cannot observe them.
 */

/**
 * Human-in-the-loop verdict attached to one detection.
 *
 * Postgres: `detections.verdict text not null default 'CONFIRMED'` with a CHECK
 * on the four UPPERCASE values (migration `0002_verification_fields.sql`). The
 * Android client stores lowercase locally and maps on sync; the canonical form
 * in this console is the Postgres form, and the adapter is the only place a
 * lowercase value may be read.
 */
export enum DetectionVerdict {
  /** The box is a real egg of the predicted class. The only verdict that counts. */
  Confirmed = "CONFIRMED",
  /** Not an egg. Retained as labeled negative training data, never deleted. */
  FalsePositive = "FALSE_POSITIVE",
  /** A real egg of a different species; `expert_class` holds the correction. */
  WrongClass = "WRONG_CLASS",
  /** A real egg, but the bounding box is wrong. */
  BoxIncorrect = "BOX_INCORRECT",
}

/**
 * Egg classes supported by the Phase 1 inference model and by reporting.
 *
 * Postgres stores these as free text in `detections.class_label`,
 * `detections.expert_class`, `reports.positive_species` and the keys of
 * `reports.epg_per_species`. No Postgres enum exists, so parsing is lenient and
 * anything unrecognised lands in {@link EggSpecies.Other}.
 */
export enum EggSpecies {
  Ascaris = "Ascaris lumbricoides",
  Trichuris = "Trichuris trichiura",
  Hookworm = "Hookworm",
  Other = "Other",
}

/**
 * Persisted report category.
 *
 * Postgres: `reports.report_type text not null default 'session'` with
 * `check (report_type in ('session'))` (migration `0008_reports.sql`). The
 * cross-session `administrative` variant this console renders is computed live
 * and is not persisted, because no migration allows that value yet.
 */
export enum ReportType {
  Session = "session",
}

/**
 * Console-derived validation state of a sample.
 *
 * Phase 1 Postgres has no per-sample validation-state column, and
 * `validation_records` is a Phase 2 ghost with no migration behind it. So this
 * console derives state from columns that do exist:
 *
 * - `Pending`  — `verified_at` is absent. Upstream the column is NOT NULL with a
 *   `now()` default, so this is defensive: a partial or future-nullable row must
 *   never be silently counted as validated.
 * - `Flagged`  — `needs_reannotation = true`. The medtech reported that the model
 *   missed eggs, so the count on this frame is known-incomplete.
 * - `Validated` — verified, not flagged. The only state that reaches a report.
 */
export enum ValidationStatus {
  Pending = "pending",
  Flagged = "flagged",
  Validated = "validated",
}

/** Infection-intensity band for an EPG value. See `src/domain/severity.ts`. */
export enum EpgSeverity {
  /** No eggs counted. */
  None = "none",
  Light = "light",
  Moderate = "moderate",
  Heavy = "heavy",
  /** Species carries no published intensity band, so no band is asserted. */
  Unclassified = "unclassified",
}

/** Canonical labels and the aliases seen in `class_label` values upstream. */
const SPECIES_ALIASES: Record<EggSpecies, readonly string[]> = {
  [EggSpecies.Ascaris]: ["ascaris lumbricoides", "ascaris", "ascaris_lumbricoides"],
  [EggSpecies.Trichuris]: ["trichuris trichiura", "trichuris", "trichuris_trichiura"],
  [EggSpecies.Hookworm]: ["hookworm", "hook worm", "hook_worm"],
  [EggSpecies.Other]: ["other"],
};

/**
 * Resolves a raw `class_label` or `expert_class` string to a canonical species.
 * Unrecognised text is {@link EggSpecies.Other} — the column is free text
 * upstream, so this must never throw.
 */
export function parseEggSpecies(label: string | null | undefined): EggSpecies {
  const needle = (label ?? "").trim().toLowerCase();
  if (needle.length === 0) return EggSpecies.Other;
  for (const [species, aliases] of Object.entries(SPECIES_ALIASES) as [
    EggSpecies,
    readonly string[],
  ][]) {
    if (aliases.includes(needle)) return species;
  }
  return EggSpecies.Other;
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

/** The three species carrying published intensity bands, in report order. */
export const REPORTABLE_SPECIES: readonly EggSpecies[] = [
  EggSpecies.Ascaris,
  EggSpecies.Trichuris,
  EggSpecies.Hookworm,
];
