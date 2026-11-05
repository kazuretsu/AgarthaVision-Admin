import type { AttemptCounts, AttemptKeys } from "@/domain/attempt-limits";

/**
 * Failed sign-in and invitation attempts, counted to limit password guessing (14zcqntnqp6).
 * Server-only: no browser may read or write them. Nothing is ever deleted; a failure older
 * than the window is simply not counted.
 *
 * Callers go through `withAttemptLimit` (`src/lib/attempt-limit.ts`), which refuses when a
 * limit is reached and lets the attempt through when this port fails: sign-in never depends
 * on a counter.
 */
export interface AttemptLimitPort {
  /** Failures at or after `since` for each of the attempt's keys. */
  countFailures(keys: AttemptKeys, since: Date): Promise<AttemptCounts>;

  /** Stores one failure under the attempt's keys. */
  recordFailure(keys: AttemptKeys): Promise<void>;
}
