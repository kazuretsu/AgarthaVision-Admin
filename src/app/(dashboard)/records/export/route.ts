import { NextResponse, type NextRequest } from "next/server";
import { getDatabase } from "@/adapters/registry";
import { buildResearchMatrix, toResearchMatrixCsv, toResearchMatrixJson } from "@/domain";
import { ANY_CONSOLE_USER, requireRouteAccess } from "@/lib/console-access";
import { parseRecordFilter } from "@/lib/search-params";

/**
 * Research-matrix export (SRS Module 4).
 *
 * A route handler rather than a client-side download: the rows are built on the
 * server from the same filter the page used, so the file cannot drift from what
 * the admin was looking at, and no record set has to be shipped to the browser
 * only to be re-serialised there.
 *
 * The gate is repeated here. A route handler does not render inside the
 * `(dashboard)` layout, so it does not inherit that layout's gate —
 * relying on it would leave the whole dataset on an unguarded URL.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await requireRouteAccess(ANY_CONSOLE_USER);
  if ("response" in access) return access.response;

  const params = request.nextUrl.searchParams;
  const format = params.get("format") === "json" ? "json" : "csv";

  // Opt-in, and never the default: an export is an aggregation, and only
  // human-validated records belong in one.
  const includeUnvalidated = params.get("includeUnvalidated") === "1";

  const records = await (
    await getDatabase()
  ).listSampleRecords({
    filter: parseRecordFilter(params),
  });
  const rows = buildResearchMatrix(records, { includeUnvalidated });

  const stamp = new Date().toISOString().slice(0, 10);
  const scope = includeUnvalidated ? "all-records" : "validated";
  const filename = `agarthavision-research-matrix-${scope}-${stamp}.${format}`;

  const body = format === "json" ? toResearchMatrixJson(rows) : toResearchMatrixCsv(rows);
  const contentType =
    format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8";

  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Exports reflect a moment in a live dataset; a cached copy would be a
      // different claim about the same URL.
      "Cache-Control": "no-store",
    },
  });
}
