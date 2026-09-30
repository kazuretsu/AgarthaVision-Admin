import { NextResponse, type NextRequest } from "next/server";
import { getDatabase } from "@/adapters/registry";
import {
  RESEARCH_EXPORT_VERSION,
  buildResearchExport,
  toResearchExportCsv,
  toResearchExportJson,
} from "@/domain";
import { ANY_CONSOLE_USER, requireRouteAccess } from "@/lib/console-access";
import { parsePeriod } from "@/lib/period";

/**
 * The research export download.
 *
 * A route handler does not render inside the `(dashboard)` layout and inherits
 * none of its gate, so it checks access itself before reading anything. Rows are
 * built on the server from the same period the page shows, so the file cannot
 * drift from the view that produced it.
 */
export const dynamic = "force-dynamic";

/** Sessions read for one file. A file cut short would be silently wrong, so it is refused. */
const EXPORT_LIMIT = 20000;

export async function GET(request: NextRequest) {
  const access = await requireRouteAccess(ANY_CONSOLE_USER);
  if ("response" in access) return access.response;

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const period = parsePeriod(params);
  const format = params.format === "json" ? "json" : "csv";

  const smears = await (
    await getDatabase()
  ).listSmears({ startedFrom: period.from, startedTo: period.to, limit: EXPORT_LIMIT + 1 });
  if (smears.length > EXPORT_LIMIT) {
    return NextResponse.json(
      { error: `More than ${EXPORT_LIMIT} sessions in this period. Export a shorter period.` },
      { status: 413 },
    );
  }

  const rows = buildResearchExport(smears);
  const scope = [period.from ?? "start", period.to ?? new Date().toISOString().slice(0, 10)].join(
    "_to_",
  );
  const filename = `agarthavision-research-export-v${RESEARCH_EXPORT_VERSION}-${scope}.${format}`;
  const body = format === "json" ? toResearchExportJson(rows) : toResearchExportCsv(rows);

  return new NextResponse(body, {
    headers: {
      "Content-Type":
        format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // An export is a moment in a live dataset; a cached copy would be a
      // different claim about the same URL.
      "Cache-Control": "no-store",
    },
  });
}
