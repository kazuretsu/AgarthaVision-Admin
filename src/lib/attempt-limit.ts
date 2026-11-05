import { createHash } from "node:crypto";
import {
  attemptEmail,
  attemptWindowStart,
  attemptsExhausted,
  type AttemptKeys,
} from "@/domain/attempt-limits";
import type { AttemptLimitPort } from "@/ports/attempt-limit";

/**
 * Runs one sign-in or invitation attempt under the attempt limits (14zcqntnqp6).
 *
 * 1. The failures within the window are counted; at a limit, {@link TooManyAttemptsError} is
 *    thrown and `attempt` never runs, so the auth provider is never called.
 * 2. `attempt` runs. If it throws and `isFailure` says the password was wrong, one failure is
 *    stored. The error is rethrown either way.
 *
 * Fails open: if the limiter cannot be reached, built or written, the attempt goes ahead and
 * the problem is logged. Sign-in must never depend on a counter.
 */
export async function withAttemptLimit<T>(
  limits: () => Promise<AttemptLimitPort>,
  keys: AttemptKeys,
  attempt: () => Promise<T>,
  isFailure: (cause: unknown) => boolean,
  now: () => Date = () => new Date(),
): Promise<T> {
  let port: AttemptLimitPort | null = null;
  let refused = false;
  try {
    port = await limits();
    refused = attemptsExhausted(await port.countFailures(keys, attemptWindowStart(now())));
  } catch (cause) {
    console.error("Attempt limit not checked; the attempt goes ahead", cause);
  }
  if (refused) throw new TooManyAttemptsError();

  try {
    return await attempt();
  } catch (cause) {
    if (port && isFailure(cause)) {
      try {
        await port.recordFailure(keys);
      } catch (recordCause) {
        console.error("Failed attempt not recorded", recordCause);
      }
    }
    throw cause;
  }
}

/** A limit was reached: the attempt was refused before the auth provider was called. */
export class TooManyAttemptsError extends Error {
  constructor() {
    super("Too many failed attempts within the window.");
    this.name = "TooManyAttemptsError";
  }
}

/** The SHA-256 (hex) under which each key is stored: no email, IP or token in the clear. */
export interface AttemptKeyHashes {
  email: string;
  ip: string | null;
  /** The same hash the invitation itself is stored under (`console_invitation_token_hash`). */
  token: string | null;
}

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

export function attemptKeyHashes(keys: AttemptKeys): AttemptKeyHashes {
  return {
    email: sha256(attemptEmail(keys.email)),
    ip: keys.ip ? sha256(keys.ip) : null,
    token: keys.kind === "invitation" && keys.invitationToken ? sha256(keys.invitationToken) : null,
  };
}

/**
 * The client IP of a request: the first entry of the header `TRUSTED_IP_HEADER` names, by
 * default `x-forwarded-for`, which Vercel sets itself and does not take from the client. On
 * another host, set the variable to the header that host sets. Null when the header is
 * missing or empty, and the attempt is then limited by email (and link) only.
 */
export function clientIp(
  headers: Pick<Headers, "get">,
  headerName: string | undefined = process.env.TRUSTED_IP_HEADER,
): string | null {
  const name = headerName?.trim() || "x-forwarded-for";
  const first = headers.get(name)?.split(",")[0]?.trim() ?? "";
  return first === "" ? null : first.slice(0, 100);
}
