/**
 * Chart palette.
 *
 * The species slots are not a taste choice. They were checked with the palette
 * validator against the chart surface and pass the lightness band, the chroma
 * floor, adjacent-pair CVD separation (worst pair ΔE 9.1 protan) and the
 * normal-vision floor (worst pair ΔE 22.9). Two slots fall under 3:1 contrast
 * against white, so every chart using them carries a legend, direct labels and a
 * table view: identity is never carried by colour alone.
 *
 * Slots are fixed per species and never cycled. A species outside the three the
 * model knows takes the fourth slot.
 */
export const SPECIES_COLOR: Readonly<Record<string, string>> = {
  "Ascaris lumbricoides": "#2a78d6",
  "Trichuris trichiura": "#eb6834",
  Hookworm: "#1baf7a",
};

export const OTHER_SPECIES_COLOR = "#eda100";

export function speciesColor(species: string): string {
  return SPECIES_COLOR[species] ?? OTHER_SPECIES_COLOR;
}
