import type { ReportCheckLink, ReportCheckOutcome } from "@/domain/report-check";

/**
 * Checks one report's QR link against the stored record (14zcqnty9bj). Answers for exactly
 * the report the link names and returns no identity: the adapter goes through admin/0025's
 * `console_check_report`, never the service role.
 */
export interface ReportCheckPort {
  checkReport(link: ReportCheckLink): Promise<ReportCheckOutcome>;
}

/** The check could not be made (database unreachable, function missing): try again later. */
export class ReportCheckError extends Error {
  constructor(cause?: unknown) {
    super("The report could not be checked.", { cause });
    this.name = "ReportCheckError";
  }
}
