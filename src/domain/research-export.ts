import type { SmearRecord } from "./dashboard";
import { isExamined } from "./dashboard";
import { formatLpfRange } from "./clinical";
import { clinicalDate } from "./patients";

/**
 * The research export: one row per examined smear, in LPF terms.
 *
 * It replaces the SRS research matrix, whose EPG columns were retracted with EPG
 * itself (PB-16). The column set below is a new contract, version 2 — an analyst
 * joins these files across periods and deployments, so labels, order and
 * spelling are a schema. Changing one is a breaking change: bump the version in
 * the file name when you do.
 *
 * **No names and no birthdates.** The export is for analysis, and the signed
 * privacy position keeps personal details out of analysis outputs. The patient
 * appears only as their record id, so repeat smears of one patient can be linked
 * without identifying them; the barangay code is the finest place given.
 */

export const RESEARCH_EXPORT_VERSION = 2;

/**
 * Sessions one export may hold. A file cut short would be silently wrong, so a
 * longer period is refused, and the export page warns before the click.
 */
export const RESEARCH_EXPORT_LIMIT = 20000;

/** The species that get their own columns, in column order. */
export const EXPORT_SPECIES = ["Ascaris lumbricoides", "Trichuris trichiura", "Hookworm"] as const;

const SPECIES_COLUMNS = EXPORT_SPECIES.flatMap(
  (species) =>
    [
      `${species} LPF min`,
      `${species} LPF max`,
      `${species} descriptor`,
      `${species} eggs counted`,
    ] as const,
);

export const RESEARCH_EXPORT_COLUMNS = [
  "Session ID",
  "Patient record ID",
  "Session date",
  "Barangay PSGC code",
  "Fields examined",
  "Result",
  "Eggs counted",
  ...SPECIES_COLUMNS,
  "Other species",
] as const;

export type ResearchExportColumn = (typeof RESEARCH_EXPORT_COLUMNS)[number];

/** One export row, keyed by the exact column labels so CSV and JSON cannot drift. */
export type ResearchExportRow = Record<ResearchExportColumn, string>;

/** Maps one smear onto the export columns. Absent species read as `0` and blank. */
export function toResearchExportRow(smear: SmearRecord): ResearchExportRow {
  const { summary } = smear;
  const eggs = new Map(summary.eggCounts.map((row) => [row.species, row.count]));

  const row: Partial<ResearchExportRow> = {
    "Session ID": smear.sessionId,
    "Patient record ID": smear.patientId,
    "Session date": clinicalDate(smear.startedAt),
    "Barangay PSGC code": smear.barangayCode,
    "Fields examined": String(summary.fieldCount),
    Result: summary.isPositive ? "positive" : "negative",
    "Eggs counted": String(summary.totalEggs),
  };

  for (const species of EXPORT_SPECIES) {
    const density = summary.lpf[species];
    row[`${species} LPF min`] = String(density?.min ?? 0);
    row[`${species} LPF max`] = String(density?.max ?? 0);
    row[`${species} descriptor`] = density?.descriptor ?? "";
    row[`${species} eggs counted`] = String(eggs.get(species) ?? 0);
  }

  const known = new Set<string>(EXPORT_SPECIES);
  const others = new Set([
    ...Object.keys(summary.lpf).filter((species) => !known.has(species)),
    ...summary.eggCounts.map((entry) => entry.species).filter((species) => !known.has(species)),
  ]);
  row["Other species"] = [...others]
    .sort()
    .map((species) => {
      const density = summary.lpf[species];
      const range = density ? ` ${formatLpfRange(density)}` : "";
      return `${species}${range} (${eggs.get(species) ?? 0} eggs)`;
    })
    .join("; ");

  return row as ResearchExportRow;
}

/** Every examined smear, oldest first. A session never read has nothing to export. */
export function buildResearchExport(smears: readonly SmearRecord[]): ResearchExportRow[] {
  return smears
    .filter(isExamined)
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt))
    .map(toResearchExportRow);
}

/**
 * RFC 4180 escaping, plus spreadsheet-formula neutralising: a cell starting with
 * `=`, `+`, `-`, `@`, tab or carriage return is prefixed with `'` so a spreadsheet
 * shows it as text instead of running it. Free-text species names reach this file.
 */
export function escapeCsvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (!/[",\n\r]/.test(safe)) return safe;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** CSV with the exact header row and CRLF line endings. */
export function toResearchExportCsv(rows: readonly ResearchExportRow[]): string {
  const header = RESEARCH_EXPORT_COLUMNS.map(escapeCsvField).join(",");
  const body = rows.map((row) =>
    RESEARCH_EXPORT_COLUMNS.map((column) => escapeCsvField(row[column])).join(","),
  );
  return [header, ...body].join("\r\n") + "\r\n";
}

/** JSON with the same keys in the same order as the CSV header. */
export function toResearchExportJson(rows: readonly ResearchExportRow[]): string {
  return JSON.stringify(rows, RESEARCH_EXPORT_COLUMNS as unknown as string[], 2);
}
