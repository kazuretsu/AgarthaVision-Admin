/**
 * An outage, as the console names it (14zcqntk6h2).
 *
 * When access cannot be read, the gate throws rather than refusing (`AuthUnavailableError`,
 * `src/ports/auth.ts`). In production the browser gets no error message, only the error's
 * digest, so the outage carries a digest of its own: a fixed prefix the error boundaries
 * recognise, then a short reference that also appears in the server log. Next keeps a
 * digest an error already has. If it ever stops doing so, the boundaries fall back to
 * their general "could not be loaded" message; the page still fails and shows no data.
 *
 * Safe on the client: no server imports.
 */

/** What the visitor reads: no host, no error, nothing about the database. */
export const CONSOLE_UNAVAILABLE =
  "The console can't reach its data right now. Try again in a moment.";

const DIGEST_PREFIX = "CONSOLE_UNAVAILABLE-";

/** Gives the error an outage digest, once: the same error thrown twice keeps one reference. */
export function markUnavailable<E extends Error>(error: E): E & { digest: string } {
  const marked = error as E & { digest?: string };
  marked.digest ??= `${DIGEST_PREFIX}${crypto.randomUUID().slice(0, 8)}`;
  return marked as E & { digest: string };
}

/** The outage's reference when the digest is an outage's, otherwise null. */
export function unavailableReference(digest: string | undefined): string | null {
  return digest?.startsWith(DIGEST_PREFIX) ? digest.slice(DIGEST_PREFIX.length) || null : null;
}
