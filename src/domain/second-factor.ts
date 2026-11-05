import type { ConsoleAccess } from "./access";
import type { Person } from "./people";

/**
 * The second step of signing in (14zcqntjnt0), and choosing to take it (14zcqntr31c).
 *
 * After their password, an admin who has set up an authenticator app enters the six-digit code
 * it shows; until they have, they reach no page and no data. Setting an app up is the admin's
 * own choice, made on `/settings`: during validation and demo the console does not insist, so
 * an admin without one goes straight in on their password (`docs/patient-pii-position.md` §3).
 * Medtechs, who never use the console, are never offered one.
 *
 * The rule lives here, in plain TypeScript; the auth adapter only reports the facts it rests on,
 * so a later provider keeps the rule (D7).
 */

/** Where a console user stands on the second step. */
export type SecondFactorStep =
  /** This session passed the code step. */
  | "passed"
  /** An authenticator app is set up; this session has not entered its code yet. */
  | "enter_code"
  /** No authenticator app: nothing to enter. One can be set up on `/settings`. */
  | "not_set_up";

/** The facts the step rests on, read by the auth adapter. */
export interface SecondFactorFacts {
  /** The session itself passed a second factor (Supabase: `aal2` on the verified token). */
  sessionPassed: boolean;
  /** The account has an authenticator app that has been confirmed with a code. */
  hasAuthenticator: boolean;
}

export function secondFactorStep({
  sessionPassed,
  hasAuthenticator,
}: SecondFactorFacts): SecondFactorStep {
  if (sessionPassed) return "passed";
  return hasAuthenticator ? "enter_code" : "not_set_up";
}

/**
 * Whether a session on this step may use the console. Only an account with an app has a step
 * to pass; until its code is entered, nothing opens.
 */
export function secondFactorAdmits(step: SecondFactorStep): boolean {
  return step !== "enter_code";
}

/** The form field a code travels in. */
export const SECOND_FACTOR_CODE_FIELD = "code";

/** Authenticator apps show six digits. */
export const SECOND_FACTOR_CODE_LENGTH = 6;

/**
 * The posted code, or `null` when it cannot be one. Apps show the code as "123 456", and people
 * paste it with stray spaces, so whitespace is dropped; anything else but six digits is refused
 * before the provider is asked.
 */
export function readSecondFactorCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.replace(/\s+/g, "");
  return new RegExp(`^\\d{${SECOND_FACTOR_CODE_LENGTH}}$`).test(code) ? code : null;
}

/**
 * Whether this actor may reset this person's authenticator app (e.g. a lost phone). Super admins
 * only, for an organization admin, never themselves: resetting your own would let a stolen
 * session replace the app it was meant to need. A medtech has no console app to reset.
 */
export function canResetSecondFactor(
  access: ConsoleAccess,
  actorId: string,
  person: Pick<Person, "userId" | "accountId" | "role">,
): boolean {
  return (
    access.kind === "super_admin" &&
    person.userId !== actorId &&
    person.role === "org_admin" &&
    person.accountId !== null
  );
}
