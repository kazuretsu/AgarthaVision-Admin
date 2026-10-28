/**
 * How long a console session lasts (14zcqntnqpd). Supabase's own time-box and inactivity
 * settings are paid, so the console keeps its own: an absolute limit from sign-in and an idle
 * limit from the last request. They apply to the console only; the mobile app's session, on
 * the same account, is never touched by them.
 *
 * Pure: the proxy reads the times and the environment, and acts on the answer.
 */

export interface SessionLimits {
  /** From sign-in, however active the session. */
  absoluteMs: number;
  /** From the last request that was the person's own (not a prefetch). */
  idleMs: number;
}

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

export const DEFAULT_SESSION_LIMITS: SessionLimits = { absoluteMs: 12 * HOUR, idleMs: 1 * HOUR };

/** A positive number from an environment variable, or the default for anything else. */
function positive(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value !== undefined && value.trim() !== "" && Number.isFinite(parsed) && parsed > 0
    ? parsed
    : fallback;
}

/**
 * The limits from `CONSOLE_SESSION_MAX_HOURS` and `CONSOLE_SESSION_IDLE_MINUTES`, each falling
 * back to its default when unset or not a positive number.
 */
export function sessionLimitsFrom(env: {
  CONSOLE_SESSION_MAX_HOURS?: string;
  CONSOLE_SESSION_IDLE_MINUTES?: string;
}): SessionLimits {
  return {
    absoluteMs: positive(env.CONSOLE_SESSION_MAX_HOURS, 12) * HOUR,
    idleMs: positive(env.CONSOLE_SESSION_IDLE_MINUTES, 60) * MINUTE,
  };
}

/** Why a session was ended, or null while it may go on. */
export type SessionEnd = "absolute" | "idle" | "tampered" | null;

/**
 * Whether the session is over.
 *
 * - `signedInAt` null: the provider could not say when this session signed in. Ended: a
 *   session whose age is unknown cannot be held to a limit.
 * - `lastActivityAt` undefined: no activity record yet, or the idle limit is off (no secret).
 *   With a record missing, the session counts as idle since sign-in, so deleting the record
 *   never buys more time.
 * - `lastActivityAt` "tampered": a record that failed its signature. Ended.
 */
export function sessionEnd({
  now,
  signedInAt,
  lastActivityAt,
  limits,
  idleLimitOn,
}: {
  now: number;
  signedInAt: number | null;
  lastActivityAt: number | null | "tampered";
  limits: SessionLimits;
  idleLimitOn: boolean;
}): SessionEnd {
  if (signedInAt === null) return "absolute";
  if (now - signedInAt > limits.absoluteMs) return "absolute";
  if (!idleLimitOn) return null;
  if (lastActivityAt === "tampered") return "tampered";
  const since = Math.max(lastActivityAt ?? signedInAt, signedInAt);
  return now - since > limits.idleMs ? "idle" : null;
}
