/**
 * The STH prevalence map (14zcqntjnt3) and its barangay breakdown (14zcqntjnt6): where an admin
 * is in the drill-down, what each area may show, and which shading band a figure falls in.
 * Pure; the figures themselves are counted by the database (`console_area_prevalence()`,
 * admin/0014 and 0015), never here.
 */

/**
 * Where the map is: the whole country, one region's provinces, one province's towns, or one
 * town and its barangays.
 */
export type MapLevel = "country" | "region" | "province" | "town";
/** What a level lists: one level down. Barangays are listed, never drawn. */
export type AreaKind = "region" | "province" | "town" | "barangay";

export const CHILD_KIND: Readonly<Record<MapLevel, AreaKind>> = {
  country: "region",
  region: "province",
  province: "town",
  town: "barangay",
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
  /**
   * Every area one level down, by name. A town's barangays are only those with a smear, by
   * code, named by `barangayBreakdown`.
   */
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
const LOCATION_PARAMS = ["town", "province", "region"] as const;

function first(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

/**
 * `?town=` wins over `?province=`, which wins over `?region=`; anything but a 10-digit code is
 * dropped, so a mistyped URL shows the country rather than an error. Whether the code exists is
 * the database's call.
 */
export function parseMapLocation(
  params: Record<string, string | string[] | undefined>,
): MapLocation {
  for (const level of LOCATION_PARAMS) {
    const code = first(params[level]);
    if (code && PSGC_CODE.test(code)) return { level, code };
  }
  return { level: "country", code: null };
}

/**
 * `?isolate=`: the one area, among those the map shows, drawn alone. A code that is not one of
 * them is ignored, so a stale link shows every area rather than an empty map.
 */
export function parseIsolate(
  params: Record<string, string | string[] | undefined>,
  areas: readonly { code: string }[],
): string | null {
  const code = first(params.isolate);
  return code && areas.some((area) => area.code === code) ? code : null;
}

/** The URL of a place on the map, keeping the period, laboratory and any isolated area. */
export function mapHref(
  location: MapLocation,
  keep: { from?: string; to?: string; org?: string | null; isolate?: string | null },
): string {
  const params = new URLSearchParams();
  if (location.level !== "country" && location.code) params.set(location.level, location.code);
  if (keep.isolate) params.set("isolate", keep.isolate);
  if (keep.from) params.set("from", keep.from);
  if (keep.to) params.set("to", keep.to);
  if (keep.org) params.set("org", keep.org);
  const query = params.toString();
  return query ? `/map?${query}` : "/map";
}

/** Where clicking an area leads: its own map, or nowhere for a barangay. */
export function drillTarget(level: MapLevel, code: string): MapLocation | null {
  if (level === "country") return { level: "region", code };
  if (level === "region") return { level: "province", code };
  if (level === "province") return { level: "town", code };
  return null;
}

/** A town's barangays as its table lists them. */
export interface BarangayBreakdown {
  /** Highest prevalence first; withheld barangays last, by name. */
  rows: AreaRow[];
  /** Barangays of the town, in the same PSGC release, with no smear in scope. */
  withoutSmears: number;
}

/** The name a barangay code that is not in the release is listed under. */
export const unlistedBarangay = (code: string) => `Barangay code ${code} (not in the 2Q 2026 PSGC)`;

function rankOf(figure: AreaFigure): number {
  return figure.kind === "reported" ? 0 : figure.kind === "too_few" ? 1 : 2;
}

/**
 * Names a town's barangays from the PSGC release (`names`: code → name, every barangay of the
 * town) and ranks them: the highest rate first, then more smears examined, then by name.
 * A withheld barangay carries no rate, so it never outranks one that is shown.
 */
export function barangayBreakdown(
  areas: readonly AreaRow[],
  names: ReadonlyMap<string, string>,
): BarangayBreakdown {
  const rows = areas.map((area) => ({
    ...area,
    name: names.get(area.code) ?? unlistedBarangay(area.code),
  }));
  rows.sort((a, b) => {
    const kind = rankOf(a.figure) - rankOf(b.figure);
    if (kind !== 0) return kind;
    if (a.figure.kind === "reported" && b.figure.kind === "reported") {
      if (a.figure.rate !== b.figure.rate) return b.figure.rate - a.figure.rate;
      if (a.figure.examined !== b.figure.examined) return b.figure.examined - a.figure.examined;
    }
    return a.name.localeCompare(b.name) || a.code.localeCompare(b.code);
  });
  const listed = areas.filter((area) => names.has(area.code)).length;
  return { rows, withoutSmears: names.size - listed };
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

/**
 * The outlines for a view: the country's regions, a region's provinces, a province's towns, or
 * a town alone among its province's (there are no barangay outlines). `isolate`, one of the
 * areas shown, draws that area alone; the map fits whatever it draws.
 */
export function boundariesFor(view: PrevalenceView, isolate: string | null = null): BoundarySource {
  const base = `/geo/${BOUNDARY_VINTAGE}`;
  const only = (code: string) => ({ key: "code", value: code });
  if (view.level === "town" && view.code) {
    const province = view.trail.find((crumb) => crumb.level === "province")?.code;
    return { url: `${base}/towns/${province}.json`, filter: only(view.code) };
  }
  if (view.level === "province" && view.code) {
    return { url: `${base}/towns/${view.code}.json`, filter: isolate ? only(isolate) : null };
  }
  if (view.level === "region" && view.code) {
    return {
      url: `${base}/provinces.json`,
      filter: isolate ? only(isolate) : { key: "region", value: view.code },
    };
  }
  return { url: `${base}/regions.json`, filter: isolate ? only(isolate) : null };
}

/** Required wherever the boundaries are shown (CC BY-IGO 3.0). */
export const BOUNDARY_ATTRIBUTION =
  "Administrative boundaries: OCHA Philippines COD-AB, CC BY-IGO 3.0.";
