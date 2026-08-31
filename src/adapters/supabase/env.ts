import { optionalEnv, optionalIntEnv, requireEnv } from "@/lib/env";

/**
 * Supabase configuration, read at request time.
 *
 * The anon key is browser-safe because RLS still applies to it. The service-role
 * key is not, and is read only by {@link serviceConfig}, which no client
 * component may reach — the storage adapter calls it from the server.
 */

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

export interface SupabaseServiceConfig extends SupabasePublicConfig {
  serviceRoleKey: string;
  samplesBucket: string;
  signedUrlTtlSeconds: number;
}

export function publicConfig(): SupabasePublicConfig {
  return {
    url: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

/** Server-only. Never call this from a component that ships to the browser. */
export function serviceConfig(): SupabaseServiceConfig {
  return {
    ...publicConfig(),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    samplesBucket: optionalEnv("SUPABASE_SAMPLES_BUCKET", "samples"),
    signedUrlTtlSeconds: optionalIntEnv("SUPABASE_SIGNED_URL_TTL_SECONDS", 60),
  };
}
