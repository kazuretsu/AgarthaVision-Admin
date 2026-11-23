import { getAttemptLimit, getReportCheck } from "@/adapters/registry";
import {
  parseReportCheckLink,
  reportCheckAttemptKeys,
  type ReportCheckOutcome,
} from "@/domain/report-check";
import { TooManyAttemptsError, withAttemptLimit } from "@/lib/attempt-limit";

type SearchParams = Record<string, string | string[] | undefined>;

/** What the page shows: the database's answer, or that the visitor must wait, or try later. */
export type ReportCheckPageState =
  ReportCheckOutcome | { kind: "too_many" } | { kind: "unavailable" };

/** Thrown inside the attempt so a link that matches nothing counts as a failed attempt. */
class FailedCheck extends Error {
  constructor(readonly outcome: ReportCheckOutcome) {
    super("The report link matched no report.");
  }
}

/**
 * Checks a report's QR link for `/verify/report` (14zcqnty9bj). A malformed link is answered
 * as an unknown report without asking the database. An unknown report or an altered link
 * counts as a failed attempt for the visitor's IP; past the limit the check is refused before
 * the database is asked. A check that cannot be made says so, and is not counted.
 */
export async function checkReportLink(
  params: SearchParams,
  ip: string | null,
): Promise<ReportCheckPageState> {
  const link = parseReportCheckLink(params);
  if (!link) return { kind: "not_found" };

  try {
    return await withAttemptLimit(
      getAttemptLimit,
      reportCheckAttemptKeys(ip),
      async () => {
        const outcome = await (await getReportCheck()).checkReport(link);
        if (outcome.kind !== "confirmed") throw new FailedCheck(outcome);
        return outcome;
      },
      (cause) => cause instanceof FailedCheck,
    );
  } catch (cause) {
    if (cause instanceof FailedCheck) return cause.outcome;
    if (cause instanceof TooManyAttemptsError) return { kind: "too_many" };
    console.error("Report check failed", cause);
    return { kind: "unavailable" };
  }
}
