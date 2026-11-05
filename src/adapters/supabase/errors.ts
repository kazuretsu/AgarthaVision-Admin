import type { PasswordChangeFailure, SecondFactorFailure } from "@/ports/auth";

/** PostgREST's and Postgres's "no such function": a migration not applied yet. */
const FUNCTION_NOT_FOUND = new Set(["PGRST202", "42883"]);

export function isFunctionNotFound(error: { code?: string } | null | undefined): boolean {
  return FUNCTION_NOT_FOUND.has(error?.code ?? "");
}

/** Supabase Auth refused the human-check token: missing, expired, reused or failed. */
export function isHumanCheckRefusal(error: { code?: string } | null | undefined): boolean {
  return error?.code === "captcha_failed";
}

/** The sign-in options that carry a human-check token, or none when the form sent none. */
export function humanCheckOptions(token: string | undefined): { captchaToken: string } | undefined {
  return token ? { captchaToken: token } : undefined;
}

/** Supabase Auth's codes for a code that was wrong, expired or used up (14zcqntjnt0). */
const SECOND_FACTOR_REJECTED = new Set(["mfa_verification_failed", "mfa_challenge_expired"]);

/** What a refused second-step request means, from Supabase Auth's error code and status. */
export function secondFactorFailure(
  error: { code?: string; status?: number } | null | undefined,
): SecondFactorFailure {
  if (SECOND_FACTOR_REJECTED.has(error?.code ?? "")) return "rejected";
  if (error?.status === 429 || error?.code === "over_request_rate_limit") return "rate_limited";
  return "failed";
}

/** Supabase Auth's codes for a refused password change (14zcqntr35e). */
const PASSWORD_CHANGE_REFUSALS: Readonly<Record<string, PasswordChangeFailure>> = {
  current_password_invalid: "wrong_current_password",
  same_password: "same_password",
  weak_password: "weak_password",
  over_request_rate_limit: "rate_limited",
};

/** What a refused password change means, from Supabase Auth's error code and status. */
export function passwordChangeFailure(
  error: { code?: string; status?: number } | null | undefined,
): PasswordChangeFailure {
  const known = PASSWORD_CHANGE_REFUSALS[error?.code ?? ""];
  if (known) return known;
  if (error?.status === 429) return "rate_limited";
  return "failed";
}
