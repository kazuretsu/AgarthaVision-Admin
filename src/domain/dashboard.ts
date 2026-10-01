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

export function summariseDashboard(records: readonly SmearRecord[]): DashboardFigures {
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
    patients: new Set(examined.map((record) => record.patientId)).size,
    smearsExamined: examined.length,
    positiveSmears: positive.length,
    positiveRate: examined.length === 0 ? null : positive.length / examined.length,
    fieldsVerified: examined.reduce((sum, record) => sum + record.summary.fieldCount, 0),
    speciesMix: [...species.entries()]
      .map(([name, count]) => ({
        species: name,
        positiveSmears: count,
        share: positive.length === 0 ? 0 : count / positive.length,
      }))
      .sort((left, right) => right.positiveSmears - left.positiveSmears),
    // Weeks with nothing examined are absent, not zero: a gap in surveillance is a
    // different claim from a week in which every smear was negative.
    trend: [...weeks.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, bucket]) => ({
        weekStart: key,
        examined: bucket.examined,
        positive: bucket.positive,
        rate: bucket.positive / bucket.examined,
      })),
  };
}
