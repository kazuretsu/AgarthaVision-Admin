import { AuthUnavailableError, SecondFactorError, type SecondFactorFailure } from "@/ports/auth";
import { MissingEnvironmentError } from "@/lib/env";
import { CONSOLE_UNAVAILABLE } from "@/lib/unavailable";

/**
 * What the authenticator forms say when a code is refused: `/verify` (14zcqntjnt0) and
 * `/settings` (14zcqntr31c) share them.
 */

export const CODE_FORMAT = "Enter the 6-digit code your authenticator app shows.";

const FAILURE: Record<SecondFactorFailure, string> = {
  rejected:
    "That code didn't match. Enter the code your app shows now; if it keeps failing, check that your phone sets its time automatically.",
  rate_limited: "Too many attempts. Wait a few minutes, then try again.",
  failed: "The code could not be checked. Try again.",
};

/** A refusal as the form shows it. Anything unexpected is thrown on. */
export function secondFactorProblem(cause: unknown): string {
  if (cause instanceof SecondFactorError) return FAILURE[cause.reason];
  if (cause instanceof AuthUnavailableError) {
    console.error("second step could not be checked", cause.cause);
    return CONSOLE_UNAVAILABLE;
  }
  if (cause instanceof MissingEnvironmentError) {
    return `Server is not configured: ${cause.variable} is not set.`;
  }
  throw cause;
}
