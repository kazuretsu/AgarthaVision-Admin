/**
 * The STH prevalence map (14zcqntjnt3): where an admin is in the drill-down, what each area may
 * show, and which shading band a figure falls in. Pure; the figures themselves are counted by
 * the database (`console_area_prevalence()`, admin/0014), never here.
 */

/** Where the map is: the whole country, one region's provinces, or one province's towns. */
export type MapLevel = "country" | "region" | "province";
/** What the map shades at a level: one level down. */
export type AreaKind = "region" | "province" | "town";

export const CHILD_KIND: Readonly<Record<MapLevel, AreaKind>> = {
  country: "region",
  region: "province",
  province: "town",
};

/** The minimum examined smears before an area's figure is shown. The database applies it. */
export const MIN_REPORTABLE_SMEARS = 5;

/**
 * What an area may show. `none`: no smear examined. `too_few`: 1 to 4, withheld. `reported`:
 * the database's counts, and the rate they give.
 */
export type AreaFigure =
  | { kind: "none" }
  | { kind: "too_few" }
  | { kind: "reported"; examined: number; positive: number; rate: number };

export interface AreaRow {
  code: string;
  name: string;
  figure: AreaFigure;
}

export interface MapCrumb {
  level: MapLevel;
  /** Null for the country. */
  code: string | null;
  name: string;
}

export interface PrevalenceView {
  level: MapLevel;
  code: string | null;
  name: string;
  /** From the country down to this area's parent. */
  trail: MapCrumb[];
  figure: AreaFigure;
  /** Examined smears whose barangay matched no town; the country view only. */
  unplaced: number | null;
  /** Every area one level down, by name. */
  areas: AreaRow[];
}

/** The database's answer for one area, as `console_area_prevalence()` returns it. */
export interface AreaFigureRow {
  examined: number | null;
  positive: number | null;
  suppressed: boolean;
}

export function toAreaFigure(row: AreaFigureRow): AreaFigure {
  if (row.suppressed) return { kind: "too_few" };
  const examined = row.examined ?? 0;
  if (examined === 0) return { kind: "none" };
  const positive = row.positive ?? 0;
  return { kind: "reported", examined, positive, rate: positive / examined };
}

/**
 * Shading bands, the app's `PositiveRateBin`: 0 is exactly none positive, then under 10%,
 * 10–20%, 20–40%, and 40% or more. The map and the phone shade the same rate alike.
 */
export const PREVALENCE_BANDS = [
  { band: 0, label: "0%" },
  { band: 1, label: "Under 10%" },
  { band: 2, label: "10–20%" },
  { band: 3, label: "20–40%" },
  { band: 4, label: "40% or more" },
] as const;

export type PrevalenceBand = (typeof PREVALENCE_BANDS)[number]["band"];

export function bandOf(rate: number): PrevalenceBand {
  if (rate <= 0) return 0;
  if (rate < 0.1) return 1;
  if (rate < 0.2) return 2;
  if (rate < 0.4) return 3;
  return 4;
}

/** An area's shading: a band, or one of the two states that carry no figure. */
export type AreaShade = PrevalenceBand | "too_few" | "none";

export function shadeOf(figure: AreaFigure): AreaShade {
  return figure.kind === "reported" ? bandOf(figure.rate) : figure.kind;
}

export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/** One line for an area, as the table and the map's readout show it. */
export function describeFigure(figure: AreaFigure): string {
  switch (figure.kind) {
    case "none":
      return "No smears examined";
    case "too_few":
      return `Too few to report (under ${MIN_REPORTABLE_SMEARS} smears)`;
    case "reported":
      return `${formatRate(figure.rate)} positive · ${figure.positive.toLocaleString()} of ${figure.examined.toLocaleString()} smears`;
  }
}

/** Where the map is, from the query string. */
export interface MapLocation {
  level: MapLevel;
  code: string | null;
}

const PSGC_CODE = /^\d{10}$/;

function first(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

/**
 * `?province=` wins over `?region=`; anything but a 10-digit code is dropped, so a mistyped
 * URL shows the country rather than an error. Whether the code exists is the database's call.
 */
export function parseMapLocation(
  params: Record<string, string | string[] | undefined>,
): MapLocation {
  const province = first(params.province);
  if (province && PSGC_CODE.test(province)) return { level: "province", code: province };
  const region = first(params.region);
  if (region && PSGC_CODE.test(region)) return { level: "region", code: region };
  return { level: "country", code: null };
}

/**
 * The URL of a place on the map, keeping the period and laboratory. A level the map cannot
 * open (a town) has no URL.
 */
export function mapHref(
  location: MapLocation,
  keep: { from?: string; to?: string; org?: string | null },
): string {
  const params = new URLSearchParams();
  if (location.level === "region" && location.code) params.set("region", location.code);
  if (location.level === "province" && location.code) params.set("province", location.code);
  if (keep.from) params.set("from", keep.from);
  if (keep.to) params.set("to", keep.to);
  if (keep.org) params.set("org", keep.org);
  const query = params.toString();
  return query ? `/map?${query}` : "/map";
}

/** Where clicking an area leads: its own map, or nowhere for a town. */
export function drillTarget(level: MapLevel, code: string): MapLocation | null {
  if (level === "country") return { level: "region", code };
  if (level === "region") return { level: "province", code };
  return null;
}

/** The breadcrumb: the country, then each parent, then this area. */
export function crumbsOf(view: PrevalenceView): MapCrumb[] {
  return [...view.trail, { level: view.level, code: view.code, name: view.name }];
}

/** The boundary file the map draws for a level, and which of its features belong. */
export const BOUNDARY_VINTAGE = "q2_2026";

export interface BoundarySource {
  url: string;
  /** Keep features whose property `key` equals `value`; null keeps every feature. */
  filter: { key: string; value: string } | null;
}

export function boundariesFor(location: MapLocation): BoundarySource {
  const base = `/geo/${BOUNDARY_VINTAGE}`;
  if (location.level === "region" && location.code) {
    return { url: `${base}/provinces.json`, filter: { key: "region", value: location.code } };
  }
  if (location.level === "province" && location.code) {
    return { url: `${base}/towns/${location.code}.json`, filter: null };
  }
  return { url: `${base}/regions.json`, filter: null };
}

/** Required wherever the boundaries are shown (CC BY-IGO 3.0). */
export const BOUNDARY_ATTRIBUTION =
  "Administrative boundaries: OCHA Philippines COD-AB, CC BY-IGO 3.0.";
