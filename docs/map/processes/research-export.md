---
verified: 2026-09-30
commit: ff526ba
---

# Research export

Input: a period in the query string → Movement: gate, read smears, build rows, serialise →
Output: a CSV or JSON download, one row per examined smear.

## Steps

1. **Gate.** `requireRouteAccess` runs first
   (`src/app/(dashboard)/export/download/route.ts:26`). A route handler does not render
   inside the `(dashboard)` layout and inherits nothing from it.
2. **Read.** The period is parsed the way the page parses it (`src/lib/period.ts`), and
   `listSmears` reads each session with its summary and the patient's barangay code. More
   than 20,000 sessions (`:23`) is refused with 413 (`:39`) rather than cut short, because
   a partial file would be silently wrong.
3. **Build.** `buildResearchExport` (`src/domain/research-export.ts:94`) keeps examined
   smears only — a session never read has nothing to report — oldest first, and
   `toResearchExportRow` (`:54`) fills the columns from the same `SessionSummary` the records
   browser shows, so a file and the screen cannot disagree about one smear.
4. **Serialise.** `toResearchExportCsv` (`:113`) or `toResearchExportJson` (`:122`), both
   keyed off `RESEARCH_EXPORT_COLUMNS`. CSV fields are RFC 4180-escaped and a cell starting
   with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'` (`escapeCsvField`, `:106`), because
   free-text species names reach the file and a spreadsheet would run them.
5. **Respond** with `Content-Disposition: attachment`, a file name carrying the column
   version and the period, and `Cache-Control: no-store` (`:57` of the route).

## The column set is a contract — version 2

`RESEARCH_EXPORT_COLUMNS` (`src/domain/research-export.ts:36`): session ID, patient record
ID, session date (Manila), barangay PSGC code, fields examined, result, eggs counted; then
for each of _Ascaris lumbricoides_, _Trichuris trichiura_ and Hookworm the LPF min, LPF max,
descriptor and eggs counted; then one "Other species" cell. An absent species reads `0`
with a blank descriptor.

Version 1 was the SRS research matrix (sample ID, species, AI confidence, AI EPG, validated
EPG, processing time), retracted with EPG. **Changing a label, its order or its spelling is a
breaking change**: bump `RESEARCH_EXPORT_VERSION` (`:21`), which is in the file name.

**No names, no birthdates.** A patient appears only as their record ID, so repeat smears
can be linked without identifying anyone, and the barangay code is the finest place given.

## Not yet

Each export should be written to the audit trail. The trail's storage does not exist yet;
the audit-trail work adds the write here.

## If you change this

**Hits**

- Every downstream analysis joining these files.
- `src/domain/research-export.test.ts`, which pins the columns, the privacy rule and the
  escaping.

**Does not hit**

- The records browser and the dashboard, which read the same summaries but own no columns.

## See

`src/domain/research-export.ts`, `src/app/(dashboard)/export/`.
