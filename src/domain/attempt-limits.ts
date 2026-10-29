/**
 * How many failed sign-in and invitation attempts the console allows (14zcqntnqp6). The forms
 * are server actions, so the auth provider's own per-IP limit sees the host, never the person
 * guessing; the console counts failures itself and refuses a new attempt, before the provider
 * is called, once a limit is reached within the window.
 *
 * Pure: counting is the port's job (`AttemptLimitPort`), acting on the answer the caller's.
 */

/** Which form an attempt came from. */
export type AttemptKind = "sign_in" | "invitation";

/** What one attempt is counted under. */
export interface AttemptKeys {
  kind: AttemptKind;
  /** The email the password was tried for: typed at sign-in, the invitation's on the invite page. */
  email: string;
  /** The client IP, or null when the host gave none: then the email (and link) limits only. */
  ip: string | null;
  /** The invitation link's token, for the invitation kind only. */
  invitationToken: string | null;
}

/** Failures within the window, for each key of one attempt. */
export interface AttemptCounts {
  /** For the email, on either form. */
  email: number;
  /** From the IP, for any email, on either form. 0 when there is no IP. */
  ip: number;
  /** On the invitation link. 0 for a sign-in. */
  invitation: number;
}

export const ATTEMPT_WINDOW_MINUTES = 15;

/** Failures allowed within the window; the next attempt is refused. */
export const ATTEMPT_LIMITS: AttemptCounts = { email: 5, ip: 20, invitation: 5 };

/** The same whether or not the email has an account. */
export const TOO_MANY_ATTEMPTS = `Too many attempts. Try again in ${ATTEMPT_WINDOW_MINUTES} minutes.`;

/** Failures at or after this moment count; older ones have expired. */
export function attemptWindowStart(now: Date): Date {
  return new Date(now.getTime() - ATTEMPT_WINDOW_MINUTES * 60 * 1000);
}

/** Whether a new attempt is refused, given the failures within the window. */
export function attemptsExhausted(counts: AttemptCounts): boolean {
  return (
    counts.email >= ATTEMPT_LIMITS.email ||
    counts.ip >= ATTEMPT_LIMITS.ip ||
    counts.invitation >= ATTEMPT_LIMITS.invitation
  );
}

/** One email however it was typed: `Ana@Lab.test ` and `ana@lab.test` are counted together. */
export function attemptEmail(email: string): string {
  return email.trim().toLowerCase();
}
