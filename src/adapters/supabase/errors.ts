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
