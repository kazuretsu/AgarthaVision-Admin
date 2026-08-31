import { EggSpecies, EpgSeverity } from "@/domain";

/**
 * Chart palette.
 *
 * These values are not a taste choice. The categorical slots were checked with
 * the palette validator against this console's white chart surface and pass the
 * lightness band, the chroma floor, adjacent-pair CVD separation (worst pair
 * ΔE 9.1 protan) and the normal-vision floor (worst pair ΔE 22.9).
 *
 * The validator raises one WARN: aqua (2.82:1) and yellow (2.17:1) fall below
 * 3:1 against white. That warning is not dismissable — it obliges visible
 * relief, so every chart using these colors carries a legend, direct labels and
 * a table view. Identity is never carried by color alone here.
 *
 * Slots are assigned in fixed order and never cycled. A fifth species does not
 * get a generated hue; it folds into `Other`.
 */
export const SPECIES_COLOR: Readonly<Record<EggSpecies, string>> = {
  [EggSpecies.Ascaris]: "#2a78d6",
  [EggSpecies.Trichuris]: "#eb6834",
  [EggSpecies.Hookworm]: "#1baf7a",
  [EggSpecies.Other]: "#eda100",
};

/**
 * Severity uses the reserved status palette rather than a categorical slot,
 * because infection intensity genuinely is a clinical status and reads as one.
 * Status colors are never reused as a series hue, and every band below is
 * rendered with its label and count so the color is decoration, not the message.
 */
export const SEVERITY_COLOR: Readonly<Record<EpgSeverity, string>> = {
  [EpgSeverity.None]: "#0ca30c",
  [EpgSeverity.Light]: "#fab219",
  [EpgSeverity.Moderate]: "#ec835a",
  [EpgSeverity.Heavy]: "#d03b3b",
  [EpgSeverity.Unclassified]: "#898781",
};

/** Recessive chart furniture: grid, axis, muted ink. */
export const CHART_INK = {
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  muted: "#898781",
} as const;

/** Fixed render order for species, so a filter cannot repaint the survivors. */
export const SPECIES_ORDER: readonly EggSpecies[] = [
  EggSpecies.Ascaris,
  EggSpecies.Trichuris,
  EggSpecies.Hookworm,
  EggSpecies.Other,
];

/** Severity bands in clinical order, worst last. */
export const SEVERITY_ORDER: readonly EpgSeverity[] = [
  EpgSeverity.None,
  EpgSeverity.Light,
  EpgSeverity.Moderate,
  EpgSeverity.Heavy,
  EpgSeverity.Unclassified,
];

export const SEVERITY_LABEL: Readonly<Record<EpgSeverity, string>> = {
  [EpgSeverity.None]: "Negative",
  [EpgSeverity.Light]: "Light",
  [EpgSeverity.Moderate]: "Moderate",
  [EpgSeverity.Heavy]: "Heavy",
  [EpgSeverity.Unclassified]: "Unclassified",
};
