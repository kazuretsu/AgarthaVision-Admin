import { NextResponse, type NextRequest } from "next/server";
import { getAdminWrites, getDatabase } from "@/adapters/registry";
import { AdminWriteError } from "@/ports";
import {
  RESEARCH_EXPORT_LIMIT,
  RESEARCH_EXPORT_VERSION,
  buildResearchExport,
  clinicalDate,
  patientDisclosureFor,
  readScopeFor,
  toResearchExportCsv,
  toResearchExportJson,
} from "@/domain";
import { ANY_CONSOLE_USER, requireRouteAccess } from "@/lib/console-access";
import { MissingEnvironmentError } from "@/lib/env";
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

/**
 * A UTF-8 byte-order mark. Excel on Windows reads a CSV without one as the
 * system code page and mangles the en dash in "0–2 LPF" and any non-ASCII name.
 */
const UTF8_BOM = "﻿";

export async function GET(request: NextRequest) {
  const access = await requireRouteAccess(ANY_CONSOLE_USER);
  if ("response" in access) return access.response;

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  // The org admin's own laboratory, whatever `org` says; a super admin may narrow.
  const scope = readScopeFor(access.actor.access, params.org);
  const period = parsePeriod(params);
  const format = params.format === "json" ? "json" : "csv";

  let smears;
  try {
    // One past the limit, so a period over it is detected rather than cut short.
    smears = await (
      await getDatabase()
    ).listSmears({
      scope,
      disclosure: patientDisclosureFor(access.actor.access),
      startedFrom: period.from,
      startedTo: period.to,
      limit: RESEARCH_EXPORT_LIMIT + 1,
    });
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return NextResponse.json(
        { error: `Server is not configured: ${cause.variable} is not set.` },
        { status: 503 },
      );
    }
    // The cause stays in the server log; the response names no table or column.
    console.error("research export read failed", cause);
    return NextResponse.json(
      { error: "The records could not be read. Try again." },
      { status: 502 },
    );
  }
  if (smears.length > RESEARCH_EXPORT_LIMIT) {
    return NextResponse.json(
      {
        error: `More than ${RESEARCH_EXPORT_LIMIT} sessions in this period. Export a shorter period.`,
      },
      { status: 413 },
    );
  }

  const rows = buildResearchExport(smears);

  // Recorded before the file leaves. If the audit entry cannot be written, the
  // export is refused: an unrecorded download of patient data must not happen.
  try {
    await (
      await getAdminWrites()
    ).recordExport(scope.kind === "organization" ? scope.organizationId : null, {
      rows: rows.length,
      format,
      from: period.from ?? null,
      to: period.to ?? null,
      columns_version: RESEARCH_EXPORT_VERSION,
    });
  } catch (cause) {
    if (cause instanceof AdminWriteError) {
      return NextResponse.json(
        { error: "The export could not be recorded, so it was not produced." },
        { status: cause.reason === "forbidden" ? 403 : 503 },
      );
    }
    throw cause;
  }
  // Today in Manila, the frame every other date in the file uses.
  const span = [period.from ?? "start", period.to ?? clinicalDate(new Date().toISOString())].join(
    "_to_",
  );
  const filename = `agarthavision-research-export-v${RESEARCH_EXPORT_VERSION}-${span}.${format}`;
  const body =
    format === "json" ? toResearchExportJson(rows) : UTF8_BOM + toResearchExportCsv(rows);

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
