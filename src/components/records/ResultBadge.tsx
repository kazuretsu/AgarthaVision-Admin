import type { SessionSummary } from "@/domain";
import { isSessionRead } from "@/domain";
import { Badge } from "@/components/ui/badge";

/** Positive or negative for STH, always in words. */
export function ResultBadge({ positive }: { positive: boolean }) {
  return positive ? <Badge variant="danger">Positive</Badge> : <Badge variant="ok">Negative</Badge>;
}

/**
 * A session's result: positive or negative once a field has been read, and
 * "Not read" before that — never "Negative" for a smear no one examined.
 */
export function SessionResult({
  summary,
}: {
  summary: Pick<SessionSummary, "fieldCount" | "isPositive">;
}) {
  return isSessionRead(summary) ? (
    <ResultBadge positive={summary.isPositive} />
  ) : (
    <span className="text-stone-mid">Not read</span>
  );
}
