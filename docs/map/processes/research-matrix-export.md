# Research-matrix export

Input: a filter in the query string → Movement: read, filter, serialise → Output: a CSV or
JSON download.

## Steps

1. **Gate.** `requireRouteAccess(ANY_CONSOLE_USER)` runs first
   (`src/app/(dashboard)/records/export/route.ts:22`).
   A route handler does **not** render inside the `(dashboard)` layout, so it does not
   inherit that layout's check; without this line the whole dataset sits on an unguarded URL.
2. **Parse the filter.** `parseRecordFilter` (`src/lib/search-params.ts:60`) reads the same
   query string the page used, so the file cannot drift from the view that produced it.
3. **Read.** `listSampleRecords({ filter })` through the database port.
4. **Select rows.** `buildResearchMatrix` (`src/domain/research-matrix.ts:67`) keeps
   validated records only unless `includeUnvalidated` is set — opt-in, never the default,
   because an export is an aggregation (constraint #6).
5. **Serialise.** `toResearchMatrixCsv` (`src/domain/research-matrix.ts:82`) or
   `toResearchMatrixJson` (`:91`). Both key off `RESEARCH_MATRIX_COLUMNS`, so the two
   formats cannot drift from each other.
6. **Respond** with `Content-Disposition: attachment` and `Cache-Control: no-store` — an
   export is a moment in a live dataset, and a cached copy would be a different claim
   about the same URL.

## The column set is a contract

`RESEARCH_MATRIX_COLUMNS` (`src/domain/research-matrix.ts:11`) is fixed by the project's
SRS: `Sample ID`, `Detected Species / Class`, `AI Confidence Score`, `AI Calculated EPG`,
`Medical Technician Validated EPG`, `Processing Time`. A downstream analyst joins these
files across deployments, so **the labels, their order and their spelling are a schema**.
Renaming one is a breaking change, not a copy edit.

Two formatting rules that carry meaning: an unverified sample gets an **empty** processing
time, never `0` (`src/domain/research-matrix.ts:40`) — a missing measurement must not read
as a fast one; and CSV escaping is RFC 4180, quoting only when needed and doubling inner
quotes (`:76`).

## Consumes / produces

Consumes `docs/map/objects/domain-model.md` and `epg-aggregation.md`. Produces a file.

## If you change this

**Hits**

- `src/domain/research-matrix.test.ts`.
- Every downstream consumer of the file, if a column changes. Treat it as a schema change.
- The records page's export links, if a query parameter is renamed.

**Does not hit**

- The table on screen. It has its own columns (capture date, technologist, status) that are
  deliberately not in the export.
- The dashboard aggregates.

## See

`src/domain/research-matrix.ts`, `src/app/(dashboard)/records/export/route.ts`.
