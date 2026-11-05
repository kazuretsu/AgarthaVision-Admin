import { optionalEnv, optionalIntEnv, requireEnv } from "@/lib/env";

/**
 * Supabase configuration, read at request time.
 *
 * The anon key is browser-safe because RLS still applies to it. The service-role
 * key is read in one place, `serviceRoleKey()`, to make an invited person's
 * account; every read, image signing included, runs as the signed-in user.
 */

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

export interface SupabaseStorageConfig {
  samplesBucket: string;
  signedUrlTtlSeconds: number;
}

export function publicConfig(): SupabasePublicConfig {
  return {
    url: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

export function storageConfig(): SupabaseStorageConfig {
  return {
    samplesBucket: optionalEnv("SUPABASE_SAMPLES_BUCKET", "samples"),
    signedUrlTtlSeconds: optionalIntEnv("SUPABASE_SIGNED_URL_TTL_SECONDS", 60),
  };
}

/** Server-only. Never prefix it `NEXT_PUBLIC_`. Read only by `createServiceClient()`. */
export function serviceRoleKey(): string {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}
