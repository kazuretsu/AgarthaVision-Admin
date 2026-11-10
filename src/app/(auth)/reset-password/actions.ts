"use server";

import { getAuth } from "@/adapters/registry";
import { checkPasswordReset, passwordGapMessage, passwordGaps } from "@/domain";
import { MissingEnvironmentError } from "@/lib/env";
import { PasswordResetError, type PasswordResetFailure } from "@/ports/auth";
import type { ResetPasswordState } from "./state";

const INVALID_LINK = "This password reset link is not valid or has expired. Request a new one.";

const RESET_REFUSED: Record<
  Exclude<PasswordResetFailure, "weak_password" | "invalid_link">,
  string
> = {
  same_password:
    "Choose a password different from your current one, then request a new reset link if this one was already used.",
  rate_limited: "Too many attempts. Wait a few minutes, then try again.",
  failed: "Your password could not be reset. Request a new reset link and try again.",
};

/**
 * Consumes a single-use password-reset link and sets the new password (14zcqntjnt9).
 *
 * Pure password checks run before the provider is called so a typo or a missed rule does not
 * spend the single-use link. Once verified, the temporary recovery session is always signed
 * out so admins still pass `/verify` (MFA) on sign-in and deactivated accounts cannot use a
 * reset link to regain access.
 */
export async function resetPassword(
  _previous: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const code = String(formData.get("code") ?? "").trim();
  const tokenHash = String(formData.get("tokenHash") ?? "").trim();
  if (code.length === 0 && tokenHash.length === 0) {
    return { done: false, linkInvalid: true, error: INVALID_LINK };
  }

  const next = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");
  const checked = checkPasswordReset(next, confirmation);
  if (!checked.ok) {
    return { done: false, linkInvalid: false, error: checked.error };
  }

  try {
    const auth = await getAuth();
    await auth.resetPassword({
      code: code.length > 0 ? code : undefined,
      tokenHash: tokenHash.length > 0 ? tokenHash : undefined,
      password: next,
    });
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return {
        done: false,
        linkInvalid: false,
        error: `Server is not configured: ${cause.variable} is not set.`,
      };
    }
    if (cause instanceof PasswordResetError) {
      if (cause.reason === "invalid_link") {
        return { done: false, linkInvalid: true, error: INVALID_LINK };
      }
      const error =
        cause.reason === "weak_password"
          ? passwordGapMessage(passwordGaps(next))
          : RESET_REFUSED[cause.reason];
      return { done: false, linkInvalid: false, error };
    }
    throw cause;
  }

  return { done: true, linkInvalid: false, error: null };
}
