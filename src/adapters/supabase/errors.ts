/** PostgREST's and Postgres's "no such function": a migration not applied yet. */
const FUNCTION_NOT_FOUND = new Set(["PGRST202", "42883"]);

export function isFunctionNotFound(error: { code?: string } | null | undefined): boolean {
  return FUNCTION_NOT_FOUND.has(error?.code ?? "");
}
