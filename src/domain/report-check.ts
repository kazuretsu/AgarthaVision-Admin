/**
 * Checking a report from the QR code printed on it (14zcqnty9bj). The app links each session
 * and patient PDF to `/verify/report?id=<report>&session=<session>|patient=<patient>&ts=<epoch
 * seconds>` (mobile 86d4a6jzt). Pure rules: which links are well formed, and what the page
 * shows for each answer. The database (admin/0025) decides whether a link matches a report.
 */
import type { AttemptKeys } from "./attempt-limits";
import { formatLpfRange, lpfDescriptor, type LpfDensity } from "./clinical";
import { isUuid } from "./ids";

/** A well-formed link: a report id, exactly one scope, and the second it was made. */
export interface ReportCheckLink {
  reportId: string;
  sessionId: string | null;
  patientId: string | null;
  generatedAtEpochSeconds: number;
}

/** What a confirmed link shows: never a patient's or medtech's identity (constraint #14). */
export interface CheckedReport {
  reportType: "session" | "patient";
  generatedAt: string;
  laboratoryName: string | null;
  totalSamples: number;
  totalEggsConfirmed: number;
  positiveSpecies: string[];
  lpfPerSpecies: Record<string, Pick<LpfDensity, "min" | "max">>;
}

/** The database's answer, plus the two the page adds itself. */
export type ReportCheckOutcome =
  { kind: "confirmed"; report: CheckedReport } | { kind: "mismatch" } | { kind: "not_found" };

type SearchParams = Record<string, string | string[] | undefined>;

/** One value per name; a repeated parameter is a malformed link, not a choice. */
function single(params: SearchParams, name: string): string | null {
  const value = params[name];
  return typeof value === "string" ? value : null;
}

/** A `ts` is whole epoch seconds: digits only, and no later than year 9999. */
const EPOCH_SECONDS = /^\d{1,12}$/;

/**
 * The link's parts, or null when it is malformed: no or bad id, both or neither scope, a
 * scope id or `ts` that cannot be one. A malformed link is answered like an unknown report.
 */
export function parseReportCheckLink(params: SearchParams): ReportCheckLink | null {
  const reportId = single(params, "id");
  const sessionId = single(params, "session");
  const patientId = single(params, "patient");
  const ts = single(params, "ts");

  if (!isUuid(reportId)) return null;
  if ((sessionId === null) === (patientId === null)) return null;
  if (sessionId !== null && !isUuid(sessionId)) return null;
  if (patientId !== null && !isUuid(patientId)) return null;
  if (ts === null || !EPOCH_SECONDS.test(ts)) return null;

  return {
    reportId: reportId.toLowerCase(),
    sessionId: sessionId?.toLowerCase() ?? null,
    patientId: patientId?.toLowerCase() ?? null,
    generatedAtEpochSeconds: Number(ts),
  };
}

/** One species line on the page, in the app's `0–4 LPF` wording. */
export interface CheckedSpeciesRow {
  species: string;
  range: string;
}

/**
 * The species to list: every positive species, then any other species with a stored range
 * above zero, alphabetically, each with its range. Empty for a report with no parasites.
 */
export function checkedSpeciesRows(report: CheckedReport): CheckedSpeciesRow[] {
  const names = new Set(report.positiveSpecies);
  for (const [species, density] of Object.entries(report.lpfPerSpecies)) {
    if (lpfDescriptor(density.max) !== null) names.add(species);
  }
  return [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((species) => {
      const density = report.lpfPerSpecies[species];
      return { species, range: density ? formatLpfRange(density) : "Range not recorded" };
    });
}

/** The report type as the page names it. */
export function reportTypeLabel(type: CheckedReport["reportType"]): string {
  return type === "session" ? "Session report (one smear)" : "Patient report (several sessions)";
}

/**
 * What a failed check is counted under. A report check has no email, so the visitor's IP
 * takes the email's place: five failed checks from one address within the window refuse the
 * next (`ATTEMPT_LIMITS.email`). The IP column stays empty, so failed checks never use up
 * the sign-in forms' shared per-IP allowance.
 */
export function reportCheckAttemptKeys(ip: string | null): AttemptKeys {
  return {
    kind: "report_check",
    email: `report-check:${ip ?? "unknown"}`,
    ip: null,
    invitationToken: null,
  };
}
