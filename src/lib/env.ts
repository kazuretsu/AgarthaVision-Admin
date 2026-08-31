/**
 * Request-time environment access.
 *
 * Nothing in this file throws at module load. A production build runs with no
 * Supabase credentials present, so an eager check would turn a missing variable
 * into a broken build instead of a clear error on the one page that needed it.
 * Every accessor here is called inside a request.
 */

/** Thrown when a required variable is absent or blank at the moment it is read. */
export class MissingEnvironmentError extends Error {
  constructor(public readonly variable: string) {
    super(
      `Environment variable ${variable} is not set. Copy .env.example to .env.local and fill it in.`,
    );
    this.name = "MissingEnvironmentError";
  }
}

/** Reads a required variable, or throws a named error naming the variable. */
export function requireEnv(variable: string): string {
  const value = process.env[variable];
  if (value === undefined || value.trim() === "") {
    throw new MissingEnvironmentError(variable);
  }
  return value;
}

/** Reads an optional variable, falling back to the supplied default. */
export function optionalEnv(variable: string, fallback: string): string {
  const value = process.env[variable];
  return value === undefined || value.trim() === "" ? fallback : value;
}

/** Reads an optional integer variable, falling back when absent or unparseable. */
export function optionalIntEnv(variable: string, fallback: number): number {
  const parsed = Number.parseInt(optionalEnv(variable, String(fallback)), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
