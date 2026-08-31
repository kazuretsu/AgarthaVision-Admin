import type { AuthPort, DatabasePort, StoragePort } from "@/ports";
import { optionalEnv } from "@/lib/env";

/**
 * Provider registry — the one place a concrete backend is named.
 *
 * Feature code asks for a port and gets whichever implementation the environment
 * selects. Adding a provider means adding a branch here plus its adapter; no
 * caller changes, because no caller ever knew which provider it was talking to.
 *
 * Adapters are imported lazily. A future S3 or Postgres adapter must not drag
 * its SDK into the bundle of a deployment that does not use it, and the eager
 * alternative would also make this module unimportable in a unit test.
 */

/** Providers with a working implementation today. */
export const SUPPORTED_DATABASE_PROVIDERS = ["supabase"] as const;
export const SUPPORTED_STORAGE_PROVIDERS = ["supabase"] as const;
export const SUPPORTED_AUTH_PROVIDERS = ["supabase"] as const;

export type DatabaseProvider = (typeof SUPPORTED_DATABASE_PROVIDERS)[number];
export type StorageProvider = (typeof SUPPORTED_STORAGE_PROVIDERS)[number];
export type AuthProvider = (typeof SUPPORTED_AUTH_PROVIDERS)[number];

/**
 * Raised when a variable names a provider that has no adapter.
 *
 * Deliberately loud. Silently falling back to the default would let a
 * deployment believe it is pointed at one backend while it reads from another.
 */
export class UnknownProviderError extends Error {
  constructor(kind: string, requested: string, supported: readonly string[]) {
    super(
      `Unknown ${kind} provider "${requested}". Supported: ${supported.join(", ")}. ` +
        `Set the matching environment variable to one of these, or add an adapter.`,
    );
    this.name = "UnknownProviderError";
  }
}

function resolve<T extends string>(kind: string, variable: string, supported: readonly T[]): T {
  const requested = optionalEnv(variable, supported[0]).trim().toLowerCase();
  const match = supported.find((candidate) => candidate === requested);
  if (!match) throw new UnknownProviderError(kind, requested, supported);
  return match;
}

export function databaseProvider(): DatabaseProvider {
  return resolve("database", "DB_PROVIDER", SUPPORTED_DATABASE_PROVIDERS);
}

export function storageProvider(): StorageProvider {
  return resolve("storage", "STORAGE_PROVIDER", SUPPORTED_STORAGE_PROVIDERS);
}

export function authProvider(): AuthProvider {
  return resolve("auth", "AUTH_PROVIDER", SUPPORTED_AUTH_PROVIDERS);
}

/** The database port for this request. Server-side only. */
export async function getDatabase(): Promise<DatabasePort> {
  switch (databaseProvider()) {
    case "supabase": {
      const { createSupabaseDatabase } = await import("./supabase/database");
      return createSupabaseDatabase();
    }
  }
}

/** The storage port. Server-side only — it holds elevated credentials. */
export async function getStorage(): Promise<StoragePort> {
  switch (storageProvider()) {
    case "supabase": {
      const { createSupabaseStorage } = await import("./supabase/storage");
      return createSupabaseStorage();
    }
  }
}

/** The auth port for this request. Server-side only. */
export async function getAuth(): Promise<AuthPort> {
  switch (authProvider()) {
    case "supabase": {
      const { createSupabaseAuth } = await import("./supabase/auth");
      return createSupabaseAuth();
    }
  }
}
