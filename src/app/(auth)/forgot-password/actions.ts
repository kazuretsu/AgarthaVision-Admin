"use server";

import { getAuth } from "@/adapters/registry";
import { HUMAN_CHECK_FIELD, readHumanCheckToken } from "@/domain/human-check";
import { normaliseResetEmail } from "@/domain/profile";
import { MissingEnvironmentError } from "@/lib/env";
import { consoleOrigin, passwordResetLink } from "@/lib/site-url";
import { HumanCheckFailedError } from "@/ports/auth";
import type { ForgotPasswordState } from "./state";

const HUMAN_CHECK_FAILED =
  "The security check expired or did not pass. Complete it again, then request a reset link.";

/**
 * Requests a password-reset email (14zcqntjnt9).
 *
 * Every valid email shape receives the same `sent: true` answer whether or not an account
 * exists or is active, so the page never reveals who has an account.
 */
export async function requestPasswordReset(
  _previous: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const checked = normaliseResetEmail(String(formData.get("email") ?? ""));
  if (!checked.ok) {
    return { sent: false, error: checked.error };
  }

  const humanCheckToken = readHumanCheckToken(formData.get(HUMAN_CHECK_FIELD));

  try {
    const [auth, origin] = await Promise.all([getAuth(), consoleOrigin()]);
    await auth.requestPasswordReset({
      email: checked.email,
      redirectTo: passwordResetLink(origin),
      humanCheckToken,
    });
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return { sent: false, error: `Server is not configured: ${cause.variable} is not set.` };
    }
    if (cause instanceof HumanCheckFailedError) {
      return { sent: false, error: HUMAN_CHECK_FAILED };
    }
    throw cause;
  }

  return { sent: true, error: null };
}

