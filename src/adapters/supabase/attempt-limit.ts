import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttemptCounts, AttemptKeys } from "@/domain/attempt-limits";
import { attemptKeyHashes } from "@/lib/attempt-limit";
import type { AttemptLimitPort } from "@/ports/attempt-limit";
import { createServiceClient } from "./client";

/**
 * Supabase implementation of {@link AttemptLimitPort}: the `console_sign_in_attempts` table
 * and `console_failed_attempts` (admin/0022). Both are the service role's only, as no browser
 * may read or write attempts. Keys are stored and matched as SHA-256 hashes.
 */

interface CountRow {
  by_email: number;
  by_ip: number;
  by_invitation: number;
}

export class SupabaseAttemptLimitAdapter implements AttemptLimitPort {
  constructor(private readonly service: () => SupabaseClient) {}

  async countFailures(keys: AttemptKeys, since: Date): Promise<AttemptCounts> {
    const hashes = attemptKeyHashes(keys);
    const { data, error } = await this.service().rpc("console_failed_attempts", {
      p_email_hash: hashes.email,
      p_ip_hash: hashes.ip,
      p_token_hash: hashes.token,
      p_since: since.toISOString(),
    });
    if (error) throw error;
    const row = ((data as CountRow[] | null) ?? [])[0];
    return {
      email: Number(row?.by_email ?? 0),
      ip: Number(row?.by_ip ?? 0),
      invitation: Number(row?.by_invitation ?? 0),
    };
  }

  async recordFailure(keys: AttemptKeys): Promise<void> {
    const hashes = attemptKeyHashes(keys);
    const { error } = await this.service().from("console_sign_in_attempts").insert({
      kind: keys.kind,
      email_hash: hashes.email,
      ip_hash: hashes.ip,
      token_hash: hashes.token,
    });
    if (error) throw error;
  }
}

export function createSupabaseAttemptLimit(): AttemptLimitPort {
  return new SupabaseAttemptLimitAdapter(createServiceClient);
}
