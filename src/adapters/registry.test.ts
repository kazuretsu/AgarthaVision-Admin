import { afterEach, describe, expect, it } from "vitest";
import {
  SUPPORTED_DATABASE_PROVIDERS,
  UnknownProviderError,
  authProvider,
  databaseProvider,
  storageProvider,
} from "./registry";

/**
 * The registry is the seam the whole provider-agnostic design rests on, so its
 * selection and failure behaviour is pinned here. These tests touch no network
 * and construct no adapter — they exercise resolution only.
 */

const TOUCHED = ["DB_PROVIDER", "STORAGE_PROVIDER", "AUTH_PROVIDER"] as const;

afterEach(() => {
  for (const variable of TOUCHED) delete process.env[variable];
});

describe("provider resolution", () => {
  it("defaults to supabase when the variable is unset", () => {
    expect(databaseProvider()).toBe("supabase");
    expect(storageProvider()).toBe("supabase");
    expect(authProvider()).toBe("supabase");
  });

  it("defaults when the variable is set but blank", () => {
    // A blank value in a .env file is an unset variable, not a provider named "".
    process.env.DB_PROVIDER = "   ";
    expect(databaseProvider()).toBe("supabase");
  });

  it("accepts an explicitly named supported provider", () => {
    process.env.DB_PROVIDER = "supabase";
    expect(databaseProvider()).toBe("supabase");
  });

  it("is case- and whitespace-insensitive", () => {
    process.env.STORAGE_PROVIDER = "  SupaBase  ";
    expect(storageProvider()).toBe("supabase");
  });

  it("throws on an unknown provider rather than falling back", () => {
    // The important half: a typo must not silently read from the default
    // backend while the deployment believes it is pointed somewhere else.
    process.env.DB_PROVIDER = "postgres";
    expect(() => databaseProvider()).toThrow(UnknownProviderError);
  });

  it("names the offender and the supported set in the error", () => {
    process.env.AUTH_PROVIDER = "better-auth";
    expect(() => authProvider()).toThrow(/better-auth/);
    expect(() => authProvider()).toThrow(/supabase/);
  });

  it("resolves each port independently", () => {
    process.env.DB_PROVIDER = "supabase";
    process.env.STORAGE_PROVIDER = "nope";
    expect(databaseProvider()).toBe("supabase");
    expect(() => storageProvider()).toThrow(UnknownProviderError);
  });

  it("declares the default as the first supported provider", () => {
    // The default is positional, so a reordering would silently change it.
    expect(SUPPORTED_DATABASE_PROVIDERS[0]).toBe("supabase");
  });
});
