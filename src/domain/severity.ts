import type { SampleRecord } from "./entities";
import { EggSpecies, EpgSeverity } from "./enums";
import { effectiveSpecies, epgFromCount, isCountableDetection, isValidatedRecord } from "./epg";

/**
 * Infection-intensity classification.
 *
 * Intensity is species-specific: 3,000 EPG is a light Ascaris burden and a heavy
 * Trichuris one, so a single set of thresholds would misreport both. Bands below
 * are the standard soil-transmitted helminth intensity classes used for Kato-Katz
 * EPG.
 *
 * TODO(Tabada): attach the DOH / WHO citation for these bands alongside the one
 * owed for `EPG_MULTIPLIER`.
 */

export interface IntensityBands {
  /** Lowest EPG that is still a moderate infection. */
  moderateFrom: number;
  /** Lowest EPG that is a heavy infection. */
  heavyFrom: number;
}

/**
 * Published bands per species. {@link EggSpecies.Other} has none — the class is a
 * free-text catch-all upstream, so no band may be asserted for it.
 */
export const INTENSITY_BANDS: Readonly<Partial<Record<EggSpecies, IntensityBands>>> = {
  [EggSpecies.Ascaris]: { moderateFrom: 5000, heavyFrom: 50000 },
  [EggSpecies.Trichuris]: { moderateFrom: 1000, heavyFrom: 10000 },
  [EggSpecies.Hookworm]: { moderateFrom: 2000, heavyFrom: 4000 },
};

/**
 * Classifies an EPG value for one species.
 *
 * Zero is {@link EpgSeverity.None} — a negative sample is not a light infection.
 * A species with no published band is {@link EpgSeverity.Unclassified} rather
 * than being folded into the nearest neighbour.
 */
export function classifyEpg(species: EggSpecies, epg: number): EpgSeverity {
  if (epg <= 0) return EpgSeverity.None;
  const bands = INTENSITY_BANDS[species];
  if (!bands) return EpgSeverity.Unclassified;
  if (epg >= bands.heavyFrom) return EpgSeverity.Heavy;
  if (epg >= bands.moderateFrom) return EpgSeverity.Moderate;
  return EpgSeverity.Light;
}

/**
 * Classifies a whole sample by its worst species-specific burden: a frame that is
 * lightly Ascaris-positive and heavily Trichuris-positive is a heavy infection,
 * because that is the finding that drives treatment.
 */
export function classifyRecord(record: SampleRecord): EpgSeverity {
  const rank: Record<EpgSeverity, number> = {
    [EpgSeverity.None]: 0,
    [EpgSeverity.Unclassified]: 1,
    [EpgSeverity.Light]: 2,
    [EpgSeverity.Moderate]: 3,
    [EpgSeverity.Heavy]: 4,
  };
  const perSpecies = new Map<EggSpecies, number>();
  for (const detection of record.detections.filter(isCountableDetection)) {
    const species = effectiveSpecies(detection);
    perSpecies.set(species, (perSpecies.get(species) ?? 0) + 1);
  }
  let worst = EpgSeverity.None;
  for (const [species, count] of perSpecies) {
    const severity = classifyEpg(species, epgFromCount(count));
    if (rank[severity] > rank[worst]) worst = severity;
  }
  return worst;
}

/** The light / moderate / heavy split rendered on the administrative dashboard. */
export interface SeveritySplit {
  none: number;
  light: number;
  moderate: number;
  heavy: number;
  /** Positive samples whose only species has no published intensity band. */
  unclassified: number;
  /** Total records counted — validated records only. */
  total: number;
}

export function severitySplit(records: SampleRecord[]): SeveritySplit {
  const split: SeveritySplit = {
    none: 0,
    light: 0,
    moderate: 0,
    heavy: 0,
    unclassified: 0,
    total: 0,
  };
  for (const record of records.filter(isValidatedRecord)) {
    split.total += 1;
    switch (classifyRecord(record)) {
      case EpgSeverity.Heavy:
        split.heavy += 1;
        break;
      case EpgSeverity.Moderate:
        split.moderate += 1;
        break;
      case EpgSeverity.Light:
        split.light += 1;
        break;
      case EpgSeverity.Unclassified:
        split.unclassified += 1;
        break;
      default:
        split.none += 1;
    }
  }
  return split;
}
