import type { Detection, Sample, SpeciesFinding } from "./entities";
import { DetectionVerdict } from "./enums";

/**
 * What a smear showed, computed the way the Android app computes it.
 *
 * Philippine medtechs read a **direct smear**, not a Kato-Katz thick smear, so
 * there is no eggs-per-gram and no WHO light / moderate / heavy tier (PB-16). A
 * session reports, per species, the **range of eggs per low-power field** across
 * the fields examined, plus a qualitative descriptor read off the worst field.
 *
 * Every rule here is ported from the app and must stay identical to it — the
 * console showing a different figure for the same smear than the report a medtech
 * handed a patient would make one of them wrong. Sources, on the app's
 * `development` branch:
 *
 * - counting: `DetectionDao.getConfirmedEggCountsForSession` and
 *   `public.barangay_prevalence()` — every verdict except `FALSE_POSITIVE` counts,
 *   and a deleted sample counts toward nothing;
 * - range: `LpfAggregation.kt::aggregateLpfPerSpecies`;
 * - descriptor: `LpfDensity.kt::LpfDescriptor.forMax`;
 * - species names: `EggSpecies.kt::fromClassLabel`.
 *
 * Pure functions only. Nothing here reads a port, an environment variable or a
 * clock.
 */

/**
 * A detection is an egg unless the medtech rejected it. `WRONG_CLASS` and
 * `BOX_INCORRECT` are real eggs with a corrected species or box, and count.
 */
export function isCountedDetection(detection: Pick<Detection, "verdict">): boolean {
  return detection.verdict !== DetectionVerdict.FalsePositive;
}

/** A sample the medtech deleted as a duplicate appears nowhere and counts toward nothing. */
export function isLiveSample(sample: Pick<Sample, "deletedAt">): boolean {
  return sample.deletedAt === null;
}

/** Canonical names and the aliases the app also accepts, matched case-insensitively. */
const SPECIES_NAMES: readonly { canonical: string; aliases: readonly string[] }[] = [
  { canonical: "Ascaris lumbricoides", aliases: ["Ascaris", "ascaris_lumbricoides"] },
  { canonical: "Trichuris trichiura", aliases: ["Trichuris", "trichuris_trichiura"] },
  { canonical: "Hookworm", aliases: ["hook_worm", "hook worm"] },
];

/**
 * The name a species is reported under. A known name or alias becomes the
 * canonical one; anything else is kept as written (trimmed), because the columns
 * are free text and a species the dropdown lacks is still a real finding.
 */
export function canonicalSpecies(label: string | null | undefined): string {
  const trimmed = (label ?? "").trim();
  const needle = trimmed.toLowerCase();
  for (const { canonical, aliases } of SPECIES_NAMES) {
    if (canonical.toLowerCase() === needle) return canonical;
    if (aliases.some((alias) => alias.toLowerCase() === needle)) return canonical;
  }
  return trimmed.length > 0 ? trimmed : "Unspecified";
}

/** The species a detection counts under: the medtech's correction wins. */
export function detectionSpecies(detection: Pick<Detection, "classLabel" | "expertClass">): string {
  return canonicalSpecies(detection.expertClass ?? detection.classLabel);
}

/**
 * True when the name is a binomial and renders italic. "Hookworm" is a common
 * name covering two genera, so italicising it would be wrong (app C11).
 */
export function isBinomial(species: string): boolean {
  return /^[A-Z][a-z]+ [a-z]+$/.test(species);
}

/** The qualitative LPF scale. Not a WHO tier and never presented as one. */
export type LpfDescriptor = "rare" | "few" | "moderate" | "numerous";

/** Band ceilings, identical to `LpfDescriptor.RARE_MAX` / `FEW_MAX` / `MODERATE_MAX`. */
export const LPF_RARE_MAX = 2;
export const LPF_FEW_MAX = 5;
export const LPF_MODERATE_MAX = 10;

/** The band the worst field falls in, or null when the species was never seen. */
export function lpfDescriptor(max: number): LpfDescriptor | null {
  if (max <= 0) return null;
  if (max <= LPF_RARE_MAX) return "rare";
  if (max <= LPF_FEW_MAX) return "few";
  if (max <= LPF_MODERATE_MAX) return "moderate";
  return "numerous";
}

/** One species across a session's fields: lowest and highest single-field count. */
export interface LpfDensity {
  min: number;
  max: number;
  descriptor: LpfDescriptor | null;
}

/**
 * The per-species LPF range for one session.
 *
 * 1. A field holding none of a species contributes **0**, not absence.
 * 2. The denominator is the fields actually recorded — no floor, no cap.
 * 3. A wholly negative session yields no species at all, which is a real result.
 *
 * Several rows for one species in one field are summed into that field's count.
 * If the findings span more fields than `fieldCount`, the larger is taken, so a
 * miscount can never invent a non-zero minimum.
 *
 * Findings are grouped by their stored species string, exactly as the app does.
 */
