import type { SessionSummary } from "./clinical";
import { clinicalDate } from "./patients";

/**
 * The dashboard's figures, counted per smear the way the prevalence map counts.
 *
 * The unit is the session — one smear, one patient specimen — not the field and
 * not the egg. A smear is **examined** when at least one live (not deleted)
 * field was verified, and **positive** when a live field carries a counted
 * detection. That is exactly `public.barangay_prevalence()`, so the dashboard's
 * positive count for a scope equals the sum the map is built from.
 *
 * No EPG and no WHO intensity tier: both were retracted for direct smear (PB-16).
 */

/** One session as the dashboard needs it. */
export interface SmearRecord {
  sessionId: string;
  patientId: string;
  startedAt: string;
  /** The patient's PSGC barangay code — where the smear counts on the map. */
  barangayCode: string;
  summary: SessionSummary;
}

export interface SpeciesMixRow {
  species: string;
  /** Positive smears in which this species was counted. */
  positiveSmears: number;
  /** Share of all positive smears, `0..1`. A polyparasitic smear counts once per species. */
  share: number;
}

export interface TrendPoint {
  /** Monday of the week, `YYYY-MM-DD`, in Asia/Manila. */
  weekStart: string;
  examined: number;
  positive: number;
  /** `positive / examined`, or `null` for a week with nothing examined. */
  rate: number | null;
}

export interface DashboardFigures {
  /** Distinct patients with at least one examined smear. */
  patients: number;
  smearsExamined: number;
  positiveSmears: number;
  /** `positiveSmears / smearsExamined`, or `null` when nothing was examined. */
  positiveRate: number | null;
  /** Live fields verified across the examined smears. */
  fieldsVerified: number;
  speciesMix: SpeciesMixRow[];
  trend: TrendPoint[];
}

/** A smear counts once at least one live field was verified. */
export function isExamined(record: Pick<SmearRecord, "summary">): boolean {
  return record.summary.fieldCount > 0;
}

/** The Monday of the Manila week an instant falls in, as `YYYY-MM-DD`. */
export function weekStart(instant: string): string {
  const date = clinicalDate(instant);
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const offset = (utc.getUTCDay() + 6) % 7; // Monday = 0
  utc.setUTCDate(utc.getUTCDate() - offset);
  return utc.toISOString().slice(0, 10);
}

/**
 * The dashboard's counts before any rate or share is derived: what
 * `public.console_dashboard_figures()` returns, and what {@link totalsOf} counts
 * from session records. Both feed {@link figuresFromTotals}, so the page shows the
 * same figures whichever counted them.
 */
export interface DashboardTotals {
  /** Every session in the period, read or not: what the export's row cap is compared with. */
  sessions: number;
  patients: number;
  smearsExamined: number;
  positiveSmears: number;
  fieldsVerified: number;
  trend: { weekStart: string; examined: number; positive: number }[];
  species: { species: string; positiveSmears: number }[];
}

/** Counts session records the way the database function counts sessions. */
export function totalsOf(records: readonly SmearRecord[]): DashboardTotals {
  const examined = records.filter(isExamined);
  const positive = examined.filter((record) => record.summary.isPositive);

  const species = new Map<string, number>();
  for (const record of positive) {
    for (const { species: name, count } of record.summary.eggCounts) {
      if (count > 0) species.set(name, (species.get(name) ?? 0) + 1);
    }
  }

  const weeks = new Map<string, { examined: number; positive: number }>();
  for (const record of examined) {
    const key = weekStart(record.startedAt);
    const bucket = weeks.get(key) ?? { examined: 0, positive: 0 };
    bucket.examined += 1;
    if (record.summary.isPositive) bucket.positive += 1;
    weeks.set(key, bucket);
  }

  return {
    sessions: records.length,
    patients: new Set(examined.map((record) => record.patientId)).size,
    smearsExamined: examined.length,
    positiveSmears: positive.length,
    fieldsVerified: examined.reduce((sum, record) => sum + record.summary.fieldCount, 0),
    trend: [...weeks.entries()].map(([key, bucket]) => ({ weekStart: key, ...bucket })),
    species: [...species.entries()].map(([name, count]) => ({
      species: name,
      positiveSmears: count,
    })),
  };
}

/** Rates, shares and order, from counts. */
export function figuresFromTotals(totals: DashboardTotals): DashboardFigures {
  const { smearsExamined, positiveSmears } = totals;
  return {
    patients: totals.patients,
    smearsExamined,
    positiveSmears,
    positiveRate: smearsExamined === 0 ? null : positiveSmears / smearsExamined,
    fieldsVerified: totals.fieldsVerified,
    speciesMix: totals.species
      .map((row) => ({
        species: row.species,
        positiveSmears: row.positiveSmears,
        share: positiveSmears === 0 ? 0 : row.positiveSmears / positiveSmears,
      }))
      .sort(
        (left, right) =>
          right.positiveSmears - left.positiveSmears || compareText(left.species, right.species),
      ),
    // Weeks with nothing examined are absent, not zero: a gap in surveillance is a
    // different claim from a week in which every smear was negative.
    trend: totals.trend
      .filter((point) => point.examined > 0)
      .map((point) => ({ ...point, rate: point.positive / point.examined }))
      .sort((left, right) => compareText(left.weekStart, right.weekStart)),
  };
}

/** Code-point order: the same in every runtime and locale. */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** The figures from session records: the reference the database function is tested against. */
export function summariseDashboard(records: readonly SmearRecord[]): DashboardFigures {
  return figuresFromTotals(totalsOf(records));
}
