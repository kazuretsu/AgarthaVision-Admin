/**
 * The human check on the sign-in and invitation forms (14zcqntnqpc).
 *
 * The form posts a single-use token from the check under {@link HUMAN_CHECK_FIELD}; the
 * auth provider verifies it with the check's service. This module only decides what counts
 * as a token worth passing on. Whether one is required is the provider's setting, not the
 * console's: with the provider's check off, a missing token signs in as before.
 */

/** The form field the token travels in. */
export const HUMAN_CHECK_FIELD = "humanCheckToken";

/** Cloudflare Turnstile tokens are at most 2048 characters. */
export const HUMAN_CHECK_TOKEN_MAX = 2048;

/** The posted token, or `undefined` when there is none or it cannot be one. */
export function readHumanCheckToken(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const token = value.trim();
  if (token.length === 0 || token.length > HUMAN_CHECK_TOKEN_MAX) return undefined;
  return token;
}