export function aggregateLpfPerSpecies(
  findings: readonly Pick<SpeciesFinding, "sampleId" | "species" | "eggCount">[],
  fieldCount: number,
): Record<string, LpfDensity> {
  const bySpecies = new Map<string, Map<string, number>>();
  for (const finding of findings) {
    const fields = bySpecies.get(finding.species) ?? new Map<string, number>();
    fields.set(finding.sampleId, (fields.get(finding.sampleId) ?? 0) + finding.eggCount);
    bySpecies.set(finding.species, fields);
  }

  const result: Record<string, LpfDensity> = {};
  for (const [species, countsByField] of bySpecies) {
    const counts = [...countsByField.values()];
    const fields = Math.max(fieldCount, countsByField.size);
    const max = counts.length === 0 ? 0 : Math.max(...counts);
    const min = countsByField.size < fields ? 0 : Math.min(...counts);
    result[species] = { min, max, descriptor: lpfDescriptor(max) };
  }
  return result;
}

/** `0–4 LPF`, the app's `lpf_range_value` string. */
export function formatLpfRange(density: Pick<LpfDensity, "min" | "max">): string {
  return `${density.min}–${density.max} LPF`;
}

/** Eggs counted for one species across a session. */
export interface SpeciesEggCount {
  species: string;
  count: number;
}

/** What one session (one smear) showed, over its live samples only. */
export interface SessionSummary {
  /** Live fields examined. Deleted duplicates are not fields. */
  fieldCount: number;
  /** Per species, most eggs first; counted detections only. */
  eggCounts: SpeciesEggCount[];
  totalEggs: number;
  /** Per species LPF range from the medtech's per-field findings. */
  lpf: Record<string, LpfDensity>;
  /**
   * The smear is positive when a live sample carries at least one counted
   * detection — the rule `public.barangay_prevalence()` uses, so a session here
   * and a cell on the map agree.
   */
  isPositive: boolean;
}

/**
 * Summarises a session from its samples, detections and findings. Anything
 * attached to a deleted sample is dropped first, so a caller cannot forget to.
 */
export function summariseSession(input: {
  samples: readonly Pick<Sample, "id" | "deletedAt">[];
  detections: readonly Pick<Detection, "sampleId" | "verdict" | "classLabel" | "expertClass">[];
  findings: readonly Pick<SpeciesFinding, "sampleId" | "species" | "eggCount">[];
}): SessionSummary {
  const live = new Set(input.samples.filter(isLiveSample).map((sample) => sample.id));
  const counted = input.detections.filter(
    (detection) => live.has(detection.sampleId) && isCountedDetection(detection),
  );

  const eggs = new Map<string, number>();
  for (const detection of counted) {
    const species = detectionSpecies(detection);
    eggs.set(species, (eggs.get(species) ?? 0) + 1);
  }
  const eggCounts = [...eggs.entries()]
    .map(([species, count]) => ({ species, count }))
    .sort((left, right) => right.count - left.count || left.species.localeCompare(right.species));

  return {
    fieldCount: live.size,
    eggCounts,
    totalEggs: counted.length,
    lpf: aggregateLpfPerSpecies(
      input.findings.filter((finding) => live.has(finding.sampleId)),
      live.size,
    ),
    isPositive: counted.length > 0,
  };
}

/**
 * Where a detection's box came from, read off `prediction_id`, the verdict and
 * whether a box exists — the table in the app's `0004_predictions.sql`.
 *
 * - `model` — the model's box, kept.
 * - `redrawn` — the medtech redrew a misplaced box.
 * - `unlocated` — counted, but no box: a rejected box not redrawn, or an egg
 *   recorded without drawing one.
 * - `added` — an egg the medtech found and drew.
 * - `unknown` — no prediction link on a frame that has no predictions at all:
 *   either a row from before `0004`, whose provenance could not be recovered, or
 *   one the server cannot tell apart from it. Never guessed as "added".
 */
export type BoxProvenance = "model" | "redrawn" | "unlocated" | "added" | "unknown";

export function boxProvenance(
  detection: Pick<Detection, "predictionId" | "verdict" | "bboxX" | "bboxY" | "bboxW" | "bboxH">,
  sample: { hasPredictions: boolean; isManual: boolean },
): BoxProvenance {
  const hasBox =
    detection.bboxX !== null &&
    detection.bboxY !== null &&
    detection.bboxW !== null &&
    detection.bboxH !== null;

  if (detection.predictionId !== null) {
    if (!hasBox) return "unlocated";
    return detection.verdict === DetectionVerdict.BoxIncorrect ? "redrawn" : "model";
  }
  if (!sample.hasPredictions && !sample.isManual) return "unknown";
  return hasBox ? "added" : "unlocated";
}
