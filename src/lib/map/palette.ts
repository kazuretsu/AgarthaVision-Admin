import type { AreaShade, PrevalenceBand } from "@/domain";

/**
 * The prevalence map's colours, per theme.
 *
 * The bands are one hue, the console's maroon, light to dark for a higher positive rate, and
 * dark to light on the dark surface. Validated as ordinal ramps against each surface: lightness
 * monotone, every adjacent step at least 0.06 apart in OKLCH lightness, the palest step at
 * 2:1 or more against the surface, one hue within 13°. "No data" is a neutral grey and "too
 * few to report" a hatch, so neither reads as a rate; the legend and the table carry every
 * area's figure in words, so nothing depends on colour alone.
 */
export interface MapPalette {
  background: string;
  bands: Readonly<Record<PrevalenceBand, string>>;
  none: string;
  tooFew: string;
  hatch: string;
  outline: string;
  hover: string;
  context: string;
}

export const MAP_PALETTE: Readonly<Record<"light" | "dark", MapPalette>> = {
  light: {
    background: "#fcfaf8",
    bands: { 0: "#e39aa4", 1: "#cd6677", 2: "#b03f53", 3: "#872034", 4: "#560d17" },
    none: "#e7e5e4",
    tooFew: "#f5f5f4",
    hatch: "#78716c",
    outline: "#ffffff",
    hover: "#1c1917",
    context: "#d6d3d1",
  },
  dark: {
    background: "#1c1917",
    bands: { 0: "#843343", 1: "#a34155", 2: "#c05a6d", 3: "#dc8193", 4: "#f6b6c2" },
    none: "#3a3532",
    tooFew: "#292524",
    hatch: "#a8a29e",
    outline: "#1c1917",
    hover: "#fafaf9",
    context: "#44403c",
  },
};

export function shadeColor(palette: MapPalette, shade: AreaShade): string {
  if (shade === "none") return palette.none;
  if (shade === "too_few") return palette.tooFew;
  return palette.bands[shade];
}
